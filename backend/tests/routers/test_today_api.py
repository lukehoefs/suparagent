"""The Today page's routes: what is running right now (with the calls that wait in it), and the
whole Today brief with each row's agent. Both only read, need local access and stay admin-only."""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select, update

from app.auth import policy
from app.core.config import settings
from app.db.models import Agent, Routine, RoutineRun, Turn
from app.routers import needs_you as needs_you_router
from app.routers.threads import get_runtime
from app.routers.today import router as today_router
from app.services import agent_store
from app.services import thread_store as store
from app.team import needs_you
from tests.services.thread_harness import cleanup, owner, rt, sessions  # noqa: F401

T0 = datetime(2026, 11, 16, 9, 0, tzinfo=UTC)
SIGNED_OUT = {"id": "claude", "label": "Claude", "installed": True, "signed_in": False, "limit": None}


@pytest.fixture(autouse=True)
def local_enabled(monkeypatch, tmp_path):
    from app.services import local_claude_runner

    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "FRONTEND_ORIGINS", "http://localhost:3000")
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
    monkeypatch.setattr(local_claude_runner, "workspace_dir", lambda: tmp_path)


@pytest.fixture(autouse=True)
async def tidy(sessions, owner):
    yield
    async with sessions() as db:
        ids = select(Routine.id).where(Routine.owner_id == owner)
        await db.execute(delete(RoutineRun).where(RoutineRun.routine_id.in_(ids)))
        await db.execute(delete(Routine).where(Routine.owner_id == owner))
        await db.execute(delete(Agent).where(Agent.owner_id == owner))
        await db.commit()


def service_for(rt, engines=()):
    async def engines_():
        return list(engines)

    async def issues_():
        return []

    return needs_you.NeedsYou(rt, lambda: T0, engines=engines_, issues=issues_)


def app_for(rt, service=None) -> FastAPI:
    app = FastAPI()
    app.include_router(today_router, prefix="/api/v1")
    app.dependency_overrides[get_runtime] = lambda: rt
    app.dependency_overrides[needs_you_router.get_service] = lambda: service or service_for(rt)
    return app


def client_for(app, *, client=("127.0.0.1", 50000), base_url="http://localhost"):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app, client=client), base_url=base_url)


async def agent_named(sessions, owner, name):
    async with sessions() as db:
        return await agent_store.create_agent(db, owner_id=owner, name=name)


async def running_turn(sessions, rt, agent, title, *, waiting=(), started=None):
    """A conversation of `agent` with an answer running, and pending calls named in `waiting`."""
    thread = await rt.create_thread(agent_id=agent.id if agent else None, title=title)
    async with sessions() as db:
        turn = await store.start_turn(db, thread.id, "go", owner_instance="t", origin="person")
        approvals = [
            await store.create_approval(
                db, thread_id=thread.id, turn_id=turn.id, request_id=uuid4().hex, tool=tool,
                input={"command": f"{tool} now"}, summary=f"{tool} now", kind="command",
                owner_token=turn.owner_token, tool_summary="Runs a command.", risk="changes")
            for tool in waiting
        ]
    if started is not None:
        async with sessions() as db:
            await db.execute(update(Turn).where(Turn.id == turn.id).values(started_at=started))
            await db.commit()
    return thread, turn, approvals


ROUTES = [("GET", "/api/v1/today/running"), ("GET", "/api/v1/today/brief")]


@pytest.mark.parametrize("method,path", ROUTES)
async def test_every_route_refuses_anyone_but_this_machine(rt, method, path):
    app = app_for(rt)
    for kwargs in (dict(client=("203.0.113.9", 50000)), dict(base_url="http://evil.example")):
        async with client_for(app, **kwargs) as remote:
            assert (await remote.request(method, path)).status_code == 403


@pytest.mark.parametrize("method,path", ROUTES)
async def test_every_route_refuses_everyone_when_local_execution_is_off(rt, monkeypatch, method, path):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", False)
    async with client_for(app_for(rt)) as client:
        assert (await client.request(method, path)).status_code == 403


@pytest.mark.parametrize("method,path", ROUTES)
def test_today_is_admin_only_like_needs_you(method, path):
    # Not in the chat scope: a paired chat-only device cannot read it.
    assert policy.required_scope(method, path) == "admin"
    assert policy.required_scope("GET", "/api/v1/needs-you") == "admin"


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
async def test_routes_only_read(rt, method):
    async with client_for(app_for(rt)) as client:
        for _, path in ROUTES:
            assert (await client.request(method, path)).status_code == 405


async def test_nothing_running_is_an_empty_list(rt):
    async with client_for(app_for(rt)) as client:
        response = await client.get("/api/v1/today/running")
    assert response.status_code == 200 and response.json() == []


