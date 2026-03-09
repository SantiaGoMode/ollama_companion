from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.conversation import ConversationModel

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class MessageItem(BaseModel):
    role: str
    content: str


class SaveRequest(BaseModel):
    messages: list[MessageItem]


@router.get("/{agent_id}")
async def load_conversation(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ConversationModel).where(ConversationModel.agent_id == agent_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        return []
    return conv.get_messages()


@router.put("/{agent_id}")
async def save_conversation(agent_id: str, req: SaveRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ConversationModel).where(ConversationModel.agent_id == agent_id)
    )
    conv = result.scalar_one_or_none()

    if conv:
        conv.set_messages([m.model_dump() for m in req.messages])
    else:
        conv = ConversationModel(agent_id=agent_id)
        conv.set_messages([m.model_dump() for m in req.messages])
        db.add(conv)

    await db.commit()
    return {"status": "saved"}


@router.delete("/{agent_id}", status_code=204)
async def delete_conversation(agent_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ConversationModel).where(ConversationModel.agent_id == agent_id)
    )
    conv = result.scalar_one_or_none()
    if conv:
        await db.delete(conv)
        await db.commit()
