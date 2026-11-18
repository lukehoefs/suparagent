"""What an agent's mode (Task or Conversational) and its guidance on how to talk add to a turn's
instructions (agent_memory.mode_prompt), and how they travel in an agent file."""

from types import SimpleNamespace

import pytest

from app.services import agent_memory, agent_package
from app.services.agent_memory import CONVERSATIONAL_MODE_PROMPT, MODE_APPROVALS_PROMPT, TASK_MODE_PROMPT


@pytest.fixture(autouse=True)
def isolated_workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(agent_memory.local_claude_runner, "workspace_dir", lambda: tmp_path)
    from app.services import about_me
    monkeypatch.setattr(about_me, "prompt_block", lambda: "")


def agent(**fields):
    base = dict(id=9, instructions="", memory_enabled=False, conversational_mode=False, conversational_style=None,
                name="Atlas", title=None, description=None)
    return SimpleNamespace(**{**base, **fields})


def test_task_mode_works_quietly_and_reports_back():
    text = agent_memory.mode_prompt(agent())
    assert text == f"{TASK_MODE_PROMPT} {MODE_APPROVALS_PROMPT}"
    assert "report back" in text and "Ask only when you cannot go on" in text


def test_conversational_mode_talks_through_the_plan_before_major_tool_calls():
    text = agent_memory.mode_prompt(agent(conversational_mode=True))
    assert text == f"{CONVERSATIONAL_MODE_PROMPT} {MODE_APPROVALS_PROMPT}"
    for words in ("question or two", "wait for the answer", "sends something", "deletes something", "takes a long time"):
        assert words in text


def test_neither_mode_loosens_approvals():
    for conversational in (False, True):
        assert "still asks for it" in agent_memory.mode_prompt(agent(conversational_mode=conversational))


def test_the_style_is_added_in_both_modes_and_blank_adds_nothing():
    for conversational in (False, True):
        text = agent_memory.mode_prompt(agent(conversational_mode=conversational, conversational_style=" Brief. "))
        assert text.endswith("\n\nHow the person wants you to talk:\nBrief.")
    assert "How the person wants" not in agent_memory.mode_prompt(agent(conversational_style="   "))


def test_a_run_nobody_follows_works_in_task_mode():
    text = agent_memory.mode_prompt(agent(conversational_mode=True, conversational_style="Warm."), attended=False)
    assert text.startswith(TASK_MODE_PROMPT) and CONVERSATIONAL_MODE_PROMPT not in text
    assert text.endswith("Warm.")


def test_the_mode_comes_after_the_instructions():
    text = agent_memory.turn_instructions(agent(instructions="Be brief.", conversational_mode=True))
    assert text == f"Be brief.\n\n{CONVERSATIONAL_MODE_PROMPT} {MODE_APPROVALS_PROMPT}"
    assert agent_memory.turn_instructions(agent(instructions="Be brief.", conversational_mode=True), attended=False) == (
        f"Be brief.\n\n{TASK_MODE_PROMPT} {MODE_APPROVALS_PROMPT}"
    )


def test_an_agent_file_writes_conversational_mode_only_when_on():
    on, redacted = agent_package.export_package(agent(conversational_mode=True, conversational_style="Warm."), None)
    assert on["agent"]["conversational_mode"] is True and on["agent"]["conversational_style"] == "Warm."
    assert redacted == []
    off, _ = agent_package.export_package(agent(), None)
    assert off["agent"] == {"name": "Atlas"}


def test_an_agent_file_is_read_back_with_its_mode_and_redacted_style():
    document = {"format": agent_package.FORMAT, "version": 1,
                "agent": {"name": "A", "conversational_mode": True, "conversational_style": " ghp_" + "b" * 30 + " "}}
    parsed = agent_package.parse_package(document)
    assert (parsed["conversational_mode"], parsed["conversational_style"]) == (True, "[redacted]")
    plain = agent_package.parse_package({"format": agent_package.FORMAT, "version": 1, "agent": {"name": "A"}})
    assert (plain["conversational_mode"], plain["conversational_style"]) == (False, None)
