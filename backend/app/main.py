from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.logging_config import setup_logging
from app.services.workflow_scheduler import start_scheduler, stop_scheduler
from app.services.mcp_service import stop_all_mcp_servers, start_mcp_health_monitor
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routes import agents, chat, ollama, settings, knowledge, conversations, workflows, mcp, agent_chats

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
).split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    await init_db()
    start_scheduler()
    start_mcp_health_monitor()
    yield
    stop_scheduler()
    await stop_all_mcp_servers()


app = FastAPI(
    title="AI Agent Hub",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(chat.router)
app.include_router(ollama.router)
app.include_router(settings.router)
app.include_router(knowledge.router)
app.include_router(conversations.router)
app.include_router(workflows.router)
app.include_router(mcp.router)
app.include_router(agent_chats.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health/deep")
async def deep_health():
    """Check all service dependencies."""
    from app.services.ollama_service import check_ollama_status, get_available_models
    from app.database import async_session
    from sqlalchemy import text

    checks: dict[str, dict] = {}

    # Database
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = {"status": "ok"}
    except Exception as e:
        checks["database"] = {"status": "error", "detail": str(e)}

    # Ollama
    try:
        is_running = await check_ollama_status()
        if is_running:
            models = await get_available_models()
            checks["ollama"] = {"status": "ok", "models": len(models)}
        else:
            checks["ollama"] = {"status": "error", "detail": "Not reachable"}
    except Exception as e:
        checks["ollama"] = {"status": "error", "detail": str(e)}

    # ChromaDB
    try:
        import chromadb
        client = chromadb.PersistentClient(path="./chroma_data")
        collections = client.list_collections()
        checks["chromadb"] = {"status": "ok", "collections": len(collections)}
    except Exception as e:
        checks["chromadb"] = {"status": "error", "detail": str(e)}

    # MCP servers
    try:
        from app.services.mcp_service import _connections
        running = len(_connections)
        checks["mcp"] = {"status": "ok", "running_servers": running}
    except Exception as e:
        checks["mcp"] = {"status": "error", "detail": str(e)}

    all_ok = all(c["status"] == "ok" for c in checks.values())
    return {"status": "ok" if all_ok else "degraded", "checks": checks}
