"""Agent groups (/agent-groups): the sidebar's stacks of agents. Real routes and database."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete, select

from app.core.config import settings
from app.db.models import Agent, AgentGroup
from app.routers.agent_groups import router as groups_router
from app.routers.threads import get_runtime
from app.schemas.agent import AgentResponse
from tests.services.thread_harness import cleanup, owner, sessions  # noqa: F401


@pytest.fixture(autouse=True)
def local_enabled(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")


class GroupRuntime:
    def __init__(self, sessions, owner_id):
        self.sessions = sessions
        self.owner_id = owner_id

    @asynccontextmanager
    async def session(self):
        async with self.sessions() as db:
            yield db


@pytest.fixture
def other_owner():
    return "od_rt_" + uuid4().hex


@pytest.fixture(autouse=True)
async def rows_cleanup(sessions, owner, other_owner):
    yield
    async with sessions() as db:
        for who in (owner, other_owner):
            await db.execute(delete(Agent).where(Agent.owner_id == who))
            await db.execute(delete(AgentGroup).where(AgentGroup.owner_id == who))
        await db.commit()


def _client(sessions, owner_id):
    app = FastAPI()
    app.include_router(groups_router, prefix="/api/v1")
    app.dependency_overrides[get_runtime] = lambda: GroupRuntime(sessions, owner_id)
    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 50000))
    return httpx.AsyncClient(transport=transport, base_url="http://localhost")


@pytest.fixture
async def api(sessions, owner):
    async with _client(sessions, owner) as client:
        yield client


@pytest.fixture
async def other_api(sessions, other_owner):
    async with _client(sessions, other_owner) as client:
        yield client


EDITED = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


async def make_agent(sessions, owner_id, name, *, archived=False):
    async with sessions() as db:
        agent = Agent(owner_id=owner_id, name=name, updated_at=EDITED,
                      archived_at=datetime.now(UTC) - timedelta(days=1) if archived else None)
        db.add(agent)
        await db.commit()
        await db.refresh(agent)
        return agent.id


async def agent_row(sessions, agent_id):
    async with sessions() as db:
        return await db.scalar(select(Agent).where(Agent.id == agent_id))


def code_of(response):
    return response.json()["detail"]["error_code"]


async def test_a_new_group_takes_its_agents_and_lists_them_by_name(api, sessions, owner):
    assert (await api.get("/api/v1/agent-groups")).json() == []
    verde = await make_agent(sessions, owner, "verde")
    atlas = await make_agent(sessions, owner, "Atlas")

    response = await api.post("/api/v1/agent-groups", json={"name": "  Clients ", "agent_ids": [verde, atlas]})
    assert response.status_code == 201, response.text
    group = response.json()
    assert group["name"] == "Clients"
    assert group["pinned"] is True
    assert group["position"] == 0
    assert group["agent_ids"] == [atlas, verde]

    second = (await api.post("/api/v1/agent-groups", json={"name": "LH Tech"})).json()
    assert second["position"] == 1
    assert second["agent_ids"] == []

    listed = (await api.get("/api/v1/agent-groups")).json()
    assert [g["name"] for g in listed] == ["Clients", "LH Tech"]
    row = await agent_row(sessions, atlas)
    assert row.group_id == group["id"]
    # Arranging the sidebar is not an edit of the agent's profile.
    assert row.updated_at == EDITED
    assert AgentResponse.model_validate(row).group_id == group["id"]


async def test_moving_an_agent_takes_it_out_of_its_old_group(api, sessions, owner):
    a = await make_agent(sessions, owner, "A")
    b = await make_agent(sessions, owner, "B")
    c = await make_agent(sessions, owner, "C")
    first = (await api.post("/api/v1/agent-groups", json={"name": "First", "agent_ids": [a, b]})).json()
    second = (await api.post("/api/v1/agent-groups", json={"name": "Second", "agent_ids": [c]})).json()

    response = await api.put(f"/api/v1/agent-groups/{second['id']}/members", json={"agent_ids": [c, a]})
    assert response.status_code == 200, response.text
    assert response.json()["agent_ids"] == [a, c]
    listed = {g["id"]: g["agent_ids"] for g in (await api.get("/api/v1/agent-groups")).json()}
    assert listed == {first["id"]: [b], second["id"]: [a, c]}

    # Members left out leave the group; an empty group stays until it is deleted.
    response = await api.put(f"/api/v1/agent-groups/{first['id']}/members", json={"agent_ids": []})
    assert response.json()["agent_ids"] == []
    assert (await agent_row(sessions, b)).group_id is None
    assert (await agent_row(sessions, b)).updated_at == EDITED
    assert len((await api.get("/api/v1/agent-groups")).json()) == 2


async def test_a_new_group_can_take_agents_from_another_group(api, sessions, owner):
    a = await make_agent(sessions, owner, "A")
    b = await make_agent(sessions, owner, "B")
    old = (await api.post("/api/v1/agent-groups", json={"name": "Old", "agent_ids": [a, b]})).json()
    new = (await api.post("/api/v1/agent-groups", json={"name": "New", "agent_ids": [b]})).json()
    listed = {g["id"]: g["agent_ids"] for g in (await api.get("/api/v1/agent-groups")).json()}
    assert listed == {old["id"]: [a], new["id"]: [b]}


async def test_archived_agents_are_not_listed_and_cannot_be_added(api, sessions, owner):
    live = await make_agent(sessions, owner, "Live")
    gone = await make_agent(sessions, owner, "Gone", archived=True)
    response = await api.post("/api/v1/agent-groups", json={"name": "G", "agent_ids": [live, gone]})
    assert response.status_code == 404
    assert code_of(response) == "agent_not_found"
    assert (await api.get("/api/v1/agent-groups")).json() == []

    group = (await api.post("/api/v1/agent-groups", json={"name": "G", "agent_ids": [live]})).json()
    async with sessions() as db:
        agent = await db.get(Agent, live)
        agent.archived_at = datetime.now(UTC)
        await db.commit()
    assert (await api.get("/api/v1/agent-groups")).json()[0]["agent_ids"] == []
    assert group["agent_ids"] == [live]


async def test_rename_pin_and_move(api, sessions, owner):
    group = (await api.post("/api/v1/agent-groups", json={"name": "Clients"})).json()
    url = f"/api/v1/agent-groups/{group['id']}"
    response = await api.patch(url, json={"name": " Customers "})
    assert response.status_code == 200
    assert response.json()["name"] == "Customers"
    changed = (await api.patch(url, json={"pinned": False, "position": 5})).json()
    assert (changed["name"], changed["pinned"], changed["position"]) == ("Customers", False, 5)


@pytest.mark.parametrize("body,code", [
    ({"name": "   "}, "invalid_name"),
    ({"name": "two\nlines"}, "invalid_name"),
    ({"name": None}, "invalid_name"),
    ({"pinned": None}, "invalid_pinned"),
    ({"position": None}, "invalid_position"),
])
async def test_bad_changes_are_refused(api, body, code):
    group = (await api.post("/api/v1/agent-groups", json={"name": "Clients"})).json()
    response = await api.patch(f"/api/v1/agent-groups/{group['id']}", json=body)
    assert response.status_code == 422
    assert code_of(response) == code


@pytest.mark.parametrize("body", [
    {"name": "x" * 81},
    {"name": ""},
    {"name": "G", "agent_ids": ["1"]},
    {"name": "G", "pinned": "yes"},
    {"name": "G", "colour": "red"},
])
async def test_malformed_new_groups_are_refused(api, body):
    assert (await api.post("/api/v1/agent-groups", json=body)).status_code == 422


async def test_members_must_be_distinct_live_agents_of_this_owner(api, sessions, owner, other_owner):
    mine = await make_agent(sessions, owner, "Mine")
    theirs = await make_agent(sessions, other_owner, "Theirs")
    group = (await api.post("/api/v1/agent-groups", json={"name": "G"})).json()
    url = f"/api/v1/agent-groups/{group['id']}/members"

    response = await api.put(url, json={"agent_ids": [mine, mine]})
    assert (response.status_code, code_of(response)) == (422, "duplicate_agents")
    response = await api.put(url, json={"agent_ids": [mine, theirs]})
    assert (response.status_code, code_of(response)) == (404, "agent_not_found")
    response = await api.put(url, json={"agent_ids": [mine, 99_999_999]})
    assert (response.status_code, code_of(response)) == (404, "agent_not_found")
    # Nothing changed on a refusal.
    assert (await agent_row(sessions, mine)).group_id is None
    assert (await agent_row(sessions, theirs)).group_id is None


async def test_ungroup_keeps_the_agents_and_removes_the_group(api, sessions, owner):
    a = await make_agent(sessions, owner, "A")
    b = await make_agent(sessions, owner, "B")
    group = (await api.post("/api/v1/agent-groups", json={"name": "G", "agent_ids": [a, b]})).json()
    response = await api.delete(f"/api/v1/agent-groups/{group['id']}")
    assert response.status_code == 204
    assert (await api.get("/api/v1/agent-groups")).json() == []
    for agent_id in (a, b):
        row = await agent_row(sessions, agent_id)
        assert row is not None and row.group_id is None and row.updated_at == EDITED
    assert (await api.delete(f"/api/v1/agent-groups/{group['id']}")).status_code == 404


async def test_another_owners_groups_are_out_of_reach(api, other_api, sessions, other_owner):
    theirs = await make_agent(sessions, other_owner, "Theirs")
    group = (await other_api.post("/api/v1/agent-groups", json={"name": "Theirs", "agent_ids": [theirs]})).json()
    assert (await api.get("/api/v1/agent-groups")).json() == []
    url = f"/api/v1/agent-groups/{group['id']}"
    for response in (
        await api.patch(url, json={"name": "Mine"}),
        await api.put(f"{url}/members", json={"agent_ids": []}),
        await api.delete(url),
    ):
        assert response.status_code == 404
        assert code_of(response) == "group_not_found"
    assert (await other_api.get("/api/v1/agent-groups")).json()[0]["agent_ids"] == [theirs]
