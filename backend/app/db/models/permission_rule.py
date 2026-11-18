from datetime import datetime

from sqlalchemy import BigInteger, Identity, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import BigIntPK, UTCDateTime


class PermissionRule(Base):
    __tablename__ = "permission_rule"
    __table_args__ = (
        Index(
            "ix_permission_rule_lookup", "user_id", "bucket", "connector", "tool"
        ),
    )

    id: Mapped[int] = mapped_column(BigIntPK, Identity(always=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    bucket: Mapped[str] = mapped_column(String, nullable=False, index=True)
    connector: Mapped[str | None] = mapped_column(String, nullable=True)
    tool: Mapped[str | None] = mapped_column(String, nullable=True)
    decision: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, server_default=func.now(), nullable=False
    )
    # An allow for one conversation (services/approval_scopes.py): the conversation it applies in,
    # when it ends (null: for as long as the conversation exists) and what the card called the tool.
    # Null on every other rule.
    thread_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)