"""While a person holds an agent's cloud computer, the approval gate refuses (never asks) every call to
that computer's MCP tools, with a message the agent can act on; a call approved just before is still
not run; hand-back restores the normal question. Also: the agent JSON's `remote_computer`, and that
deleting an agent unlinks its computer."""
import json
from datetime import UTC, datetime
from types import SimpleNamespace as NS
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select

from app import community_mcp
from app.core import crypto
from app.core.config import settings
from app.db.models import (
    Agent, Approval, CustomMcpConnection, CustomMcpToolGrant, RemoteComputer, Thread, Turn, UserCredential,
)
from app.routers.agents import get_runtime as agents_runtime
from app.routers.agents import router as agents_router
from app.services import remote_computers, thread_store
from app.services.community_mcp_bridge import BROKER_CALL, CUSTOM_CREDENTIAL_PREFIX, PREFIX, CommunityMcpBridge
from app.services.openai_chat_adapter import OpenAIChatAdapter  # noqa: F401  (the adapter under test below)
from app.services.provider_adapter import CANCELLED, DENY, Decision
from app.services.thread_runtime import ThreadApprovalGate
from tests.services.test_openai_chat_tools import Bridge as ChatBridge, context, make, sink, text_stream, tool_call_stream
from tests.services.thread_harness import cleanup, owner, rt, sessions  # noqa: F401

SECRET = "gateway_SECRET_token_value_123456"
ENDPOINT = "https://gateway-atlas.example.com/mcp"


def make_tool(name="computer_click_mouse"):
    return community_mcp._normalize_tool({"name": name, "description": "Click", "inputSchema": {
        "type": "object", "properties": {"x": {"type": "integer"}}, "additionalProperties": False}})


@pytest.fixture
async def world(sessions, owner, monkeypatch):
    monkeypatch.setattr(settings, "HOST_EXECUTION_DISABLED", False)
    tool = make_tool()
    async with sessions() as db:
        agent = Agent(owner_id=owner, name="Atlas " + uuid4().hex[:6])
        db.add(agent)
        await db.flush()
        thread = Thread(owner_id=owner, agent_id=agent.id, provider="claude")
        db.add(thread)
        await db.flush()
        turn = Turn(thread_id=thread.id, seq=1, prompt_text="Go", origin="person", status="running", owner_token="owner-token")
        connection = CustomMcpConnection(
            id=uuid4().hex, owner_id=owner, name="Atlas gateway", endpoint=ENDPOINT, auth_mode="bearer",
            enabled=True, revision=2, tested_revision=2, tools_snapshot=[tool])
        db.add_all([turn, connection])
        await db.flush()
        db.add(CustomMcpToolGrant(
            agent_id=agent.id, connection_id=connection.id, tool_name=tool["name"], schema_digest=tool["schema_digest"],
            description=tool["description"], input_schema=tool["inputSchema"]))
        db.add(UserCredential(user_id=owner, provider=CUSTOM_CREDENTIAL_PREFIX + connection.id, file_path="-",
                              ciphertext=crypto.encrypt(json.dumps(SECRET))))
        computer = RemoteComputer(name="Atlas desktop", mcp_connection_id=connection.id, agent_id=agent.id)
        db.add(computer)
        await db.commit()
    yield NS(agent=agent, thread=thread, turn=turn, connection=connection, computer=computer, tool=tool)
    async with sessions() as db:
        await db.execute(delete(RemoteComputer).where(RemoteComputer.id == computer.id))
        await db.execute(delete(UserCredential).where(UserCredential.user_id == owner))
        await db.execute(delete(CustomMcpToolGrant).where(CustomMcpToolGrant.connection_id == connection.id))
        await db.execute(delete(CustomMcpConnection).where(CustomMcpConnection.id == connection.id))
        await db.execute(delete(Agent).where(Agent.id == agent.id))
        await db.commit()


def run_for(world, bridge=None):
    return NS(thread_id=world.thread.id, turn_id=world.turn.id, owner_token="owner-token", accepted=False,
              recorder=NS(lose=lambda: None), approval_timeout=5, agent_id=world.agent.id, routine_run_id=None,
              uninterrupted_access=False, screen_granted=False,
              ctx=NS(approval_mode="ask", community_bridge=bridge, workspace=None, computer=None, browser=None,
                     team=None, draft_only=False, media_review_only=False, aborted=False,
                     community_tools=list(bridge.aliases_allowed) if bridge else []))


