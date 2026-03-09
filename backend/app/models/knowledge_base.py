from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean
from sqlalchemy.dialects.sqlite import JSON
from datetime import datetime, timezone
import uuid

from app.database import Base


class KnowledgeBaseModel(Base):
    __tablename__ = "knowledge_bases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False, unique=True)
    description = Column(Text, default="")
    collection_name = Column(String(200), nullable=False, unique=True)
    embedding_model = Column(String(100), default="nomic-embed-text")
    chunk_size = Column(Integer, default=1000)
    chunk_overlap = Column(Integer, default=200)
    document_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    sources = Column(JSON, default=list)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AgentKnowledgeBaseLink(Base):
    __tablename__ = "agent_knowledge_bases"

    agent_id = Column(String, primary_key=True)
    knowledge_base_id = Column(String, primary_key=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
