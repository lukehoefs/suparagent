"""An agent's model settings reach its turns: sampling sent only by the engines
that take it, a reasoning effort that follows edits of the agent into the
conversations already started (a conversation's own choice still wins), and
Claude's `--effort` only for a CLI that lists the flag."""

import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.services import agent_store, local_claude_runner
from app.services import thread_store as store
from app.services.boat_adapter import build_command
from app.services.claude_adapter import ClaudeAdapter
from app.services.engine_registry import EngineRegistry
from app.services.openai_chat_adapter import OpenAIChatAdapter, OpenRouterAdapter, openrouter_params, sampling_body
from app.services.provider_adapter import ModelOption, ProviderStatus, TurnContext, TurnOutcome
from app.services.thread_runtime import agent_turn_settings
from tests.services.thread_harness import (  # noqa: F401
    cleanup,
    finished,
    new_thread,
    owner,
    reload,
    rt,
    sessions,
)

BASE = "http://llm.test/v1"


def context(**changes) -> TurnContext:
    async def history():
        return []

    values = dict(
        thread_id=1, turn_id=1, prompt="hello", workspace=None, model="llama-x",
        provider_session_id=None, provider_state=None, resume=False, history=history,
    )
    values.update(changes)
    return TurnContext(**values)


async def run_openai(ctx) -> dict:
    sent = {}

    def handler(request):
        sent["body"] = json.loads(request.content)
        return httpx.Response(200, text='data: {"choices": [{"delta": {"content": "ok"}}]}\n\ndata: [DONE]\n\n')

    adapter = OpenAIChatAdapter(transport=httpx.MockTransport(handler))
    adapter.config = {"base_url": BASE, "model": "llama-x"}

    async def emit(*_args):
        pass

    sink = SimpleNamespace(lost=False, emit=emit, delta=lambda *_args: None)
    outcome = await adapter.run_turn(ctx, sink, None)
    assert outcome.status == "succeeded", outcome.error
    return sent["body"]


# --- sampling on the wire ------------------------------------------------------------------------


async def test_the_chat_body_carries_the_agents_sampling():
    body = await run_openai(context(temperature=0.3, top_p=0.9, max_output_tokens=512))
    assert (body["temperature"], body["top_p"], body["max_tokens"]) == (0.3, 0.9, 512)


async def test_unset_sampling_is_left_out_of_the_chat_body():
    body = await run_openai(context())
    assert not {"temperature", "top_p", "max_tokens"} & set(body)
    body = await run_openai(context(temperature=0.0))
    # Zero is a value, not "unset".
    assert body["temperature"] == 0.0 and "top_p" not in body and "max_tokens" not in body


def test_sampling_body_sends_only_what_is_set():
    assert sampling_body(SimpleNamespace(temperature=None, top_p=None, max_output_tokens=None)) == {}
    assert sampling_body(SimpleNamespace(temperature=1, top_p=None, max_output_tokens=7)) == {"temperature": 1, "max_tokens": 7}


def test_openrouter_reads_what_each_model_takes():
    assert openrouter_params(["tools", "temperature", "max_tokens"]) == ("temperature", "max_output_tokens")
    assert openrouter_params([]) == ()
    assert openrouter_params(None) is None


# --- what the engine list says ------------------------------------------------------------------


class _Runtime:
    def __init__(self, adapters):
        self.adapters = adapters

    async def prepare_adapter(self, *_args):
        return None


