from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, Enum as SAEnum
from sqlalchemy.dialects.sqlite import JSON
from datetime import datetime, timezone
import enum
import uuid

from app.database import Base


class AgentType(str, enum.Enum):
    CHAT = "chat"
    SUMMARIZER = "summarizer"
    CODE = "code"
    FILE = "file"
    GENERATOR = "generator"
    TRANSFORMER = "transformer"
    REASONING = "reasoning"


class ConfirmationMode(str, enum.Enum):
    AUTO = "auto"
    CONFIRM = "confirm"


class AgentModel(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    agent_type = Column(SAEnum(AgentType), nullable=False, default=AgentType.CHAT)
    model = Column(String(100), nullable=False, default="llama3.2")
    system_prompt = Column(Text, default="You are a helpful assistant.")
    input_schema = Column(JSON, default=dict)
    icon = Column(String(10), default="")
    color = Column(String(7), default="#6366f1")
    tools_enabled = Column(Boolean, default=False)
    allowed_directories = Column(JSON, default=list)
    confirmation_mode = Column(SAEnum(ConfirmationMode), default=ConfirmationMode.CONFIRM)
    allowed_commands = Column(JSON, default=list)
    sort_order = Column(Integer, default=0)
    message_count = Column(Integer, default=0)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
