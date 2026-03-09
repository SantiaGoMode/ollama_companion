from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Text, DateTime
from app.database import Base

DEFAULT_TTL_MINUTES = 10


class PendingActionModel(Base):
    __tablename__ = "pending_actions"

    id = Column(String(8), primary_key=True)
    agent_id = Column(String(36), nullable=False)
    action_type = Column(String(50), nullable=False)
    details = Column(Text, nullable=False)  # JSON
    status = Column(String(20), nullable=False, default="pending")  # pending/approved/rejected/expired
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc) + timedelta(minutes=DEFAULT_TTL_MINUTES),
    )
