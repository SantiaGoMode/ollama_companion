from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.services import settings_service
from app.services.ollama_service import get_available_models

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    settings: dict[str, str]


class ModelCapabilityUpdate(BaseModel):
    model_name: str
    capabilities: list[str]
    default_for: str = ""
    temperature: str = "0.7"
    context_length: str = "4096"


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await settings_service.get_all_settings(db)


@router.put("")
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    await settings_service.set_many_settings(db, data.settings)
    return await settings_service.get_all_settings(db)


@router.get("/models")
async def get_model_capabilities(db: AsyncSession = Depends(get_db)):
    return await settings_service.get_model_capabilities(db)


@router.put("/models")
async def update_model_capability(data: ModelCapabilityUpdate, db: AsyncSession = Depends(get_db)):
    await settings_service.upsert_model_capability(
        db, data.model_name, data.capabilities, data.default_for, data.temperature, data.context_length
    )
    return await settings_service.get_model_capabilities(db)


@router.post("/models/sync")
async def sync_models(db: AsyncSession = Depends(get_db)):
    ollama_models = await get_available_models()
    synced = await settings_service.sync_models_from_ollama(db, ollama_models)
    return {"models": synced, "count": len(synced)}


@router.post("/models/pull")
async def pull_model(data: dict, db: AsyncSession = Depends(get_db)):
    model_name = data.get("model_name", "")
    if not model_name:
        return {"error": "model_name is required"}

    from app.services.ollama_service import pull_ollama_model
    result = await pull_ollama_model(model_name)
    if result:
        ollama_models = await get_available_models()
        await settings_service.sync_models_from_ollama(db, ollama_models)
    return {"success": result, "model": model_name}


@router.get("/defaults/{agent_type}")
async def get_agent_type_defaults(agent_type: str, db: AsyncSession = Depends(get_db)):
    settings = await settings_service.get_all_settings(db)
    return {
        "model": settings.get(f"default_model_{agent_type}", ""),
        "system_prompt": settings.get(f"default_prompt_{agent_type}", ""),
        "temperature": settings.get(f"default_temp_{agent_type}", "0.7"),
    }
