"""The agent-editable look of the app (app/ui/config.py, routers/ui_config.py, the ui MCP tools)."""
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import delete

from app.core.config import settings
from app.db.models import UiRevision
from app.routers.threads import get_runtime
from app.routers.ui_config import router as ui_router
from app.services import tool_policy
from app.ui import config as ui
from app.ui import mcp_server
from tests.services.thread_harness import cleanup, owner, sessions  # noqa: F401


@pytest.fixture(autouse=True)
def local_enabled(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")


class Runtime:
    def __init__(self, sessions, owner_id):
        self.sessions, self.owner_id = sessions, owner_id

    @asynccontextmanager
    async def session(self):
        async with self.sessions() as db:
            yield db


@pytest.fixture(autouse=True)
async def rows_cleanup(sessions, owner):
    yield
    async with sessions() as db:
        await db.execute(delete(UiRevision).where(UiRevision.owner_id == owner))
        await db.commit()


def _client(sessions, owner_id):
    app = FastAPI()
    app.include_router(ui_router, prefix="/api/v1")
    app.dependency_overrides[get_runtime] = lambda: Runtime(sessions, owner_id)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 50000)), base_url="http://localhost")


# -- rules -----------------------------------------------------------------------------

def test_a_brand_colour_is_accepted_and_lowercased():
    new, summary = ui.set_theme(ui.empty(), "both", {"accent": "#1D4ED8"})
    out = ui.normalize(new)
    assert out["theme"]["light"]["accent"] == "#1d4ed8" and "accent" in out["theme"]["dark"]
    assert "accent" in summary


@pytest.mark.parametrize("tokens, needle", [
    ({"ink": "#f1f1f1"}, "contrast"),  # text the same as the background
    ({"danger": "#00ff00"}, "not a colour you can change"),  # status colours stay fixed
    ({"accent": "red"}, "hex colour"),
    ({"accent": "#fff; background:url(x)"}, "hex colour"),
])
def test_unsafe_colours_are_refused_with_a_reason(tokens, needle):
    new, _ = ui.set_theme(ui.empty(), "light", tokens)
    with pytest.raises(ui.UiConfigError, match=needle):
        ui.normalize(new)


def test_settings_cannot_be_hidden_and_unknown_entries_are_refused():
    with pytest.raises(ui.UiConfigError, match="Settings"):
        ui.normalize(ui.set_nav(ui.empty(), hidden=["settings"])[0])
    with pytest.raises(ui.UiConfigError, match="Unknown sidebar"):
        ui.normalize(ui.set_nav(ui.empty(), order=["page:nope"])[0])
    ok = ui.normalize(ui.set_nav(ui.empty(), order=["agents", "today"], hidden=["routines"], labels={"agents": "Team"})[0])
    assert ok["nav"] == {"order": ["agents", "today"], "hidden": ["routines"], "labels": {"agents": "Team"}}


def test_pages_are_checked_and_deleting_one_drops_it_from_the_order():
    config, _ = ui.save_page(ui.empty(), "sales", "Sales", "<h1>Hi</h1>")
    config = ui.normalize(ui.set_nav(config, order=["page:sales", "agents"])[0])
    assert ui.public(config)["pages"] == [{"id": "sales", "title": "Sales", "in_nav": True}]
    config = ui.normalize(ui.delete_page(config, "sales")[0])
    assert config["pages"] == [] and config["nav"]["order"] == ["agents"]
    with pytest.raises(ui.UiConfigError):
        ui.normalize(ui.save_page(ui.empty(), "Bad Id", "x", "<p>")[0])
    with pytest.raises(ui.UiConfigError, match="larger"):
        ui.normalize(ui.save_page(ui.empty(), "big", "Big", "x" * (ui.MAX_PAGE_HTML + 1))[0])


def test_defaults_pass_their_own_contrast_check():
    ui.normalize(ui.empty())


def test_the_mcp_server_lists_the_same_tools_and_tokens_as_the_backend():
    from app.ui import bridge
    assert {t["name"] for t in mcp_server.TOOLS} == set(bridge.TOOLS)
    assert mcp_server.TOKENS == ui.THEME_TOKENS and mcp_server.NAV_KEYS == ui.NAV_KEYS


def test_policy_reads_are_free_changes_ask_and_plan_mode_changes_nothing():
    run = SimpleNamespace(ctx=SimpleNamespace())
    assert tool_policy.automatic("mcp__ui__ui_get", "ask", run, {}) == ("allowed", "ui_read")
    assert tool_policy.automatic("mcp__ui__ui_set_theme", "ask", run, {}) is None
    assert tool_policy.automatic("mcp__ui__ui_set_theme", "full_access", run, {}) is None
    assert tool_policy.automatic("mcp__ui__ui_save_page", "plan", run, {}) == ("denied", "plan_mode")
    assert tool_policy.automatic("mcp__ui__other", "ask", run, {}) == ("denied", "unknown_ui_tool")


# -- storage and API -------------------------------------------------------------------

async def test_save_history_undo_and_reset(sessions, owner):
    async with sessions() as db:
        first = await ui.save(db, owner, ui.set_theme(ui.empty(), "light", {"accent": "#1d4ed8", "accent-text": "#1d4ed8"})[0],
                              summary="blue", source="agent", actor="Hoefs")
        config, _ = await ui.current(db, owner)
        await ui.save(db, owner, ui.save_page(config, "sales", "Sales", "<p>x</p>")[0], summary="page", source="agent", actor="Hoefs")
        await db.commit()

    async with _client(sessions, owner) as client:
        body = (await client.get("/api/v1/ui-config")).json()
        assert body["config"]["theme"]["light"]["accent"] == "#1d4ed8"
        assert body["config"]["pages"] == [{"id": "sales", "title": "Sales", "in_nav": True}]
        assert (await client.get("/api/v1/ui-config/pages/sales")).json()["html"] == "<p>x</p>"
        assert (await client.get("/api/v1/ui-config/pages/nope")).status_code == 404

        undone = (await client.post("/api/v1/ui-config/restore", json={})).json()
        assert undone["config"]["pages"] == [] and undone["config"]["theme"]["light"]["accent"] == "#1d4ed8"
        history = (await client.get("/api/v1/ui-config/history")).json()["revisions"]
        assert history[0]["summary"].startswith("Undid: page") and history[0]["restored_from"] == first.id

        reset = (await client.post("/api/v1/ui-config/restore", json={"revision_id": 0})).json()
        assert reset["config"] == ui.empty()
        assert (await client.post("/api/v1/ui-config/restore", json={"revision_id": 999999999})).status_code == 409


async def test_an_owner_never_sees_another_owners_look(sessions, owner):
    other = "od_rt_" + uuid4().hex
    async with sessions() as db:
        await ui.save(db, other, ui.save_page(ui.empty(), "secret", "Secret", "<p>s</p>")[0], summary="x", source="agent", actor="A")
        await db.commit()
    try:
        async with _client(sessions, owner) as client:
            assert (await client.get("/api/v1/ui-config")).json()["config"]["pages"] == []
            assert (await client.get("/api/v1/ui-config/pages/secret")).status_code == 404
    finally:
        async with sessions() as db:
            await db.execute(delete(UiRevision).where(UiRevision.owner_id == other))
            await db.commit()