async def test_running_lists_each_working_conversation_newest_first_with_its_waiting_calls(sessions, rt, owner):
    atlas = await agent_named(sessions, owner, "Atlas")
    scout = await agent_named(sessions, owner, "Scout")
    older, older_turn, _ = await running_turn(sessions, rt, atlas, "Freight read", started=T0 - timedelta(minutes=30))
    newer, newer_turn, approvals = await running_turn(
        sessions, rt, scout, "Prospects", waiting=("Bash", "Write"), started=T0 - timedelta(minutes=5))
    plain, plain_turn, _ = await running_turn(sessions, rt, None, None, started=T0 - timedelta(hours=1))

    async with client_for(app_for(rt)) as client:
        listed = (await client.get("/api/v1/today/running")).json()

    assert [row["thread_id"] for row in listed] == [newer.id, older.id, plain.id]
    first = listed[0]
    assert (first["turn_id"], first["agent_id"], first["title"], first["kind"], first["origin"]) == (
        newer_turn.id, scout.id, "Prospects", "chat", "person")
    assert (first["room_id"], first["job_id"]) == (None, None)
    # Oldest first; two calls asked in the same instant keep a stable order.
    assert sorted(a["id"] for a in first["approvals"]) == sorted(a.id for a in approvals)
    call = next(a for a in first["approvals"] if a["tool"] == "Bash")
    assert (call["tool"], call["summary"], call["kind"], call["status"], call["input"]) == (
        "Bash", "Bash now", "command", "pending", {"command": "Bash now"})
    assert (call["tool_summary"], call["risk"], call["turn_id"]) == ("Runs a command.", "changes", newer_turn.id)
    assert "once" in call["scopes"]
    assert listed[1]["approvals"] == [] and listed[1]["agent_id"] == atlas.id
    # A plain chat has no agent; an untitled one is named after its first message.
    assert listed[2]["agent_id"] is None and listed[2]["title"] == "go"


async def test_running_leaves_out_finished_answers_answered_calls_and_other_owners(sessions, rt, owner):
    atlas = await agent_named(sessions, owner, "Atlas")
    thread, turn, approvals = await running_turn(sessions, rt, atlas, "Work", waiting=("Bash", "Write"))
    done, done_turn, _ = await running_turn(sessions, rt, atlas, "Done")
    async with sessions() as db:
        await store.finish_turn(db, done_turn.id, done_turn.owner_token, status="succeeded")
        await store.decide_approval(db, approvals[0].id, "allowed")
    # Someone else's running answer is never listed.
    async with sessions() as db:
        other = await store.create_thread(db, owner_id="someone_" + uuid4().hex, provider="claude",
                                          provider_session_id=uuid4().hex)
        other_turn = await store.start_turn(db, other.id, "go", owner_instance="t")
    try:
        async with client_for(app_for(rt)) as client:
            listed = (await client.get("/api/v1/today/running")).json()
        assert [row["thread_id"] for row in listed] == [thread.id]
        assert [a["id"] for a in listed[0]["approvals"]] == [approvals[1].id]
    finally:
        async with sessions() as db:
            await store.finish_turn(db, other_turn.id, other_turn.owner_token, status="succeeded")
            await store.delete_thread(db, other.id)


async def test_brief_lists_every_row_past_the_cards_six_with_each_rows_agent(sessions, rt, owner):
    atlas = await agent_named(sessions, owner, "Atlas")
    waiting = []
    for index in range(needs_you.CARD_ROWS + 2):
        thread, _, approvals = await running_turn(sessions, rt, atlas, f"Work {index}", waiting=("Bash",))
        waiting.append((thread.id, approvals[0].id))
    async with sessions() as db:
        routine = Routine(owner_id=owner, agent_id=atlas.id, name="Digest", prompt="x",
                          schedule_kind="interval", schedule_spec={}, next_run_at=T0)
        db.add(routine)
        await db.flush()
        db.add(RoutineRun(routine_id=routine.id, trigger="schedule", state="failed", error="boom",
                          scheduled_for=T0, finished_at=T0, created_at=T0))
        await db.commit()

    service = service_for(rt, engines=[SIGNED_OUT])
    async with client_for(app_for(rt, service)) as client:
        card = (await client.get("/api/v1/today/brief")).json()
    # The card in the chat still shows six.
    assert len((await service.read())["items"]) == needs_you.CARD_ROWS

    kinds = [item["kind"] for item in card["items"]]
    assert kinds == ["signed_out"] + ["approval"] * len(waiting) + ["routine"]
    assert card["more"] == 0
    assert {item["key"] for item in card["items"] if item["kind"] == "approval"} == {f"approval:{a}" for _, a in waiting}
    by_kind = {item["kind"]: item for item in card["items"]}
    assert by_kind["signed_out"]["agent_id"] is None
    assert by_kind["routine"]["agent_id"] == atlas.id and by_kind["routine"]["routine_id"] == routine.id
    assert all(item["agent_id"] == atlas.id for item in card["items"] if item["kind"] == "approval")
    # The rest of the card is the same shape as GET /needs-you.
    for key in ("card_id", "day", "subtitle", "time_zone", "checked_at", "sources", "empty_text"):
        assert key in card


async def test_an_empty_brief_says_so(rt):
    async with client_for(app_for(rt)) as client:
        card = (await client.get("/api/v1/today/brief")).json()
    assert card["items"] == [] and card["more"] == 0 and card["empty_text"] == needs_you.EMPTY_TEXT


async def test_brief_refresh_is_passed_on(rt):
    seen = []

    class Spy(needs_you.NeedsYou):
        async def read(self, *, refresh=False, rows=needs_you.CARD_ROWS):
            seen.append((refresh, rows))
            return await super().read(refresh=refresh, rows=rows)

    spy = Spy(rt, lambda: T0, engines=lambda: _empty(), issues=lambda: _empty())
    async with client_for(app_for(rt, spy)) as client:
        await client.get("/api/v1/today/brief")
        await client.get("/api/v1/today/brief", params={"refresh": "true"})
    assert seen == [(False, 100), (True, 100)]


async def _empty():
    return []
