import uuid
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.mcp_server import MCPServerModel, AgentMCPLinkModel
from app.models.mcp_schemas import MCPServerCreate, MCPServerUpdate
from app.utils.crypto import encrypt_env, decrypt_env

logger = logging.getLogger(__name__)

# ─── In-memory MCP process manager ──────────────────────────

class MCPConnection:
    """Manages a running MCP server subprocess (stdio transport)."""

    def __init__(self, server_id: str, process: asyncio.subprocess.Process):
        self.server_id = server_id
        self.process = process
        self._request_id = 0
        self._lock = asyncio.Lock()
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: Optional[asyncio.Task] = None
        self.tools: list[dict] = []
        self.healthy: bool = True
        self.last_ping_at: Optional[datetime] = None
        self.failed_pings: int = 0

    async def start_reader(self):
        self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        try:
            while True:
                if self.process.stdout is None:
                    break
                line = await self.process.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line.decode().strip())
                    req_id = msg.get("id")
                    if req_id is not None and req_id in self._pending:
                        self._pending[req_id].set_result(msg)
                except (json.JSONDecodeError, Exception):
                    pass
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"MCP reader error for {self.server_id}: {e}")

    async def send_request(self, method: str, params: dict = None, timeout: float = 30.0) -> dict:
        async with self._lock:
            self._request_id += 1
            req_id = self._request_id

        request = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
        }
        if params:
            request["params"] = params

        future = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future

        try:
            if self.process.stdin is None:
                raise RuntimeError("MCP process stdin is None")
            data = json.dumps(request) + "\n"
            self.process.stdin.write(data.encode())
            await self.process.stdin.drain()

            result = await asyncio.wait_for(future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            raise TimeoutError(f"MCP request '{method}' timed out after {timeout}s")
        finally:
            self._pending.pop(req_id, None)

    async def initialize(self):
        response = await self.send_request("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "agent-hub", "version": "1.0.0"},
        })
        # Send initialized notification (no id)
        notif = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"
        if self.process.stdin:
            self.process.stdin.write(notif.encode())
            await self.process.stdin.drain()
        return response

    async def list_tools(self) -> list[dict]:
        response = await self.send_request("tools/list")
        result = response.get("result", {})
        self.tools = result.get("tools", [])
        return self.tools

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        response = await self.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments,
        })
        result = response.get("result", {})
        if "error" in response:
            return f"Error: {response['error'].get('message', 'Unknown error')}"
        content = result.get("content", [])
        texts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item.get("text", ""))
            elif isinstance(item, str):
                texts.append(item)
        return "\n".join(texts) if texts else json.dumps(result)

    async def ping(self) -> bool:
        """Send a ping (tools/list) to verify the server is responsive."""
        try:
            if self.process.returncode is not None:
                self.healthy = False
                return False
            await self.send_request("tools/list", timeout=10.0)
            self.healthy = True
            self.failed_pings = 0
            self.last_ping_at = datetime.now(timezone.utc)
            return True
        except Exception:
            self.failed_pings += 1
            if self.failed_pings >= 3:
                self.healthy = False
            return False

    async def close(self):
        if self._reader_task:
            self._reader_task.cancel()
        try:
            self.process.terminate()
            await asyncio.wait_for(self.process.wait(), timeout=5.0)
        except (asyncio.TimeoutError, ProcessLookupError):
            try:
                self.process.kill()
            except ProcessLookupError:
                pass


# Global connection pool
_connections: dict[str, MCPConnection] = {}


async def start_mcp_server(server: MCPServerModel) -> MCPConnection:
    """Start an MCP server subprocess and initialize it."""
    if server.id in _connections:
        return _connections[server.id]

    if server.transport != "stdio":
        raise ValueError(f"Transport '{server.transport}' not yet supported (only stdio)")

    if not server.command:
        raise ValueError("MCP server has no command configured")

    env = {**os.environ}
    decrypted_env = decrypt_env(server.env) if server.env else {}
    if decrypted_env:
        env.update(decrypted_env)

    cmd_args = [server.command] + (server.args or [])

    process = await asyncio.create_subprocess_exec(
        *cmd_args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )

    conn = MCPConnection(server.id, process)
    await conn.start_reader()

    try:
        await conn.initialize()
        await conn.list_tools()
        _connections[server.id] = conn
        logger.info(f"MCP server '{server.name}' started with {len(conn.tools)} tools")
        return conn
    except Exception as e:
        await conn.close()
        raise RuntimeError(f"Failed to initialize MCP server '{server.name}': {e}")


async def stop_mcp_server(server_id: str):
    conn = _connections.pop(server_id, None)
    if conn:
        await conn.close()
        logger.info(f"MCP server {server_id} stopped")


async def stop_all_mcp_servers():
    stop_mcp_health_monitor()
    for server_id in list(_connections.keys()):
        await stop_mcp_server(server_id)


def get_mcp_health() -> dict[str, dict]:
    """Return health status for all running MCP connections."""
    result = {}
    for server_id, conn in _connections.items():
        result[server_id] = {
            "healthy": conn.healthy,
            "last_ping_at": conn.last_ping_at.isoformat() if conn.last_ping_at else None,
            "failed_pings": conn.failed_pings,
            "tool_count": len(conn.tools),
            "process_alive": conn.process.returncode is None,
        }
    return result


# ─── Health Monitor Background Task ──────────────────────────

_health_task: Optional[asyncio.Task] = None


