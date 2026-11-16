"""Clients list: saved to clients.json, portal addresses reduced to a path, other hosts refused."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import clients as clients_module
from app.services.local_access_policy import require_local_access


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(clients_module.local_claude_runner, "workspace_dir", lambda: tmp_path)
    app = FastAPI()
    app.include_router(clients_module.router, prefix="/api/v1")
    app.dependency_overrides[require_local_access] = lambda: None
    return TestClient(app)


def test_empty_list_has_origins(api):
    body = api.get("/api/v1/clients").json()
    assert body["clients"] == []
    assert body["preview_origin"] == "https://preview.lthops.tech"


def test_save_and_read_back(api, tmp_path):
    res = api.put("/api/v1/clients", json={"clients": [
        {"name": "Sarasota", "portal_path": "https://portal.lthops.tech/w/sarasota?x=1", "agent_ids": [3]},
        {"name": "PFNZ", "color": "nope"},
    ]})
    assert res.status_code == 200, res.text
    saved = api.get("/api/v1/clients").json()["clients"]
    assert [c["name"] for c in saved] == ["Sarasota", "PFNZ"]
    assert saved[0]["portal_path"] == "/w/sarasota?x=1"
    assert saved[1]["portal_path"] == "/"
    assert saved[1]["color"] == "#4f46e5"
    assert (tmp_path / "clients.json").exists()


@pytest.mark.parametrize("path", ["https://evil.example/w/a", "//evil.example", "w/a", "javascript:alert(1)"])
def test_refuses_foreign_or_odd_paths(api, path):
    res = api.put("/api/v1/clients", json={"clients": [{"name": "X", "portal_path": path}]})
    assert res.status_code == 422


def test_duplicate_ids_refused(api):
    res = api.put("/api/v1/clients", json={"clients": [{"id": "a", "name": "A"}, {"id": "a", "name": "B"}]})
    assert res.status_code == 422


def test_corrupt_file_reads_as_empty(api, tmp_path):
    (tmp_path / "clients.json").write_text("{not json", encoding="utf-8")
    assert api.get("/api/v1/clients").json()["clients"] == []
