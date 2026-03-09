"""Bridge between MCP server tools and LangChain tools."""
import asyncio
import json
from typing import Any
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, create_model

from app.services.mcp_service import MCPConnection


def _build_pydantic_model(tool_name: str, input_schema: dict) -> type[BaseModel]:
    """Convert a JSON Schema from an MCP tool into a Pydantic model for LangChain."""
    properties = input_schema.get("properties", {})
    required = set(input_schema.get("required", []))

    fields: dict[str, Any] = {}
    for prop_name, prop_schema in properties.items():
        prop_type = prop_schema.get("type", "string")
        type_map = {
            "string": str,
            "integer": int,
            "number": float,
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        python_type = type_map.get(prop_type, str)
        default = ... if prop_name in required else prop_schema.get("default", None)
        fields[prop_name] = (python_type, default)

    if not fields:
        fields["input"] = (str, "")

    model_name = f"MCP_{tool_name}_Input"
    return create_model(model_name, **fields)


def create_mcp_langchain_tools(
    connection: MCPConnection,
    server_name: str,
) -> list[StructuredTool]:
    """Convert MCP tools from a connection into LangChain StructuredTools."""
    lc_tools = []

    for mcp_tool in connection.tools:
        tool_name = mcp_tool.get("name", "")
        description = mcp_tool.get("description", f"Tool from {server_name}")
        input_schema = mcp_tool.get("inputSchema", {})

        # Prefix tool name with server name to avoid collisions
        qualified_name = f"{server_name}__{tool_name}".replace("-", "_").replace(" ", "_")

        args_model = _build_pydantic_model(tool_name, input_schema)

        # Capture variables in closure
        _conn = connection
        _tool_name = tool_name

        def make_sync_caller(conn: MCPConnection, tn: str):
            def call_tool(**kwargs) -> str:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(asyncio.run, conn.call_tool(tn, kwargs))
                        return future.result(timeout=60)
                else:
                    return asyncio.run(conn.call_tool(tn, kwargs))
            return call_tool

        async def make_async_caller(conn: MCPConnection, tn: str):
            async def call_tool(**kwargs) -> str:
                return await conn.call_tool(tn, kwargs)
            return call_tool

        sync_fn = make_sync_caller(_conn, _tool_name)

        tool = StructuredTool(
            name=qualified_name,
            description=f"[{server_name}] {description}",
            func=sync_fn,
            args_schema=args_model,
        )
        lc_tools.append(tool)

    return lc_tools
