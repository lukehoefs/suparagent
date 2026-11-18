"""Conversation allows ("Allow for 1 hour", "Always in this chat"): what each is tied to, when it
stops, that it stays in its own conversation, and that the safety floor still wins. Through a real
runtime and a child process playing the Claude CLI, plus the matching rules on their own."""

import asyncio
import time
from datetime import timedelta
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import select, update

from app.db.models.permission_rule import PermissionRule
from app.schemas.thread import ApprovalResponse
from app.services import approval_scopes as scopes
from app.services import decision_log
from app.services import thread_store as store
from app.services.thread_runtime import ThreadApprovalGate
from tests.services.thread_harness import (  # noqa: F401
    cleanup,
    cli,
    events_of,
    finished,
    new_thread,
    owner,
    pending_approval,
    rt,
    sessions,
    tools_on,
)

WRITE = {"type": "tool", "tool_name": "Write", "tool_input": {"file_path": "notes.txt", "content": "hello"}}
WRITE_OTHER = {"type": "tool", "tool_name": "Write", "tool_input": {"file_path": "other.txt", "content": "bye"}}
LIST = {"type": "tool", "tool_name": "Bash", "tool_input": {"command": "ls -la"}}
LIST_PLAIN = {"type": "tool", "tool_name": "Bash", "tool_input": {"command": "ls"}}
FORCE_PUSH = {"type": "tool", "tool_name": "Bash", "tool_input": {"command": "git push --force"}}
SECRET_WRITE = {"type": "tool", "tool_name": "Write",
                "tool_input": {"file_path": "env.txt", "content": "API_KEY=sk-abcdefghijklmnopqrstuvwx"}}


def behaviors(cli):
    return [entry["reply"]["response"]["response"]["behavior"] for entry in cli.log("reply")]


def logged(event=None):
    items, _ = decision_log.read_page(limit=200, event=event)
    return list(reversed(items))


async def logged_eventually(event, count=1, timeout=10.0):
    deadline = time.monotonic() + timeout
    while len(logged(event)) < count and time.monotonic() < deadline:
        await asyncio.sleep(0.05)
    return logged(event)


async def first_turn(rt, sessions, cli, thread, step, scope, decision="allow"):
    """Run one turn whose call is asked about, and answer it with `scope`."""
    cli.script(step)
    await rt.send_turn(thread.id, "go")
    approval = await pending_approval(sessions, thread.id)
    answer = await rt.answer(approval.id, decision, scope=scope)
    await finished(sessions, thread.id)
    return approval, answer


async def next_turn(rt, sessions, cli, thread, step, count):
    cli.script(step)
    await rt.send_turn(thread.id, "again")
    await finished(sessions, thread.id, count=count)


async def approvals_of(sessions, thread_id):
    async with sessions() as db:
        return await store.list_approvals(db, thread_id)


async def rules_of(sessions, owner):
    async with sessions() as db:
        rows = await db.execute(select(PermissionRule).where(
            PermissionRule.user_id == owner, PermissionRule.bucket == scopes.BUCKET))
        return list(rows.scalars())


# --- through the runtime ------------------------------------------------------------------


