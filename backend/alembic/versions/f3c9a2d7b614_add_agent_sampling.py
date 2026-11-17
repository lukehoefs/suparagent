"""Per-agent sampling (temperature, top_p, max output tokens) for the engines that take it.

All three are nullable: null leaves the engine or model its own default, so existing agents
keep behaving exactly as before.

Revision ID: f3c9a2d7b614
Revises: d4b8e1f7a936
"""
from alembic import context, op
import sqlalchemy as sa

revision = "f3c9a2d7b614"
down_revision = "d4b8e1f7a936"
branch_labels = None
depends_on = None

COLUMNS = (
    ("temperature", sa.Float),
    ("top_p", sa.Float),
    ("max_output_tokens", sa.Integer),
)


def upgrade():
    # A plain nullable ADD COLUMN needs no table rebuild on SQLite. Each column is
    # checked first, so a re-run after a crash completes the rest.
    offline = context.is_offline_mode()
    existing = set() if offline else {c["name"] for c in sa.inspect(op.get_bind()).get_columns("agent")}
    for name, kind in COLUMNS:
        if offline or name not in existing:
            op.add_column("agent", sa.Column(name, kind(), nullable=True))


def downgrade():
    with op.batch_alter_table("agent") as batch:
        for name, _ in reversed(COLUMNS):
            batch.drop_column(name)
