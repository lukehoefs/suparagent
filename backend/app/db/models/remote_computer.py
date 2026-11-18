from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, Identity, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import expression

from app.db.base import Base
from app.db.types import BigIntPK, UTCDateTime


class RemoteComputer(Base):
    """An agent's cloud computer: a desktop behind its own gateway, reached through one owner-added
    MCP connection (custom_mcp_connection). The gateway's address is derived from that connection's
    endpoint and never stored or accepted on its own; its bearer token stays in the credential store.

    `human_control` is set while a person drives the desktop: the approval gate then refuses every
    call to that connection's tools (services/remote_computers.py)."""

    __tablename__ = "remote_computer"
    __table_args__ = (
        Index("uq_remote_computer_connection", "mcp_connection_id", unique=True),
        Index("uq_remote_computer_agent", "agent_id", unique=True),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigIntPK, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Removing the connection removes the link; removing the link never removes the connection.
    mcp_connection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("custom_mcp_connection.id", ondelete="CASCADE"), nullable=False
    )
    # Like thread.agent_id, no foreign key: deleting an agent sets this back to null.
    agent_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    human_control: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=expression.false()
    )
    control_started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    # The signed-in member who took control; null for the workspace owner.
    control_person_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
