"""SOUL.md over HTTP: read creates a default, save keeps the managed tools block and refreshes it."""

import pytest
from fastapi import FastAPI
from sqlalchemy import delete

from app.core.config import settings
from app.db.models import Agent
from app.db.session import get_db
from app.routers.agent_soul import router as soul_router
from app.routers.agents import get_runtime as agents_runtime
from app.routers.agents import router as agents_router
from app.services import agent_soul
from tests.routers.test_agents_api import client_for, make  # noqa: F401
from tests.services.thread_harness import cleanup, cli, owner, rt, sessions  # noqa: F401


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
async def api(rt, cli, sessions):
    app = FastAPI()
    for router in (agents_router, soul_router):
        app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[agents_runtime] = lambda: rt

    async def db_override():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    async with client_for(app) as client:
        yield client


async def test_reading_a_new_agents_soul_creates_a_default_with_a_tools_block(api):
    agent = await make(api, name="Atlas")
    response = await api.get(f"/api/v1/agents/{agent['id']}/soul")
    assert response.status_code == 200, response.text
    body = response.json()
    assert "Atlas" in body["mine"]
    assert "No connected tools are granted to you yet" in body["managed"]
    assert body["path"].replace("\\", "/").endswith(f"agents/{agent['id']}/SOUL.md")


async def test_saving_keeps_the_managed_block_and_ignores_a_pasted_copy_of_it(api):
    agent = await make(api, name="Fleet")
    await api.get(f"/api/v1/agents/{agent['id']}/soul")
    pasted = f"I run PFNZ go-to-market.\n\n{agent_soul.TOOLS_START}\nfake tool list\n{agent_soul.TOOLS_END}"
    saved = await api.put(f"/api/v1/agents/{agent['id']}/soul", json={"mine": pasted})
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["mine"] == "I run PFNZ go-to-market."
    assert "fake tool list" not in body["text"]
    assert body["text"].count(agent_soul.TOOLS_START) == 1
    assert "No connected tools are granted to you yet" in body["managed"]


async def test_the_saved_soul_is_part_of_the_turn_instructions(api, sessions):
    agent = await make(api, name="Verde")
    await api.put(f"/api/v1/agents/{agent['id']}/soul", json={"mine": "Never publish without approval."})
    async with sessions() as db:
        row = await db.get(Agent, agent["id"])
    from app.services import agent_memory

    text = agent_memory.turn_instructions(row) or ""
    assert "BEGIN SOUL (SOUL.md)" in text and "Never publish without approval." in text


async def test_an_unknown_agent_is_404(api):
    response = await api.get("/api/v1/agents/999999/soul")
    assert response.status_code == 404