async def test_engines_say_which_sampling_they_send(monkeypatch):
    monkeypatch.setattr(local_claude_runner, "known_effort_support", lambda: None)

    class Ready(ClaudeAdapter):
        async def status(self):
            return ProviderStatus(ready=True)

    router = OpenRouterAdapter()

    async def probe():
        from app.services.provider_adapter import EngineProbe

        return EngineProbe(installed=True, ready=True, models=[
            ModelOption("a/one", "One", True, generation_params=("temperature",)),
            ModelOption("b/two", "Two", generation_params=None),
        ])

    router.probe = probe
    registry = EngineRegistry(_Runtime({"claude": Ready(), "openai_compat": OpenAIChatAdapter(), "openrouter": router}))
    described = {e["id"]: e for e in await registry.describe()}
    assert described["claude"]["generation_params"] == []
    assert all(m["generation_params"] == [] for m in described["claude"]["models"])
    assert described["openai_compat"]["generation_params"] == ["temperature", "top_p", "max_output_tokens"]
    models = {m["id"]: m for m in described["openrouter"]["models"]}
    assert models["a/one"]["generation_params"] == ["temperature"]
    assert models["b/two"]["generation_params"] == ["temperature", "top_p", "max_output_tokens"]
    # The engine's default model decides for "no model"; an unlisted one gets the engine's.
    assert registry.generation_params("openrouter", None) == ("temperature",)
    assert registry.generation_params("openrouter", "c/three") == ("temperature", "top_p", "max_output_tokens")
    assert registry.generation_params("claude", "opus") == ()


async def test_claude_offers_effort_only_once_the_cli_is_known_to_take_it(monkeypatch):
    adapter = ClaudeAdapter()
    monkeypatch.setattr(local_claude_runner, "known_effort_support", lambda: None)
    assert all(not m.supported_reasoning_efforts for m in adapter.models)
    monkeypatch.setattr(local_claude_runner, "known_effort_support", lambda: False)
    assert all(not m.supported_reasoning_efforts for m in adapter.models)
    monkeypatch.setattr(local_claude_runner, "known_effort_support", lambda: True)
    efforts = {m.id: m.supported_reasoning_efforts for m in adapter.models}
    assert efforts["opus"] == efforts["sonnet"] == ("low", "medium", "high", "xhigh", "max")
    assert efforts["haiku"] == ()
    registry = EngineRegistry(_Runtime({"claude": adapter}))
    assert registry.reasoning_efforts("claude", "opus") == ("low", "medium", "high", "xhigh", "max")
    assert registry.reasoning_efforts("claude", "haiku") == ()
    assert registry.reasoning_efforts("claude", "claude-something-new") == ()


# --- Claude's --effort ---------------------------------------------------------------------------


def test_build_args_passes_a_known_effort_level_only():
    args = local_claude_runner.build_args(Path("claude.exe"), "sid", effort="high")
    assert args[args.index("--effort") + 1] == "high"
    assert "--effort" not in local_claude_runner.build_args(Path("claude.exe"), "sid")
    assert "--effort" not in local_claude_runner.build_args(Path("claude.exe"), "sid", effort="--evil")


def test_effort_support_is_read_from_the_help_once_per_build(monkeypatch, tmp_path):
    executable = tmp_path / "claude"
    executable.write_text("x")
    calls = []

    def fake_run(args, **_kwargs):
        calls.append(args)
        return local_claude_runner.RunOutput(stdout="  --effort <level>  Effort level", stderr="", exit_code=0)

    monkeypatch.setattr(local_claude_runner, "run_blocking", fake_run)
    monkeypatch.setattr(local_claude_runner, "_effort_flag", {})
    monkeypatch.setattr(local_claude_runner, "resolve_claude_executable", lambda: executable)
    assert local_claude_runner.known_effort_support() is None
    assert local_claude_runner.effort_support_blocking(executable) is True
    assert local_claude_runner.effort_support_blocking(executable) is True
    assert calls == [[str(executable), "--help"]]
    assert local_claude_runner.known_effort_support() is True
    # Another build of the CLI is read again.
    executable.write_text("a newer, longer build")
    monkeypatch.setattr(local_claude_runner, "run_blocking", lambda args, **_k: local_claude_runner.RunOutput("Usage: claude", "", 0))
    assert local_claude_runner.effort_support_blocking(executable) is False


