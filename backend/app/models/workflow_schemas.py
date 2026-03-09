from pydantic import BaseModel, Field
from typing import Optional


class WorkflowStepSchema(BaseModel):
    step_order: int = 0
    agent_id: str
    label: str = ""
    input_template: str = "{{previous_output}}"
    timeout_seconds: int = 300


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    steps: list[WorkflowStepSchema] = []
    schedule: Optional[str] = None
    enabled: bool = True


class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    steps: Optional[list[WorkflowStepSchema]] = None
    schedule: Optional[str] = None
    enabled: Optional[bool] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str
    steps: list[dict]
    schedule: Optional[str]
    enabled: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class StepResultSchema(BaseModel):
    step_order: int
    agent_id: str
    agent_name: str = ""
    input: str = ""
    output: str = ""
    status: str = "pending"  # pending, running, completed, failed, skipped
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None


class ExecutionResponse(BaseModel):
    id: str
    workflow_id: str
    status: str
    current_step: int
    trigger: str
    step_results: list[dict]
    started_at: Optional[str]
    completed_at: Optional[str]
    error: Optional[str]

    model_config = {"from_attributes": True}


class ExecuteWorkflowRequest(BaseModel):
    initial_input: str = ""
    trigger: str = "manual"
