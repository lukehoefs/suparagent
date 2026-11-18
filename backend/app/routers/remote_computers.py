"""Agent cloud computers (remote gateways): link one to a custom MCP connection and an agent, see
its status and screen, take control and hand it back, and open its live desktop.

Admin only (auth/policy.py lists none of these routes for other scopes). The gateway address is
derived from the linked connection's endpoint, never accepted from the client, and the
connection's bearer token is read from the credential store for each use and never returned.
"""

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import community_mcp as mcp
from app.auth.middleware import principal_of
from app.db.models import Agent, CustomMcpConnection, RemoteComputer, UserCredential
from app.db.models.auth import AuthSession
from app.db.session import get_db
from app.db.transactions import begin_write, release_snapshot
from app.routers import custom_mcp
from app.routers.integrations import _owner
from app.schemas.remote_computer import (
    RemoteComputerBrief,
    RemoteComputerCreate,
    RemoteComputerOut,
    RemoteComputerUpdate,
    ViewerTicketOut,
    ViewerTicketRequest,
)
from app.services import remote_computers as service
from app.services.local_access_policy import get_local_access_policy, require_local_access

API_PREFIX = "/api/v1"
router = APIRouter(tags=["Remote computers"])
_HTTP = [Depends(require_local_access), Depends(_owner)]


def _owner_id() -> str:
    """The account the linked connections belong to (the same owner the custom MCP routes use)."""
    return custom_mcp.LOCAL_OWNER_ID


def _actor(connection) -> custom_mcp.Actor:
    principal = principal_of(connection.scope)
    return custom_mcp.Actor(person_id=getattr(principal, "person_id", None))


def _fail(status: int, code: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"error_code": code})


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _clean_name(value: str) -> str:
    name = " ".join(value.split())
    if not name or len(name) > 100 or any(ord(char) < 32 or ord(char) == 127 for char in name):
        raise _fail(422, "invalid_name")
    return name


# ---------------------------------------------------------------- reads

async def _connection(db: AsyncSession, connection_id: str, actor: custom_mcp.Actor) -> CustomMcpConnection:
    row = await db.scalar(select(CustomMcpConnection).where(
        CustomMcpConnection.id == connection_id, CustomMcpConnection.owner_id == _owner_id(),
    ))
    if row is None or not custom_mcp._can_manage(row, actor):
        raise _fail(404, "connection_not_found")  # someone else's private connection looks absent
    return row


async def _computer(db: AsyncSession, computer_id: int, actor: custom_mcp.Actor, *, lock: bool = False
                    ) -> tuple[RemoteComputer, CustomMcpConnection]:
    query = select(RemoteComputer).where(RemoteComputer.id == computer_id)
    if lock:
        query = query.with_for_update()
    row = await db.scalar(query)
    if row is None:
        raise _fail(404, "remote_computer_not_found")
    connection = await db.scalar(select(CustomMcpConnection).where(
        CustomMcpConnection.id == row.mcp_connection_id, CustomMcpConnection.owner_id == _owner_id(),
    ))
    if connection is None or not custom_mcp._can_manage(connection, actor):
        raise _fail(404, "remote_computer_not_found")
    return row, connection


async def _agent(db: AsyncSession, agent_id: int) -> Agent:
    agent = await db.scalar(select(Agent).where(
        Agent.id == agent_id, Agent.owner_id == _owner_id(), Agent.archived_at.is_(None),
    ))
    if agent is None:
        raise _fail(404, "agent_not_found")
    return agent


async def _keys(db: AsyncSession, connection_ids: list[str], owner_id: str | None = None) -> set[str]:
    """Which of these connections have a saved secret (never read here, only whether it exists)."""
    if not connection_ids:
        return set()
    providers = {custom_mcp._provider(cid): cid for cid in connection_ids}
    rows = (await db.scalars(select(UserCredential.provider).where(
        UserCredential.user_id == (owner_id or _owner_id()), UserCredential.provider.in_(list(providers)),
    ))).all()
    return {providers[p] for p in rows if p in providers}


def _base(connection: CustomMcpConnection) -> str | None:
    try:
        return service.base_url(connection.endpoint)
    except mcp.McpError:
        return None


