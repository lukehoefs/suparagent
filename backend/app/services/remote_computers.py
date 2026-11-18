"""Agent cloud computers: desktops behind their own gateway, linked through a custom MCP connection.

A gateway serves `/mcp` (the agent's computer tools), `/websockify` (the desktop's VNC stream) and
`/healthz`. Its address is always the scheme and host of the linked connection's endpoint, which the
custom MCP routes already checked is a public HTTPS URL; this module re-checks it and resolves the
host to public addresses only before any request, so a link can never point the backend at a local
or private service. The connection's bearer token is read from the credential store by the caller
and sent only to that host; it is never returned, logged or stored here.

Status checks and screenshots are cached briefly in this process, per account, so a page that
polls does not reach the gateway on every request. Every network call is async and bounded.
"""

import asyncio
import ipaddress
import json
import socket
import ssl
import time
import weakref
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import community_mcp as mcp
from app.computers.rfb import RfbFilterError, ViewOnlyFilter
from app.computers.viewer import Viewers
from app.core.logging import get_logger
from app.db import tenant_schema
from app.db.models import Person, RemoteComputer

logger = get_logger(__name__)

HEALTH_TTL_SECONDS = 30.0
HEALTH_TIMEOUT_SECONDS = 4.0
SCREENSHOT_TTL_SECONDS = 2.0
SCREENSHOT_TIMEOUT_SECONDS = 15.0
MAX_SCREENSHOT_RESPONSE_BYTES = 16 * 1024 * 1024
MAX_VIEWER_MESSAGE_BYTES = 65536
MAX_UPSTREAM_FRAME_BYTES = 4 * 1024 * 1024
VIEWER_REVALIDATE_SECONDS = 5.0
VIEWER_FIRST_BYTE_SECONDS = 10.0
# lukethomas has one owner. A member who takes control is named by their own display name.
OWNER_NAME_FALLBACK = "Luke"
PREFERRED_SCREENSHOT_TOOLS = ("computer_screenshot", "screenshot", "take_screenshot")
HEALTH_ERRORS = ("timeout", "unreachable", "unsafe_address", "bad_status")

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


class RemoteComputerError(Exception):
    def __init__(self, code: str, status: int = 502):
        super().__init__(code)
        self.code = code
        self.status = status


# ---------------------------------------------------------------- address

def base_url(endpoint: str) -> str:
    """`https://<host>` of a connection endpoint such as `https://<gateway>/mcp`. Raises McpError for
    anything that is not a public HTTPS URL on the standard port (the custom MCP rules)."""
    host, _path, _port = mcp._validate_public_url(endpoint, "endpoint", require_standard_port=True, max_length=300)
    return f"https://{host}"


def _host(base: str) -> str:
    host = urlsplit(base).hostname
    if not host:
        raise RemoteComputerError("unsafe_address", 409)
    return host


async def resolve_public(host: str, port: int = 443) -> list[str]:
    """The host's addresses, all public, or RemoteComputerError. The same rule as the MCP client's
    pinned transport: one private, local or reserved answer refuses the host."""
    try:
        literal = ipaddress.ip_address(host)
        addresses = [literal]
    except ValueError:
        loop = asyncio.get_running_loop()
        try:
            rows = await asyncio.wait_for(loop.getaddrinfo(host, port, type=socket.SOCK_STREAM), timeout=5)
        except Exception:  # noqa: BLE001
            raise RemoteComputerError("unreachable") from None
        addresses = []
        for row in rows:
            address = ipaddress.ip_address(str(row[4][0]).split("%", 1)[0])
            if address not in addresses:
                addresses.append(address)
    if not addresses or any(not address.is_global for address in addresses):
        raise RemoteComputerError("unsafe_address")
    return [address.compressed for address in addresses]


def _scope() -> str | None:
    return tenant_schema.current_tenant_id()


def _lock(table: "weakref.WeakValueDictionary", key) -> asyncio.Lock:
    lock = table.get(key)
    if lock is None:
        lock = asyncio.Lock()
        table[key] = lock
    return lock


