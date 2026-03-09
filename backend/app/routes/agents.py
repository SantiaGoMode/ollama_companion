from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.schemas import AgentCreate, AgentUpdate, AgentResponse
from app.services import agent_service

router = APIRouter(prefix="/api/agents", tags=["agents"])


class ReorderRequest(BaseModel):
    ordered_ids: list[str] = Field(..., max_length=500)


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(agent_data: AgentCreate, db: AsyncSession = Depends(get_db)):
    return await agent_service.create_agent(db, agent_data)


@router.put("/reorder")
async def reorder_agents(body: ReorderRequest, db: AsyncSession = Depends(get_db)):
    await agent_service.reorder_agents(db, body.ordered_ids)
    return {"status": "ok"}


@router.get("", response_model=list[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    return await agent_service.get_all_agents(db)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, agent_data: AgentUpdate, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.update_agent(db, agent_id, agent_data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await agent_service.delete_agent(db, agent_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Agent not found")