async def _status(connection: CustomMcpConnection, has_key: bool, *, force: bool = False,
                  allow_stale: bool = False) -> tuple[str, service.Health | None, str | None]:
    """(state, the gateway's last answer, base URL). The gateway is asked only when the state depends on it."""
    base = _base(connection)
    if base is None:  # not a public HTTPS endpoint (the custom MCP routes never save one): never asked
        return service.state_of(enabled=connection.enabled, auth_mode=connection.auth_mode, has_key=has_key,
                                answer=None), None, None
    needs_answer = connection.enabled and connection.auth_mode == "bearer" and has_key
    answer = (await service.health(base, force=force, allow_stale=allow_stale) if needs_answer
              else service.cached_health(base))
    state = service.state_of(enabled=connection.enabled, auth_mode=connection.auth_mode, has_key=has_key,
                             answer=answer if needs_answer else None)
    return state, answer, base


def _build(row: RemoteComputer, connection: CustomMcpConnection, *, has_key: bool, agent_name: str | None,
           status: tuple[str, service.Health | None, str | None]) -> RemoteComputerOut:
    state, answer, base = status
    return RemoteComputerOut(
        id=row.id, name=row.name, mcp_connection_id=row.mcp_connection_id, connection_name=connection.name,
        agent_id=row.agent_id, agent_name=agent_name if row.agent_id is not None else None,
        base_url=base or "", state=state, human_control=row.human_control,
        control_started_at=row.control_started_at if row.human_control else None,
        live_view=state == "online" and has_key,
        last_checked_at=answer.checked_at if answer is not None else None,
        last_error=answer.error if answer is not None else None,
    )


async def _out(db: AsyncSession, row: RemoteComputer, connection: CustomMcpConnection, *,
               force: bool = False) -> RemoteComputerOut:
    has_key = row.mcp_connection_id in await _keys(db, [row.mcp_connection_id])
    agent_name = None
    if row.agent_id is not None:
        agent_name = await db.scalar(select(Agent.name).where(Agent.id == row.agent_id, Agent.owner_id == _owner_id()))
    await release_snapshot(db)  # a status check may wait on the network: hold no snapshot meanwhile
    status = await _status(connection, has_key, force=force)
    return _build(row, connection, has_key=has_key, agent_name=agent_name, status=status)


def _cached_status(connection: CustomMcpConnection, has_key: bool) -> tuple[str, service.Health | None, str | None]:
    """`_status` from the last answer only, never asking the gateway now: a missing or stale answer
    starts a check in the background (service.refresh_soon), and with no answer yet the computer
    reads as offline until a later read (the Computers page and the live panel ask the gateway)."""
    base = _base(connection)
    needs_answer = connection.enabled and connection.auth_mode == "bearer" and has_key
    answer = service.cached_health(base) if base is not None else None
    if base is not None and needs_answer:
        service.refresh_soon(base)
    state = service.state_of(enabled=connection.enabled, auth_mode=connection.auth_mode, has_key=has_key,
                             answer=answer if needs_answer else None)
    return state, answer, base


async def briefs_for_agents(db: AsyncSession, owner_id: str, agent_ids: list[int]) -> dict[int, RemoteComputerBrief]:
    """Each agent's cloud computer for the agent JSON, from the last status answer only: listing agents
    never waits on a gateway (and never holds its database session while one answers)."""
    if not agent_ids:
        return {}
    rows = (await db.execute(
        select(RemoteComputer, CustomMcpConnection)
        .join(CustomMcpConnection, CustomMcpConnection.id == RemoteComputer.mcp_connection_id)
        .where(RemoteComputer.agent_id.in_(agent_ids), CustomMcpConnection.owner_id == owner_id)
    )).all()
    keys = await _keys(db, [connection.id for _, connection in rows], owner_id)
    statuses = [_cached_status(connection, connection.id in keys) for _, connection in rows]
    return {
        row.agent_id: RemoteComputerBrief(id=row.id, name=row.name, state=status[0], human_control=row.human_control)
        for (row, _connection), status in zip(rows, statuses)
    }


