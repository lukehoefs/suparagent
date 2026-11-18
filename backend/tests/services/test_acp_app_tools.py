"""Connected apps and granted MCP tools on an ACP engine (Antigravity): the servers are
mounted in `session/new`, and a permission request naming one of their tools reaches
the approval gate as `mcp__<server>__<tool>` with its exact arguments, which is what
the bridges require before they run a call (composio_bridge, community_mcp_bridge)."""

import asyncio
from types import SimpleNamespace

import pytest

from app import composio_tools
from app.services import community_mcp_bridge, composio_bridge
from app.services.acp_adapter import AcpAdapter, _AcpTurn, mcp_call_of
from app.services.antigravity_adapter import AntigravityAdapter
from app.services.engine_registry import capabilities_of
from app.services.provider_adapter import ALLOW


def launch(name):
    return SimpleNamespace(command="python", args=["-m", name, "--mailbox", "/tmp/x"], env={"A": "1"})


def ctx(**more):
    base = dict(
        approval_mode="ask", workspace=None, provider_state=None, memory_launch=None, team_launch=None,
        composio_launch=None, composio_apps=None, composio_exact_tools=None,
        community_launch=None, community_tools=[], community_prompt_note=None, community_bridge=None,
        instructions=None, prompt="hi", routine_uninterrupted=False,
    )
    base.update(more)
    return SimpleNamespace(**base)


class Gate:
    def __init__(self):
        self.opened = []

    async def open(self, **kwargs):
        self.opened.append(kwargs)
        return SimpleNamespace(tool=None)

    async def decide(self, handle):
        return SimpleNamespace(kind=ALLOW)


class Rpc:
    def __init__(self):
        self.answers = {}

    def respond(self, rid, result=None, error=None):
        self.answers[rid] = result if error is None else {"error": error}


def turn(c, mode="ask"):
    c.approval_mode = mode
    t = _AcpTurn(ctx=c, sink=None, gate=Gate(), argv=["agent"], adapter=AcpAdapter())
    t.rpc = Rpc()
    return t


def ask(title, raw, rid=1, meta=None):
    call = {"toolCallId": "c1", "kind": "other", "title": title, "rawInput": raw}
    if meta is not None:
        call["_meta"] = meta
    return {"id": rid, "method": "session/request_permission", "params": {
        "sessionId": "s", "toolCall": call,
        "options": [{"optionId": "once", "kind": "allow_once"}, {"optionId": "no", "kind": "reject_once"}],
    }}


async def settle(t):
    await asyncio.gather(*list(t.answering))


def test_names_an_engine_gives_an_mcp_tool():
    assert mcp_call_of("mcp__composio__app_run_action") == ("composio", "app_run_action")
    assert mcp_call_of("app_run_action (composio MCP Server)") == ("composio", "app_run_action")
    assert mcp_call_of("community/search_issues") == ("community", "search_issues")
    assert mcp_call_of("anything", {"serverName": "community", "toolName": "t"}) == ("community", "t")
    assert mcp_call_of("Run ls in the workspace") is None
    assert mcp_call_of("x" * 300) is None


def test_antigravity_declares_apps_and_tools_but_not_team_tools():
    caps = capabilities_of(AntigravityAdapter())
    assert caps.connected_apps and caps.community_tools and caps.approvals
    assert not caps.mcp  # a lead needs team tools, which ACP does not mount
    assert not capabilities_of(AcpAdapter()).connected_apps


def test_the_app_servers_are_mounted_with_their_own_names():
    t = turn(ctx(composio_launch=launch("composio"), community_launch=launch("community")))
    names = [s["name"] for s in t._mcp_servers()]
    assert names == ["composio", "community"]
    assert t._mcp_servers()[0]["env"] == [{"name": "A", "value": "1"}]
    assert turn(ctx())._mcp_servers() == []


@pytest.mark.parametrize("mode", ["ask", "plan", "accept_edits"])
async def test_a_connected_app_call_is_put_to_the_gate_by_its_exact_name_and_arguments(mode):
    apps = {"gmail": "read"}
    name = next(tool["name"] for tool in composio_tools.mcp_tools(apps))
    t = turn(ctx(composio_launch=launch("composio"), composio_apps=apps), mode)
    raw = {"query": "invoice", "n": 3}
    await t._server_request(ask(f"{name} (composio MCP Server)", raw))
    await settle(t)
    assert t.gate.opened == [{"request_id": "acp-1", "tool": composio_bridge.PREFIX + name, "input": raw,
                              "summary": t.gate.opened[0]["summary"], "kind": "other"}]
    assert t.rpc.answers[1] == {"outcome": {"outcome": "selected", "optionId": "once"}}


async def test_a_tool_the_agent_was_not_given_is_refused_without_a_card():
    t = turn(ctx(composio_launch=launch("composio"), composio_apps={"gmail": "read"},
                 community_launch=launch("community"), community_tools=["search_issues"]))
    await t._server_request(ask("mcp__composio__delete_everything", {}, rid=1))
    await t._server_request(ask("mcp__community__drop_table", {}, rid=2))
    assert t.gate.opened == []
    assert t.rpc.answers == {1: {"outcome": {"outcome": "selected", "optionId": "no"}},
                             2: {"outcome": {"outcome": "selected", "optionId": "no"}}}


async def test_a_granted_mcp_tool_goes_to_the_gate_and_an_unmounted_server_does_not_count():
    bridge = SimpleNamespace(approval_summary=lambda name, args: f"Use {name}")
    t = turn(ctx(community_launch=launch("community"), community_tools=["search_issues"], community_bridge=bridge))
    await t._server_request(ask("community/search_issues", {"q": "bug"}))
    await settle(t)
    assert t.gate.opened[0]["tool"] == community_mcp_bridge.PREFIX + "search_issues"
    assert t.gate.opened[0]["input"] == {"q": "bug"} and t.gate.opened[0]["summary"] == "Use search_issues"
    # No composio server this turn: a call naming it is just another tool call, refused here with tools off.
    t2 = turn(ctx())
    t2.tools = False
    await t2._server_request(ask("mcp__composio__app_run_action", {"x": 1}))
    assert t2.gate.opened == [] and t2.rpc.answers[1]["outcome"]["optionId"] == "no"


def test_the_prompt_carries_the_app_notes():
    t = turn(ctx(composio_launch=launch("composio"), composio_apps={"gmail": "read"},
                 community_launch=launch("community"), community_prompt_note="NOTE-COMMUNITY", instructions="Be brief."))
    t.preamble = ""
    text = t._prompt_text()
    assert "Be brief." in text and "NOTE-COMMUNITY" in text
    assert composio_tools.tool_note({"gmail": "read"}) in text
