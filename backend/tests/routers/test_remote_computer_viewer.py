"""The live desktop of a cloud computer: the WebSocket route (tickets, modes, who may control) and the
relay to the gateway, with watch-only input filtering. The gateway is a fake upstream socket."""
import asyncio
import json
import struct
from types import SimpleNamespace as NS
from uuid import uuid4

import httpx
import pytest
from fastapi import WebSocketDisconnect
from sqlalchemy import delete

from app import community_mcp
from app.auth.policy import Principal
from app.core import crypto
from app.db.models import CustomMcpConnection, RemoteComputer, UserCredential
from app.routers import custom_mcp
from app.routers import remote_computers as routes
from app.services import remote_computers as service
from app.services.community_mcp_bridge import CUSTOM_CREDENTIAL_PREFIX
from tests.services.thread_harness import cleanup, owner, sessions  # noqa: F401

SECRET = "gateway_SECRET_token_value_123456"
V38 = b"RFB 003.008\n"
KEY = struct.pack(">BBxxI", 4, 1, 0x61)
POINTER = struct.pack(">BBHH", 5, 1, 10, 20)
UPDATE_REQUEST = struct.pack(">BBHHHH", 3, 1, 0, 0, 1280, 960)


class Browser:
    """The viewer's side of the socket."""

    def __init__(self, messages, subprotocols=("binary",), principal=None, ticket=""):
        self.incoming: asyncio.Queue = asyncio.Queue()
        for message in messages:
            self.incoming.put_nowait(message)
        self.sent: list[bytes] = []
        self.accepted: str | None | bool = False
        self.closed: int | None = None
        self.scope = {"subprotocols": list(subprotocols), "state": {"auth": principal}}
        self.query_params = {"ticket": ticket}

    async def accept(self, subprotocol=None):
        self.accepted = subprotocol

    async def receive_bytes(self):
        message = await self.incoming.get()
        if message is None:
            raise WebSocketDisconnect()
        return message

    async def send_bytes(self, data):
        self.sent.append(data)

    async def close(self, code=1000):
        if self.closed is None:
            self.closed = code


class Desktop:
    """The gateway's VNC socket."""

    def __init__(self, frames=(V38, b"\x01\x01", b"\x00\x00\x00\x00")):
        self.frames: asyncio.Queue = asyncio.Queue()
        for frame in frames:
            self.frames.put_nowait(frame)
        self.sent: list[bytes] = []
        self.closed = False

    async def recv(self):
        return await self.frames.get()

    async def send(self, data):
        self.sent.append(bytes(data))

    async def close(self):
        self.closed = True


async def always_valid():
    return True


# ---------------------------------------------------------------- the relay

async def test_watching_relays_the_screen_and_drops_the_viewers_input():
    browser = Browser([V38, b"\x01", b"\x01", KEY, UPDATE_REQUEST, POINTER, UPDATE_REQUEST, None])
    desktop = Desktop()
    await service.bridge(browser, desktop, view_only=True, valid=always_valid)
    assert b"".join(desktop.sent) == V38 + b"\x01" + b"\x01" + UPDATE_REQUEST + UPDATE_REQUEST
    assert V38 in browser.sent and desktop.closed


async def test_in_control_the_viewers_input_reaches_the_desktop():
    browser = Browser([V38, b"\x01", b"\x01", KEY, POINTER, None])
    desktop = Desktop()
    await service.bridge(browser, desktop, view_only=False, valid=always_valid)
    assert b"".join(desktop.sent) == V38 + b"\x01" + b"\x01" + KEY + POINTER


async def test_text_frames_from_the_gateway_are_not_relayed():
    browser = Browser([V38, b"\x01", b"\x01", None])
    desktop = Desktop(frames=(V38, "base64 text", b"\x01\x01"))
    await service.bridge(browser, desktop, view_only=True, valid=always_valid)
    await asyncio.sleep(0)
    assert "base64 text" not in browser.sent and all(isinstance(frame, bytes) for frame in browser.sent)


async def test_a_watcher_stream_that_cannot_be_filtered_is_closed():
    browser = Browser([V38, b"\x01", b"\x01", bytes([7, 0, 0, 0]), UPDATE_REQUEST])
    desktop = Desktop()
    await service.bridge(browser, desktop, view_only=True, valid=always_valid)
    assert browser.closed == 1008
    assert bytes([7, 0, 0, 0]) not in b"".join(desktop.sent)


async def test_the_relay_stops_when_it_is_no_longer_allowed(monkeypatch):
    monkeypatch.setattr(service, "VIEWER_REVALIDATE_SECONDS", 0.05)
    browser = Browser([V38])

    async def revoked():
        return False

    await asyncio.wait_for(service.bridge(browser, Desktop(), view_only=False, valid=revoked), 5)
    assert browser.closed == 4409


async def test_an_oversized_message_closes_the_relay():
    browser = Browser([b"\x00" * (service.MAX_VIEWER_MESSAGE_BYTES + 1)])
    await asyncio.wait_for(service.bridge(browser, Desktop(), view_only=False, valid=always_valid), 5)
    assert browser.closed == 1009


# ---------------------------------------------------------------- the route

