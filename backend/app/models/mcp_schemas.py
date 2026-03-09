from pydantic import BaseModel, Field
from typing import Optional


class MCPServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    transport: str = "stdio"
    command: Optional[str] = None
    args: list[str] = []
    env: dict[str, str] = {}
    url: Optional[str] = None
    icon: str = ""
    color: str = "#6366f1"
    enabled: bool = True
    preset_id: Optional[str] = None


class MCPServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    transport: Optional[str] = None
    command: Optional[str] = None
    args: Optional[list[str]] = None
    env: Optional[dict[str, str]] = None
    url: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    enabled: Optional[bool] = None


class MCPServerResponse(BaseModel):
    id: str
    name: str
    description: str
    transport: str
    command: Optional[str]
    args: list[str]
    env: dict[str, str]
    url: Optional[str]
    icon: str
    color: str
    enabled: bool
    preset_id: Optional[str]
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MCPToolSchema(BaseModel):
    name: str
    description: str = ""
    server_id: str
    server_name: str
    input_schema: dict = {}


class LinkAgentMCPRequest(BaseModel):
    agent_id: str
    mcp_server_ids: list[str]
