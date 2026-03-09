from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.mcp_schemas import (
    MCPServerCreate,
    MCPServerUpdate,
    MCPServerResponse,
    MCPToolSchema,
    LinkAgentMCPRequest,
)
from app.services.mcp_service import (
    create_mcp_server,
    get_all_mcp_servers,
    get_mcp_server,
    update_mcp_server,
    delete_mcp_server,
    set_agent_mcps,
    get_agent_mcps,
    get_agent_mcp_ids,
    test_mcp_server,
    get_mcp_connection,
    start_mcp_server,
    get_mcp_health,
)
from app.utils.crypto import decrypt_env, mask_env

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _server_to_response(server) -> dict:
    """Convert MCP server model to response dict with masked env vars."""
    decrypted = decrypt_env(server.env) if server.env else {}
    return {
        "id": server.id,
        "name": server.name,
        "description": server.description,
        "transport": server.transport,
        "command": server.command,
        "args": server.args or [],
        "env": mask_env(decrypted),
        "url": server.url,
        "icon": server.icon,
        "color": server.color,
        "enabled": server.enabled,
        "preset_id": server.preset_id,
        "created_at": server.created_at,
        "updated_at": server.updated_at,
    }


@router.get("/health")
async def mcp_health():
    return get_mcp_health()


@router.post("/servers", response_model=MCPServerResponse)
async def create(data: MCPServerCreate, db: AsyncSession = Depends(get_db)):
    server = await create_mcp_server(db, data)
    return _server_to_response(server)


@router.get("/servers", response_model=list[MCPServerResponse])
async def list_all(db: AsyncSession = Depends(get_db)):
    servers = await get_all_mcp_servers(db)
    return [_server_to_response(s) for s in servers]


@router.get("/servers/{server_id}", response_model=MCPServerResponse)
async def get_one(server_id: str, db: AsyncSession = Depends(get_db)):
    server = await get_mcp_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return _server_to_response(server)


@router.patch("/servers/{server_id}", response_model=MCPServerResponse)
async def update(server_id: str, data: MCPServerUpdate, db: AsyncSession = Depends(get_db)):
    server = await update_mcp_server(db, server_id, data)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return _server_to_response(server)


@router.delete("/servers/{server_id}")
async def remove(server_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await delete_mcp_server(db, server_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return {"status": "deleted"}


@router.post("/servers/{server_id}/test")
async def test_server(server_id: str, db: AsyncSession = Depends(get_db)):
    result = await test_mcp_server(db, server_id)
    return result


@router.get("/servers/{server_id}/tools")
async def list_tools(server_id: str, db: AsyncSession = Depends(get_db)):
    server = await get_mcp_server(db, server_id)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    conn = await get_mcp_connection(server_id)
    if not conn:
        try:
            conn = await start_mcp_server(server)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    tools = conn.tools or []
    return {
        "server_id": server_id,
        "server_name": server.name,
        "tools": [
            MCPToolSchema(
                name=t.get("name", ""),
                description=t.get("description", ""),
                server_id=server_id,
                server_name=server.name,
                input_schema=t.get("inputSchema", {}),
            ).model_dump()
            for t in tools
        ],
    }


@router.post("/agents/link")
async def link_agent(body: LinkAgentMCPRequest, db: AsyncSession = Depends(get_db)):
    await set_agent_mcps(db, body.agent_id, body.mcp_server_ids)
    return {"status": "ok"}


@router.get("/agents/{agent_id}/linked", response_model=list[MCPServerResponse])
async def get_linked(agent_id: str, db: AsyncSession = Depends(get_db)):
    servers = await get_agent_mcps(db, agent_id)
    return [_server_to_response(s) for s in servers]


@router.get("/agents/{agent_id}/linked-ids")
async def get_linked_ids(agent_id: str, db: AsyncSession = Depends(get_db)):
    ids = await get_agent_mcp_ids(db, agent_id)
    return {"mcp_server_ids": ids}
