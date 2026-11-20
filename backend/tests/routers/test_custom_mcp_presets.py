"""CUSTOM_MCP_PRESETS: an operator-registered MCP server, its secret, grants and tool decisions."""
import json
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException, Response
from sqlalchemy import select

from app.core.config import settings
from app.db.models import Agent, CustomMcpConnection, CustomMcpToolGrant, UserCredential
from app.routers import custom_mcp
from app.schemas.custom_mcp import CustomMcpGrantRequest, CustomMcpGrantSelection
from app.services import approval_modes, custom_mcp_presets, tool_policy
from tests.auth.test_auth_api import auth_settings, factory  # noqa: F401
from tests.routers.test_custom_mcp_api import owner, server, tool  # noqa: F401

SECRET = "mem_SECRET_key_value_123"
ENDPOINT = "https://memory.example.com/api/mcp"
PRESET = {
    "name": "Shared AI memory", "endpoint": ENDPOINT, "auth_mode": "bearer", "credential_env": "TEST_MEMORY_KEY",
    "auto_allow_tools": ["search_memory", "forget_memory"], "deny_tools": ["forget_memory"],
    "grant_tools": ["search_memory", "save_memory", "forget_memory"], "shared": True,
}


@pytest.fixture
def preset_env(server, monkeypatch):
    server.tools = [tool("search_memory"), tool("save_memory"), tool("forget_memory")]
    monkeypatch.setattr(custom_mcp_presets, "_registered", {})
    monkeypatch.setattr(settings, "CUSTOM_MCP_PRESETS", json.dumps([PRESET]))
    monkeypatch.setenv("TEST_MEMORY_KEY", SECRET)
    return server


async def add_agent(factory, owner) -> int:
    async with factory() as db:
        agent = Agent(owner_id=owner, name="Helper", instructions="help", provider="claude", approval_mode="ask")
        db.add(agent)
        await db.commit()
        return agent.id


@pytest.mark.parametrize("raw", ["not json", "{}", '[{"name": "x"}]', '[{"name": "x", "endpoint": "https://a.example/mcp", "auth_mode": "bearer"}]',
                                 '[{"name": "x", "endpoint": "https://a.example/mcp", "deny_tools": "forget"}]'])
def test_a_malformed_preset_turns_the_feature_off(raw):
    assert custom_mcp_presets.parse(raw) == []


def test_a_denied_tool_is_never_auto_allowed_or_granted():
    [preset] = custom_mcp_presets.parse(json.dumps([PRESET]))
    assert preset.decision("forget_memory") == "deny"
    assert preset.decision("search_memory") == "allow"
    assert preset.decision("save_memory") == "ask"
    assert "forget_memory" not in preset.grant_tools


async def test_startup_registers_tests_enables_and_grants_once(factory, owner, preset_env):
    agent_id = await add_agent(factory, owner)
    await custom_mcp_presets.sync(factory)
    await custom_mcp_presets.sync(factory)  # a restart changes nothing
    async with factory() as db:
        rows = (await db.scalars(select(CustomMcpConnection).where(CustomMcpConnection.owner_id == owner))).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.enabled and row.shared and row.owner_person_id is None and row.auth_mode == "bearer"
        grants = sorted((await db.scalars(select(CustomMcpToolGrant.tool_name).where(
            CustomMcpToolGrant.connection_id == row.id, CustomMcpToolGrant.agent_id == agent_id))).all())
        assert grants == ["save_memory", "search_memory"]
        credential = (await db.scalars(select(UserCredential).where(UserCredential.user_id == owner))).one()
        assert SECRET not in credential.ciphertext
        assert SECRET not in json.dumps(row.tools_snapshot)
        assert await custom_mcp._credential(db, row.id) == SECRET
        assert SECRET not in (await custom_mcp._out(db, row)).model_dump_json()
    assert all(token == SECRET for _endpoint, token, _header in preset_env.seen)
    assert custom_mcp_presets.preset_for(row.id) is not None


async def test_a_missing_secret_registers_nothing(factory, owner, preset_env, monkeypatch):
    monkeypatch.delenv("TEST_MEMORY_KEY")
    await custom_mcp_presets.sync(factory)
    async with factory() as db:
        assert (await db.scalars(select(CustomMcpConnection).where(CustomMcpConnection.owner_id == owner))).all() == []


