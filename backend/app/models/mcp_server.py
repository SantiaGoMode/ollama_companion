import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base


class MCPServerModel(Base):
    __tablename__ = "mcp_servers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    # Transport: "stdio" or "sse"
    transport = Column(String(10), default="stdio")
    # For stdio: command to run (e.g., "npx", "uvx", "python")
    command = Column(String(200), nullable=True)
    # For stdio: arguments list (e.g., ["-y", "@modelcontextprotocol/server-github"])
    args = Column(JSON, default=list)
    # Environment variables — encrypted at rest via Fernet
    env = Column(Text, default="")
    # For SSE: URL endpoint
    url = Column(String(500), nullable=True)
    # Display
    icon = Column(String(10), default="")
    color = Column(String(7), default="#6366f1")
    enabled = Column(Boolean, default=True)
    # Which integration preset this was created from (null = custom)
    preset_id = Column(String(50), nullable=True)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    updated_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat(),
                       onupdate=lambda: datetime.now(timezone.utc).isoformat())


class AgentMCPLinkModel(Base):
    __tablename__ = "agent_mcp_links"

    agent_id = Column(String, primary_key=True)
    mcp_server_id = Column(String, primary_key=True)