def test_a_failed_help_run_says_no_and_is_tried_again(monkeypatch, tmp_path):
    executable = tmp_path / "claude"
    executable.write_text("x")
    monkeypatch.setattr(local_claude_runner, "_effort_flag", {})
    monkeypatch.setattr(local_claude_runner, "run_blocking", lambda args, **_k: local_claude_runner.RunOutput("", "", None, timed_out=True))
    assert local_claude_runner.effort_support_blocking(executable) is False
    assert local_claude_runner._effort_flag == {}


def test_the_flag_never_reaches_a_cli_without_it(monkeypatch, tmp_path):
    seen = {}

    def fake_build_args(executable, session_id, **extra):
        seen.update(extra)
        return ["claude"]

    monkeypatch.setattr(local_claude_runner, "resolve_claude_executable", lambda: tmp_path / "claude")
    monkeypatch.setattr(local_claude_runner, "build_args", fake_build_args)
    monkeypatch.setattr(local_claude_runner, "run_blocking", lambda args, **_k: local_claude_runner.RunOutput("", "", 0))
    monkeypatch.setattr(local_claude_runner, "effort_support_blocking", lambda executable=None: False)
    local_claude_runner._run_blocking("hi", "sid", None, None, workspace=None, effort="high")
    assert "effort" not in seen
    monkeypatch.setattr(local_claude_runner, "effort_support_blocking", lambda executable=None: True)
    local_claude_runner._run_blocking("hi", "sid", None, None, workspace=None, effort="high")
    assert seen["effort"] == "high"


def test_the_sandbox_command_asks_its_own_cli_before_passing_effort():
    plain = build_command(session_id="s", resume=False, prompt_path="p", model=None, approval_mode=None, instructions=None)
    assert "--effort" not in plain
    with_effort = build_command(session_id="s", resume=False, prompt_path="p", model=None, approval_mode=None,
                                instructions=None, effort="xhigh")
    assert "if claude --help 2>/dev/null | grep -q -e '--effort'; then " in with_effort
    then, otherwise = with_effort.split("; else ")
    assert "--effort xhigh" in then and "--effort" not in otherwise.replace("fi", "")
    bogus = build_command(session_id="s", resume=False, prompt_path="p", model=None, approval_mode=None,
                          instructions=None, effort="high; rm -rf /")
    assert bogus == plain


# --- which settings a turn uses ------------------------------------------------------------------


def _agent(**values):
    base = dict(provider="codex", model=None, effort="high", temperature=0.4, top_p=None, max_output_tokens=900)
    base.update(values)
    return SimpleNamespace(**base)


def test_a_turn_reads_the_agent_unless_the_conversation_chose():
    thread = SimpleNamespace(provider="codex", model=None, provider_state={"codex_thread_id": "t"})
    assert agent_turn_settings(_agent(), thread) == {"effort": "high", "temperature": 0.4, "top_p": None, "max_output_tokens": 900}
    thread.provider_state = {"codex_thread_id": "t", "effort": "low"}
    assert agent_turn_settings(_agent(), thread)["effort"] == "low"


def test_another_engine_or_model_does_not_get_the_agents_settings():
    other_engine = SimpleNamespace(provider="claude", model=None, provider_state=None)
    assert agent_turn_settings(_agent(), other_engine) == {"effort": None, "temperature": None, "top_p": None, "max_output_tokens": None}
    other_model = SimpleNamespace(provider="codex", model="gpt-other", provider_state=None)
    assert agent_turn_settings(_agent(model="gpt-main"), other_model)["effort"] is None
    assert agent_turn_settings(_agent(model="gpt-main"), other_model)["temperature"] == 0.4
    assert agent_turn_settings(None, other_model)["effort"] is None


# --- the conversation's own effort survives the engine's state ------------------------------------