# ---------------------------------------------------------------- status

@dataclass(frozen=True)
class Health:
    ok: bool
    checked_at: datetime
    error: str | None
    at: float  # monotonic


_health: dict[tuple[str | None, str], Health] = {}
_health_locks: "weakref.WeakValueDictionary[tuple, asyncio.Lock]" = weakref.WeakValueDictionary()
_refreshing: set[asyncio.Task] = set()


def _health_client() -> httpx.AsyncClient:
    """A client that resolves the gateway to public addresses only (the MCP client's pinned transport).
    Tests replace this."""
    return httpx.AsyncClient(
        transport=mcp.PinnedHTTPSTransport(),
        timeout=httpx.Timeout(HEALTH_TIMEOUT_SECONDS - 1, connect=3),
        follow_redirects=False,
        trust_env=False,
    )


async def _probe(base: str) -> Health:
    error: str | None = None
    try:
        async with asyncio.timeout(HEALTH_TIMEOUT_SECONDS):
            async with _health_client() as client:
                response = await client.get(base + "/healthz", headers={"Accept": "text/plain"})
                await response.aclose()
        if response.status_code != 200:
            error = "bad_status"
    except (TimeoutError, httpx.TimeoutException):
        error = "timeout"
    except mcp.McpError as exc:
        error = "unsafe_address" if exc.code in ("unsafe_endpoint", "endpoint_mismatch") else "unreachable"
    except Exception:  # noqa: BLE001 - any other failure means the gateway did not answer
        error = "unreachable"
    return Health(ok=error is None, checked_at=datetime.now(UTC), error=error, at=time.monotonic())


async def health(base: str, *, force: bool = False, allow_stale: bool = False) -> Health:
    """The gateway's `/healthz` answer, cached for HEALTH_TTL_SECONDS. `allow_stale` returns an older
    answer at once and refreshes it in the background (an agent list must not wait on a gateway);
    with no answer yet it waits like a normal check."""
    key = (_scope(), base)
    cached = _health.get(key)
    now = time.monotonic()
    if not force and cached is not None and now - cached.at < HEALTH_TTL_SECONDS:
        return cached
    if allow_stale and not force and cached is not None:
        lock = _lock(_health_locks, key)
        if not lock.locked():
            task = asyncio.create_task(health(base, force=True))
            _refreshing.add(task)
            task.add_done_callback(_refreshing.discard)
        return cached
    async with _lock(_health_locks, key):
        cached = _health.get(key)
        if cached is not None and (cached.at > now or (not force and time.monotonic() - cached.at < HEALTH_TTL_SECONDS)):
            return cached  # answered by a check that finished while this one waited
        result = await _probe(base)
        _health[key] = result
        return result


def cached_health(base: str) -> Health | None:
    return _health.get((_scope(), base))


def state_of(*, enabled: bool, auth_mode: str, has_key: bool, answer: Health | None) -> str:
    if not enabled:
        return "disabled"
    if auth_mode != "bearer" or not has_key:
        return "needs_key"
    return "online" if answer is not None and answer.ok else "offline"


def forget(base: str | None = None) -> None:
    """Drop cached answers (all of them, or one gateway's). For tests and after a link changes."""
    if base is None:
        _health.clear()
        _screens.clear()
        return
    _health.pop((_scope(), base), None)


# ---------------------------------------------------------------- screenshot

_screens: dict[tuple, tuple[float, bytes, str]] = {}
_screen_locks: "weakref.WeakValueDictionary[tuple, asyncio.Lock]" = weakref.WeakValueDictionary()


def screenshot_tool(tools: list | None) -> str | None:
    """The gateway's screenshot tool among a listed toolset: a known name first, then any tool whose
    name says screenshot and needs no arguments."""
    candidates = {}
    for tool in tools or []:
        if isinstance(tool, dict) and isinstance(tool.get("name"), str):
            candidates[tool["name"]] = tool
    for name in PREFERRED_SCREENSHOT_TOOLS:
        if name in candidates:
            return name
    for name, tool in sorted(candidates.items()):
        schema = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {}
        if "screenshot" in name.lower() and not schema.get("required"):
            return name
    return None


