from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, event
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./agents.db")


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    """Enable SQLite foreign key enforcement on every connection."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


engine = create_async_engine(DATABASE_URL, echo=False)
event.listen(engine.sync_engine, "connect", _set_sqlite_pragmas)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


_MIGRATIONS = [
    ("agents", "message_count", "ALTER TABLE agents ADD COLUMN message_count INTEGER DEFAULT 0"),
    ("agents", "last_used_at", "ALTER TABLE agents ADD COLUMN last_used_at DATETIME"),
    ("agents", "sort_order", "ALTER TABLE agents ADD COLUMN sort_order INTEGER DEFAULT 0"),
]


async def _run_migrations(conn):
    """Add missing columns to existing tables."""
    for table, column, sql in _MIGRATIONS:
        try:
            result = await conn.execute(text(f"SELECT {column} FROM {table} LIMIT 1"))
        except Exception:
            try:
                await conn.execute(text(sql))
                logger.info(f"Migration: added {table}.{column}")
            except Exception as e:
                logger.warning(f"Migration failed for {table}.{column}: {e}")

    # Migrate plaintext JSON env vars to encrypted format
    await _migrate_mcp_env_encryption(conn)


async def _migrate_mcp_env_encryption(conn):
    """One-time migration: encrypt any plaintext JSON env vars in mcp_servers."""
    import json
    try:
        rows = await conn.execute(text("SELECT id, env FROM mcp_servers WHERE env IS NOT NULL AND env != ''"))
        for row in rows:
            server_id, env_val = row[0], row[1]
            if not env_val:
                continue
            try:
                parsed = json.loads(env_val)
                if isinstance(parsed, dict):
                    from app.utils.crypto import encrypt_env
                    encrypted = encrypt_env(parsed)
                    await conn.execute(
                        text("UPDATE mcp_servers SET env = :env WHERE id = :id"),
                        {"env": encrypted, "id": server_id},
                    )
                    logger.info("Migration: encrypted env vars for MCP server %s", server_id)
            except (json.JSONDecodeError, Exception):
                pass
    except Exception:
        pass


async def init_db():
    import app.models.agent  # noqa: F401
    import app.models.settings  # noqa: F401
    import app.models.knowledge_base  # noqa: F401
    import app.models.conversation  # noqa: F401
    import app.models.workflow  # noqa: F401
    import app.models.mcp_server  # noqa: F401
    import app.models.agent_chat  # noqa: F401
    import app.models.pending_action  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_migrations(conn)
