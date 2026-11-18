"""e4d7f0a5e234: the agent_group table and agent.group_id arrive empty; existing agents are in
no group, and a downgrade takes both away again without touching the agents."""

import sqlite3

from tests.db.sqlite_helpers import run_alembic

PREVIOUS_HEAD = "b5e2d8c4a913"
NEW_REVISION = "e4d7f0a5e234"


def _columns(db, table):
    return {row[1] for row in db.execute(f"PRAGMA table_info({table})")}


def _tables(db):
    return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_existing_agents_start_in_no_group_and_downgrade_removes_groups(tmp_path):
    database = tmp_path / "groups.db"
    result = run_alembic(database, "upgrade", PREVIOUS_HEAD)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO agent (owner_id, name, pinned) VALUES ('o', 'Atlas', 1)")

    result = run_alembic(database, "upgrade", NEW_REVISION)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert "agent_group" in _tables(db)
        assert db.execute("SELECT name, pinned, group_id FROM agent").fetchall() == [("Atlas", 1, None)]
        db.execute("INSERT INTO agent_group (owner_id, name) VALUES ('o', 'Clients')")
        assert db.execute("SELECT name, pinned, position FROM agent_group").fetchall() == [("Clients", 1, 0)]

    result = run_alembic(database, "downgrade", PREVIOUS_HEAD)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert "agent_group" not in _tables(db)
        assert "group_id" not in _columns(db, "agent")
        assert db.execute("SELECT name, pinned FROM agent").fetchall() == [("Atlas", 1)]


def test_offline_upgrade_writes_the_table_and_column(tmp_path):
    result = run_alembic(tmp_path / "offline.db", "upgrade", f"{PREVIOUS_HEAD}:{NEW_REVISION}", "--sql")
    assert result.returncode == 0, result.stderr
    assert "CREATE TABLE agent_group" in result.stdout
    assert "ALTER TABLE agent ADD COLUMN group_id" in result.stdout
