"""Task or Conversational mode, and how an agent talks, over the HTTP API: defaults, partial
updates that never reset them, limits, history, duplicate, export and import, a `manage` device,
and what each mode tells the engine at the next turn."""

from uuid import uuid4

import pytest

from app.services import agent_memory, agent_package
from tests.routers.test_agents_api import (  # noqa: F401
    agent_cleanup,
    api,
    client_for,
    code_of,
    launches,
    local_enabled,
    make,
    send,
    thread_from,
)
from tests.routers.test_agents_manage_api import phone  # noqa: F401
from tests.services.thread_harness import cleanup, cli, finished, owner, rt, sessions  # noqa: F401


async def patch(api, agent, body):
    response = await api.patch(f"/api/v1/agents/{agent['id']}", json=body)
    assert response.status_code == 200, response.text
    return response.json()


async def test_a_new_agent_works_in_task_mode_with_no_style(api):
    agent = await make(api)
    assert (agent["conversational_mode"], agent["conversational_style"]) == (False, None)


async def test_mode_and_style_are_saved_trimmed_and_read_back(api):
    agent = await make(api, conversational_mode=True, conversational_style="  Short answers, no jargon.  ")
    assert (agent["conversational_mode"], agent["conversational_style"]) == (True, "Short answers, no jargon.")
    assert (await api.get(f"/api/v1/agents/{agent['id']}")).json()["conversational_mode"] is True


async def test_a_partial_update_never_resets_the_mode_or_the_style(api):
    agent = await make(api, conversational_mode=True, conversational_style="Warm.")
    renamed = await patch(api, agent, {"name": "Renamed " + uuid4().hex[:6]})
    assert (renamed["conversational_mode"], renamed["conversational_style"]) == (True, "Warm.")
    task = await patch(api, agent, {"conversational_mode": False})
    assert (task["conversational_mode"], task["conversational_style"]) == (False, "Warm.")
    styled = await patch(api, agent, {"conversational_style": "Brief."})
    assert (styled["conversational_mode"], styled["conversational_style"]) == (False, "Brief.")


async def test_null_or_blank_style_removes_it_but_the_mode_cannot_be_null(api):
    agent = await make(api, conversational_style="Warm.")
    assert (await patch(api, agent, {"conversational_style": None}))["conversational_style"] is None
    await patch(api, agent, {"conversational_style": "Warm."})
    assert (await patch(api, agent, {"conversational_style": "   "}))["conversational_style"] is None
    response = await api.patch(f"/api/v1/agents/{agent['id']}", json={"conversational_mode": None})
    assert response.status_code == 422


async def test_the_style_is_at_most_500_characters(api):
    assert (await make(api, conversational_style="x" * 500))["conversational_style"] == "x" * 500
    response = await api.post("/api/v1/agents", json={"name": "Long", "conversational_style": "x" * 501})
    assert response.status_code == 422
    agent = await make(api)
    assert (await api.patch(f"/api/v1/agents/{agent['id']}", json={"conversational_style": "x" * 501})).status_code == 422


async def test_a_mode_change_is_a_version_that_can_be_restored(api):
    agent = await make(api)
    await patch(api, agent, {"conversational_mode": True, "conversational_style": "Warm."})
    revisions = (await api.get(f"/api/v1/agents/{agent['id']}/revisions")).json()
    assert [r["number"] for r in revisions] == [2, 1]
    assert revisions[0]["changed_fields"] == ["conversational_mode", "conversational_style"]
    restored = await api.post(f"/api/v1/agents/{agent['id']}/revisions/1/restore", json={"expected_revision": 2})
    assert restored.status_code == 200, restored.text
    assert (restored.json()["conversational_mode"], restored.json()["conversational_style"]) == (False, None)


async def test_a_copy_keeps_the_mode_and_the_style(api):
    agent = await make(api, conversational_mode=True, conversational_style="Warm.")
    response = await api.post(f"/api/v1/agents/{agent['id']}/duplicate")
    assert response.status_code == 201, response.text
    assert (response.json()["conversational_mode"], response.json()["conversational_style"]) == (True, "Warm.")