async def test_always_in_this_chat_allows_the_tool_again_without_asking(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    _, answer = await first_turn(rt, sessions, cli, thread, WRITE, "thread")
    assert answer.won and answer.scope_error is None
    rule = answer.scope_rule
    assert (rule.thread_id, rule.connector, rule.tool, rule.expires_at) == (thread.id, "Write", None, None)
    await next_turn(rt, sessions, cli, thread, WRITE_OTHER, count=2)
    assert behaviors(cli) == ["allow", "allow"]
    first, second = await approvals_of(sessions, thread.id)
    assert (first.status, second.status) == ("allowed", "allowed")
    resolved = [e.data for e in await events_of(sessions, thread.id) if e.type == "approval.resolved"]
    assert resolved[0]["scope"] == "thread" and "by" not in resolved[0]  # the person, reaching further
    assert (resolved[1]["by"], resolved[1]["rule_id"], resolved[1]["scope"]) == ("scoped_rule", rule.id, "thread")
    [allowed] = await logged_eventually("allowed")
    assert (allowed["source"], allowed["scope"]) == ("user", "thread")
    [auto] = await logged_eventually("auto_allowed")
    assert (auto["source"], auto["scope"]) == ("scoped_rule", "thread")
    assert auto["rule"].startswith("thread: ")


async def test_an_allow_in_one_chat_does_not_reach_another(rt, sessions, cli, tools_on, owner):
    here = await new_thread(sessions, owner)
    await first_turn(rt, sessions, cli, here, WRITE, "thread")
    elsewhere = await new_thread(sessions, owner)
    cli.script(WRITE_OTHER)
    await rt.send_turn(elsewhere.id, "go")
    approval = await pending_approval(sessions, elsewhere.id)  # asked, not allowed by the other chat's rule
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, elsewhere.id)


async def test_allow_for_an_hour_stops_matching_when_the_hour_is_up(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    _, answer = await first_turn(rt, sessions, cli, thread, WRITE, "hour")
    rule = answer.scope_rule
    left = rule.expires_at - scopes.utcnow()
    assert timedelta(minutes=59) < left <= timedelta(minutes=60)
    await next_turn(rt, sessions, cli, thread, WRITE_OTHER, count=2)  # within the hour: no card
    assert behaviors(cli) == ["allow", "allow"]
    async with sessions() as db:
        await db.execute(update(PermissionRule).where(PermissionRule.id == rule.id)
                         .values(expires_at=scopes.utcnow() - timedelta(seconds=1)))
        await db.commit()
    cli.script(WRITE)
    await rt.send_turn(thread.id, "once more")
    approval = await pending_approval(sessions, thread.id)  # the hour is up: asked again
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, thread.id, count=3)


async def test_a_shell_allow_covers_only_that_exact_command(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    _, answer = await first_turn(rt, sessions, cli, thread, LIST, "thread")
    assert (answer.scope_rule.connector, answer.scope_rule.tool) == ("Bash", "ls -la")
    await next_turn(rt, sessions, cli, thread, LIST, count=2)  # the same command: no card
    assert behaviors(cli) == ["allow", "allow"]
    cli.script(LIST_PLAIN)
    await rt.send_turn(thread.id, "a different command")
    approval = await pending_approval(sessions, thread.id)  # never the tool in general
    assert approval.input == {"command": "ls"}
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, thread.id, count=3)


