"""Agent cloud computers: a desktop behind its own gateway, linked through one custom MCP connection.

A new table only, so it is the same on SQLite and PostgreSQL. On SQLite the id is AUTOINCREMENT
from the start, so a removed link's id (and the viewer tickets bound to it) is never reused.

Revision ID: e3c6e9f4d123
Revises: e2b5d8e3c012
"""
from alembic import context, op
import sqlalchemy as sa

revision = "e3c6e9f4d123"
down_revision = "e2b5d8e3c012"
branch_labels = None
depends_on = None


def upgrade():
    # Checked first, so a re-run after a crash before the version stamp completes it.
    offline = context.is_offline_mode()
    if offline or "remote_computer" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "remote_computer",
            sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), primary_key=True),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("mcp_connection_id", sa.String(length=36), nullable=False),
            sa.Column("agent_id", sa.BigInteger(), nullable=True),
            sa.Column("human_control", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("control_started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("control_person_id", sa.BigInteger(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["mcp_connection_id"], ["custom_mcp_connection.id"], ondelete="CASCADE"),
            sqlite_autoincrement=True,
        )
    existing = set() if offline else {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("remote_computer")}
    if "uq_remote_computer_connection" not in existing:
        op.create_index("uq_remote_computer_connection", "remote_computer", ["mcp_connection_id"], unique=True)
    if "uq_remote_computer_agent" not in existing:
        op.create_index("uq_remote_computer_agent", "remote_computer", ["agent_id"], unique=True)


def downgrade():
    op.drop_index("uq_remote_computer_agent", table_name="remote_computer")
    op.drop_index("uq_remote_computer_connection", table_name="remote_computer")
    op.drop_table("remote_computer")