def _image_type(data: bytes) -> str | None:
    if data.startswith(PNG_MAGIC):
        return "image/png"
    if data.startswith(JPEG_MAGIC):
        return "image/jpeg"
    return None


def _session(endpoint: str, token: str) -> mcp.RemoteMcpSession:
    session = mcp.RemoteMcpSession(endpoint, token)
    session.max_tools, session.max_toolset_bytes = mcp.CUSTOM_MAX_TOOLS, mcp.CUSTOM_MAX_TOOLSET_BYTES
    session.max_result_bytes = MAX_SCREENSHOT_RESPONSE_BYTES
    return session


async def _capture(endpoint: str, token: str, tools: list | None) -> tuple[bytes, str]:
    session = _session(endpoint, token)
    try:
        async with asyncio.timeout(SCREENSHOT_TIMEOUT_SECONDS):
            name = screenshot_tool(tools)
            if name is None:
                # The saved toolset is from the last test; ask the gateway itself before giving up.
                name = screenshot_tool(await session.list_tools())
            if name is None:
                raise RemoteComputerError("screenshot_not_offered")
            images = await session.call_tool_images(name, {})
    except RemoteComputerError:
        raise
    except TimeoutError:
        raise RemoteComputerError("screenshot_failed", 504) from None
    except mcp.McpError as exc:
        raise RemoteComputerError("key_rejected" if exc.code == "authentication_failed" else "screenshot_failed") from None
    except Exception:  # noqa: BLE001
        raise RemoteComputerError("screenshot_failed") from None
    finally:
        await session.close()
    for _mime, data in images:
        kind = _image_type(data)
        if kind is not None:
            return data, kind
    raise RemoteComputerError("screenshot_failed")


async def screenshot(computer_id: int, endpoint: str, token: str, tools: list | None) -> tuple[bytes, str]:
    """(image bytes, MIME type) of the desktop now, at most SCREENSHOT_TTL_SECONDS old. One capture
    at a time per computer: concurrent viewers share it."""
    key = (_scope(), computer_id, endpoint)
    cached = _screens.get(key)
    if cached is not None and time.monotonic() - cached[0] < SCREENSHOT_TTL_SECONDS:
        return cached[1], cached[2]
    async with _lock(_screen_locks, key):
        cached = _screens.get(key)
        if cached is not None and time.monotonic() - cached[0] < SCREENSHOT_TTL_SECONDS:
            return cached[1], cached[2]
        data, kind = await _capture(endpoint, token, tools)
        for old in [k for k in _screens if k[:2] == key[:2] and k != key]:
            _screens.pop(old, None)
        _screens[key] = (time.monotonic(), data, kind)
        return data, kind


# ---------------------------------------------------------------- human control