async def bridge_for(rt, world, sessions, owner):
    async with sessions() as db:
        snapshot = await CommunityMcpBridge._custom_snapshot(db, owner, world.agent.id)
    assert [item["connection_id"] for item in snapshot] == [world.connection.id]
    run = run_for(world)
    bridge = CommunityMcpBridge(rt, run, snapshot)
    run.ctx.community_bridge = bridge
    run.ctx.community_tools = bridge.aliases_allowed
    return bridge, run


async def set_control(sessions, world, held: bool):
    async with sessions() as db:
        row = await db.get(RemoteComputer, world.computer.id)
        row.human_control = held
        row.control_started_at = datetime.now(UTC) if held else None
        await db.commit()


# ---------------------------------------------------------------- the gate

async def test_while_a_person_holds_the_computer_its_tools_are_refused_not_asked(rt, world, sessions, owner):
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        await set_control(sessions, world, True)
        gate = ThreadApprovalGate(rt, run)
        handle = await gate.open(request_id="r1", tool=PREFIX + alias, input={"x": 1}, summary="Click", kind="other")
        async with sessions() as db:
            approval = await db.get(Approval, handle.approval_id)
        assert approval.status == "denied"  # answered at once: no card waits for anyone
        from app.services import decision_log
        [entry] = decision_log.read_page(thread_id=world.thread.id)[0]
        assert entry["event"] == "denied" and entry["source"] == "human_control"
        decision = await gate.decide(handle)
        assert decision.kind == DENY
        assert "has taken control of your computer \"Atlas desktop\"" in decision.message
        assert "carry on without the computer" in decision.message
        assert SECRET not in decision.message
    finally:
        await bridge.close()


async def test_after_hand_back_the_person_is_asked_again(rt, world, sessions, owner):
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        await set_control(sessions, world, True)
        await set_control(sessions, world, False)
        gate = ThreadApprovalGate(rt, run)
        handle = await gate.open(request_id="r2", tool=PREFIX + alias, input={"x": 1}, summary="Click", kind="other")
        async with sessions() as db:
            assert (await db.get(Approval, handle.approval_id)).status == "pending"  # a card, as always
        await gate.cancel("r2")
        assert (await gate.decide(handle)).kind == CANCELLED
    finally:
        await bridge.close()


async def test_a_broker_call_naming_the_computers_tool_is_refused_too(rt, world, sessions, owner):
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        bridge.broker_aliases = {alias}  # as if this agent had too many tools to list one by one
        assert bridge.custom_connection_for(BROKER_CALL, {"ref": alias, "arguments": {}}) == world.connection.id
        assert bridge.custom_connection_for(BROKER_CALL, {"ref": "community_" + "0" * 32}) is None
        await set_control(sessions, world, True)
        gate = ThreadApprovalGate(rt, run)
        handle = await gate.open(request_id="r3", tool=PREFIX + BROKER_CALL,
                                 input={"ref": alias, "arguments": {"x": 1}}, summary="Click", kind="other")
        decision = await gate.decide(handle)
        assert decision.kind == DENY and "has taken control" in decision.message
    finally:
        await bridge.close()


async def test_another_server_is_not_affected(rt, world, sessions, owner):
    """Holding one computer leaves the agent's other tools (and their questions) alone."""
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        await set_control(sessions, world, True)
        gate = ThreadApprovalGate(rt, run)
        assert await gate._held_by_person("mcp__community__community_" + "1" * 32, {}) is None
        assert await gate._held_by_person("Bash", {"command": "ls"}) is None
    finally:
        await bridge.close()


async def test_another_connection_to_the_same_gateway_is_refused_too(rt, world, sessions, owner):
    """A second connection to the desktop (made when rotating its key, or a member's own) drives it just the same."""
    async with sessions() as db:
        second = CustomMcpConnection(
            id=uuid4().hex, owner_id=owner, name="Atlas gateway (new key)", endpoint="https://GATEWAY-atlas.example.com./mcp",
            auth_mode="bearer", enabled=True, revision=1, tested_revision=1, tools_snapshot=[world.tool])
        elsewhere = CustomMcpConnection(
            id=uuid4().hex, owner_id=owner, name="Docs", endpoint="https://docs.example.com/mcp",
            auth_mode="bearer", enabled=True, revision=1, tested_revision=1, tools_snapshot=[world.tool])
        db.add_all([second, elsewhere])
        await db.commit()
    try:
        async with sessions() as db:
            assert await remote_computers.control_refusal(db, second.id) is None  # nobody holds it yet
            assert (await remote_computers.computer_for_connection(db, second.id)).id == world.computer.id
        await set_control(sessions, world, True)
        async with sessions() as db:
            refusal = await remote_computers.control_refusal(db, second.id)
            assert refusal is not None and 'has taken control of your computer "Atlas desktop"' in refusal
            assert await remote_computers.control_refusal(db, elsewhere.id) is None
            assert await remote_computers.computer_for_connection(db, elsewhere.id) is None
    finally:
        async with sessions() as db:
            await db.execute(delete(CustomMcpConnection).where(CustomMcpConnection.id.in_([second.id, elsewhere.id])))
            await db.commit()