@pytest.fixture
async def world(sessions, owner, monkeypatch):
    monkeypatch.setattr(custom_mcp, "LOCAL_OWNER_ID", owner)
    tool = community_mcp._normalize_tool({"name": "computer_screenshot", "inputSchema": {"type": "object"}})
    async with sessions() as db:
        connection = CustomMcpConnection(
            id=uuid4().hex, owner_id=owner, name="Atlas gateway", endpoint="https://gateway-atlas.example.com/mcp",
            auth_mode="bearer", enabled=True, revision=1, tested_revision=1, tools_snapshot=[tool])
        db.add(connection)
        await db.flush()
        db.add(UserCredential(user_id=owner, provider=CUSTOM_CREDENTIAL_PREFIX + connection.id, file_path="-",
                              ciphertext=crypto.encrypt(json.dumps(SECRET))))
        computer = RemoteComputer(name="Atlas desktop", mcp_connection_id=connection.id)
        db.add(computer)
        await db.commit()
    service.forget()
    monkeypatch.setattr(service, "_health_client", lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="ok"))))
    opened: list[tuple[str, str]] = []
    desktops: list[Desktop] = []

    async def open_upstream(base, token):
        opened.append((base, token))
        desktop = Desktop()
        desktops.append(desktop)
        return desktop

    monkeypatch.setattr(service, "open_upstream", open_upstream)
    yield NS(connection=connection, computer=computer, opened=opened, desktops=desktops)
    service.forget()
    async with sessions() as db:
        await db.execute(delete(RemoteComputer).where(RemoteComputer.id == computer.id))
        await db.execute(delete(UserCredential).where(UserCredential.user_id == owner))
        await db.execute(delete(CustomMcpConnection).where(CustomMcpConnection.id == connection.id))
        await db.commit()


PRINCIPAL = Principal(kind="browser", scopes=("admin", "chat"), session_id=None)
POLICY = NS(authorize=lambda websocket: None)


async def connect(sessions, world, browser):
    async with sessions() as db:
        await asyncio.wait_for(routes.viewer(browser, world.computer.id, policy=POLICY, db=db), 10)


def ticket(world, mode, principal=PRINCIPAL):
    return service.viewers.issue(service.viewer_key(world.computer.id), "", service.viewer_identity(principal), mode=mode)


async def test_a_watch_ticket_opens_the_gateways_stream_with_its_key_and_filters_input(sessions, world):
    browser = Browser([V38, b"\x01", b"\x01", KEY, UPDATE_REQUEST, None], principal=PRINCIPAL, ticket=ticket(world, "view"))
    await connect(sessions, world, browser)
    assert world.opened == [("https://gateway-atlas.example.com", SECRET)]
    assert browser.accepted == "binary"
    assert b"".join(world.desktops[0].sent) == V38 + b"\x01" + b"\x01" + UPDATE_REQUEST
    assert service.viewers.active == {} and service.viewers.view_only == set()


async def test_a_ticket_works_once(sessions, world):
    token = ticket(world, "view")
    await connect(sessions, world, Browser([None], principal=PRINCIPAL, ticket=token))
    again = Browser([None], principal=PRINCIPAL, ticket=token)
    await connect(sessions, world, again)
    assert again.closed == 4403 and len(world.opened) == 1


async def test_a_ticket_is_bound_to_who_asked_for_it(sessions, world):
    token = ticket(world, "view")
    stranger = Principal(kind="device", scopes=("admin",), session_id=None)
    browser = Browser([None], principal=stranger, ticket=token)
    await connect(sessions, world, browser)
    assert browser.closed == 4403 and world.opened == []


async def test_control_needs_control_taken(sessions, world):
    browser = Browser([None], principal=PRINCIPAL, ticket=ticket(world, "control"))
    await connect(sessions, world, browser)
    # Accepted first: a close before the accept reaches the browser as 1006, and the page acts on 4409.
    assert browser.accepted == "binary"
    assert browser.closed == 4409 and world.opened == []
    async with sessions() as db:
        (await db.get(RemoteComputer, world.computer.id)).human_control = True
        await db.commit()
    browser = Browser([V38, b"\x01", b"\x01", KEY, None], principal=PRINCIPAL, ticket=ticket(world, "control"))
    await connect(sessions, world, browser)
    assert b"".join(world.desktops[0].sent).endswith(KEY)  # in control, typing reaches the desktop


async def test_too_many_viewers_is_said_with_its_own_code(sessions, world, monkeypatch):
    monkeypatch.setattr(service.viewers, "reserve", lambda key, websocket: None)
    browser = Browser([None], principal=PRINCIPAL, ticket=ticket(world, "view"))
    await connect(sessions, world, browser)
    assert browser.accepted == "binary" and browser.closed == 4429 and world.opened == []


async def test_a_signed_in_non_admin_cannot_open_it(sessions, world):
    chat = Principal(kind="device", scopes=("chat",), session_id=None)
    browser = Browser([None], principal=chat, ticket=ticket(world, "view", chat))
    await connect(sessions, world, browser)
    assert browser.closed == 4403 and world.opened == []


async def test_a_gateway_that_refuses_the_stream_closes_with_its_own_code(sessions, world, monkeypatch):
    async def refused(base, token):
        raise service.RemoteComputerError("key_rejected")

    monkeypatch.setattr(service, "open_upstream", refused)
    browser = Browser([None], principal=PRINCIPAL, ticket=ticket(world, "view"))
    await connect(sessions, world, browser)
    assert browser.closed == 4502


async def test_an_offline_computer_refuses_the_viewer(sessions, world, monkeypatch):
    service.forget()
    monkeypatch.setattr(service, "_health_client", lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))))
    browser = Browser([None], principal=PRINCIPAL, ticket=ticket(world, "view"))
    await connect(sessions, world, browser)
    assert browser.closed == 1008 and world.opened == []


# ---------------------------------------------------------------- address safety

@pytest.mark.parametrize("answer", ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1"])
async def test_a_gateway_that_resolves_to_a_private_address_is_never_contacted(monkeypatch, answer):
    import socket

    async def getaddrinfo(host, port, type=None):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (answer, port))]

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", getaddrinfo)
    with pytest.raises(service.RemoteComputerError) as refused:
        await service.open_upstream("https://gateway.example.com", SECRET)
    assert refused.value.code == "unsafe_address"
