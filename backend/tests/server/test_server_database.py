"""`python -m app.server migrate`: create or update the schema without losing data
(app/server/database.py). SQLite only; PostgreSQL migrations are covered by CI."""

import os
import sqlite3
import subprocess
import sys
import textwrap
from contextlib import contextmanager
from pathlib import Path

import pytest

from app.core import data_lease
from app.core.config import settings
from app.server import database
from tests.conftest import using_sqlite
from tests.db.sqlite_helpers import run_alembic, one_revision_back

pytestmark = pytest.mark.skipif(not using_sqlite(), reason="these checks use their own SQLite files")


@pytest.fixture
def target(tmp_path, monkeypatch) -> Path:
    file = tmp_path / "data" / "suparagent.db"
    monkeypatch.setattr(settings, "SQLITE_PATH", str(file))
    return file


def revision(file: Path) -> str | None:
    connection = sqlite3.connect(file)
    try:
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        return row[0] if row else None
    finally:
        connection.close()


def test_a_new_database_is_created_at_the_newest_revision_with_no_backup(target):
    report = database.prepare_database()
    assert target.is_file() and revision(target) == database.newest_revision()
    assert report.before is None and report.after == database.newest_revision()
    assert report.backup is None and report.changed
    assert not (target.parent / "backups").exists()


def test_running_it_again_changes_nothing_and_copies_nothing(target):
    database.prepare_database()
    report = database.prepare_database()
    assert report.before == report.after and not report.changed and report.backup is None
    assert not (target.parent / "backups").exists()


def test_a_database_behind_is_copied_aside_first_then_updated(target):
    database.prepare_database()
    assert run_alembic(target, "downgrade", one_revision_back()).returncode == 0
    behind = revision(target)
    assert behind != database.newest_revision()
    connection = sqlite3.connect(target)
    connection.execute("CREATE TABLE IF NOT EXISTS keepsake (n INTEGER)")
    connection.execute("INSERT INTO keepsake VALUES (42)")
    connection.commit()
    connection.close()

    report = database.prepare_database()

    assert report.before == behind and report.after == database.newest_revision() and report.changed
    assert revision(target) == database.newest_revision()
    assert report.backup is not None and report.backup.parent == target.parent / "backups"
    assert behind in report.backup.name
    assert revision(report.backup) == behind  # the copy is the state before the update
    assert sqlite3.connect(report.backup).execute("SELECT n FROM keepsake").fetchone() == (42,)
    assert sqlite3.connect(target).execute("SELECT n FROM keepsake").fetchone() == (42,)  # data survives


def test_a_file_this_app_did_not_make_is_refused_and_left_exactly_as_it_was(target):
    target.parent.mkdir(parents=True)
    connection = sqlite3.connect(target)
    connection.execute("CREATE TABLE somebody_elses (id INTEGER)")
    connection.commit()
    connection.close()
    before = target.read_bytes()

    with pytest.raises(database.DatabaseRefused, match="schema version is unknown"):
        database.prepare_database()
    assert target.read_bytes() == before


def test_a_file_that_is_not_a_database_is_refused_and_left_alone(target):
    target.parent.mkdir(parents=True)
    target.write_bytes(b"this is not sqlite, it is a text file " * 20)
    before = target.read_bytes()
    with pytest.raises(database.DatabaseRefused):
        database.prepare_database()
    assert target.read_bytes() == before


def test_a_wrong_encryption_key_is_reported_before_anything_changes(target):
    database.prepare_database()
    assert run_alembic(target, "downgrade", one_revision_back()).returncode == 0
    connection = sqlite3.connect(target)
    connection.execute(
        "INSERT INTO user_credential (user_id, provider, file_path, ciphertext) VALUES ('u1', 'claude', 'f', 'not-a-valid-token')"
    )
    connection.commit()
    connection.close()
    before = target.read_bytes()

    with pytest.raises(database.KeyMismatch):
        database.prepare_database()
    assert target.read_bytes() == before
    assert not (target.parent / "backups").exists()


BACKEND_DIR = Path(__file__).parents[2]
PYTHON_ENV = {**os.environ, "PYTHONPATH": str(BACKEND_DIR)}
NAMES_THE_HOLDER = sys.platform != "win32"  # Windows keeps the locked lease file unreadable, so no pid