async def _health_check_loop():
    """Ping all MCP connections every 30s, auto-restart on 3 consecutive failures."""
    from app.database import async_session as get_session

    while True:
        await asyncio.sleep(30)
        for server_id in list(_connections.keys()):
            conn = _connections.get(server_id)
            if not conn:
                continue

            alive = await conn.ping()
            if not alive and conn.failed_pings >= 3:
                logger.warning("MCP server %s unresponsive after 3 pings, restarting", server_id)
                await stop_mcp_server(server_id)
                try:
                    async with get_session() as db:
                        server_result = await db.execute(
                            select(MCPServerModel).where(
                                MCPServerModel.id == server_id,
                                MCPServerModel.enabled == True,
                            )
                        )
                        server = server_result.scalar_one_or_none()
                        if server:
                            await start_mcp_server(server)
                            logger.info("MCP server %s restarted successfully", server_id)
                except Exception as e:
                    logger.error("Failed to restart MCP server %s: %s", server_id, e)


def start_mcp_health_monitor():
    global _health_task
    if _health_task is None or _health_task.done():
        _health_task = asyncio.create_task(_health_check_loop())
        logger.info("MCP health monitor started")


def stop_mcp_health_monitor():
    global _health_task
    if _health_task and not _health_task.done():
        _health_task.cancel()
        logger.info("MCP health monitor stopped")
    _health_task = None


async def get_mcp_connection(server_id: str) -> Optional[MCPConnection]:
    return _connections.get(server_id)


async def get_mcp_tools_for_agent(db: AsyncSession, agent_id: str) -> list[tuple[str, MCPConnection]]:
    """Get all MCP connections for an agent, starting servers as needed."""
    result = await db.execute(
        select(AgentMCPLinkModel.mcp_server_id).where(AgentMCPLinkModel.agent_id == agent_id)
    )
    server_ids = [row[0] for row in result.all()]

    if not server_ids:
        return []

    connections = []
    for sid in server_ids:
        conn = _connections.get(sid)
        if not conn:
            server_result = await db.execute(
                select(MCPServerModel).where(MCPServerModel.id == sid, MCPServerModel.enabled == True)
            )
            server = server_result.scalar_one_or_none()
            if server:
                try:
                    conn = await start_mcp_server(server)
                except Exception as e:
                    logger.error(f"Failed to start MCP server {server.name}: {e}")
                    continue
        if conn:
            connections.append((sid, conn))

    return connections


# ─── CRUD ──────────────────────────────────────────────────

async def create_mcp_server(db: AsyncSession, data: MCPServerCreate) -> MCPServerModel:
    server = MCPServerModel(
        name=data.name,
        description=data.description,
        transport=data.transport,
        command=data.command,
        args=data.args,
        env=encrypt_env(data.env),
        url=data.url,
        icon=data.icon,
        color=data.color,
        enabled=data.enabled,
        preset_id=data.preset_id,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


async def get_all_mcp_servers(db: AsyncSession) -> list[MCPServerModel]:
    result = await db.execute(select(MCPServerModel).order_by(MCPServerModel.created_at.desc()))
    return list(result.scalars().all())


async def get_mcp_server(db: AsyncSession, server_id: str) -> Optional[MCPServerModel]:
    result = await db.execute(select(MCPServerModel).where(MCPServerModel.id == server_id))
    return result.scalar_one_or_none()


async def update_mcp_server(db: AsyncSession, server_id: str, data: MCPServerUpdate) -> Optional[MCPServerModel]:
    server = await get_mcp_server(db, server_id)
    if not server:
        return None
    update_data = data.model_dump(exclude_unset=True)
    if "env" in update_data and update_data["env"] is not None:
        update_data["env"] = encrypt_env(update_data["env"])
    for key, value in update_data.items():
        setattr(server, key, value)
    server.updated_at = datetime.now(timezone.utc).isoformat()
    # If server is running, restart it to pick up changes
    if server_id in _connections:
        await stop_mcp_server(server_id)
    await db.commit()
    await db.refresh(server)
    return server


async def delete_mcp_server(db: AsyncSession, server_id: str) -> bool:
    server = await get_mcp_server(db, server_id)
    if not server:
        return False
    await stop_mcp_server(server_id)
    await db.execute(delete(AgentMCPLinkModel).where(AgentMCPLinkModel.mcp_server_id == server_id))
    await db.delete(server)
    await db.commit()
    return True


async def set_agent_mcps(db: AsyncSession, agent_id: str, mcp_server_ids: list[str]):
    await db.execute(delete(AgentMCPLinkModel).where(AgentMCPLinkModel.agent_id == agent_id))
    for sid in mcp_server_ids:
        db.add(AgentMCPLinkModel(agent_id=agent_id, mcp_server_id=sid))
    await db.commit()


async def get_agent_mcp_ids(db: AsyncSession, agent_id: str) -> list[str]:
    result = await db.execute(
        select(AgentMCPLinkModel.mcp_server_id).where(AgentMCPLinkModel.agent_id == agent_id)
    )
    return [row[0] for row in result.all()]


async def get_agent_mcps(db: AsyncSession, agent_id: str) -> list[MCPServerModel]:
    result = await db.execute(
        select(MCPServerModel)
        .join(AgentMCPLinkModel, MCPServerModel.id == AgentMCPLinkModel.mcp_server_id)
        .where(AgentMCPLinkModel.agent_id == agent_id)
    )
    return list(result.scalars().all())


async def test_mcp_server(db: AsyncSession, server_id: str) -> dict:
    """Test an MCP server by starting it, listing tools, then stopping."""
    server = await get_mcp_server(db, server_id)
    if not server:
        return {"status": "error", "error": "Server not found"}

    try:
        conn = await start_mcp_server(server)
        tools = conn.tools
        tool_names = [t.get("name", "") for t in tools]
        # Keep it running since it was just started
        return {"status": "ok", "tools": tool_names, "tool_count": len(tools)}
    except Exception as e:
        return {"status": "error", "error": str(e)}
