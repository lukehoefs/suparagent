from datetime import datetime

from sqlalchemy import Identity, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import BigIntPK, JSONValue, UTCDateTime


class UiRevision(Base):
    """One saved version of the app's look: theme colours, sidebar order and labels, and
    agent-made pages (app/ui/config.py). The newest row per owner is what the app shows;
    an undo writes a new row with an older config, so history only ever grows (trimmed to
    the newest app.ui.config.KEEP). Changes only how the app looks: nothing here grants or
    changes what any agent, person or tool may do."""

    __tablename__ = "ui_revision"
    __table_args__ = (
        Index("ix_ui_revision_owner", "owner_id", "id"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(BigIntPK, Identity(always=True), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    config: Mapped[object] = mapped_column(JSONValue, nullable=False)
    # A short plain-language line: what changed ("Accent colour set to #2563eb").
    summary: Mapped[str] = mapped_column(String, nullable=False)
    # "agent", "person" or "restore".
    source: Mapped[str] = mapped_column(String, nullable=False)
    # Who: the agent's name, or "you" for the person.
    actor: Mapped[str] = mapped_column(String, nullable=False)
    agent_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    restored_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, server_default=func.now())