async def test_a_cloud_computers_input_tool_is_asked_about_one_call_at_a_time(rt, world, sessions, owner):
    """Typing or clicking on the desktop can never be allowed for an hour or the whole chat."""
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        gate = ThreadApprovalGate(rt, run)
        handle = await gate.open(request_id="r9", tool=PREFIX + alias, input={"x": 1}, summary="Click", kind="other")
        async with sessions() as db:
            approval = await db.get(Approval, handle.approval_id)
            [requested] = [e.data for e in await thread_store.list_all_events(db, world.thread.id)
                           if e.type == "approval.requested" and e.data["approval_id"] == handle.approval_id]
        assert approval.status == "pending" and approval.kind == "remote_input"
        assert requested["scopes"] == ["once"]
        await gate.cancel("r9")
        await gate.decide(handle)
    finally:
        await bridge.close()


async def test_a_failed_lookup_refuses_the_call(rt, world, sessions, owner, monkeypatch):
    bridge, run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed

        async def broken(*_args, **_kwargs):
            raise RuntimeError("database away")

        monkeypatch.setattr(bridge, "control_refusal", broken)
        message = await ThreadApprovalGate(rt, run)._held_by_person(PREFIX + alias, {"x": 1})
        assert message is not None and "refused and did not run" in message
    finally:
        await bridge.close()


# ---------------------------------------------------------------- the bridge (approved before control was taken)

class FakeRemote:
    calls: list = []
    tools: list = []

    def __init__(self, endpoint, token=None, *, header=None):
        pass

    async def list_tools(self):
        return list(FakeRemote.tools)

    async def call_tool(self, name, arguments):
        FakeRemote.calls.append((name, arguments))
        return {"content": [{"type": "text", "text": "clicked"}]}

    async def close(self):
        pass


@pytest.fixture
def remote(monkeypatch, world):
    FakeRemote.calls, FakeRemote.tools = [], [world.tool]
    monkeypatch.setattr(community_mcp, "RemoteMcpSession", FakeRemote)
    return FakeRemote


async def approve(sessions, world, alias, arguments, request_id):
    async with sessions() as db:
        row = await thread_store.create_approval(
            db, thread_id=world.thread.id, turn_id=world.turn.id, request_id=request_id, tool=PREFIX + alias,
            input=arguments, summary="x", kind="other", owner_token="owner-token")
        await thread_store.decide_approval(db, row.id, "allowed", by={"by": "person"})
        return row.id


async def test_an_approved_call_does_not_run_once_control_was_taken(rt, world, sessions, owner, remote):
    bridge, _run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        await approve(sessions, world, alias, {"x": 1}, "a1")
        await set_control(sessions, world, True)
        result = await bridge.execute(alias, {"x": 1})
        assert result["code"] == "human_control" and "has taken control" in result["error"]
        assert remote.calls == []
        await set_control(sessions, world, False)
        assert (await bridge.execute(alias, {"x": 1}))["content"][0]["text"] == "clicked"
        assert remote.calls == [("computer_click_mouse", {"x": 1})]
    finally:
        await bridge.close()


async def test_control_taken_between_the_check_and_the_call_still_stops_it_and_uses_up_the_approval(
        rt, world, sessions, owner, remote, monkeypatch):
    bridge, _run = await bridge_for(rt, world, sessions, owner)
    try:
        [alias] = bridge.aliases_allowed
        approval_id = await approve(sessions, world, alias, {"x": 2}, "a2")

        async def not_yet(*_args, **_kwargs):
            return None  # the early check ran before the person took control

        monkeypatch.setattr(bridge, "control_refusal", not_yet)
        await set_control(sessions, world, True)
        result = await bridge.execute(alias, {"x": 2})
        assert result["code"] == "human_control" and remote.calls == []
        async with sessions() as db:
            assert (await db.get(Approval, approval_id)).consumed_at is not None
    finally:
        await bridge.close()