async def test_a_command_on_the_safety_floor_is_allowed_once_and_nothing_is_saved(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    approval, answer = await first_turn(rt, sessions, cli, thread, FORCE_PUSH, "thread")
    assert answer.won and answer.scope_rule is None and "safety floor" in answer.scope_error
    assert behaviors(cli) == ["allow"]
    assert await rules_of(sessions, owner) == []
    [allowed] = await logged_eventually("allowed")
    assert allowed["scope"] == "once"
    [resolved] = [e.data for e in await events_of(sessions, thread.id) if e.type == "approval.resolved"]
    assert "scope" not in resolved


async def test_a_matching_allow_never_lets_a_credential_through(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    await first_turn(rt, sessions, cli, thread, WRITE, "thread")
    cli.script(SECRET_WRITE)
    await rt.send_turn(thread.id, "write the key")
    approval = await pending_approval(sessions, thread.id)  # the rule matches the tool, the floor holds it
    shown = await logged_eventually("shown", count=2)
    assert shown[-1]["rule"] == "safety_floor:credential"
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, thread.id, count=2)


async def test_a_deny_saves_nothing_whatever_scope_it_carries(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    _, answer = await first_turn(rt, sessions, cli, thread, WRITE, "thread", decision="deny")
    assert answer.won and answer.scope_rule is None and answer.scope_error is None
    assert await rules_of(sessions, owner) == []
    [denied] = await logged_eventually("denied")
    assert denied["scope"] is None


async def test_the_card_says_what_the_tool_does_and_which_answers_it_offers(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(WRITE)
    await rt.send_turn(thread.id, "go")
    approval = await pending_approval(sessions, thread.id)
    [requested] = [e.data for e in await events_of(sessions, thread.id) if e.type == "approval.requested"]
    assert requested["tool_summary"] == "Creates or changes files in the agent's folder."
    assert requested["risk"] == "changes"
    assert requested["scopes"] == ["once", "hour", "thread"]
    shown = ApprovalResponse.model_validate(approval).model_dump()
    assert (shown["tool_summary"], shown["risk"], shown["scopes"]) == (
        requested["tool_summary"], "changes", ["once", "hour", "thread"])
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, thread.id)


async def test_a_floor_command_offers_only_allow_once(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    cli.script(FORCE_PUSH)
    await rt.send_turn(thread.id, "push")
    approval = await pending_approval(sessions, thread.id)
    [requested] = [e.data for e in await events_of(sessions, thread.id) if e.type == "approval.requested"]
    assert requested["scopes"] == ["once"] and requested["risk"] == "destructive"
    assert await rt.answer_approval(approval.id, "deny")
    await finished(sessions, thread.id)


async def test_deleting_a_conversation_removes_its_allows(rt, sessions, cli, tools_on, owner):
    thread = await new_thread(sessions, owner)
    await first_turn(rt, sessions, cli, thread, WRITE, "thread")
    assert len(await rules_of(sessions, owner)) == 1
    async with sessions() as db:
        await store.delete_thread(db, thread.id)
    assert await rules_of(sessions, owner) == []


# --- the rules on their own -----------------------------------------------------------------


@pytest.mark.parametrize("tool,tool_input,kind,expected", [
    ("Bash", {"command": " ls -la "}, "command", scopes.Key("Bash", "ls -la")),
    ("mcp__computer__exec", {"command": "uptime"}, "command", scopes.Key("mcp__computer__exec", "uptime")),
    ("acp:execute", {"cmd": ["ls"]}, "command", scopes.Key("acp:execute", '{"cmd":["ls"]}')),
    ("Write", {"file_path": "a"}, "file_write", scopes.Key("Write", None)),
    ("mcp__community__community_x", {"q": 1}, "other", scopes.Key("mcp__community__community_x", None)),
    ("mcp__community__custom_call", {"ref": "community_y", "arguments": {}}, "other",
     scopes.Key("mcp__community__custom_call", "ref:community_y")),
    ("mcp__community__custom_call", {"ref": "community_y", "arguments": {"c": "ls"}}, "command",
     scopes.Key("mcp__community__custom_call", '{"arguments":{"c":"ls"},"ref":"community_y"}')),
])
def test_what_a_scoped_allow_is_tied_to(tool, tool_input, kind, expected):
    assert scopes.rule_key(tool, tool_input, kind) == expected


@pytest.mark.parametrize("tool,tool_input", [
    ("Bash", {"command": "  "}),
    ("Bash", {}),
    ("mcp__composio__github_create_issue", {"title": "x"}),
    ("mcp__team__delegate", {"brief": "x"}),
    ("mcp__computer__click", {"x": 1, "y": 2}),
    ("mcp__computer__screenshot", {}),
    ("mcp__computer__browser_click", {"ref": "e1"}),
    ("mcp__community__custom_search", {"query": "x"}),
    ("mcp__community__custom_call", {"arguments": {}}),
])
def test_some_calls_can_only_be_allowed_once(tool, tool_input):
    assert scopes.rule_key(tool, tool_input) is None
    assert scopes.scopes_for(tool, tool_input) == ["once"]


@pytest.mark.parametrize("tool_input,reason", [
    ({"command": "rm -rf /"}, "delete-root"),
    ({"command": "echo $(whoami)"}, "unreadable"),
    ({"content": "token=abcdef0123456789abcdef"}, "credential"),
    ({"headers": {"Authorization": "Bearer abcdefghijklmnopqrstuvwxyz"}}, "credential"),
    ({"api_key": "short"}, "credential"),
    ({"items": [{"password": "hunter2"}]}, "credential"),
])
def test_the_safety_floor_holds_some_calls_for_their_own_card(tool_input, reason):
    assert scopes.held_for("Write", tool_input) == reason
    assert scopes.scopes_for("mcp__community__community_x", tool_input) == ["once"]


def test_ordinary_calls_are_not_held():
    assert scopes.held_for("Write", {"file_path": "/home/me/projects/app/src/components/very/long/path.tsx"}) is None
    assert scopes.held_for("Bash", {"command": "ls -la"}) is None
    assert scopes.scopes_for("Bash", {"command": "ls -la"}) == ["once", "hour", "thread"]


def test_allow_all_leaves_held_calls_connected_apps_and_screen_tools_for_their_own_card():
    assert scopes.needs_own_card("Bash", {"command": "git push --force"}) == "force-push"
    assert scopes.needs_own_card("mcp__composio__github_create_issue", {"title": "x"}) == "connected_app"
    assert scopes.needs_own_card("mcp__computer__click", {"x": 1}) == "screen"
    assert scopes.needs_own_card("Write", {"file_path": "a", "content": "b"}) is None
    assert scopes.needs_own_card("mcp__team__delegate", {"brief": "x"}) is None


def test_shell_like_remote_names():
    for name in ("exec", "run_command", "computer_exec", "shell", "bash", "execute-script", "Terminal"):
        assert scopes.shell_like_name(name), name
    for name in ("computer_screenshot", "search_web", "list_files", "executive_summary", None):
        assert not scopes.shell_like_name(name), name


async def test_a_rule_matches_only_its_conversation_tool_and_key_and_only_while_live(sessions, owner):
    a = await new_thread(sessions, owner)
    b = await new_thread(sessions, owner)
    now = scopes.utcnow()
    async with sessions() as db:
        write = await scopes.add_rule(db, owner, a.id, "hour", "Write", {"file_path": "x"}, "file_write", now=now)
        listing = await scopes.add_rule(db, owner, a.id, "thread", "Bash", {"command": "ls -la"}, "command", now=now)
    assert write.expires_at == now + timedelta(minutes=60) and listing.expires_at is None

    async def match(thread, tool, tool_input, kind=None, at=now):
        async with sessions() as db:
            found = await scopes.matching_rule(db, owner, thread.id, tool, tool_input, kind, now=at)
        return found.id if found else None

    assert await match(a, "Write", {"file_path": "anything"}) == write.id
    assert await match(a, "Write", {"file_path": "y"}, at=now + timedelta(minutes=59)) == write.id
    assert await match(a, "Write", {"file_path": "y"}, at=now + timedelta(minutes=60)) is None
    assert await match(b, "Write", {"file_path": "y"}) is None
    assert await match(a, "Edit", {"file_path": "y"}) is None
    assert await match(a, "Bash", {"command": "ls -la"}) == listing.id
    assert await match(a, "Bash", {"command": "ls -la "}) == listing.id  # surrounding spaces only
    assert await match(a, "Bash", {"command": "ls -la /"}) is None
    assert await match(a, "Bash", {"command": "ls -la"}, at=now + timedelta(days=30)) == listing.id
    async with sessions() as db:
        assert await scopes.matching_rule(db, owner + "-other", a.id, "Write", {"file_path": "y"}, now=now) is None


async def test_saving_the_same_allow_again_extends_it_and_never_shortens_it(sessions, owner):
    thread = await new_thread(sessions, owner)
    now = scopes.utcnow()
    async with sessions() as db:
        first = await scopes.add_rule(db, owner, thread.id, "hour", "Write", {}, now=now)
        later = await scopes.add_rule(db, owner, thread.id, "hour", "Write", {}, now=now + timedelta(minutes=30))
        assert later.id == first.id and later.expires_at == now + timedelta(minutes=90)
        forever = await scopes.add_rule(db, owner, thread.id, "thread", "Write", {}, now=now)
        assert forever.id == first.id and forever.expires_at is None
        again = await scopes.add_rule(db, owner, thread.id, "hour", "Write", {}, now=now)
        assert again.expires_at is None


async def test_rules_past_their_end_or_without_a_conversation_are_not_listed(sessions, owner):
    live = await new_thread(sessions, owner)
    gone = await new_thread(sessions, owner)
    now = scopes.utcnow()
    async with sessions() as db:
        kept = await scopes.add_rule(db, owner, live.id, "thread", "Write", {}, now=now)
        ended = await scopes.add_rule(db, owner, live.id, "hour", "Edit", {}, now=now - timedelta(hours=2))
        await scopes.add_rule(db, owner, gone.id, "thread", "Write", {}, now=now)
        await store.delete_thread(db, gone.id)
        listed = await scopes.list_rules(db, owner, now=now)
        assert [r.id for r in listed] == [kept.id]
        assert await scopes.list_rules(db, owner, thread_ids=set(), now=now) == []
        assert ended.id not in {r.id for r in await scopes.list_rules(db, owner, thread_ids={live.id}, now=now)}


@pytest.mark.parametrize("tool,tool_input,words", [
    ("mcp__composio__github_create_issue", {"title": "x"}, "one call at a time"),
    ("Bash", {"command": "git push --force"}, "safety floor"),
    ("Write", {"content": "password=hunter2hunter2"}, "credential"),
])
async def test_a_scoped_allow_that_cannot_be_saved_says_why(sessions, owner, tool, tool_input, words):
    thread = await new_thread(sessions, owner)
    async with sessions() as db:
        with pytest.raises(scopes.ScopeError, match=words):
            await scopes.add_rule(db, owner, thread.id, "thread", tool, tool_input)
    with pytest.raises(scopes.ScopeError):
        scopes.validate(tool, tool_input)


async def test_a_conversation_holds_at_most_so_many_allows(sessions, owner, monkeypatch):
    monkeypatch.setattr(scopes, "MAX_RULES_PER_THREAD", 2)
    thread = await new_thread(sessions, owner)
    async with sessions() as db:
        await scopes.add_rule(db, owner, thread.id, "thread", "Write", {})
        await scopes.add_rule(db, owner, thread.id, "thread", "Edit", {})
        with pytest.raises(scopes.ScopeError, match="at most 2"):
            await scopes.add_rule(db, owner, thread.id, "thread", "Read", {})


# --- what the gate says about an MCP tool ------------------------------------------------------


def gate_with(aliases):
    run = NS(thread_id=1, turn_id=1, ctx=NS(community_bridge=NS(aliases=aliases)))
    return ThreadApprovalGate(NS(owner_id="o"), run)


def test_an_mcp_tool_is_described_by_its_server_and_a_shell_tool_is_tied_to_the_exact_call():
    gate = gate_with({
        "community_shot": {"description": "Take a **screenshot** of the desktop.\nReturns a PNG.",
                           "annotations": {"readOnlyHint": True}, "remote_name": "computer_screenshot"},
        "community_run": {"description": "Run a command in the desktop's terminal", "annotations": {},
                          "remote_name": "computer_exec"},
        "community_del": {"description": "", "annotations": {"readOnlyHint": False, "destructiveHint": True},
                          "remote_name": "delete_file"},
    })
    assert gate._about("mcp__community__community_shot", {}, "other") == (
        "Take a screenshot of the desktop.", "read_only", "other")
    assert gate._about("mcp__community__community_run", {"c": "ls"}, "other") == (
        "Run a command in the desktop's terminal.", None, "command")
    assert gate._about("mcp__community__community_del", {}, "other") == (None, "destructive", "other")
    assert gate._about("mcp__community__custom_call", {"ref": "community_run", "arguments": {}}, "other")[2] == "command"
    assert gate._about("mcp__community__community_unknown", {}, "other") == (None, None, "other")
    assert gate._about("Read", {"file_path": "a"}, "file_read") == (
        "Reads a file. Changes nothing and sends nothing.", "read_only", "file_read")
    assert gate._about("SomethingNew", {}, None) == (None, None, None)
