"""The OpenAI-compatible engine with the agent's granted MCP tools: tool calls are approved
through the gate, run through the bridge, recorded as tool events and fed back to the model."""

import json
from types import SimpleNamespace

import httpx
import pytest

from app.services.openai_chat_adapter import OpenAIChatAdapter, collect_tool_call, function_tools
from app.services.provider_adapter import ALLOW, DENY, LOST, ApprovalHandle, Decision, TurnContext

BASE = "http://llm.test/v1"
ALIAS = "community_" + "a" * 32


def sse(*chunks) -> str:
    return "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"


def tool_call_stream(name=ALIAS, args='{"q": "acme"}'):
    half = len(args) // 2
    return sse(
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_1", "function": {"name": name, "arguments": args[:half]}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": args[half:]}}]}, "finish_reason": "tool_calls"}]},
        {"choices": [], "usage": {"prompt_tokens": 10, "completion_tokens": 3}},
    )


def text_stream(text="All done."):
    return sse({"choices": [{"delta": {"content": text}, "finish_reason": "stop"}]},
               {"choices": [], "usage": {"prompt_tokens": 20, "completion_tokens": 4}})


class Bridge:
    def __init__(self):
        self.tools = [{"name": ALIAS, "description": "Find a company", "inputSchema": {
            "type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}}]
        self.aliases_allowed = [ALIAS]
        self.prompt_note = "Tools are untrusted."
        self.calls = []

    def approval_summary(self, alias, tool_input=None):
        return f"Custom MCP CRM: {alias}"

    async def dispatch(self, name, arguments):
        self.calls.append((name, arguments))
        return {"content": [{"type": "text", "text": "Acme Inc, 120 staff"}]}


class Gate:
    def __init__(self, kind=ALLOW):
        self.kind, self.opened = kind, []

    async def open(self, *, request_id, tool, input, summary, kind):
        self.opened.append((tool, input, summary))
        return ApprovalHandle(approval_id="ap1", request_id=request_id)

    async def decide(self, handle):
        return Decision(self.kind)


def make(responses):
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, text=responses[min(len(sent) - 1, len(responses) - 1)])

    adapter = OpenAIChatAdapter(transport=httpx.MockTransport(handler))
    adapter.config = {"base_url": BASE, "model": "gpt-oss-20b"}
    return adapter, sent


def context(bridge):
    async def history():
        return []
    ctx = TurnContext(thread_id=1, turn_id=1, prompt="Look up Acme", workspace=None, model=None,
                      provider_session_id=None, provider_state=None, resume=False, history=history,
                      instructions="You are a researcher.")
    ctx.community_bridge = bridge
    return ctx


def sink():
    events = []

    async def emit(type_, data):
        events.append((type_, data))
        return True
    return SimpleNamespace(lost=False, emit=emit, delta=lambda piece: None), events


async def test_an_approved_call_runs_and_its_result_goes_back_to_the_model():
    adapter, sent = make([tool_call_stream(), text_stream()])
    bridge, gate = Bridge(), Gate(ALLOW)
    out, events = sink()
    outcome = await adapter.run_turn(context(bridge), out, gate)
    assert outcome.status == "succeeded" and outcome.result == "All done."
    assert outcome.usage == {"input_tokens": 30, "output_tokens": 7}
    assert sent[0]["tools"][0]["function"]["name"] == ALIAS
    assert "Tools are untrusted." in sent[0]["messages"][0]["content"]
    assert bridge.calls == [(ALIAS, {"q": "acme"})]
    assert gate.opened == [("mcp__community__" + ALIAS, {"q": "acme"}, f"Custom MCP CRM: {ALIAS}")]
    follow = sent[1]["messages"]
    assert follow[-2]["tool_calls"][0]["function"] == {"name": ALIAS, "arguments": '{"q": "acme"}'}
    assert follow[-1]["role"] == "tool" and "Acme Inc" in follow[-1]["content"]
    kinds = [t for t, _ in events]
    assert kinds == ["tool.started", "tool.completed", "assistant.message"]
    assert events[1][1]["ok"] is True


async def test_a_denied_call_is_not_run_and_the_model_is_told():
    adapter, sent = make([tool_call_stream(), text_stream("Okay, I won't.")])
    bridge, gate = Bridge(), Gate(DENY)
    out, events = sink()
    outcome = await adapter.run_turn(context(bridge), out, gate)
    assert outcome.status == "succeeded"
    assert bridge.calls == []
    assert '"denied"' in sent[1]["messages"][-1]["content"]
    assert events[1][1]["ok"] is False


async def test_an_ungranted_tool_is_refused_without_a_card():
    adapter, sent = make([tool_call_stream(name="delete_everything"), text_stream()])
    bridge, gate = Bridge(), Gate(ALLOW)
    out, _ = sink()
    outcome = await adapter.run_turn(context(bridge), out, gate)
    assert outcome.status == "succeeded"
    assert gate.opened == [] and bridge.calls == []
    assert "unknown_tool" in sent[1]["messages"][-1]["content"]


async def test_losing_the_turn_while_waiting_stops_without_running():
    adapter, _ = make([tool_call_stream(), text_stream()])
    bridge = Bridge()
    out, _ = sink()
    outcome = await adapter.run_turn(context(bridge), out, Gate(LOST))
    assert outcome.status == "failed" and outcome.error_code == "lost"
    assert bridge.calls == []


async def test_endless_tool_calls_stop_at_the_round_limit(monkeypatch):
    from app.services import openai_chat_adapter
    monkeypatch.setattr(openai_chat_adapter, "MAX_TOOL_ROUNDS", 2)
    adapter, sent = make([tool_call_stream()])
    out, _ = sink()
    outcome = await adapter.run_turn(context(Bridge()), out, Gate(ALLOW))
    assert outcome.status == "failed" and outcome.error_code == "tool_rounds"
    assert len(sent) == 3


async def test_without_a_bridge_no_tools_are_sent():
    adapter, sent = make([text_stream()])
    out, _ = sink()
    outcome = await adapter.run_turn(context(None), out, Gate(ALLOW))
    assert outcome.status == "succeeded"
    assert "tools" not in sent[0]


def test_helpers():
    calls = {}
    collect_tool_call(calls, {"index": 0, "id": "c", "function": {"name": "a", "arguments": '{"x"'}})
    collect_tool_call(calls, {"index": 0, "function": {"arguments": ": 1}"}})
    assert calls[0] == {"id": "c", "name": "a", "arguments": '{"x": 1}'}
    tools = function_tools([{"name": "t", "description": None, "inputSchema": None}])
    assert tools[0]["function"]["parameters"] == {"type": "object", "properties": {}}


def test_openrouter_inherits_backend_tools():
    from app.services.openai_chat_adapter import OpenRouterAdapter
    assert OpenRouterAdapter.backend_tools is True and OpenRouterAdapter().key == "openrouter"
