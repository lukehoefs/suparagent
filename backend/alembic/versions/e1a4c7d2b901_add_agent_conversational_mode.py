"""Task or Conversational mode per agent, and optional guidance on how it talks.

`conversational_mode` is off for every existing agent: Task, which is how agents
worked before this setting. `conversational_style` is null (no guidance).

Revision ID: e1a4c7d2b901
Revises: b5e2d8c4a913
"""
from alembic import context, op
import sqlalchemy as sa

revision = "e1a4c7d2b901"
down_revision = "b5e2d8c4a913"
branch_labels = None
depends_on = None


def upgrade():
    # A plain ADD COLUMN (nullable, or with a constant default) needs no table
    # rebuild on SQLite. Each column is checked first, so a re-run after a crash
    # completes the rest.
    offline = context.is_offline_mode()
    existing = set() if offline else {c["name"] for c in sa.inspect(op.get_bind()).get_columns("agent")}
    if offline or "conversational_mode" not in existing:
        op.add_column(
            "agent",
            sa.Column("conversational_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if offline or "conversational_style" not in existing:
        op.add_column("agent", sa.Column("conversational_style", sa.String(length=500), nullable=True))


def downgrade():
    with op.batch_alter_table("agent") as batch:
        batch.drop_column("conversational_style")
        batch.drop_column("conversational_mode")
