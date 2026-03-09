import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.settings import SettingModel, ModelCapabilityModel

DEFAULT_SETTINGS = {
    "ollama_host": "http://localhost:11434",
    "auto_reconnect_interval": "30",
    "grid_density": "comfortable",
    "conversation_persistence": "keep",
    "max_conversation_length": "100",
    "theme": "dark",
    "default_model_chat": "",
    "default_model_code": "",
    "default_model_summarizer": "",
    "default_model_transformer": "",
    "default_model_generator": "",
    "default_model_file": "",
    "default_prompt_chat": "You are a helpful assistant. Be concise and informative.",
    "default_prompt_code": "You are an expert code reviewer and programmer. Analyze code for bugs, performance issues, and best practices. Provide clear explanations and improved code.",
    "default_prompt_summarizer": "You are an expert summarizer. Extract key points and present them clearly and concisely. Maintain accuracy while reducing verbosity.",
    "default_prompt_transformer": "You are a text transformation specialist. Transform the input according to the given instruction while preserving meaning and intent.",
    "default_prompt_generator": "You are a creative content generator. Produce high-quality, well-structured content based on the given parameters and instructions.",
    "default_prompt_file": "You are a file analysis specialist. Analyze the provided file content thoroughly and provide detailed insights.",
    "default_temp_chat": "0.7",
    "default_temp_code": "0.3",
    "default_temp_summarizer": "0.3",
    "default_temp_transformer": "0.4",
    "default_temp_generator": "0.7",
    "default_temp_file": "0.4",
}

MODEL_FAMILY_CAPABILITIES = {
    "code": ["chat", "code"],
    "coder": ["chat", "code"],
    "deepseek-coder": ["chat", "code"],
    "starcoder": ["chat", "code"],
    "codellama": ["chat", "code"],
    "llama": ["chat", "summarizer", "generator", "transformer"],
    "mistral": ["chat", "summarizer", "generator", "transformer"],
    "gemma": ["chat", "summarizer", "generator", "transformer"],
    "phi": ["chat", "summarizer", "transformer"],
    "qwen": ["chat", "summarizer", "generator", "transformer", "code"],
    "command-r": ["chat", "summarizer", "generator"],
    "llava": ["chat", "file"],
    "bakllava": ["chat", "file"],
    "moondream": ["chat", "file"],
    "dolphin": ["chat", "summarizer", "generator", "transformer"],
    "neural-chat": ["chat", "summarizer"],
    "wizard": ["chat", "code", "generator"],
    "nous-hermes": ["chat", "generator", "transformer"],
    "solar": ["chat", "summarizer", "generator"],
    "yi": ["chat", "summarizer", "generator", "transformer"],
    "orca": ["chat", "summarizer"],
    "vicuna": ["chat", "summarizer", "generator"],
    "zephyr": ["chat", "summarizer", "generator"],
    "tinyllama": ["chat"],
    "nomic-embed": ["embedding"],
    "mxbai-embed": ["embedding"],
    "all-minilm": ["embedding"],
    "snowflake-arctic-embed": ["embedding"],
}

MODEL_FAMILY_DEFAULTS = {
    "codellama": "code",
    "deepseek-coder": "code",
    "starcoder": "code",
    "llava": "file",
    "bakllava": "file",
    "moondream": "file",
}


def detect_capabilities(model_name: str) -> list[str]:
    name_lower = model_name.lower().split(":")[0]

    for family, caps in MODEL_FAMILY_CAPABILITIES.items():
        if family in name_lower:
            return caps

    return ["chat", "summarizer", "generator", "transformer"]


def detect_default_for(model_name: str) -> str:
    name_lower = model_name.lower().split(":")[0]

    for family, default_type in MODEL_FAMILY_DEFAULTS.items():
        if family in name_lower:
            return default_type

    return ""


async def get_setting(db: AsyncSession, key: str) -> str:
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, "")


async def get_all_settings(db: AsyncSession) -> dict[str, str]:
    result = await db.execute(select(SettingModel))
    stored = {s.key: s.value for s in result.scalars().all()}
    merged = {**DEFAULT_SETTINGS, **stored}
    return merged


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    result = await db.execute(select(SettingModel).where(SettingModel.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        db.add(SettingModel(key=key, value=value))
    await db.commit()


async def set_many_settings(db: AsyncSession, settings: dict[str, str]) -> None:
    for key, value in settings.items():
        result = await db.execute(select(SettingModel).where(SettingModel.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(SettingModel(key=key, value=value))
    await db.commit()


async def get_model_capabilities(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(ModelCapabilityModel))
    return [
        {
            "model_name": m.model_name,
            "capabilities": m.capabilities.split(",") if m.capabilities else [],
            "default_for": m.default_for,
            "temperature": m.temperature,
            "context_length": m.context_length,
        }
        for m in result.scalars().all()
    ]


async def upsert_model_capability(
    db: AsyncSession,
    model_name: str,
    capabilities: list[str],
    default_for: str = "",
    temperature: str = "0.7",
    context_length: str = "4096",
) -> None:
    result = await db.execute(
        select(ModelCapabilityModel).where(ModelCapabilityModel.model_name == model_name)
    )
    existing = result.scalar_one_or_none()
    caps_str = ",".join(capabilities)

    if existing:
        existing.capabilities = caps_str
        existing.default_for = default_for
        existing.temperature = temperature
        existing.context_length = context_length
    else:
        db.add(ModelCapabilityModel(
            model_name=model_name,
            capabilities=caps_str,
            default_for=default_for,
            temperature=temperature,
            context_length=context_length,
        ))
    await db.commit()


async def sync_models_from_ollama(db: AsyncSession, ollama_models: list[dict]) -> list[dict]:
    existing = await get_model_capabilities(db)
    existing_names = {m["model_name"] for m in existing}

    for model in ollama_models:
        name = model["name"]
        if name not in existing_names:
            caps = detect_capabilities(name)
            default_for = detect_default_for(name)
            await upsert_model_capability(db, name, caps, default_for)

    return await get_model_capabilities(db)
