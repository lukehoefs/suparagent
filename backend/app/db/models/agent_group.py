from datetime import datetime

from sqlalchemy import Boolean, Identity, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import expression

from app.db.base import Base
from app.db.types import BigIntPK, UTCDateTime


class AgentGroup(Base):
    """A named stack of agents in the sidebar's pinned grid (design: Main.html). Membership is
    `agent.group_id`; an agent is in at most one group. Purely a way to arrange the sidebar:
    a group changes nothing about what its agents may do or how their turns run."""

    __tablename__ = "agent_group"
    __table_args__ = (
        Index("ix_agent_group_owner", "owner_id"),
        # Ids are never reused, so an agent's stale group_id can never point at a newer group.
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigIntPK, Identity(always=True), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Pinned groups show in the sidebar grid; new groups are pinned.
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=expression.true()
    )
    # Order among the owner's groups, lowest first.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())
