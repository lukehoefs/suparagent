"""The decision log and saved-rule HTTP routes, `remember` and `scope` on an answer, and
allowing every waiting call at once."""

from datetime import datetime, timedelta

import httpx
import pytest
from fastapi import FastAPI

from app.core.config import settings
from app.routers.approval_rules import router as rules_router
from app.routers.decisions import router as decisions_router
from app.routers.sentinel import router as sentinel_router
from app.routers.threads import get_runtime
from app.routers.threads import router as threads_router
from app.services import agent_store, approval_scopes, decision_log, local_claude_runner
from app.services import thread_store as store
from tests.services.thread_harness import (  # noqa: F401
    cleanup,
    cli,
    finished,
    new_thread,
    owner,
    pending_approval,
    rt,
    sessions,
    tools_on,
)

BASH = {"type": "tool", "tool_name": "Bash", "tool_input": {"command": "git status -s"}}


@pytest.fixture(autouse=True)
def local_enabled(monkeypatch):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "FRONTEND_ORIGINS", "http://localhost:3000")
    monkeypatch.setattr(settings, "LOCAL_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")


def app_for(rt) -> FastAPI:
    app = FastAPI()
    for router in (threads_router, rules_router, decisions_router, sentinel_router):
        app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_runtime] = lambda: rt
    return app


def client_for(app, *, client=("127.0.0.1", 50000), base_url="http://localhost"):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app, client=client), base_url=base_url)


@pytest.fixture
async def api(rt):
    async with client_for(app_for(rt)) as client:
        yield client


ROUTES = [
    ("GET", "/api/v1/decisions", None),
    ("GET", "/api/v1/approval-rules", None),
    ("POST", "/api/v1/approval-rules", {"match": "exact", "command": "ls"}),
    ("DELETE", "/api/v1/approval-rules/1", None),
    ("GET", "/api/v1/decisions/export.csv", None),
    ("GET", "/api/v1/sentinel/scan", None),
]


@pytest.mark.parametrize("method,path,body", ROUTES)
async def test_every_route_refuses_anyone_but_this_machine(rt, method, path, body):
    app = app_for(rt)
    for kwargs in (dict(client=("203.0.113.9", 50000)), dict(base_url="http://evil.example")):
        async with client_for(app, **kwargs) as remote:
            assert (await remote.request(method, path, json=body)).status_code == 403


@pytest.mark.parametrize("method,path,body", ROUTES)
async def test_every_route_refuses_everyone_when_local_execution_is_off(rt, monkeypatch, method, path, body):
    monkeypatch.setattr(settings, "LOCAL_EXECUTION_ENABLED", False)
    async with client_for(app_for(rt)) as client:
        assert (await client.request(method, path, json=body)).status_code == 403


async def test_decisions_are_read_only(api):
    for method in ("POST", "PUT", "PATCH", "DELETE"):
        assert (await api.request(method, "/api/v1/decisions")).status_code == 405


async def test_decisions_page_newest_first_with_a_cursor_and_filters(api):
    for index in range(5):
        decision_log.record("shown" if index % 2 == 0 else "denied", thread_id=index % 2, approval_id=f"a{index}")
    first = (await api.get("/api/v1/decisions", params={"limit": 2})).json()
    assert [i["approval_id"] for i in first["items"]] == ["a4", "a3"] and first["next_before"]
    second = (await api.get("/api/v1/decisions", params={"limit": 2, "before": first["next_before"]})).json()
    assert [i["approval_id"] for i in second["items"]] == ["a2", "a1"]
    last = (await api.get("/api/v1/decisions", params={"limit": 2, "before": second["next_before"]})).json()
    assert [i["approval_id"] for i in last["items"]] == ["a0"] and last["next_before"] is None
    denied = (await api.get("/api/v1/decisions", params={"event": "denied"})).json()
    assert {i["event"] for i in denied["items"]} == {"denied"}
    assert len((await api.get("/api/v1/decisions", params={"thread_id": 1})).json()["items"]) == 2


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 1000}, {"event": "approved"}])
async def test_bad_decision_queries_are_422(api, params):
    assert (await api.get("/api/v1/decisions", params=params)).status_code == 422