async def test_finishing_a_turn_keeps_the_conversations_effort(sessions, owner):
    thread = await new_thread(sessions, owner, provider="codex", session_state="none", provider_session_id=None,
                              provider_state={"effort": "high"})
    async with sessions() as db:
        turn = await store.start_turn(db, thread.id, "hi", owner_instance="test")
    async with sessions() as db:
        assert await store.finish_turn(db, turn.id, turn.owner_token, status="succeeded", result="ok",
                                       provider_state={"codex_thread_id": "c-1", "effort": "stale"})
    got = await reload(sessions, store.Thread, thread.id)
    assert got.provider_state == {"codex_thread_id": "c-1", "effort": "high"}


async def test_a_reset_session_keeps_the_conversations_effort(sessions, owner):
    thread = await new_thread(sessions, owner, provider_session_id="old", provider_state={"effort": "max", "x": 1})
    async with sessions() as db:
        await store.reset_session(db, thread.id, "new-sid", message="reset")
    got = await reload(sessions, store.Thread, thread.id)
    assert got.provider_state == {"effort": "max"}


class Recorder(ClaudeAdapter):
    """Records what each turn was given and reports engine state like Codex does."""

    def __init__(self):
        self.seen: list[dict] = []

    async def status(self):
        return ProviderStatus(ready=True, version="fake")

    async def run_turn(self, ctx, sink, gate):
        self.seen.append({"effort": ctx.effort, "temperature": ctx.temperature, "top_p": ctx.top_p,
                          "max_output_tokens": ctx.max_output_tokens})
        return TurnOutcome("succeeded", result="ok", session_state="active", provider_state={"engine_thread": "e-1"})


async def test_agent_edits_reach_a_conversation_already_started(rt, sessions, owner, tmp_path, monkeypatch):
    monkeypatch.setattr(local_claude_runner, "workspace_dir", lambda: tmp_path)
    recorder = Recorder()
    rt.adapters = {"claude": recorder}
    async with sessions() as db:
        agent = await agent_store.create_agent(db, owner_id=owner, name="Sampler", provider="claude",
                                               effort="high", temperature=0.2)
    thread = await rt.create_thread(agent_id=agent.id)
    # The agent's own effort is not copied into the conversation: it is read at every turn.
    assert (await reload(sessions, store.Thread, thread.id)).effort is None

    await rt.send_turn(thread.id, "one")
    await finished(sessions, thread.id, 1)
    async with sessions() as db:
        await agent_store.update_agent(db, agent.id, effort="low", temperature=1.1, max_output_tokens=64)
    await rt.send_turn(thread.id, "two")
    await finished(sessions, thread.id, 2)
    async with sessions() as db:
        await store.set_model(db, thread.id, None, effort="max")
    await rt.send_turn(thread.id, "three")
    await finished(sessions, thread.id, 3)

    assert [s["effort"] for s in recorder.seen] == ["high", "low", "max"]
    assert [s["temperature"] for s in recorder.seen] == [0.2, 1.1, 1.1]
    assert recorder.seen[1]["max_output_tokens"] == 64 and recorder.seen[1]["top_p"] is None
    state = (await reload(sessions, store.Thread, thread.id)).provider_state
    assert state == {"engine_thread": "e-1", "effort": "max"}


async def test_an_explicit_different_effort_at_start_is_the_conversations_own(rt, sessions, owner, tmp_path, monkeypatch):
    monkeypatch.setattr(local_claude_runner, "workspace_dir", lambda: tmp_path)
    async with sessions() as db:
        agent = await agent_store.create_agent(db, owner_id=owner, name="Pinned", provider="claude", effort="high")
    same = await rt.create_thread(agent_id=agent.id, effort="high")
    other = await rt.create_thread(agent_id=agent.id, effort="low")
    assert (await reload(sessions, store.Thread, same.id)).effort is None
    assert (await reload(sessions, store.Thread, other.id)).effort == "low"


@pytest.fixture(autouse=True)
async def _agents_cleanup(sessions, owner):
    yield
    from sqlalchemy import delete

    from app.db.models import Agent

    async with sessions() as db:
        await db.execute(delete(Agent).where(Agent.owner_id == owner))
        await db.commit()
