"""e2b5d8e3c012: saved rules gain a conversation, an end and a label (conversation allows), and
approvals gain what the card says about their tool. Existing rows keep working as they were, and a
downgrade removes the columns together with the conversation allows that need them."""

import sqlite3

from tests.db.sqlite_helpers import run_alembic

PREVIOUS_HEAD = "b5e2d8c4a913"
NEW_REVISION = "e2b5d8e3c012"


def _columns(db, table):
    return {row[1] for row in db.execute(f"PRAGMA table_info({table})")}


def test_rules_and_approvals_gain_their_columns_and_old_rules_are_untouched(tmp_path):
    database = tmp_path / "scopes.db"
    assert run_alembic(database, "upgrade", PREVIOUS_HEAD).returncode == 0
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO permission_rule (user_id, bucket, connector, tool, decision) "
            "VALUES ('o', 'local_command', 'exact@/work', 'ls -la', 'allow')"
        )
    result = run_alembic(database, "upgrade", NEW_REVISION)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert {"thread_id", "expires_at", "label"} <= _columns(db, "permission_rule")
        assert {"tool_summary", "risk"} <= _columns(db, "approval")
        indexes = {row[1] for row in db.execute("PRAGMA index_list(permission_rule)")}
        assert "ix_permission_rule_thread_id" in indexes
        assert db.execute(
            "SELECT bucket, connector, tool, thread_id, expires_at, label FROM permission_rule"
        ).fetchall() == [("local_command", "exact@/work", "ls -la", None, None, None)]


def test_a_downgrade_removes_the_columns_and_the_conversation_allows(tmp_path):
    database = tmp_path / "scopes.db"
    assert run_alembic(database, "upgrade", NEW_REVISION).returncode == 0
    with sqlite3.connect(database) as db:
        db.execute(
            "INSERT INTO permission_rule (user_id, bucket, connector, tool, decision) "
            "VALUES ('o', 'local_command', 'exact', 'pwd', 'allow')"
        )
        db.execute(
            "INSERT INTO permission_rule (user_id, bucket, connector, tool, decision, thread_id, label) "
            "VALUES ('o', 'thread_tool', 'Write', NULL, 'allow', 7, 'notes.txt')"
        )
    result = run_alembic(database, "downgrade", PREVIOUS_HEAD)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(database) as db:
        assert not {"thread_id", "expires_at", "label"} & _columns(db, "permission_rule")
        assert not {"tool_summary", "risk"} & _columns(db, "approval")
        assert db.execute("SELECT bucket, tool FROM permission_rule").fetchall() == [("local_command", "pwd")]
    again = run_alembic(database, "upgrade", "head")
    assert again.returncode == 0, again.stderr
