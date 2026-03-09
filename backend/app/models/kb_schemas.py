from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    embedding_model: str = "nomic-embed-text"
    chunk_size: int = 1000
    chunk_overlap: int = 200


class KnowledgeBaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str
    collection_name: str
    embedding_model: str
    chunk_size: int
    chunk_overlap: int
    document_count: int
    chunk_count: int
    sources: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IngestFileRequest(BaseModel):
    file_path: str


class IngestDirectoryRequest(BaseModel):
    directory_path: str
    extensions: Optional[list[str]] = None


class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    search_type: str = "mmr"


class AgentKBLinkRequest(BaseModel):
    agent_id: str
    knowledge_base_ids: list[str]