# A stand-in for a server still running on the file: another process holding its lease.
HOLDER = textwrap.dedent(
    """
    import sys, time
    from pathlib import Path
    from app.core import data_lease
    data_lease.acquire(Path(sys.argv[1]))
    print("HELD", flush=True)
    time.sleep(600)
    """
)


@contextmanager
def server_running_on(file: Path):
    proc = subprocess.Popen([sys.executable, "-c", HOLDER, str(file)], cwd=BACKEND_DIR, env=PYTHON_ENV,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        line = proc.stdout.readline().strip()
        assert line == "HELD", (line, proc.stderr.read() if proc.poll() is not None else "")
        yield proc
    finally:
        if proc.poll() is None:
            proc.terminate()
        proc.wait(timeout=10)


def lease_is_free(file: Path) -> bool:
    """Whether another process could take the lease now (asked from a separate process)."""
    check = "import sys; from pathlib import Path; from app.core import data_lease; data_lease.acquire(Path(sys.argv[1]))"
    done = subprocess.run([sys.executable, "-c", check, str(file)], cwd=BACKEND_DIR, env=PYTHON_ENV,
                          capture_output=True, text=True, timeout=60)
    return done.returncode == 0


def test_a_server_still_running_on_the_file_makes_it_refuse_and_change_nothing(target):
    # A release with a migration, started while the old version still serves the file (a rolling update).
    database.prepare_database()
    assert run_alembic(target, "downgrade", one_revision_back()).returncode == 0
    behind = revision(target)
    before = target.read_bytes()

    with server_running_on(target) as server:
        with pytest.raises(database.DatabaseRefused) as refused:
            database.prepare_database()
        message = str(refused.value)
        assert "is still using the database" in message and str(target.resolve()) in message
        assert "was not changed" in message and "Stop that server first" in message
        if NAMES_THE_HOLDER:
            assert f"process {server.pid}" in message
        assert target.read_bytes() == before and revision(target) == behind
        assert not (target.parent / "backups").exists()  # refused before the copy, too

    # Once that server has stopped, the same migration goes ahead.
    report = database.prepare_database()
    assert report.before == behind and report.after == database.newest_revision() and report.backup is not None


def test_the_lease_is_held_while_it_judges_copies_and_migrates(target, monkeypatch):
    database.prepare_database()
    assert run_alembic(target, "downgrade", one_revision_back()).returncode == 0
    free_during = {}

    def watched(step, real):
        def run(*args, **kwargs):
            free_during[step] = lease_is_free(target)
            return real(*args, **kwargs)
        return run

    monkeypatch.setattr(database, "sqlite_file_state", watched("judge", database.sqlite_file_state))
    monkeypatch.setattr(database, "backup_before_migration", watched("copy", database.backup_before_migration))
    monkeypatch.setattr(database.command, "upgrade", watched("migrate", database.command.upgrade))

    report = database.prepare_database()

    assert report.backup is not None and report.changed
    assert free_during == {"judge": False, "copy": False, "migrate": False}
    assert lease_is_free(target)


def test_the_migrate_command_exits_with_the_database_code_and_says_why(target, capsys):
    from app.server.entry import EXIT_DATABASE, main as server_main

    with server_running_on(target) as server:
        assert server_main(["migrate"]) == EXIT_DATABASE
    err = capsys.readouterr().err
    assert "is still using the database" in err
    if NAMES_THE_HOLDER:
        assert f"process {server.pid}" in err
    assert not target.exists()  # a new database is not created under a running server either


def test_the_lease_is_given_back_when_it_is_done(target):
    database.prepare_database()
    assert data_lease.lease_path(target.resolve()) not in data_lease._held
    assert lease_is_free(target)  # the server started next (`migrate && exec server`) can take it


def test_the_lease_is_given_back_when_it_refuses(target):
    target.parent.mkdir(parents=True)
    target.write_bytes(b"this is not sqlite, it is a text file " * 20)
    with pytest.raises(database.DatabaseRefused):
        database.prepare_database()
    assert data_lease.lease_path(target.resolve()) not in data_lease._held
    assert lease_is_free(target)


def test_a_lease_this_process_already_holds_is_shared_not_refused_or_dropped(target):
    lease = data_lease.acquire(target)  # as a caller that took it first would
    try:
        database.prepare_database()
        assert lease.held and not lease_is_free(target)
    finally:
        lease.release()
    assert lease_is_free(target)
