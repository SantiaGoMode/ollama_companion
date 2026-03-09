"""Service for managing pending tool actions in the database."""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pending_action import PendingActionModel

logger = logging.getLogger(__name__)


async def store_action(
    db: AsyncSession,
    action_id: str,
    agent_id: str,
    action_type: str,
    details: dict,
) -> None:
    action = PendingActionModel(
        id=action_id,
        agent_id=agent_id,
        action_type=action_type,
        details=json.dumps(details),
    )
    db.add(action)
    await db.commit()


async def get_action(db: AsyncSession, action_id: str) -> dict | None:
    result = await db.execute(
        select(PendingActionModel).where(
            PendingActionModel.id == action_id,
            PendingActionModel.status == "pending",
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        return None

    if action.expires_at and action.expires_at < datetime.now(timezone.utc):
        action.status = "expired"
        await db.commit()
        return None

    return {
        "action_id": action.id,
        "agent_id": action.agent_id,
        "action_type": action.action_type,
        "details": json.loads(action.details),
    }


async def resolve_action(db: AsyncSession, action_id: str, status: str) -> None:
    result = await db.execute(
        select(PendingActionModel).where(PendingActionModel.id == action_id)
    )
    action = result.scalar_one_or_none()
    if action:
        action.status = status
        await db.commit()


async def cleanup_expired(db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        delete(PendingActionModel).where(
            PendingActionModel.expires_at < now,
            PendingActionModel.status == "pending",
        )
    )
    await db.commit()
    count = result.rowcount
    if count:
        logger.info("Cleaned up %d expired pending actions", count)
    return count