async def test_the_agent_file_carries_the_mode_and_the_style(api):
    agent = await make(api, conversational_mode=True, conversational_style="Warm. key sk-" + "a" * 24)
    exported = (await api.get(f"/api/v1/agents/{agent['id']}/export")).json()
    assert exported["document"]["agent"]["conversational_mode"] is True
    assert exported["document"]["agent"]["conversational_style"] == "Warm. key [redacted]"
    assert exported["redacted"] == ["conversational_style"]
    imported = await api.post("/api/v1/agents/import", json={"document": exported["document"]})
    assert imported.status_code == 201, imported.text
    assert (imported.json()["conversational_mode"], imported.json()["conversational_style"]) == (True, "Warm. key [redacted]")
    # Task, the default, is not written at all; an older file without it imports as Task.
    task = await make(api)
    document = (await api.get(f"/api/v1/agents/{task['id']}/export")).json()["document"]
    assert "conversational_mode" not in document["agent"] and "conversational_style" not in document["agent"]
    again = await api.post("/api/v1/agents/import", json={"document": document})
    assert again.json()["conversational_mode"] is False


@pytest.mark.parametrize("agent_part", [
    {"conversational_mode": "yes"},
    {"conversational_mode": 1},
    {"conversational_style": 5},
    {"conversational_style": "x" * 501},
])
async def test_an_agent_file_with_a_bad_mode_or_style_is_refused(api, agent_part):
    document = {"format": agent_package.FORMAT, "version": 1, "agent": {"name": "Odd", **agent_part}}
    response = await api.post("/api/v1/agents/import", json={"document": document})
    assert response.status_code == 422 and code_of(response) == "invalid_agent_file"


async def test_a_manage_device_may_change_the_mode_and_the_style(phone):
    created = await phone.post("/api/v1/agents", json={"name": "Phone " + uuid4().hex[:6], "conversational_mode": True})
    assert created.status_code == 201, created.text
    changed = await phone.patch(
        f"/api/v1/agents/{created.json()['id']}", json={"conversational_mode": False, "conversational_style": "Brief."},
    )
    assert changed.status_code == 200, changed.text
    assert (changed.json()["conversational_mode"], changed.json()["conversational_style"]) == (False, "Brief.")


async def test_each_turn_follows_the_agents_current_mode(api, rt, sessions, launches):
    agent = await make(api, instructions="Answer in French.", memory_enabled=False)
    thread = (await thread_from(api, agent)).json()
    await send(api, rt, sessions, thread["id"], 1)
    prompt = launches[-1]["system_prompt"]
    assert prompt.startswith("Answer in French.\n\n")
    assert agent_memory.TASK_MODE_PROMPT in prompt and agent_memory.CONVERSATIONAL_MODE_PROMPT not in prompt

    await patch(api, agent, {"conversational_mode": True, "conversational_style": "Short answers."})
    await send(api, rt, sessions, thread["id"], 2)
    prompt = launches[-1]["system_prompt"]
    assert agent_memory.CONVERSATIONAL_MODE_PROMPT in prompt and agent_memory.TASK_MODE_PROMPT not in prompt
    assert prompt.endswith("How the person wants you to talk:\nShort answers.")
    assert agent_memory.MODE_APPROVALS_PROMPT in prompt


async def test_a_turn_nobody_follows_works_in_task_mode(api, rt, sessions, launches):
    agent = await make(api, conversational_mode=True, memory_enabled=False)
    thread = (await thread_from(api, agent)).json()
    await rt.send_turn(thread["id"], "hello", internal=True)
    await finished(sessions, thread["id"], 1)
    assert agent_memory.TASK_MODE_PROMPT in launches[-1]["system_prompt"]
    await rt.send_turn(thread["id"], "hello", team_origin="workflow")
    await finished(sessions, thread["id"], 2)
    assert agent_memory.TASK_MODE_PROMPT in launches[-1]["system_prompt"]
    # A person on a device that may not change settings is still there to answer.
    await rt.send_turn(thread["id"], "hello", configuration_allowed=False)
    await finished(sessions, thread["id"], 3)
    assert agent_memory.CONVERSATIONAL_MODE_PROMPT in launches[-1]["system_prompt"]
