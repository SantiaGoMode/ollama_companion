import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from app.database import Base


class AgentChatModel(Base):
    __tablename__ = "agent_chats"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    agent_a_id = Column(String, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_b_id = Column(String, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    agent_a_name = Column(String, nullable=False)
    agent_b_name = Column(String, nullable=False)
    agent_a_model = Column(String, nullable=False)
    agent_b_model = Column(String, nullable=False)
    topic = Column(Text, nullable=False)
    total_turns = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AgentChatMessageModel(Base):
    __tablename__ = "agent_chat_messages"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    chat_id = Column(String, ForeignKey("agent_chats.id", ondelete="CASCADE"), nullable=False)
    turn = Column(Integer, nullable=False)
    agent_id = Column(String, nullable=False)
    agent_name = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