async def test_an_unreachable_server_never_raises(factory, owner, preset_env):
    from app import community_mcp as mcp
    preset_env.error = mcp.McpError("remote_unavailable", "down", 502)
    await custom_mcp_presets.sync(factory)  # logged, not raised


async def test_a_denied_tool_cannot_be_granted_by_hand(factory, owner, preset_env):
    agent_id = await add_agent(factory, owner)
    await custom_mcp_presets.sync(factory)
    async with factory() as db:
        row = (await db.scalars(select(CustomMcpConnection).where(CustomMcpConnection.owner_id == owner))).one()
        digest = {t["name"]: t["schema_digest"] for t in row.tools_snapshot}["forget_memory"]
        with pytest.raises(HTTPException) as refused:
            await custom_mcp.set_grants(row.id, agent_id, CustomMcpGrantRequest(
                revision=row.revision, tools=[CustomMcpGrantSelection(name="forget_memory", schema_digest=digest)]),
                Response(), db)
    assert refused.value.status_code == 422 and refused.value.detail["error_code"] == "tool_blocked_by_preset"


def _run(connection_id, mode="ask", uninterrupted=False):
    aliases = {f"a_{name}": {"kind": "custom", "connection_id": connection_id, "remote_name": name}
               for name in ("search_memory", "save_memory", "forget_memory")}
    bridge = NS(aliases=aliases)
    ctx = NS(media_review_only=False, draft_only=False, community_tools=[*aliases, "custom_call"],
             community_bridge=bridge, approval_mode=mode)
    return NS(ctx=ctx, uninterrupted_access=uninterrupted)


def test_tool_decisions_for_a_preset_server(monkeypatch):
    [preset] = custom_mcp_presets.parse(json.dumps([PRESET]))
    monkeypatch.setattr(custom_mcp_presets, "_registered", {"conn-1": preset})
    run = _run("conn-1")
    decide = lambda tool, mode="ask", args=None, r=run: tool_policy.automatic("mcp__community__" + tool, mode, r, args or {})  # noqa: E731
    assert decide("a_search_memory") == ("allowed", "preset_auto_allow")
    assert decide("custom_call", args={"ref": "a_search_memory", "arguments": {}}) == ("allowed", "preset_auto_allow")
    assert decide("a_save_memory") is None  # a card
    assert decide("a_forget_memory") == ("denied", "preset_denied")
    assert decide("a_search_memory", mode="plan") == ("denied", "plan_mode")
    assert decide("a_search_memory", r=_run("conn-1", uninterrupted=True)) is None
    # Full access never answers a preset write on its own; reads were allowed above already.
    assert custom_mcp_presets.always_asked(run, "mcp__community__a_save_memory", {})
    assert not custom_mcp_presets.always_asked(run, "mcp__community__a_search_memory", {})
    assert approval_modes.FULL_ACCESS == "full_access"


def test_a_connection_without_a_preset_is_decided_as_before(monkeypatch):
    monkeypatch.setattr(custom_mcp_presets, "_registered", {})
    run = _run("conn-1")
    assert tool_policy.automatic("mcp__community__a_search_memory", "ask", run, {}) is None
    assert not custom_mcp_presets.always_asked(run, "mcp__community__a_save_memory", {})


async def test_a_resync_grants_new_agents_and_respects_an_owner_switch_off(factory, owner, preset_env):
    from app.schemas.custom_mcp import CustomMcpRevision
    await custom_mcp_presets.sync(factory)
    tests_run = len(preset_env.seen)
    agent_id = await add_agent(factory, owner)
    await custom_mcp_presets.sync(factory)
    async with factory() as db:
        row = (await db.scalars(select(CustomMcpConnection).where(CustomMcpConnection.owner_id == owner))).one()
        grants = sorted((await db.scalars(select(CustomMcpToolGrant.tool_name).where(
            CustomMcpToolGrant.agent_id == agent_id))).all())
    assert grants == ["save_memory", "search_memory"]
    assert len(preset_env.seen) == tests_run + 1  # the grant only, no new test of a connected server
    async with factory() as db:
        await custom_mcp.disable_connection(row.id, CustomMcpRevision(revision=row.revision), Response(), db)
    await custom_mcp_presets.sync(factory)
    async with factory() as db:
        assert (await db.get(CustomMcpConnection, row.id, populate_existing=True)).enabled is False