def _saved_owner_name() -> str | None:
    """The owner's name from their saved profile (never guessed from the machine)."""
    from app.services import user_profile

    try:
        data = json.loads(user_profile.profile_file_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    name = str(data.get("name") or "").strip() if isinstance(data, dict) else ""
    return " ".join(name.split())[:80] or None


async def controller_name(db: AsyncSession, row: RemoteComputer) -> str:
    if row.control_person_id is not None:
        person = await db.get(Person, row.control_person_id)
        if person is not None and person.display_name:
            return person.display_name
    return await asyncio.to_thread(_saved_owner_name) or OWNER_NAME_FALLBACK


def refusal_message(who: str, computer: str) -> str:
    return (f'{who} has taken control of your computer "{computer}", so this call was refused and did not run. '
            f"Wait until {who} hands it back, or carry on without the computer.")


async def control_refusal(db: AsyncSession, connection_id: str) -> str | None:
    """The message for an agent whose call to this connection's tools must be refused because a person
    holds its computer, or None. Any agent's call is refused, not only the linked agent's: nobody but
    the person drives a desktop they took over."""
    row = await db.scalar(select(RemoteComputer).where(
        RemoteComputer.mcp_connection_id == connection_id, RemoteComputer.human_control.is_(True),
    ))
    if row is None:
        return None
    return refusal_message(await controller_name(db, row), row.name)


# ---------------------------------------------------------------- viewer

viewers = Viewers()


def viewer_identity(principal) -> tuple:
    """Who may use a ticket: the same signed-in session, in the same account."""
    kind, session = (principal.kind, principal.session_id) if principal else ("loopback", None)
    return (kind, session, _scope())


def viewer_key(computer_id: int) -> tuple:
    return ("remote", _scope(), computer_id)


async def close_control_viewers(computer_id: int) -> None:
    """End the live control sessions of a computer (after hand-back). Watch-only ones stay open."""
    key = viewer_key(computer_id)
    for ident, (cid, websocket) in list(viewers.active.items()):
        if cid == key and ident not in viewers.view_only:
            try:
                await websocket.close(code=4410)
            except Exception:  # noqa: BLE001
                pass


async def open_upstream(base: str, token: str):
    """The desktop's VNC stream through its gateway, authenticated with the connection's bearer token,
    connected only to a public address the host resolved to (the TLS name stays the host). Tests
    replace this."""
    import websockets

    host = _host(base)
    addresses = await resolve_public(host)
    last: Exception | None = None
    for address in addresses:
        try:
            return await websockets.connect(
                f"wss://{host}/websockify",
                host=address, port=443, server_hostname=host, ssl=ssl.create_default_context(),
                additional_headers={"Authorization": f"Bearer {token}"},
                subprotocols=["binary"], origin=None, proxy=None, compression=None,
                open_timeout=8, max_size=MAX_UPSTREAM_FRAME_BYTES, ping_interval=20, ping_timeout=20,
                user_agent_header="lukethomas",
            )
        except Exception as exc:  # noqa: BLE001 - try the next address; the reason is not shown
            last = exc
    if last is not None and getattr(getattr(last, "response", None), "status_code", None) in (401, 403):
        raise RemoteComputerError("key_rejected")
    raise RemoteComputerError("unreachable")


async def bridge(websocket, upstream, *, view_only: bool, valid) -> None:
    """Relay binary RFB between the browser and the gateway until either side ends, `valid()` turns
    False or nothing arrives at first. In view mode the browser's input never reaches the desktop."""
    rfb = ViewOnlyFilter() if view_only else None

    async def outbound():
        # Only the first frame has a deadline: a still desktop sends nothing for as long as it is still,
        # and a dead gateway is noticed by the WebSocket's own pings.
        message = await asyncio.wait_for(upstream.recv(), VIEWER_FIRST_BYTE_SECONDS)
        while True:
            # websockify's text (base64) mode is not used with the binary subprotocol: text is skipped.
            if not isinstance(message, str):
                if rfb is not None:
                    rfb.server(message)
                await websocket.send_bytes(message)
            message = await upstream.recv()

    async def inbound():
        while True:
            data = await websocket.receive_bytes()
            if len(data) > MAX_VIEWER_MESSAGE_BYTES:
                await websocket.close(code=1009)
                return
            if rfb is not None:
                data = rfb.client(data)
                if not data:
                    continue
            await upstream.send(data)

    async def revalidate():
        while True:
            await asyncio.sleep(VIEWER_REVALIDATE_SECONDS)
            if not await valid():
                await websocket.close(code=4409)
                return

    tasks = [asyncio.create_task(fn()) for fn in (outbound, inbound, revalidate)]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if not task.cancelled() and isinstance(task.exception(), RfbFilterError):
                logger.info("watch-only viewer closed: the stream could not be filtered")
                try:
                    await websocket.close(code=1008)
                except Exception:  # noqa: BLE001
                    pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            await upstream.close()
        except Exception:  # noqa: BLE001
            pass