async def test_an_empty_log_is_an_empty_page(api):
    assert (await api.get("/api/v1/decisions")).json() == {"items": [], "next_before": None}


async def test_rules_are_added_listed_and_deleted(api):
    created = await api.post("/api/v1/approval-rules", json={"match": "prefix", "command": "git status"})
    assert created.status_code == 201
    rule = created.json()
    assert (rule["match"], rule["command"]) == ("prefix", "git status")
    again = await api.post("/api/v1/approval-rules", json={"match": "prefix", "command": "git status"})
    assert again.json()["id"] == rule["id"]
    assert [r["id"] for r in (await api.get("/api/v1/approval-rules")).json()] == [rule["id"]]
    assert (await api.delete(f"/api/v1/approval-rules/{rule['id']}")).status_code == 204
    assert (await api.delete(f"/api/v1/approval-rules/{rule['id']}")).status_code == 404
    assert (await api.get("/api/v1/approval-rules")).json() == []


async def test_a_rule_can_be_tied_to_a_folder(api):
    created = await api.post("/api/v1/approval-rules", json={"command": "ls", "workspace": "/work/a"})
    assert created.status_code == 201 and created.json()["workspace"] == "/work/a"
    other = await api.post("/api/v1/approval-rules", json={"command": "ls"})
    assert other.json()["id"] != created.json()["id"] and other.json()["workspace"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"command": "ls", "workspace": "relative"},
        {"command": "ls", "workspace": "/a/../b"},
        {"command": "git push --force"},
        {"command": "rm -rf /"},
        {"command": "export API_KEY=hunter2"},
        {"match": "prefix", "command": "ls; rm -rf ~"},
        {"match": "regex", "command": "ls"},
        {"match": "exact", "command": ""},
        {"match": "exact", "command": "x" * 1001},
    ],
)
async def test_a_bad_rule_is_a_422(api, body):
    assert (await api.post("/api/v1/approval-rules", json=body)).status_code == 422
    assert (await api.get("/api/v1/approval-rules")).json() == []


