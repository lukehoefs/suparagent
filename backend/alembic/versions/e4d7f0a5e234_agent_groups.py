"""Agent groups: named stacks of agents in the sidebar's pinned grid.

A new `agent_group` table (one row per group, owner-scoped, pinned by default)
and a nullable `agent.group_id` naming the group an agent is stacked in. Both
are additive: existing agents are in no group and the sidebar looks as before.

Revision ID: e4d7f0a5e234
Revises: e3c6e9f4d123
"""
from alembic import context, op
import sqlalchemy as sa

from app.db.types import BigIntPK, UTCDateTime

revision = "e4d7f0a5e234"
down_revision = "e3c6e9f4d123"
branch_labels = None
depends_on = None


def upgrade():
    # Each step is checked first, so a re-run after a crash completes the rest.
    offline = context.is_offline_mode()
    inspector = None if offline else sa.inspect(op.get_bind())
    if offline or not inspector.has_table("agent_group"):
        op.create_table(
            "agent_group",
            sa.Column("id", BigIntPK, sa.Identity(always=True), primary_key=True),
            sa.Column("owner_id", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", UTCDateTime(), nullable=False, server_default=sa.func.now()),
            sqlite_autoincrement=True,
        )
    if offline or "ix_agent_group_owner" not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("agent_group")}:
        op.create_index("ix_agent_group_owner", "agent_group", ["owner_id"])
    # A plain nullable ADD COLUMN needs no table rebuild on SQLite.
    if offline or "group_id" not in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("agent")}:
        op.add_column("agent", sa.Column("group_id", sa.BigInteger(), nullable=True))


def downgrade():
    with op.batch_alter_table("agent") as batch:
        batch.drop_column("group_id")
    op.drop_index("ix_agent_group_owner", table_name="agent_group")
    op.drop_table("agent_group")
