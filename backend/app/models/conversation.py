import json
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime
from app.database import Base


class ConversationModel(Base):
    __tablename__ = "conversations"

    agent_id = Column(String, primary_key=True)
    messages = Column(Text, default="[]")
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def get_messages(self) -> list[dict]:
        return json.loads(self.messages) if self.messages else []

    def set_messages(self, msgs: list[dict]):
        self.messages = json.dumps(msgs)
