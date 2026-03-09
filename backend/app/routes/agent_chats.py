from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models.agent_chat import AgentChatModel, AgentChatMessageModel
from app.models.schemas import (
    AgentChatRequest,
    AgentChatContinueRequest,
    AgentChatResponse,
    AgentChatMessageResponse,
)
from app.services import agent_service
from app.agents.engine import stream_agent_to_agent

router = APIRouter(prefix="/api/agent-chats", tags=["agent-chats"])


def _streaming_response(generator):
    async def sse_wrapper():
        try:
            async for chunk in generator:
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        sse_wrapper(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("")
async def list_agent_chats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentChatModel).order_by(AgentChatModel.updated_at.desc())
    )
    chats = result.scalars().all()
    out = []
    for chat in chats:
        # Get last message for preview
        msg_result = await db.execute(
            select(AgentChatMessageModel)
            .where(AgentChatMessageModel.chat_id == chat.id)
            .order_by(AgentChatMessageModel.turn.desc())
            .limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()

        chat_dict = AgentChatResponse.model_validate(chat).model_dump()
        chat_dict["last_message_preview"] = (
            last_msg.content[:120] + "..." if last_msg and len(last_msg.content) > 120
            else last_msg.content if last_msg else ""
        )
        chat_dict["last_agent_name"] = last_msg.agent_name if last_msg else ""
        out.append(chat_dict)

    return out


@router.get("/{chat_id}")
async def get_agent_chat(chat_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentChatModel).where(AgentChatModel.id == chat_id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Agent chat not found")

    msg_result = await db.execute(
        select(AgentChatMessageModel)
        .where(AgentChatMessageModel.chat_id == chat_id)
        .order_by(AgentChatMessageModel.turn.asc())
    )
    messages = msg_result.scalars().all()

    return {
        **AgentChatResponse.model_validate(chat).model_dump(),
        "messages": [AgentChatMessageResponse.model_validate(m).model_dump() for m in messages],
    }


@router.post("")
async def create_agent_chat(request: AgentChatRequest, db: AsyncSession = Depends(get_db)):
    agent_a = await agent_service.get_agent(db, request.agent_a_id)
    agent_b = await agent_service.get_agent(db, request.agent_b_id)
    if not agent_a:
        raise HTTPException(status_code=404, detail="Agent A not found")
    if not agent_b:
        raise HTTPException(status_code=404, detail="Agent B not found")

    # Create the chat record
    chat = AgentChatModel(
        agent_a_id=agent_a.id,
        agent_b_id=agent_b.id,
        agent_a_name=agent_a.name,
        agent_b_name=agent_b.name,
        agent_a_model=agent_a.model,
        agent_b_model=agent_b.model,
        topic=request.topic,
        total_turns=0,
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)

    chat_id = chat.id

    async def stream_and_save():
        turn_count = 0
        async for line in stream_agent_to_agent(
            agent_a.model, agent_a.system_prompt, agent_a.name,
            agent_b.model, agent_b.system_prompt, agent_b.name,
            request.topic,
            request.max_turns,
        ):
            # Parse to save messages to DB
            import json
            try:
                event = json.loads(line.strip())
            except (json.JSONDecodeError, ValueError):
                yield line
                continue

            if event.get("type") == "turn_end":
                turn_count += 1
                msg = AgentChatMessageModel(
                    chat_id=chat_id,
                    turn=event["turn"],
                    agent_id=agent_a.id if event["agent_name"] == agent_a.name else agent_b.id,
                    agent_name=event["agent_name"],
                    content=event.get("full_content", ""),
                )
                db.add(msg)
                await db.commit()

            # Add chat_id to events so frontend can track
            event["chat_id"] = chat_id
            yield json.dumps(event) + "\n"

        # Update total turns
        result = await db.execute(
            select(AgentChatModel).where(AgentChatModel.id == chat_id)
        )
        chat_record = result.scalar_one_or_none()
        if chat_record:
            chat_record.total_turns = turn_count
            chat_record.updated_at = datetime.now(timezone.utc)
            await db.commit()

    return _streaming_response(stream_and_save())


@router.post("/{chat_id}/continue")
async def continue_agent_chat(
    chat_id: str,
    request: AgentChatContinueRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentChatModel).where(AgentChatModel.id == chat_id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Agent chat not found")

    agent_a = await agent_service.get_agent(db, chat.agent_a_id)
    agent_b = await agent_service.get_agent(db, chat.agent_b_id)
    if not agent_a or not agent_b:
        raise HTTPException(status_code=404, detail="One of the agents no longer exists")

    # Load existing messages
    msg_result = await db.execute(
        select(AgentChatMessageModel)
        .where(AgentChatMessageModel.chat_id == chat_id)
        .order_by(AgentChatMessageModel.turn.asc())
    )
    existing_messages = msg_result.scalars().all()

    prior_messages = [
        {"agent_name": m.agent_name, "content": m.content}
        for m in existing_messages
    ]

    topic = request.redirect_topic or chat.topic
    start_turn_offset = len(existing_messages)

    async def stream_and_save():
        turn_count = 0
        async for line in stream_agent_to_agent(
            agent_a.model, agent_a.system_prompt, agent_a.name,
            agent_b.model, agent_b.system_prompt, agent_b.name,
            topic,
            request.max_turns,
            prior_messages=prior_messages,
            start_turn_offset=start_turn_offset,
        ):
            import json
            try:
                event = json.loads(line.strip())
            except (json.JSONDecodeError, ValueError):
                yield line
                continue

            if event.get("type") == "turn_end":
                turn_count += 1
                msg = AgentChatMessageModel(
                    chat_id=chat_id,
                    turn=event["turn"],
                    agent_id=agent_a.id if event["agent_name"] == agent_a.name else agent_b.id,
                    agent_name=event["agent_name"],
                    content=event.get("full_content", ""),
                )
                db.add(msg)
                await db.commit()

            event["chat_id"] = chat_id
            yield json.dumps(event) + "\n"

        # Update total turns and topic if redirected
        result = await db.execute(
            select(AgentChatModel).where(AgentChatModel.id == chat_id)
        )
        chat_record = result.scalar_one_or_none()
        if chat_record:
            chat_record.total_turns = start_turn_offset + turn_count
            chat_record.updated_at = datetime.now(timezone.utc)
            if request.redirect_topic:
                chat_record.topic = request.redirect_topic
            await db.commit()

    return _streaming_response(stream_and_save())


@router.delete("/{chat_id}", status_code=204)
async def delete_agent_chat(chat_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentChatModel).where(AgentChatModel.id == chat_id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Agent chat not found")

    # Delete messages first
    msg_result = await db.execute(
        select(AgentChatMessageModel).where(AgentChatMessageModel.chat_id == chat_id)
    )
    for msg in msg_result.scalars().all():
        await db.delete(msg)

    await db.delete(chat)
    await db.commit()
