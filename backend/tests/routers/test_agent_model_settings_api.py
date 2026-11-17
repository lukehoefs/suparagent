"""An agent's temperature, top P, maximum output length and reasoning effort over
the HTTP API: ranges, explicit null back to the default, what an engine change
resets, and that a setting an engine or model does not take is refused."""

from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.config import settings
from app.db.models import Agent
from app.services.claude_adapter import ClaudeAdapter
from app.services.openai_chat_adapter import OpenAIChatAdapter
from app.services.provider_adapter import ModelOption, ProviderStatus
from tests.routers.test_agents_api import app_for, client_for, code_of
from tests.services.thread_harness import cleanup, cli, owner, rt, sessions  # noqa: F401


class Ready(ClaudeAdapter):
    async def status(self):
        return ProviderStatus(ready=True, version="fake")


class Picky(Ready):
    """An engine whose catalog lists efforts, and one model that takes only temperature."""

    label = "Picky"
    generation_params = ("temperature", "top_p", "max_output_tokens")

    @property
    def models(self):
        return [
            ModelOption("deep", "Deep", True, supported_reasoning_efforts=("low", "high")),
            ModelOption("warm", "Warm", generation_params=("temperature",)),
        ]


@pytest.fixture(autouse=True)
def local_enabled(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "FRONTEND_ORIGINS", "http://localhost:3000")
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")


@pytest.fixture(autouse=True)
async def agent_cleanup(sessions, owner):
    yield
    async with sessions() as db:
        await db.execute(delete(Agent).where(Agent.owner_id == owner))
        await db.commit()


@pytest.fixture
async def api(rt, cli):
    rt.adapters = {"claude": Ready(), "openai_compat": OpenAIChatAdapter(), "picky": Picky()}
    async with client_for(app_for(rt)) as client:
        yield client


