"""Approvals for one conversation, and what an approval card says about its tool.

`permission_rule` gains `thread_id`, `expires_at` and `label`, for "Allow for 1 hour" and
"Always in this chat" (services/approval_scopes.py): rows in bucket `thread_tool` tied to one
conversation, an hour-long one with the moment it ends. Every existing rule keeps null in all
three and works exactly as before.

`approval` gains `tool_summary` and `risk`: one sentence on what the tool does and how much it
can change, shown on the card (services/tool_descriptions.py). Null for approvals asked before.

Additive only, so it is safe on SQLite.

Revision ID: e2b5d8e3c012
Revises: b5e2d8c4a913
"""
from alembic import context, op
import sqlalchemy as sa

from app.db.types import UTCDateTime

revision = "e2b5d8e3c012"
down_revision = "b5e2d8c4a913"
branch_labels = None
depends_on = None

_RULE_COLUMNS = (
    ("thread_id", sa.BigInteger()),
    ("expires_at", UTCDateTime()),
    ("label", sa.String()),
)
_APPROVAL_COLUMNS = (
    ("tool_summary", sa.Text()),
    ("risk", sa.String()),
)
_THREAD_INDEX = "ix_permission_rule_thread_id"


def _columns(table: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    if context.is_offline_mode():
        return set()
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    present = _columns("permission_rule")
    for name, kind in _RULE_COLUMNS:
        if name not in present:
            op.add_column("permission_rule", sa.Column(name, kind, nullable=True))
    if _THREAD_INDEX not in _indexes("permission_rule"):
        op.create_index(_THREAD_INDEX, "permission_rule", ["thread_id"], unique=False)
    present = _columns("approval")
    for name, kind in _APPROVAL_COLUMNS:
        if name not in present:
            op.add_column("approval", sa.Column(name, kind, nullable=True))


def downgrade():
    for name, _kind in reversed(_APPROVAL_COLUMNS):
        op.drop_column("approval", name)
    # A conversation allow means nothing without its conversation: remove them with the columns.
    op.execute(sa.text("DELETE FROM permission_rule WHERE bucket = 'thread_tool'"))
    op.drop_index(_THREAD_INDEX, table_name="permission_rule")
    for name, _kind in reversed(_RULE_COLUMNS):
        op.drop_column("permission_rule", name)
