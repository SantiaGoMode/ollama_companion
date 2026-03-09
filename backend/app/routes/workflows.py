import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.workflow_schemas import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    ExecutionResponse,
    ExecuteWorkflowRequest,
)
from app.services.workflow_service import (
    create_workflow,
    get_all_workflows,
    get_workflow,
    update_workflow,
    delete_workflow,
    get_execution,
    get_workflow_executions,
    execute_workflow,
    cancel_execution,
)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


# ─── Execution routes (must come before /{workflow_id} to avoid conflict) ───

@router.post("/executions/{execution_id}/resume")
async def resume(execution_id: str, db: AsyncSession = Depends(get_db)):
    execution = await get_execution(db, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    workflow = await get_workflow(db, execution.workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    async def stream_events():
        async for event in execute_workflow(
            db=db,
            workflow=workflow,
            resume_execution_id=execution_id,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/executions/{execution_id}/cancel")
async def cancel_exec(execution_id: str, db: AsyncSession = Depends(get_db)):
    cancelled = await cancel_execution(db, execution_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Execution not found or not running")
    return {"status": "cancelled", "execution_id": execution_id}


@router.get("/executions/{execution_id}", response_model=ExecutionResponse)
async def get_exec(execution_id: str, db: AsyncSession = Depends(get_db)):
    execution = await get_execution(db, execution_id)
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


# ─── Workflow CRUD ───

@router.post("", response_model=WorkflowResponse)
async def create(data: WorkflowCreate, db: AsyncSession = Depends(get_db)):
    workflow = await create_workflow(db, data)
    return workflow


@router.get("", response_model=list[WorkflowResponse])
async def list_all(db: AsyncSession = Depends(get_db)):
    return await get_all_workflows(db)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_one(workflow_id: str, db: AsyncSession = Depends(get_db)):
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update(workflow_id: str, data: WorkflowUpdate, db: AsyncSession = Depends(get_db)):
    workflow = await update_workflow(db, workflow_id, data)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.delete("/{workflow_id}")
async def remove(workflow_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_workflow(db, workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"status": "deleted"}


@router.post("/{workflow_id}/execute")
async def execute(workflow_id: str, body: ExecuteWorkflowRequest, db: AsyncSession = Depends(get_db)):
    workflow = await get_workflow(db, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    async def stream_events():
        async for event in execute_workflow(
            db=db,
            workflow=workflow,
            initial_input=body.initial_input,
            trigger=body.trigger,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{workflow_id}/executions", response_model=list[ExecutionResponse])
async def list_executions(workflow_id: str, db: AsyncSession = Depends(get_db)):
    return await get_workflow_executions(db, workflow_id)