async def make(api, **body):
    body.setdefault("name", "Agent " + uuid4().hex[:6])
    response = await api.post("/api/v1/agents", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def test_sampling_is_saved_read_back_and_reset_with_null(api):
    agent = await make(api, provider="openai_compat", temperature=0.7, top_p=0.95, max_output_tokens=2048)
    assert (agent["temperature"], agent["top_p"], agent["max_output_tokens"]) == (0.7, 0.95, 2048)
    changed = await api.patch(f"/api/v1/agents/{agent['id']}", json={"temperature": None, "top_p": 1})
    assert changed.status_code == 200, changed.text
    assert (changed.json()["temperature"], changed.json()["top_p"], changed.json()["max_output_tokens"]) == (None, 1.0, 2048)
    fresh = await make(api, provider="openai_compat")
    assert (fresh["temperature"], fresh["top_p"], fresh["max_output_tokens"]) == (None, None, None)


@pytest.mark.parametrize("body", [
    {"temperature": -0.1}, {"temperature": 2.01}, {"top_p": 0}, {"top_p": 1.5},
    {"max_output_tokens": 0}, {"max_output_tokens": 200_001}, {"max_output_tokens": 1.5},
    {"temperature": True}, {"max_output_tokens": True},
])
async def test_out_of_range_sampling_is_refused(api, body):
    response = await api.post("/api/v1/agents", json={"name": "Odd", "provider": "openai_compat", **body})
    assert response.status_code == 422
    agent = await make(api, provider="openai_compat")
    assert (await api.patch(f"/api/v1/agents/{agent['id']}", json=body)).status_code == 422


async def test_an_engine_that_picks_its_own_sampling_refuses_it(api):
    response = await api.post("/api/v1/agents", json={"name": "Cold", "provider": "claude", "temperature": 0.5})
    assert response.status_code == 422 and code_of(response) == "unsupported_setting"
    agent = await make(api, provider="claude", temperature=None)
    response = await api.patch(f"/api/v1/agents/{agent['id']}", json={"max_output_tokens": 100})
    assert response.status_code == 422 and code_of(response) == "unsupported_setting"
    # Null is always fine: it is the engine's own default.
    assert (await api.patch(f"/api/v1/agents/{agent['id']}", json={"top_p": None})).status_code == 200


async def test_a_model_that_takes_less_refuses_the_rest(api):
    ok = await make(api, provider="picky", model="warm", temperature=1.2)
    assert ok["temperature"] == 1.2
    response = await api.patch(f"/api/v1/agents/{ok['id']}", json={"top_p": 0.5})
    assert response.status_code == 422 and code_of(response) == "unsupported_setting"
    # A model the catalog does not list gets what the engine sends.
    assert (await make(api, provider="picky", model="unlisted-1", top_p=0.5))["top_p"] == 0.5


async def test_an_engine_change_resets_sampling_unless_sent(api):
    agent = await make(api, provider="openai_compat", temperature=0.3, max_output_tokens=10)
    moved = await api.patch(f"/api/v1/agents/{agent['id']}", json={"provider": "picky"})
    assert moved.status_code == 200, moved.text
    assert (moved.json()["temperature"], moved.json()["max_output_tokens"]) == (None, None)
    back = await api.patch(f"/api/v1/agents/{agent['id']}", json={"provider": "openai_compat", "temperature": 0.9})
    assert back.json()["temperature"] == 0.9
    # A model change on the same engine leaves stored sampling alone.
    same = await api.patch(f"/api/v1/agents/{agent['id']}", json={"model": "another"})
    assert same.json()["temperature"] == 0.9


async def test_a_whole_profile_sent_back_on_an_engine_change_drops_what_the_new_engine_ignores(api):
    agent = await make(api, provider="openai_compat", temperature=0.7, top_p=0.5)
    whole = {"name": agent["name"], "provider": "claude", "temperature": 0.7, "top_p": 0.5}
    moved = await api.patch(f"/api/v1/agents/{agent['id']}", json=whole)
    assert moved.status_code == 200, moved.text
    assert (moved.json()["provider"], moved.json()["temperature"], moved.json()["top_p"]) == ("claude", None, None)
    # A new value is a choice, and is checked.
    again = await make(api, provider="openai_compat", temperature=0.7)
    response = await api.patch(f"/api/v1/agents/{again['id']}", json={"provider": "claude", "temperature": 0.8})
    assert response.status_code == 422 and code_of(response) == "unsupported_setting"


async def test_effort_is_checked_against_the_models_efforts_when_known(api):
    response = await api.post("/api/v1/agents", json={"name": "Deep", "provider": "picky", "effort": "max"})
    assert response.status_code == 422 and code_of(response) == "unsupported_effort"
    agent = await make(api, provider="picky", effort="HIGH")
    response = await api.patch(f"/api/v1/agents/{agent['id']}", json={"effort": "medium"})
    assert response.status_code == 422 and code_of(response) == "unsupported_effort"
    # Unknown efforts (a model the catalog does not describe) are not checked.
    assert (await make(api, provider="picky", model="warm", effort="whatever"))["effort"] == "whatever"
    # A stored value is left alone by an unrelated edit.
    assert (await api.patch(f"/api/v1/agents/{agent['id']}", json={"name": "Deeper"})).status_code == 200


async def test_a_copy_and_the_history_carry_the_sampling(api):
    agent = await make(api, provider="openai_compat", temperature=0.6, top_p=0.8, max_output_tokens=300)
    copy = await api.post(f"/api/v1/agents/{agent['id']}/duplicate")
    assert copy.status_code == 201, copy.text
    assert (copy.json()["temperature"], copy.json()["top_p"], copy.json()["max_output_tokens"]) == (0.6, 0.8, 300)
    await api.patch(f"/api/v1/agents/{agent['id']}", json={"temperature": 1.5})
    revisions = (await api.get(f"/api/v1/agents/{agent['id']}/revisions")).json()
    assert revisions[0]["changed_fields"] == ["temperature"]
    restored = await api.post(f"/api/v1/agents/{agent['id']}/revisions/{revisions[-1]['number']}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["temperature"] == 0.6
