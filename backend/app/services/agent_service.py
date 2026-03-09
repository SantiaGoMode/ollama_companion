from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_
from typing import Optional
from datetime import datetime, timezone
import logging

from app.models.agent import AgentModel
from app.models.schemas import AgentCreate, AgentUpdate
from app.models.conversation import ConversationModel
from app.models.agent_chat import AgentChatModel, AgentChatMessageModel
from app.models.knowledge_base import AgentKnowledgeBaseLink
from app.models.mcp_server import AgentMCPLinkModel

logger = logging.getLogger(__name__)


async def create_agent(db: AsyncSession, agent_data: AgentCreate) -> AgentModel:
    agent = AgentModel(**agent_data.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def get_all_agents(db: AsyncSession) -> list[AgentModel]:
    result = await db.execute(
        select(AgentModel).order_by(AgentModel.sort_order.asc(), AgentModel.created_at.desc())
    )
    return list(result.scalars().all())


async def reorder_agents(db: AsyncSession, ordered_ids: list[str]) -> bool:
    for i, agent_id in enumerate(ordered_ids):
        agent = await get_agent(db, agent_id)
        if agent:
            agent.sort_order = i
    await db.commit()
    return True


async def get_agent(db: AsyncSession, agent_id: str) -> Optional[AgentModel]:
    result = await db.execute(select(AgentModel).where(AgentModel.id == agent_id))
    return result.scalar_one_or_none()


async def update_agent(db: AsyncSession, agent_id: str, agent_data: AgentUpdate) -> Optional[AgentModel]:
    agent = await get_agent(db, agent_id)
    if not agent:
        return None
    update_data = agent_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(agent, key, value)
    await db.commit()
    await db.refresh(agent)
    return agent


async def record_usage(db: AsyncSession, agent_id: str) -> None:
    agent = await get_agent(db, agent_id)
    if agent:
        agent.message_count = (agent.message_count or 0) + 1
        agent.last_used_at = datetime.now(timezone.utc)
        await db.commit()


async def delete_agent(db: AsyncSession, agent_id: str) -> bool:
    agent = await get_agent(db, agent_id)
    if not agent:
        return False

    # Clean up all related records before deleting the agent

    # 1. Conversation history
    await db.execute(
        delete(ConversationModel).where(ConversationModel.agent_id == agent_id)
    )

    # 2. Agent-to-agent chats: delete messages first, then chats
    chat_result = await db.execute(
        select(AgentChatModel.id).where(
            or_(
                AgentChatModel.agent_a_id == agent_id,
                AgentChatModel.agent_b_id == agent_id,
            )
        )
    )
    chat_ids = [row[0] for row in chat_result.all()]
    if chat_ids:
        await db.execute(
            delete(AgentChatMessageModel).where(
                AgentChatMessageModel.chat_id.in_(chat_ids)
            )
        )
        await db.execute(
            delete(AgentChatModel).where(AgentChatModel.id.in_(chat_ids))
        )

    # 3. Knowledge base links
    await db.execute(
        delete(AgentKnowledgeBaseLink).where(
            AgentKnowledgeBaseLink.agent_id == agent_id
        )
    )

    # 4. MCP server links
    await db.execute(
        delete(AgentMCPLinkModel).where(AgentMCPLinkModel.agent_id == agent_id)
    )

    # 5. Delete the agent itself
    await db.delete(agent)
    await db.commit()
    logger.info("Deleted agent %s and all related records", agent_id)
    return True