async def test_answering_with_remember_saves_a_rule_the_api_can_list(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(BASH)
    await rt.send_turn(thread.id, "status")
    approval = await pending_approval(sessions, thread.id)
    answered = await api.post(
        f"/api/v1/threads/{thread.id}/approvals/{approval.id}", json={"decision": "allow", "remember": True}
    )
    assert answered.status_code == 200
    await finished(sessions, thread.id)
    [rule] = (await api.get("/api/v1/approval-rules")).json()
    assert (rule["match"], rule["command"]) == ("exact", "git status -s")
    assert rule["workspace"]  # tied to the conversation's folder
    events = [i["event"] for i in (await api.get("/api/v1/decisions")).json()["items"]]
    assert events == ["allowed", "shown"]


async def test_remember_defaults_to_off(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(BASH)
    await rt.send_turn(thread.id, "status")
    approval = await pending_approval(sessions, thread.id)
    assert (await api.post(f"/api/v1/threads/{thread.id}/approvals/{approval.id}", json={"decision": "allow"})).status_code == 200
    await finished(sessions, thread.id)
    assert (await api.get("/api/v1/approval-rules")).json() == []


async def test_remember_returns_the_rule_it_saved_and_undo_removes_it(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(BASH)
    await rt.send_turn(thread.id, "status")
    approval = await pending_approval(sessions, thread.id)
    body = (await api.post(
        f"/api/v1/threads/{thread.id}/approvals/{approval.id}", json={"decision": "allow", "remember": True}
    )).json()
    await finished(sessions, thread.id)
    [rule] = (await api.get("/api/v1/approval-rules")).json()
    assert body["rule_id"] == rule["id"] and "remember_error" not in body
    undone = await api.delete(f"/api/v1/approval-rules/{rule['id']}", params={"thread_id": thread.id})
    assert undone.status_code == 204
    assert (await api.get("/api/v1/approval-rules")).json() == []
    [entry] = (await api.get("/api/v1/decisions", params={"event": "undone"})).json()["items"]
    assert (entry["thread_id"], entry["source"]) == (thread.id, "user")
    assert "git status -s" in entry["rule"]


async def test_remember_says_why_nothing_was_saved(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script({"type": "tool", "tool_name": "Bash", "tool_input": {"command": "git push --force"}})
    await rt.send_turn(thread.id, "push")
    approval = await pending_approval(sessions, thread.id)
    body = (await api.post(
        f"/api/v1/threads/{thread.id}/approvals/{approval.id}", json={"decision": "allow", "remember": True}
    )).json()
    await finished(sessions, thread.id)
    assert "rule_id" not in body and "safety floor" in body["remember_error"]


async def test_an_answer_without_remember_has_no_rule_fields(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(BASH)
    await rt.send_turn(thread.id, "status")
    approval = await pending_approval(sessions, thread.id)
    body = (await api.post(f"/api/v1/threads/{thread.id}/approvals/{approval.id}", json={"decision": "deny"})).json()
    await finished(sessions, thread.id)
    assert body == {"status": "recorded", "decision": "deny"}


async def test_rules_can_be_listed_for_one_folder(api):
    here = (await api.post("/api/v1/approval-rules", json={"command": "ls", "workspace": "/work/a"})).json()
    anywhere = (await api.post("/api/v1/approval-rules", json={"command": "pwd"})).json()
    await api.post("/api/v1/approval-rules", json={"command": "ls", "workspace": "/work/b"})
    listed = (await api.get("/api/v1/approval-rules", params={"workspace": "/work/a"})).json()
    assert {r["id"] for r in listed} == {here["id"], anywhere["id"]}
    assert len((await api.get("/api/v1/approval-rules")).json()) == 3


async def test_rules_can_be_listed_for_one_agent(api, sessions, owner, tmp_path):
    chosen = str(tmp_path.resolve())
    async with sessions() as db:
        own_folder = await agent_store.create_agent(db, owner_id=owner, name="Folder", workspace_path=chosen)
        default = await agent_store.create_agent(db, owner_id=owner, name="Default")
        theirs = await agent_store.create_agent(db, owner_id=owner + "-other", name="Theirs")
    # A conversation started before the agent's folder changed keeps its old folder.
    await new_thread(sessions, owner, agent_id=own_folder.id, workspace_path="/work/old")
    default_folder = str((local_claude_runner.workspace_dir() / "agents" / str(default.id)).resolve())

    async def add(command, workspace=None):
        return (await api.post("/api/v1/approval-rules", json={"command": command, "workspace": workspace})).json()["id"]

    in_chosen = await add("ls", chosen)
    in_old = await add("pwd", "/work/old")
    everywhere = await add("whoami")
    in_default = await add("ls", default_folder)
    await add("ls", "/work/elsewhere")

    async def listed(agent_id):
        response = await api.get("/api/v1/approval-rules", params={"agent_id": agent_id})
        return response.status_code, {r["id"] for r in response.json()} if response.status_code == 200 else None

    assert await listed(own_folder.id) == (200, {in_chosen, in_old, everywhere})
    assert await listed(default.id) == (200, {in_default, everywhere})
    assert (await listed(theirs.id))[0] == 404
    assert (await listed(999_999_999))[0] == 404
    assert (await api.get("/api/v1/approval-rules", params={"agent_id": 0})).status_code == 422
    assert len((await api.get("/api/v1/approval-rules")).json()) == 5


async def test_csv_export_is_newest_first_and_filtered(api):
    decision_log.record("shown", thread_id=1, approval_id="a1", summary="=cmd")
    decision_log.record("denied", thread_id=2, approval_id="a2")
    response = await api.get("/api/v1/decisions/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    header, first, second = response.text.splitlines()
    assert header.startswith("at,event,") and ",denied," in first and ",shown," in second
    assert "'=cmd" in second
    only = (await api.get("/api/v1/decisions/export.csv", params={"thread_id": 1})).text.splitlines()
    assert len(only) == 2
    assert len((await api.get("/api/v1/decisions/export.csv", params={"limit": 1})).text.splitlines()) == 2


async def test_sentinel_scan_reports_and_validates(api):
    report = (await api.get("/api/v1/sentinel/scan")).json()
    assert report["issues"] == [] and report["scanned_events"] == 0
    assert (await api.get("/api/v1/sentinel/scan", params={"hours": 0})).status_code == 422


# --- scope on an answer, conversation allows in the rules list ---------------------------------

WRITE = {"type": "tool", "tool_name": "Write", "tool_input": {"file_path": "notes.txt", "content": "hello"}}


def answer_url(thread_id, approval_id):
    return f"/api/v1/threads/{thread_id}/approvals/{approval_id}"


async def test_allow_for_an_hour_returns_the_allow_and_the_rules_list_shows_it(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(WRITE)
    await rt.send_turn(thread.id, "write")
    approval = await pending_approval(sessions, thread.id)
    listed = (await api.get(f"/api/v1/threads/{thread.id}/approvals", params={"status": "pending"})).json()
    assert (listed[0]["risk"], listed[0]["scopes"]) == ("changes", ["once", "hour", "thread"])
    assert listed[0]["tool_summary"] == "Creates or changes files in the agent's folder."
    body = (await api.post(answer_url(thread.id, approval.id), json={"decision": "allow", "scope": "hour"})).json()
    await finished(sessions, thread.id)
    assert body["decision"] == "allow" and "scope_error" not in body and "rule_id" not in body
    ends = approval_scopes.utcnow() + timedelta(minutes=60)
    assert abs((datetime.fromisoformat(body["scope_expires_at"]) - ends).total_seconds()) < 60
    [rule] = (await api.get("/api/v1/approval-rules")).json()
    assert rule["id"] == body["scope_rule_id"]
    assert (rule["scope"], rule["tool"], rule["thread_id"], rule["match"], rule["command"]) == (
        "hour", "Write", thread.id, None, None)
    assert rule["expires_at"] and rule["label"] == "notes.txt"
    # Only for this conversation: a folder or agent list of saved rules leaves it out.
    assert (await api.get("/api/v1/approval-rules", params={"workspace": "/elsewhere"})).json() == []
    here = (await api.get("/api/v1/approval-rules", params={"thread_id": thread.id})).json()
    assert [r["id"] for r in here] == [rule["id"]]
    other = await new_thread(sessions, owner)
    assert (await api.get("/api/v1/approval-rules", params={"thread_id": other.id})).json() == []
    assert (await api.get("/api/v1/approval-rules", params={"thread_id": 999_999_999})).status_code == 404
    [allowed] = (await api.get("/api/v1/decisions", params={"event": "allowed"})).json()["items"]
    assert allowed["scope"] == "hour"


async def test_a_conversation_allow_can_be_taken_back(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script({"type": "tool", "tool_name": "Bash", "tool_input": {"command": "ls -la"}})
    await rt.send_turn(thread.id, "list")
    approval = await pending_approval(sessions, thread.id)
    body = (await api.post(answer_url(thread.id, approval.id), json={"decision": "allow", "scope": "thread"})).json()
    await finished(sessions, thread.id)
    assert "scope_expires_at" not in body  # from now on in this conversation
    [rule] = (await api.get("/api/v1/approval-rules", params={"thread_id": thread.id})).json()
    assert (rule["scope"], rule["match"], rule["command"], rule["expires_at"]) == ("thread", "exact", "ls -la", None)
    assert (await api.delete(f"/api/v1/approval-rules/{rule['id']}", params={"thread_id": thread.id})).status_code == 204
    assert (await api.get("/api/v1/approval-rules")).json() == []
    assert (await api.delete(f"/api/v1/approval-rules/{rule['id']}")).status_code == 404
    [undone] = (await api.get("/api/v1/decisions", params={"event": "undone"})).json()["items"]
    assert (undone["thread_id"], undone["tool"], undone["scope"]) == (thread.id, "Bash", "thread")
    assert "ls -la" in undone["rule"]


async def test_a_scope_that_cannot_be_saved_says_why_and_allows_once(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script({"type": "tool", "tool_name": "Bash", "tool_input": {"command": "rm -rf ~"}})
    await rt.send_turn(thread.id, "clean")
    approval = await pending_approval(sessions, thread.id)
    body = (await api.post(answer_url(thread.id, approval.id), json={"decision": "allow", "scope": "thread"})).json()
    await finished(sessions, thread.id)
    assert "scope_rule_id" not in body and "safety floor" in body["scope_error"]
    assert (await api.get("/api/v1/approval-rules")).json() == []


async def test_an_unknown_scope_is_a_422(api, rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(WRITE)
    await rt.send_turn(thread.id, "write")
    approval = await pending_approval(sessions, thread.id)
    bad = await api.post(answer_url(thread.id, approval.id), json={"decision": "allow", "scope": "forever"})
    assert bad.status_code == 422
    assert (await api.post(answer_url(thread.id, approval.id), json={"decision": "deny"})).status_code == 200
    await finished(sessions, thread.id)


# --- allow all ---------------------------------------------------------------------------------


async def waiting(sessions, owner, *calls):
    """A conversation with a running turn and one waiting approval per (tool, input)."""
    thread = await new_thread(sessions, owner)
    async with sessions() as db:
        turn = await store.start_turn(db, thread.id, "do it", origin="person")
        for index, (tool, tool_input) in enumerate(calls):
            await store.create_approval(
                db, thread_id=thread.id, turn_id=turn.id, request_id=f"r{index}", tool=tool, input=tool_input,
                summary=tool, kind="other", owner_token=turn.owner_token)
    return thread, turn


async def test_allow_all_allows_every_waiting_call_except_those_needing_their_own_card(api, sessions, owner):
    thread, _turn = await waiting(
        sessions, owner,
        ("Write", {"file_path": "a.txt", "content": "a"}),
        ("Bash", {"command": "ls"}),
        ("Bash", {"command": "git push --force"}),
        ("mcp__composio__github_create_issue", {"title": "x"}),
        ("Write", {"file_path": "b.txt", "content": "TOKEN=abcdefghijklmnopqrstuvwxyz0123"}),
    )
    done = await api.post(f"/api/v1/threads/{thread.id}/approvals/allow-all")
    assert done.status_code == 200 and done.json() == {"allowed": 2, "skipped": 3}
    async with sessions() as db:
        approvals = await store.list_approvals(db, thread.id)
    status = {a.request_id: a.status for a in approvals}
    assert status == {"r0": "allowed", "r1": "allowed", "r2": "pending", "r3": "pending", "r4": "pending"}
    again = await api.post(f"/api/v1/threads/{thread.id}/approvals/allow-all")
    assert again.json() == {"allowed": 0, "skipped": 3}
    entries = (await api.get("/api/v1/decisions", params={"event": "allowed"})).json()["items"]
    assert [(e["source"], e["scope"]) for e in entries] == [("user", "once"), ("user", "once")]
    assert (await api.get("/api/v1/approval-rules")).json() == []  # once each: nothing saved


async def test_allow_all_with_nothing_waiting_allows_nothing(api, sessions, owner):
    thread = await new_thread(sessions, owner)
    assert (await api.post(f"/api/v1/threads/{thread.id}/approvals/allow-all")).json() == {"allowed": 0, "skipped": 0}
    assert (await api.post("/api/v1/threads/999999999/approvals/allow-all")).status_code == 404


async def test_allow_all_is_never_read_as_an_approval_id(api, sessions, owner):
    thread, _turn = await waiting(sessions, owner, ("Write", {"file_path": "a.txt"}))
    # The single-approval route with a real id still answers just that one.
    async with sessions() as db:
        [approval] = await store.list_approvals(db, thread.id)
    assert (await api.post(answer_url(thread.id, approval.id), json={"decision": "deny"})).status_code == 200
    assert (await api.post(f"/api/v1/threads/{thread.id}/approvals/allow-all")).json() == {"allowed": 0, "skipped": 0}
