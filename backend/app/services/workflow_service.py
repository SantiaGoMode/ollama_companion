import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.workflow import WorkflowModel, WorkflowExecutionModel
from app.models.workflow_schemas import WorkflowCreate, WorkflowUpdate, WorkflowStepSchema
from app.models.agent import AgentModel
from app.agents.engine import build_llm, _build_messages

logger = logging.getLogger(__name__)

_cancel_flags: dict[str, asyncio.Event] = {}


# ─── WORKFLOW CRUD ──────────────────────────────────────────────

async def create_workflow(db: AsyncSession, data: WorkflowCreate) -> WorkflowModel:
    workflow = WorkflowModel(
        name=data.name,
        description=data.description,
        steps=[s.model_dump() for s in data.steps],
        schedule=data.schedule,
        enabled=data.enabled,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return workflow


async def get_all_workflows(db: AsyncSession) -> list[WorkflowModel]:
    result = await db.execute(select(WorkflowModel).order_by(WorkflowModel.created_at.desc()))
    return list(result.scalars().all())


async def get_workflow(db: AsyncSession, workflow_id: str) -> Optional[WorkflowModel]:
    result = await db.execute(select(WorkflowModel).where(WorkflowModel.id == workflow_id))
    return result.scalar_one_or_none()


async def update_workflow(db: AsyncSession, workflow_id: str, data: WorkflowUpdate) -> Optional[WorkflowModel]:
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        return None
    update_data = data.model_dump(exclude_unset=True)
    if "steps" in update_data and update_data["steps"] is not None:
        update_data["steps"] = [s if isinstance(s, dict) else s.model_dump() for s in update_data["steps"]]
    for key, value in update_data.items():
        setattr(workflow, key, value)
    workflow.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    await db.refresh(workflow)
    return workflow


async def delete_workflow(db: AsyncSession, workflow_id: str) -> bool:
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        return False
    await db.execute(delete(WorkflowExecutionModel).where(WorkflowExecutionModel.workflow_id == workflow_id))
    await db.delete(workflow)
    await db.commit()
    return True


# ─── EXECUTION CRUD ──────────────────────────────────────────────

async def get_execution(db: AsyncSession, execution_id: str) -> Optional[WorkflowExecutionModel]:
    result = await db.execute(
        select(WorkflowExecutionModel).where(WorkflowExecutionModel.id == execution_id)
    )
    return result.scalar_one_or_none()


async def get_workflow_executions(db: AsyncSession, workflow_id: str) -> list[WorkflowExecutionModel]:
    result = await db.execute(
        select(WorkflowExecutionModel)
        .where(WorkflowExecutionModel.workflow_id == workflow_id)
        .order_by(WorkflowExecutionModel.started_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())


async def cancel_execution(db: AsyncSession, execution_id: str) -> bool:
    execution = await get_execution(db, execution_id)
    if not execution or execution.status not in ("running", "pending"):
        return False

    if execution_id in _cancel_flags:
        _cancel_flags[execution_id].set()
    else:
        execution.status = "cancelled"
        execution.completed_at = datetime.now(timezone.utc).isoformat()
        await db.commit()

    logger.info("Cancellation requested for execution %s", execution_id)
    return True


# ─── WORKFLOW EXECUTOR ──────────────────────────────────────────

async def execute_workflow(
    db: AsyncSession,
    workflow: WorkflowModel,
    initial_input: str = "",
    trigger: str = "manual",
    resume_execution_id: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """
    Execute a workflow's steps sequentially. Yields status events as dicts:
      {"type": "execution_started", "execution_id": "..."}
      {"type": "step_started", "step_order": 0, "agent_name": "..."}
      {"type": "step_chunk", "step_order": 0, "chunk": "text"}
      {"type": "step_completed", "step_order": 0, "output": "full text"}
      {"type": "step_failed", "step_order": 0, "error": "..."}
      {"type": "execution_completed", "execution_id": "..."}
      {"type": "execution_failed", "execution_id": "...", "error": "..."}
    """
    steps = workflow.steps or []
    if not steps:
        yield {"type": "execution_failed", "execution_id": "", "error": "Workflow has no steps"}
        return

    # Resume or create new execution
    if resume_execution_id:
        execution = await get_execution(db, resume_execution_id)
        if not execution:
            yield {"type": "execution_failed", "execution_id": resume_execution_id, "error": "Execution not found"}
            return
        start_step = execution.current_step
        step_results = list(execution.step_results or [])
        # Get the last successful output as carry-over
        previous_output = ""
        for sr in step_results:
            if sr.get("status") == "completed" and sr.get("output"):
                previous_output = sr["output"]
    else:
        execution = WorkflowExecutionModel(
            workflow_id=workflow.id,
            status="running",
            current_step=0,
            trigger=trigger,
            step_results=[],
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        db.add(execution)
        await db.commit()
        await db.refresh(execution)
        start_step = 0
        step_results = []
        previous_output = initial_input

    yield {"type": "execution_started", "execution_id": execution.id}

    # Set up cancellation flag
    cancel_event = asyncio.Event()
    _cancel_flags[execution.id] = cancel_event

    # Update status to running (for resume case)
    execution.status = "running"
    await db.commit()

    for i in range(start_step, len(steps)):
        if cancel_event.is_set():
            execution.status = "cancelled"
            execution.completed_at = datetime.now(timezone.utc).isoformat()
            await db.commit()
            _cancel_flags.pop(execution.id, None)
            yield {"type": "execution_cancelled", "execution_id": execution.id}
            return
        step = steps[i]
        agent_id = step.get("agent_id", "")
        step_label = step.get("label", f"Step {i + 1}")
        input_template = step.get("input_template", "{{previous_output}}")

        # Look up the agent
        agent_result = await db.execute(select(AgentModel).where(AgentModel.id == agent_id))
        agent = agent_result.scalar_one_or_none()

        if not agent:
            error_msg = f"Agent not found for step {i + 1}: {agent_id}"
            step_result = {
                "step_order": i,
                "agent_id": agent_id,
                "agent_name": step_label,
                "input": "",
                "output": "",
                "status": "failed",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": 0,
                "error": error_msg,
            }
            step_results.append(step_result)
            execution.step_results = step_results
            execution.current_step = i
            execution.status = "failed"
            execution.error = error_msg
            execution.completed_at = datetime.now(timezone.utc).isoformat()
            await db.commit()
            _cancel_flags.pop(execution.id, None)
            yield {"type": "step_failed", "step_order": i, "error": error_msg}
            yield {"type": "execution_failed", "execution_id": execution.id, "error": error_msg}
            return

        # Build the input from template
        step_input = input_template.replace("{{previous_output}}", previous_output)

        step_started = datetime.now(timezone.utc)
        yield {"type": "step_started", "step_order": i, "agent_name": agent.name, "agent_id": agent_id}

        # Update execution state
        execution.current_step = i
        await db.commit()

        # Run the agent
        try:
            llm = build_llm(agent.model, temperature=0.7)
            messages = [{"role": "user", "content": step_input}]
            lc_messages = _build_messages(agent.system_prompt, messages)

            full_output = ""
            async for chunk in llm.astream(lc_messages):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if text:
                    full_output += text
                    yield {"type": "step_chunk", "step_order": i, "chunk": text}

            step_completed = datetime.now(timezone.utc)
            duration_ms = int((step_completed - step_started).total_seconds() * 1000)

            step_result = {
                "step_order": i,
                "agent_id": agent_id,
                "agent_name": agent.name,
                "input": step_input[:2000],  # Truncate for storage
                "output": full_output[:5000],  # Truncate for storage
                "status": "completed",
                "started_at": step_started.isoformat(),
                "completed_at": step_completed.isoformat(),
                "duration_ms": duration_ms,
                "error": None,
            }
            step_results.append(step_result)
            execution.step_results = step_results
            await db.commit()

            previous_output = full_output
            yield {"type": "step_completed", "step_order": i, "output": full_output}

        except Exception as e:
            step_completed = datetime.now(timezone.utc)
            duration_ms = int((step_completed - step_started).total_seconds() * 1000)
            error_msg = str(e)

            step_result = {
                "step_order": i,
                "agent_id": agent_id,
                "agent_name": agent.name,
                "input": step_input[:2000],
                "output": "",
                "status": "failed",
                "started_at": step_started.isoformat(),
                "completed_at": step_completed.isoformat(),
                "duration_ms": duration_ms,
                "error": error_msg,
            }
            step_results.append(step_result)
            execution.step_results = step_results
            execution.current_step = i
            execution.status = "failed"
            execution.error = error_msg
            execution.completed_at = step_completed.isoformat()
            await db.commit()
            _cancel_flags.pop(execution.id, None)

            yield {"type": "step_failed", "step_order": i, "error": error_msg}
            yield {"type": "execution_failed", "execution_id": execution.id, "error": error_msg}
            return

    # All steps completed
    execution.status = "completed"
    execution.completed_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    _cancel_flags.pop(execution.id, None)
    yield {"type": "execution_completed", "execution_id": execution.id}
