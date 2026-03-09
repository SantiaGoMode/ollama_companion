import json
import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.ollama_service import (
    get_available_models,
    check_ollama_status,
    get_ollama_url,
)
from app.services.system_service import get_system_info

router = APIRouter(prefix="/api/ollama", tags=["ollama"])


@router.get("/models")
async def list_models():
    models = await get_available_models()
    return {"models": models}


@router.get("/status")
async def status():
    is_running = await check_ollama_status()
    return {"status": "connected" if is_running else "disconnected"}


@router.get("/system")
async def system_info():
    return get_system_info()


@router.post("/pull")
async def pull_model_stream(request: dict):
    model_name = request.get("model_name", "")
    if not model_name:
        return {"error": "model_name is required"}

    async def stream_pull():
        base_url = get_ollama_url()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/pull",
                    json={"name": model_name, "stream": True},
                ) as response:
                    async for line in response.aiter_lines():
                        if line.strip():
                            try:
                                data = json.loads(line)
                                event = {
                                    "status": data.get("status", ""),
                                    "total": data.get("total", 0),
                                    "completed": data.get("completed", 0),
                                    "digest": data.get("digest", ""),
                                }
                                yield f"data: {json.dumps(event)}\n\n"
                            except json.JSONDecodeError:
                                pass

            yield f"data: {json.dumps({'status': 'success'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        stream_pull(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/models/{model_name:path}")
async def delete_model(model_name: str):
    base_url = get_ollama_url()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{base_url}/api/delete",
                json={"name": model_name},
                timeout=30.0,
            )
            if response.status_code == 200:
                return {"status": "deleted", "model": model_name}
            return {"status": "error", "detail": response.text}
        except Exception as e:
            return {"status": "error", "detail": str(e)}
