"""UI revisions: the app's agent-editable look (theme, sidebar, custom pages) with history.

A new `ui_revision` table, one row per saved version, owner-scoped. Additive: with no
rows the app looks exactly as before.

Revision ID: f8c1a3e5b702
Revises: e4d7f0a5e234
"""
from alembic import context, op
import sqlalchemy as sa

from app.db.types import BigIntPK, JSONValue, UTCDateTime

revision = "f8c1a3e5b702"
down_revision = "e4d7f0a5e234"
branch_labels = None
depends_on = None


def upgrade():
    offline = context.is_offline_mode()
    inspector = None if offline else sa.inspect(op.get_bind())
    if offline or not inspector.has_table("ui_revision"):
        op.create_table(
            "ui_revision",
            sa.Column("id", BigIntPK, sa.Identity(always=True), primary_key=True),
            sa.Column("owner_id", sa.String(), nullable=False),
            sa.Column("config", JSONValue, nullable=False),
            sa.Column("summary", sa.String(), nullable=False),
            sa.Column("source", sa.String(), nullable=False),
            sa.Column("actor", sa.String(), nullable=False),
            sa.Column("agent_id", sa.Integer(), nullable=True),
            sa.Column("restored_from", sa.Integer(), nullable=True),
            sa.Column("created_at", UTCDateTime(), nullable=False, server_default=sa.func.now()),
            sqlite_autoincrement=True,
        )
        inspector = None if offline else sa.inspect(op.get_bind())
    if offline or "ix_ui_revision_owner" not in {i["name"] for i in inspector.get_indexes("ui_revision")}:
        op.create_index("ix_ui_revision_owner", "ui_revision", ["owner_id", "id"])


def downgrade():
    op.drop_index("ix_ui_revision_owner", table_name="ui_revision")
    op.drop_table("ui_revision")
