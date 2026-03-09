from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime

from app.models.agent import AgentType, ConfirmationMode

# Size limits
MAX_SYSTEM_PROMPT = 50_000  # ~12k tokens
MAX_MESSAGE_CONTENT = 200_000  # ~50k tokens
MAX_MESSAGES_PER_REQUEST = 200
MAX_CODE_LENGTH = 500_000  # ~125k tokens
MAX_CONTENT_LENGTH = 500_000


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    agent_type: AgentType = AgentType.CHAT
    model: str = Field(default="llama3.2", max_length=100)
    system_prompt: str = Field(default="You are a helpful assistant.", max_length=MAX_SYSTEM_PROMPT)
    input_schema: dict = {}
    icon: str = Field(default="", max_length=10)
    color: str = Field(default="#6366f1", max_length=7)
    tools_enabled: bool = False
    allowed_directories: list[str] = Field(default=[], max_length=20)
    confirmation_mode: ConfirmationMode = ConfirmationMode.CONFIRM
    allowed_commands: list[str] = Field(default=[], max_length=50)


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=1000)
    agent_type: Optional[AgentType] = None
    model: Optional[str] = Field(default=None, max_length=100)
    system_prompt: Optional[str] = Field(default=None, max_length=MAX_SYSTEM_PROMPT)
    input_schema: Optional[dict] = None
    icon: Optional[str] = Field(default=None, max_length=10)
    color: Optional[str] = Field(default=None, max_length=7)
    tools_enabled: Optional[bool] = None
    allowed_directories: Optional[list[str]] = None
    confirmation_mode: Optional[ConfirmationMode] = None
    allowed_commands: Optional[list[str]] = None


class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    agent_type: AgentType
    model: str
    system_prompt: str
    input_schema: dict
    icon: str
    color: str
    tools_enabled: bool
    allowed_directories: list[str]
    confirmation_mode: ConfirmationMode
    allowed_commands: list[str]
    sort_order: int = 0
    message_count: int = 0
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant|system)$")
    content: str = Field(..., max_length=MAX_MESSAGE_CONTENT)
    images: list[str] = Field(default=[], max_length=10)


class ChatRequest(BaseModel):
    agent_id: str
    messages: list[ChatMessage] = Field(..., max_length=MAX_MESSAGES_PER_REQUEST)

    @field_validator("messages")
    @classmethod
    def messages_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("messages must not be empty")
        return v


class CodeRequest(BaseModel):
    agent_id: str
    code: str = Field(..., max_length=MAX_CODE_LENGTH)
    language: str = Field(default="python", max_length=50)
    instruction: str = Field(default="Review this code", max_length=2000)


class SummaryRequest(BaseModel):
    agent_id: str
    content: str = Field(..., max_length=MAX_CONTENT_LENGTH)
    source_type: str = Field(default="text", max_length=50)


class TransformRequest(BaseModel):
    agent_id: str
    content: str = Field(..., max_length=MAX_CONTENT_LENGTH)
    target_format: str = Field(default="", max_length=100)
    instruction: str = Field(default="", max_length=2000)


class GeneratorRequest(BaseModel):
    agent_id: str
    parameters: dict = {}
    instruction: str = Field(default="", max_length=5000)


class AgentChatRequest(BaseModel):
    agent_a_id: str
    agent_b_id: str
    topic: str = Field(..., max_length=1000)
    max_turns: int = Field(default=6, ge=1, le=100)


class AgentChatContinueRequest(BaseModel):
    max_turns: int = Field(default=4, ge=1, le=100)
    redirect_topic: Optional[str] = Field(default=None, max_length=1000)


class AgentChatResponse(BaseModel):
    id: str
    agent_a_id: str
    agent_b_id: str
    agent_a_name: str
    agent_b_name: str
    agent_a_model: str
    agent_b_model: str
    topic: str
    total_turns: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentChatMessageResponse(BaseModel):
    id: str
    chat_id: str
    turn: int
    agent_id: str
    agent_name: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PendingAction(BaseModel):
    action_id: str
    action_type: str
    agent_id: str
    details: dict


class ActionApproval(BaseModel):
    action_id: str
    approved: bool