# ---------------------------------------------------------------- the engines get the message

async def test_the_openai_compatible_engine_hands_the_refusal_to_the_model():
    adapter, sent = make([tool_call_stream(), text_stream("I'll wait.")])

    class Gate:
        async def open(self, **kwargs):
            from app.services.provider_adapter import ApprovalHandle
            return ApprovalHandle(approval_id="ap", request_id=kwargs["request_id"])

        async def decide(self, handle):
            return Decision(DENY, message=remote_computers.refusal_message("Luke", "Atlas desktop"))

    bridge = ChatBridge()
    out, _events = sink()
    outcome = await adapter.run_turn(context(bridge), out, Gate())
    assert outcome.status == "succeeded" and bridge.calls == []
    told = json.loads(sent[1]["messages"][-1]["content"])
    assert told["code"] == "denied" and told["error"].startswith('Luke has taken control of your computer "Atlas desktop"')


def test_the_claude_engine_denial_carries_the_message():
    from app.services.claude_adapter import _deny_payload
    payload = _deny_payload("req-1", remote_computers.refusal_message("Luke", "Atlas desktop"))
    assert "Luke has taken control" in json.dumps(payload)


# ---------------------------------------------------------------- agent JSON

@pytest.fixture
def agents_api(rt, monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "FRONTEND_ORIGINS", "http://localhost:3000")
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
    app = FastAPI()
    app.include_router(agents_router, prefix="/api/v1")
    app.dependency_overrides[agents_runtime] = lambda: rt
    return httpx.AsyncClient(transport=httpx.ASGITransport(app, client=("127.0.0.1", 50000)), base_url="http://localhost")


@pytest.fixture
def healthy(monkeypatch):
    remote_computers.forget()
    monkeypatch.setattr(remote_computers, "_health_client", lambda: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="ok"))))
    yield
    remote_computers.forget()


async def test_the_agent_json_names_its_cloud_computer(agents_api, world, sessions, owner, healthy):
    async with sessions() as db:
        other = Agent(owner_id=owner, name="Plain " + uuid4().hex[:6])
        db.add(other)
        await db.commit()
    async with agents_api as api:
        first = await api.get(f"/api/v1/agents/{world.agent.id}")
        # Never checked yet: the list does not wait for the gateway, it reads as offline and asks in the background.
        assert first.json()["remote_computer"]["state"] == "offline"
        await remote_computers.settle()
        one = await api.get(f"/api/v1/agents/{world.agent.id}")
        assert one.status_code == 200, one.text
        assert one.json()["remote_computer"] == {
            "id": world.computer.id, "name": "Atlas desktop", "state": "online", "human_control": False}
        listed = {a["id"]: a for a in (await api.get("/api/v1/agents")).json()}
        assert listed[world.agent.id]["remote_computer"]["id"] == world.computer.id
        assert listed[other.id]["remote_computer"] is None
        assert SECRET not in one.text and "gateway-atlas" not in one.text
        await set_control(sessions, world, True)
        assert (await api.get(f"/api/v1/agents/{world.agent.id}")).json()["remote_computer"]["human_control"] is True


async def test_listing_agents_never_waits_on_a_gateway(agents_api, world, monkeypatch):
    import asyncio
    import time

    async def hangs(request):
        await asyncio.sleep(30)

    remote_computers.forget()
    monkeypatch.setattr(remote_computers, "_health_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(hangs)))
    try:
        async with agents_api as api:
            started = time.monotonic()
            listed = await api.get("/api/v1/agents")
            assert listed.status_code == 200 and time.monotonic() - started < 2
        mine = next(a for a in listed.json() if a["id"] == world.agent.id)
        assert mine["remote_computer"]["state"] == "offline"
    finally:
        for task in list(remote_computers._refreshing):
            task.cancel()
        await remote_computers.settle()
        remote_computers.forget()


async def test_deleting_an_agent_unlinks_its_computer(agents_api, world, sessions):
    async with agents_api as api:
        assert (await api.delete(f"/api/v1/agents/{world.agent.id}")).status_code == 204
    async with sessions() as db:
        row = await db.get(RemoteComputer, world.computer.id)
        assert row is not None and row.agent_id is None
        assert await db.get(CustomMcpConnection, world.connection.id) is not None
