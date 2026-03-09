import httpx
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


def get_ollama_url() -> str:
    return OLLAMA_BASE_URL


def set_ollama_url(url: str) -> None:
    global OLLAMA_BASE_URL
    OLLAMA_BASE_URL = url


async def get_available_models() -> list[dict]:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10.0)
            response.raise_for_status()
            data = response.json()
            return [
                {
                    "name": m["name"],
                    "size": m.get("size", 0),
                    "modified_at": m.get("modified_at", ""),
                    "details": m.get("details", {}),
                }
                for m in data.get("models", [])
            ]
        except httpx.ConnectError:
            return []
        except httpx.HTTPStatusError:
            return []


async def check_ollama_status() -> bool:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{OLLAMA_BASE_URL}/", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False


async def pull_ollama_model(model_name: str) -> bool:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/pull",
                json={"name": model_name, "stream": False},
                timeout=600.0,
            )
            return response.status_code == 200
        except Exception:
            return False


async def get_model_info(model_name: str) -> dict:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/show",
                json={"name": model_name},
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()
        except Exception:
            return {}
