"""b5e2d8c4a913: a conversation created before this release carries a copy of
its agent's effort in provider_state; where it still equals the agent's effort
on the agent's own engine and model, the copy goes, so the conversation follows
the agent. Everything else is left exactly as it was."""

import json
import sqlite3

from tests.db.sqlite_helpers import run_alembic

PREVIOUS_HEAD = "f3c9a2d7b614"
NEW_REVISION = "b5e2d8c4a913"


def _agent(db, name, provider, model, effort):
    db.execute(
        "INSERT INTO agent (owner_id, name, provider, model, effort) VALUES ('o', ?, ?, ?, ?)",
        (name, provider, model, effort),
    )
    return db.execute("SELECT last_insert_rowid()").fetchone()[0]


def _thread(db, agent_id, provider, model, state):
    db.execute(
        "INSERT INTO thread (owner_id, provider, model, agent_id, provider_state) VALUES ('o', ?, ?, ?, ?)",
        (provider, model, agent_id, state),
    )
    return db.execute("SELECT last_insert_rowid()").fetchone()[0]


def _states(database):
    with sqlite3.connect(database) as db:
        return dict(db.execute("SELECT id, provider_state FROM thread"))


def test_copies_of_the_agents_effort_are_removed_and_nothing_else_changes(tmp_path):
    database = tmp_path / "effort.db"
    result = run_alembic(database, "upgrade", PREVIOUS_HEAD)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        high = _agent(db, "High", "codex", "gpt-5", "high")
        bare = _agent(db, "Bare", "claude", None, None)
        t = {
            # Copies: on the agent's engine, on its model or the default.
            "copy": _thread(db, high, "codex", None, json.dumps({"effort": "high"})),
            "copy_model": _thread(db, high, "codex", "gpt-5", json.dumps({"effort": "high", "branched_from": 4})),
            # The conversation's own choice.
            "own": _thread(db, high, "codex", None, json.dumps({"effort": "low"})),
            "other_case": _thread(db, high, "codex", None, json.dumps({"effort": "HIGH"})),
            # Another engine or model: the agent's effort does not apply there, so it is the conversation's.
            "other_engine": _thread(db, high, "claude", None, json.dumps({"effort": "high"})),
            "other_model": _thread(db, high, "codex", "gpt-5-mini", json.dumps({"effort": "high"})),
            # An agent with no effort, no agent, or state that is not a JSON object.
            "agent_without": _thread(db, bare, "claude", None, json.dumps({"effort": "high"})),
            "no_agent": _thread(db, None, "codex", None, json.dumps({"effort": "high"})),
            "malformed": _thread(db, high, "codex", None, '{"effort": "high"'),
            "list": _thread(db, high, "codex", None, json.dumps(["effort", "high"])),
            "null": _thread(db, high, "codex", None, None),
            "no_effort": _thread(db, high, "codex", None, json.dumps({"session": "abc"})),
        }
    before = _states(database)

    result = run_alembic(database, "upgrade", NEW_REVISION)
    assert result.returncode == 0, result.stderr
    after = _states(database)
    assert json.loads(after[t["copy"]]) == {}
    assert json.loads(after[t["copy_model"]]) == {"branched_from": 4}
    untouched = set(t) - {"copy", "copy_model"}
    assert {name: after[t[name]] for name in untouched} == {name: before[t[name]] for name in untouched}

    # Running it again (down to the previous head and up) changes nothing more.
    assert run_alembic(database, "downgrade", PREVIOUS_HEAD).returncode == 0
    assert _states(database) == after
    assert run_alembic(database, "upgrade", "head").returncode == 0
    assert _states(database) == after
