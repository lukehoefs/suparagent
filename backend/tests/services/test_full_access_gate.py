"""Full access at the approval gate: a real runtime and the real gate, an engine that asks about each
call as the CLI would. Every call is still recorded as an approval; full access answers it at once,
except what the safety floor holds (approval_scopes.held_for) and removing an agent, which still
wait for a person on a card."""
from types import SimpleNamespace as NS
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.computers import grants
from app.db.models import Agent, Approval
from app.db.models.user_credential import UserCredential
from app.services import agent_store, composio_service, decision_log, thread_store
from app.services.claude_adapter import _issue_permit
from app.services.provider_adapter import ALLOW, DENY, TurnOutcome
from app.services.thread_hub import ThreadHub
from app.services.thread_runtime import ThreadRuntime
from app.team.policy import TurnTeam
from tests.services.test_composio_bridge import (  # noqa: F401
    ISSUE_ARGS, KEY, PREFIX as COMPOSIO, Engine, ask, fake, set_level,
)
from tests.services.thread_harness import cleanup, owner, sessions, wait_until  # noqa: F401

ALIAS = "community_" + "a" * 32


@pytest.fixture
async def world(sessions, owner, fake, tmp_path, monkeypatch):
    from app.services import local_claude_runner

    monkeypatch.setattr(local_claude_runner, "workspace_dir", lambda: tmp_path)
    engine = Engine()
    runtime = ThreadRuntime(hub=ThreadHub(), adapters={"claude": engine}, owner_id=owner, _session_factory=sessions)
    async with sessions() as db:
        agent = await agent_store.create_agent(db, owner_id=owner, name="Free hand", approval_mode="full_access")
        await composio_service._save(db, owner, {"api_key": KEY, "user_id": "u1", "session_id": "sess_1"})
    yield runtime, engine, agent
    await runtime.shutdown()
    async with sessions() as db:
        await db.execute(delete(UserCredential).where(UserCredential.user_id == owner))
        await db.execute(delete(Agent).where(Agent.owner_id == owner))
        await db.commit()


async def one_turn(world, handler):
    runtime, engine, agent = world
    engine.handler = handler
    thread = await runtime.create_thread(agent_id=agent.id)
    turn = await runtime.send_turn(thread.id, "go")
    await wait_until(lambda: turn.id not in runtime._runs)
    return thread


async def asked(runtime, gate, tool, tool_input, kind=None, answer=None):
    """The engine asks about one call. Returns (status when asked, the decision, the handle); a call
    left on a card is answered with `answer` (or denied) so the turn can finish."""
    handle = await gate.open(request_id=uuid4().hex, tool=tool, input=tool_input, summary=None, kind=kind)
    async with runtime.session() as db:
        status = (await db.get(Approval, handle.approval_id)).status
    if status == "pending":
        assert await runtime.answer_approval(handle.approval_id, answer or "deny")
    return status, (await gate.decide(handle)).kind, handle


async def resolved_by(sessions, thread_id):
    async with sessions() as db:
        events = await thread_store.list_events(db, thread_id)
    return [e.data.get("by") for e in events if e.type == "approval.resolved"]


async def test_full_access_allows_an_ordinary_call_without_a_card(world, sessions):
    runtime, _, _ = world
    seen = {}

    async def handler(ctx, sink, gate):
        seen["mode"] = ctx.approval_mode
        seen["bash"] = await asked(runtime, gate, "Bash", {"command": "npm test"}, kind="command")
        seen["fetch"] = await asked(runtime, gate, "WebFetch", {"url": "https://example.com"})
        return TurnOutcome("succeeded", result="ok")

    thread = await one_turn(world, handler)
    assert seen["mode"] == "full_access"
    assert seen["bash"][:2] == ("allowed", ALLOW) and seen["fetch"][:2] == ("allowed", ALLOW)
    async with sessions() as db:
        approvals = await thread_store.list_approvals(db, thread.id)
    # Still recorded, and the allow was delivered like a person's.
    # list_approvals orders by created_at then id; the two can share a timestamp, so compare as a set.
    assert sorted((a.tool, a.status) for a in approvals) == [("Bash", "allowed"), ("WebFetch", "allowed")]
    assert all(a.delivered_at is not None for a in approvals)
    assert await resolved_by(sessions, thread.id) == ["full_access", "full_access"]
    entries = [e for e in decision_log.read_page(limit=50)[0] if e["thread_id"] == thread.id]
    assert {(e["event"], e["source"], e["mode"]) for e in entries} == {("auto_allowed", "full_access", "full_access")}


async def test_full_access_allows_a_custom_mcp_call(world, sessions):
    runtime, _, _ = world
    seen = {}

    async def handler(ctx, sink, gate):
        ctx.community_tools = [ALIAS]
        seen["mcp"] = await asked(runtime, gate, "mcp__community__" + ALIAS, {"query": "x"}, kind="other")
        return TurnOutcome("succeeded", result="ok")

    thread = await one_turn(world, handler)
    assert seen["mcp"][:2] == ("allowed", ALLOW)
    # The bridge runs a marketplace call only on an allowed, unconsumed approval for that exact input.
    async with sessions() as db:
        [approval] = await thread_store.list_approvals(db, thread.id)
    assert approval.status == "allowed" and approval.consumed_at is None and approval.input == {"query": "x"}


