import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from pydantic import BaseModel as PydanticBaseModel
from app.models.schemas import (
    ChatRequest,
    CodeRequest,
    SummaryRequest,
    TransformRequest,
    GeneratorRequest,
    ActionApproval,
    AgentChatRequest,
)
from app.services import agent_service
from app.services.agent_service import record_usage
from app.services.kb_service import get_agent_collection_names
from app.services.settings_service import get_setting
from app.services import pending_action_service
from app.agents.engine import (
    stream_chat,
    stream_chat_with_tools,
    stream_chat_with_rag,
    stream_code_review,
    stream_summary,
    stream_transform,
    stream_generate,
    stream_agent_to_agent,
)
from app.agents.tools import create_filesystem_tools, _validate_path, _validate_command
from app.services.mcp_service import get_mcp_tools_for_agent
from app.agents.mcp_bridge import create_mcp_langchain_tools

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


async def _sse_wrapper(generator, local_actions: dict | None = None):
    try:
        async for chunk in generator:
            escaped = chunk.replace("\n", "\\n")
            yield f"data: {escaped}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n"
    finally:
        if local_actions:
            try:
                async with async_session() as db:
                    for action_id, action_data in local_actions.items():
                        await pending_action_service.store_action(
                            db,
                            action_id,
                            action_data.get("agent_id", ""),
                            action_data["action_type"],
                            action_data["details"],
                        )
            except Exception as e:
                logger.error("Failed to persist pending actions: %s", e)


def _streaming_response(generator, local_actions: dict | None = None):
    return StreamingResponse(
        _sse_wrapper(generator, local_actions),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/message")
async def chat_message(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    messages = [{"role": m.role, "content": m.content, "images": m.images} for m in request.messages]

    await record_usage(db, request.agent_id)

    # Resolve temperature for this agent type
    agent_type_str = agent.agent_type.value if agent.agent_type else "chat"
    temp_setting = await get_setting(db, f"default_temp_{agent_type_str}")
    temperature = float(temp_setting) if temp_setting else 0.7

    collection_names = await get_agent_collection_names(db, request.agent_id)

    # Gather MCP tools for this agent
    mcp_tools = []
    mcp_connections = await get_mcp_tools_for_agent(db, request.agent_id)
    for _sid, conn in mcp_connections:
        from app.services.mcp_service import get_mcp_server
        server_model = await get_mcp_server(db, _sid)
        server_name = server_model.name if server_model else _sid
        mcp_tools.extend(create_mcp_langchain_tools(conn, server_name))

    has_tools = (agent.tools_enabled and agent.allowed_directories) or len(mcp_tools) > 0

    local_actions: dict[str, dict] = {}

    if has_tools:
        generator = stream_chat_with_tools(
            agent.model,
            agent.system_prompt,
            messages,
            agent.allowed_directories if agent.tools_enabled else [],
            agent.confirmation_mode.value if agent.confirmation_mode else "confirm",
            pending_actions=local_actions,
            extra_tools=mcp_tools if mcp_tools else None,
            temperature=min(temperature, 0.4),
            agent_type=agent_type_str,
        )
        return _streaming_response(generator, local_actions)
    elif collection_names:
        generator = stream_chat_with_rag(
            agent.model,
            agent.system_prompt,
            messages,
            collection_names,
            temperature=temperature,
            agent_type=agent_type_str,
        )
    else:
        generator = stream_chat(agent.model, agent.system_prompt, messages, temperature=temperature, agent_type=agent_type_str)

    return _streaming_response(generator)


@router.post("/action/approve")
async def approve_action(approval: ActionApproval, db: AsyncSession = Depends(get_db)):
    action = await pending_action_service.get_action(db, approval.action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Action not found or expired")

    if not approval.approved:
        await pending_action_service.resolve_action(db, approval.action_id, "rejected")
        return {"status": "rejected", "action_id": approval.action_id}

    agent = await agent_service.get_agent(db, action["agent_id"])
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    tools = create_filesystem_tools(agent.allowed_directories)
    tool_map = {t.name: t for t in tools}

    action_type = action["action_type"]
    details = action["details"]

    tool_name_map = {
        "write_file": "write_file",
        "edit_file": "edit_file",
        "run_command": "run_command",
    }

    actual_tool = tool_name_map.get(action_type)
    if not actual_tool or actual_tool not in tool_map:
        await pending_action_service.resolve_action(db, approval.action_id, "rejected")
        raise HTTPException(status_code=400, detail=f"Unknown action type: {action_type}")

    try:
        result = tool_map[actual_tool].invoke(details)
        await pending_action_service.resolve_action(db, approval.action_id, "approved")
        return {"status": "executed", "action_id": approval.action_id, "result": str(result)}
    except Exception as e:
        await pending_action_service.resolve_action(db, approval.action_id, "rejected")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/code")
async def code_review(request: CodeRequest, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    generator = stream_code_review(
        agent.model, agent.system_prompt, request.code, request.language, request.instruction
    )
    return _streaming_response(generator)


@router.post("/summarize")
async def summarize(request: SummaryRequest, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    generator = stream_summary(agent.model, agent.system_prompt, request.content, request.source_type)
    return _streaming_response(generator)


@router.post("/transform")
async def transform(request: TransformRequest, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    generator = stream_transform(
        agent.model, agent.system_prompt, request.content, request.target_format, request.instruction
    )
    return _streaming_response(generator)


@router.post("/generate")
async def generate(request: GeneratorRequest, db: AsyncSession = Depends(get_db)):
    agent = await agent_service.get_agent(db, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    generator = stream_generate(
        agent.model, agent.system_prompt, request.parameters, request.instruction
    )
    return _streaming_response(generator)


@router.post("/agent-to-agent")
async def agent_to_agent_chat(request: AgentChatRequest, db: AsyncSession = Depends(get_db)):
    agent_a = await agent_service.get_agent(db, request.agent_a_id)
    agent_b = await agent_service.get_agent(db, request.agent_b_id)
    if not agent_a:
        raise HTTPException(status_code=404, detail="Agent A not found")
    if not agent_b:
        raise HTTPException(status_code=404, detail="Agent B not found")

    async def sse_wrapper():
        try:
            async for line in stream_agent_to_agent(
                agent_a.model, agent_a.system_prompt, agent_a.name,
                agent_b.model, agent_b.system_prompt, agent_b.name,
                request.topic,
                request.max_turns,
            ):
                yield f"data: {line}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        sse_wrapper(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


class WebhookRequest(PydanticBaseModel):
    message: str
    webhook_secret: str = ""


@router.post("/webhook/{agent_id}")
async def webhook_trigger(agent_id: str, request: WebhookRequest, db: AsyncSession = Depends(get_db)):
    """Trigger an agent via webhook. Returns the full response (non-streaming)."""
    agent = await agent_service.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    await record_usage(db, agent_id)

    messages = [{"role": "user", "content": request.message, "images": []}]
    agent_type_str = agent.agent_type.value if agent.agent_type else "chat"

    response_text = ""
    async for chunk in stream_chat(agent.model, agent.system_prompt, messages, agent_type=agent_type_str):
        response_text += chunk

    return {
        "agent_id": agent_id,
        "agent_name": agent.name,
        "input": request.message,
        "response": response_text,
    }
