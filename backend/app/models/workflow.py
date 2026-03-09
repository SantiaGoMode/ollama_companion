import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean, Integer, Float
from sqlalchemy.dialects.sqlite import JSON
from app.database import Base


class WorkflowModel(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    # Steps stored as JSON array:
    # [{"step_order": 0, "agent_id": "uuid", "label": "Step Name", "input_template": "{{previous_output}}", "timeout_seconds": 300}]
    steps = Column(JSON, default=list)
    # Cron expression for scheduling, e.g. "0 9 * * *" = daily at 9am. Null = no schedule.
    schedule = Column(String(50), nullable=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat())
    updated_at = Column(String, default=lambda: datetime.now(timezone.utc).isoformat(),
                       onupdate=lambda: datetime.now(timezone.utc).isoformat())


class WorkflowExecutionModel(Base):
    __tablename__ = "workflow_executions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id = Column(String, nullable=False)
    # status: pending, running, paused, completed, failed, cancelled
    status = Column(String(20), default="pending")
    current_step = Column(Integer, default=0)
    # trigger: manual, scheduled, on_completion
    trigger = Column(String(20), default="manual")
    # Step results stored as JSON array:
    # [{"step_order": 0, "agent_id": "uuid", "agent_name": "...", "input": "...", "output": "...", "status": "completed|failed|skipped|pending", "started_at": "...", "completed_at": "...", "duration_ms": 1234, "error": null}]
    step_results = Column(JSON, default=list)
    started_at = Column(String, nullable=True)
    completed_at = Column(String, nullable=True)
    error = Column(Text, nullable=True)