async def test_full_access_allows_computer_exec_and_screen_input_with_a_permit(world, sessions, tmp_path):
    runtime, _, _ = world
    seen = {}

    async def handler(ctx, sink, gate):
        run = runtime._runs[ctx.turn_id]
        seen["exec"] = await asked(runtime, gate, "mcp__computer__exec", {"command": "ls -la"})
        seen["click"] = await asked(runtime, gate, "mcp__computer__click", {"x": 1, "y": 2})
        seen["granted"] = run.screen_granted
        seen["native"] = await asked(runtime, gate, "mcp__computer__native_click", {"x": 3, "y": 4})
        return TurnOutcome("succeeded", result="ok")

    thread = await one_turn(world, handler)
    assert seen["exec"][:2] == ("allowed", ALLOW)
    assert seen["click"][:2] == ("allowed", ALLOW) and seen["granted"] is True  # the screen turn grant follows
    assert seen["native"][:2] == ("allowed", ALLOW)
    assert await resolved_by(sessions, thread.id) == ["full_access"] * 3
    # The engine's adapter writes the computer's one-use permit for an allow from full access as for a person's.
    folder = tmp_path / "grants"
    target = NS(computer=NS(grants_dir=folder, provider="docker"), browser=None, thread_id=thread.id)
    assert _issue_permit(target, seen["exec"][2], {"command": "ls -la"})
    assert grants.consume(folder, "exec", {"command": "ls -la"})


async def test_full_access_allows_a_connected_app_change(world, fake, sessions):
    runtime, _, agent = world
    await set_level(sessions, agent, "write")
    fake.answer = {"result_type": "completed", "error": None, "data": {"number": 12, "title": "Crash on start",
                   "state": "open", "html_url": "https://github.com/o/r/issues/12"}}
    seen = {}

    async def handler(ctx, sink, gate):
        seen["write"] = await asked(runtime, gate, COMPOSIO + "github_create_issue", ISSUE_ARGS)
        seen["answer"] = await ask(ctx, gate, "github_create_issue", ISSUE_ARGS, approve=False)
        return TurnOutcome("succeeded", result="ok")

    await one_turn(world, handler)
    assert seen["write"][:2] == ("allowed", ALLOW)
    assert len(fake.executes) == 1 and seen["answer"].get("code") is None


@pytest.mark.parametrize("tool,tool_input,kind,rule", [
    ("Bash", {"command": "rm -rf /"}, "command", "safety_floor:"),
    ("mcp__computer__exec", {"command": "rm -rf /"}, None, "safety_floor:"),
    ("WebFetch", {"url": "https://example.com", "api_key": "abc123def456"}, None, "safety_floor:credential"),
    ("apply_patch", {"changes": [], "grant_root": "/"}, "file_write", "safety_floor:grant_root"),
])
async def test_full_access_still_asks_for_what_the_safety_floor_holds(world, sessions, tool, tool_input, kind, rule):
    runtime, _, _ = world
    seen = {}

    async def handler(ctx, sink, gate):
        seen["call"] = await asked(runtime, gate, tool, tool_input, kind=kind)
        return TurnOutcome("succeeded", result="ok")

    thread = await one_turn(world, handler)
    assert seen["call"][:2] == ("pending", DENY)
    assert await resolved_by(sessions, thread.id) == [None]  # a person answered
    shown = [e for e in decision_log.read_page(limit=50, event="shown")[0] if e["thread_id"] == thread.id]
    assert len(shown) == 1 and shown[0]["rule"].startswith(rule) and shown[0]["mode"] == "full_access"


async def test_full_access_never_removes_an_agent_without_the_persons_card(world, sessions):
    runtime, _, agent = world
    seen = {}

    async def handler(ctx, sink, gate):
        ctx.team = TurnTeam(team_id=1, agent_id=agent.id, is_lead=True, lead_auto=False)
        seen["delete"] = await asked(runtime, gate, "mcp__team__propose_bot_deletion", {"agent_id": 99})
        seen["profile"] = await asked(runtime, gate, "mcp__team__propose_profile", {"agent_id": 99, "name": "x"})
        return TurnOutcome("succeeded", result="ok")

    await one_turn(world, handler)
    assert seen["delete"][:2] == ("pending", DENY)
    # Other team configuration changes, a card in ask, are answered by full access.
    assert seen["profile"][:2] == ("allowed", ALLOW)


async def test_ask_mode_still_shows_the_card(world, sessions):
    runtime, _, agent = world
    async with sessions() as db:
        await agent_store.update_agent(db, agent.id, approval_mode="ask")
    seen = {}

    async def handler(ctx, sink, gate):
        seen["bash"] = await asked(runtime, gate, "Bash", {"command": "npm test"}, kind="command")
        return TurnOutcome("succeeded", result="ok")

    await one_turn(world, handler)
    assert seen["bash"][:2] == ("pending", DENY)