# ---------------------------------------------------------------- CRUD

@router.get("/remote-computers", response_model=list[RemoteComputerOut], dependencies=_HTTP)
async def list_remote_computers(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    _no_store(response)
    actor = _actor(request)
    rows = (await db.execute(
        select(RemoteComputer, CustomMcpConnection)
        .join(CustomMcpConnection, CustomMcpConnection.id == RemoteComputer.mcp_connection_id)
        .where(CustomMcpConnection.owner_id == _owner_id())
        .order_by(RemoteComputer.created_at, RemoteComputer.id)
    )).all()
    rows = [(row, connection) for row, connection in rows if custom_mcp._can_manage(connection, actor)]
    keys = await _keys(db, [connection.id for _, connection in rows])
    agent_ids = [row.agent_id for row, _ in rows if row.agent_id is not None]
    names = dict((await db.execute(select(Agent.id, Agent.name).where(
        Agent.id.in_(agent_ids), Agent.owner_id == _owner_id()))).all()) if agent_ids else {}
    await release_snapshot(db)
    # Gateways are asked side by side, never one after another.
    statuses = await asyncio.gather(*[_status(connection, connection.id in keys) for _, connection in rows])
    return [
        _build(row, connection, has_key=connection.id in keys, agent_name=names.get(row.agent_id), status=status)
        for (row, connection), status in zip(rows, statuses)
    ]


def _conflict(exc: IntegrityError) -> HTTPException:
    text = str(exc.orig).lower()
    return _fail(409, "agent_already_linked" if "agent" in text else "connection_already_linked")


async def _check_free(db: AsyncSession, *, connection_id: str | None = None, agent_id: int | None = None,
                      except_id: int | None = None) -> None:
    if connection_id is not None:
        taken = await db.scalar(select(RemoteComputer.id).where(RemoteComputer.mcp_connection_id == connection_id))
        if taken is not None and taken != except_id:
            raise _fail(409, "connection_already_linked")
    if agent_id is not None:
        taken = await db.scalar(select(RemoteComputer.id).where(RemoteComputer.agent_id == agent_id))
        if taken is not None and taken != except_id:
            raise _fail(409, "agent_already_linked")


@router.post("/remote-computers", response_model=RemoteComputerOut, status_code=201, dependencies=_HTTP)
async def create_remote_computer(payload: RemoteComputerCreate, request: Request, response: Response,
                                 db: AsyncSession = Depends(get_db)):
    _no_store(response)
    actor = _actor(request)
    name = _clean_name(payload.name)
    await begin_write(db)
    connection = await _connection(db, payload.mcp_connection_id, actor)
    if connection.auth_mode != "bearer":
        await db.rollback()
        raise _fail(422, "bearer_required")
    if _base(connection) is None:
        await db.rollback()
        raise _fail(422, "unsafe_endpoint")
    if payload.agent_id is not None:
        await _agent(db, payload.agent_id)
    try:
        await _check_free(db, connection_id=connection.id, agent_id=payload.agent_id)
    except HTTPException:
        await db.rollback()
        raise
    row = RemoteComputer(name=name, mcp_connection_id=connection.id, agent_id=payload.agent_id, human_control=False)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from None
    await db.refresh(row)
    return await _out(db, row, connection)


@router.patch("/remote-computers/{computer_id}", response_model=RemoteComputerOut, dependencies=_HTTP)
async def update_remote_computer(computer_id: int, payload: RemoteComputerUpdate, request: Request,
                                 response: Response, db: AsyncSession = Depends(get_db)):
    _no_store(response)
    actor = _actor(request)
    sent = payload.model_fields_set
    name = _clean_name(payload.name) if "name" in sent and payload.name is not None else None
    if "name" in sent and payload.name is None:
        raise _fail(422, "invalid_name")
    await begin_write(db)
    row, connection = await _computer(db, computer_id, actor, lock=True)
    if name is not None:
        row.name = name
    if "agent_id" in sent and payload.agent_id != row.agent_id:
        if payload.agent_id is not None:
            try:
                await _agent(db, payload.agent_id)
                await _check_free(db, agent_id=payload.agent_id, except_id=row.id)
            except HTTPException:
                await db.rollback()
                raise
        row.agent_id = payload.agent_id
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _conflict(exc) from None
    await db.refresh(row)
    return await _out(db, row, connection)


@router.delete("/remote-computers/{computer_id}", status_code=204, dependencies=_HTTP)
async def delete_remote_computer(computer_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Removes the link only: the custom MCP connection, its key and its tool grants stay."""
    actor = _actor(request)
    await begin_write(db)
    row, _connection_row = await _computer(db, computer_id, actor, lock=True)
    await db.delete(row)
    await db.commit()
    await service.viewers.close_computer(service.viewer_key(computer_id))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/remote-computers/{computer_id}/check", response_model=RemoteComputerOut, dependencies=_HTTP)
async def check_remote_computer(computer_id: int, request: Request, response: Response,
                                db: AsyncSession = Depends(get_db)):
    _no_store(response)
    row, connection = await _computer(db, computer_id, _actor(request))
    return await _out(db, row, connection, force=True)


# ---------------------------------------------------------------- screen

async def _token(db: AsyncSession, connection: CustomMcpConnection) -> str | None:
    if connection.auth_mode != "bearer":
        return None
    return await custom_mcp._credential(db, connection.id)


def _unavailable(state: str) -> HTTPException:
    return _fail(409, {"disabled": "computer_disabled", "needs_key": "computer_needs_key",
                       "offline": "computer_offline"}.get(state, "computer_offline"))


async def _live(db: AsyncSession, connection: CustomMcpConnection) -> tuple[str, str, str]:
    """(endpoint, token, base URL) of a computer that can be looked at now, or 409 with its state."""
    endpoint = connection.endpoint
    token = await _token(db, connection)
    state, _answer, base = await _status(connection, token is not None)
    if state != "online" or token is None or base is None:
        raise _unavailable(state)
    return endpoint, token, base


@router.get("/remote-computers/{computer_id}/screenshot", dependencies=_HTTP)
async def remote_computer_screenshot(computer_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """The desktop as a picture, from the gateway's own screenshot tool (at most ~2 s old)."""
    row, connection = await _computer(db, computer_id, _actor(request))
    tools = connection.tools_snapshot
    endpoint, token, _base_url = await _live(db, connection)
    try:
        data, kind = await service.screenshot(row.id, endpoint, token, tools)
    except service.RemoteComputerError as exc:
        raise _fail(exc.status, exc.code) from None
    return Response(content=data, media_type=kind, headers={
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })


# ---------------------------------------------------------------- control

@router.post("/remote-computers/{computer_id}/take-control", response_model=RemoteComputerOut, dependencies=_HTTP)
async def take_control(computer_id: int, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """From now until hand-back, every agent call to this computer's tools is refused (not asked)."""
    _no_store(response)
    actor = _actor(request)
    await begin_write(db)
    row, connection = await _computer(db, computer_id, actor, lock=True)
    if not row.human_control:
        row.human_control = True
        row.control_started_at = datetime.now(UTC)
        row.control_person_id = actor.person_id
        await db.commit()
        await db.refresh(row)
    else:
        await db.commit()  # nothing changed: end the write and keep the loaded row (a rollback would expire it)
    return await _out(db, row, connection)


@router.post("/remote-computers/{computer_id}/hand-back", response_model=RemoteComputerOut, dependencies=_HTTP)
async def hand_back(computer_id: int, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    _no_store(response)
    await begin_write(db)
    row, connection = await _computer(db, computer_id, _actor(request), lock=True)
    if row.human_control:
        row.human_control = False
        row.control_started_at = None
        row.control_person_id = None
        await db.commit()
        await db.refresh(row)
    else:
        await db.commit()  # nothing changed: end the write and keep the loaded row
    await service.close_control_viewers(row.id)
    return await _out(db, row, connection)


# ---------------------------------------------------------------- viewer

@router.post("/remote-computers/{computer_id}/viewer-ticket", response_model=ViewerTicketOut, dependencies=_HTTP)
async def viewer_ticket(computer_id: int, payload: ViewerTicketRequest, request: Request, response: Response,
                        db: AsyncSession = Depends(get_db)):
    """A single-use ticket (30 s) for the live desktop. `control` needs control taken first."""
    _no_store(response)
    row, connection = await _computer(db, computer_id, _actor(request))
    if payload.mode == "control" and not row.human_control:
        raise _fail(409, "control_not_taken")
    await _live(db, connection)
    try:
        ticket = service.viewers.issue(service.viewer_key(row.id), "", service.viewer_identity(principal_of(request.scope)),
                                       mode=payload.mode)
    except ValueError:
        raise _fail(429, "too_many_viewers") from None
    return ViewerTicketOut(ticket=ticket, path=f"{API_PREFIX}/remote-computers/{row.id}/viewer?ticket={ticket}")


@router.websocket("/remote-computers/{computer_id}/viewer")
async def viewer(websocket: WebSocket, computer_id: int, policy=Depends(get_local_access_policy),
                 db: AsyncSession = Depends(get_db)):
    """Close codes: 4403 bad or used ticket, 4409 no longer allowed (control handed back, key or
    gateway changed, signed out), 4410 handed back or unlinked, 4429 too many viewers, 4502 the
    gateway's desktop stream did not open, 1008 refused or (watching) a stream that cannot be filtered.
    Every 44xx code is sent on an accepted socket: a close before the accept reaches the browser as
    an HTTP 403 (code 1006), and the page acts on these codes (4409: reconnect watching)."""
    # Short sessions from the same database as the request: none is held open while the desktop streams.
    sessions = async_sessionmaker(bind=db.bind, expire_on_commit=False)
    await db.close()
    manager = service.viewers
    key = service.viewer_key(computer_id)
    principal = principal_of(websocket.scope)
    actor = _actor(websocket)
    subprotocol = "binary" if "binary" in websocket.scope.get("subprotocols", []) else None

    async def refuse(code: int) -> None:
        await websocket.accept(subprotocol=subprotocol)
        await websocket.close(code=code)

    try:
        policy.authorize(websocket)
        if principal is not None and not principal.is_admin:
            await refuse(4403)
            return
        ticket = manager.consume(websocket.query_params.get("ticket", ""), key, service.viewer_identity(principal))
        if not ticket:
            await refuse(4403)
            return
        view_only = ticket.mode == "view"
        async with sessions() as session:
            row, connection = await _computer(session, computer_id, actor)
            if not view_only and not row.human_control:
                await refuse(4409)
                return
            endpoint = connection.endpoint
            _endpoint, token, base = await _live(session, connection)
        ident = manager.reserve(key, websocket)
        if ident is None:
            await refuse(4429)
            return
    except Exception:  # noqa: BLE001 - LocalAccessDenied, HTTP errors: neither can be sent on a socket
        try:
            await websocket.close(code=1008)
        except Exception:  # noqa: BLE001
            pass
        return
    if view_only:
        manager.view_only.add(ident)

    async def valid() -> bool:
        """Still signed in, still linked to the same gateway with the same key, and (to control) still held."""
        try:
            async with sessions() as session:
                if principal is not None and principal.session_id:
                    signed_in = await session.get(AuthSession, principal.session_id)
                    if signed_in is None or signed_in.revoked_at or signed_in.expires_at <= datetime.now(UTC):
                        return False
                current, current_connection = await _computer(session, computer_id, actor)
                if current_connection.endpoint != endpoint or not current_connection.enabled:
                    return False
                if not view_only and not current.human_control:
                    return False
                return await _token(session, current_connection) == token
        except Exception:  # noqa: BLE001
            return False

    try:
        try:
            upstream = await service.open_upstream(base, token)
        except service.RemoteComputerError:
            await websocket.accept(subprotocol=subprotocol)
            await websocket.close(code=4502)
            return
        await websocket.accept(subprotocol=subprotocol)
        await service.bridge(websocket, upstream, view_only=view_only, valid=valid)
    except (WebSocketDisconnect, OSError):
        pass
    finally:
        manager.active.pop(ident, None)
        manager.view_only.discard(ident)
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
