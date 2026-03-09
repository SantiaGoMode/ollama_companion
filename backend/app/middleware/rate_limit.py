"""In-memory rate limiting middleware with request logging.

Uses a sliding-window counter per client IP and route group.
Implemented as a raw ASGI middleware to avoid BaseHTTPMiddleware
buffering issues with SSE streaming responses.
"""

import logging
import time
from collections import defaultdict

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("app.middleware")

RATE_LIMITS: list[tuple[str, int]] = [
    ("/api/chat", 30),
    ("/api/agent-chats", 30),
    ("/api/ollama/pull", 10),
    ("/api/knowledge", 30),
    ("/api/health", 120),
    ("/api/ollama", 120),
]

DEFAULT_RPM = 60
WINDOW_SECONDS = 60.0


def _get_rpm_limit(path: str) -> int:
    for prefix, rpm in RATE_LIMITS:
        if path.startswith(prefix):
            return rpm
    return DEFAULT_RPM


def _route_group(path: str) -> str:
    parts = path.rstrip("/").split("/")
    return "/".join(parts[:4]) if len(parts) >= 4 else path


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = request.url.path

        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        client_ip = request.client.host if request.client else "unknown"
        rpm_limit = _get_rpm_limit(path)
        bucket_key = f"{client_ip}:{_route_group(path)}"
        now = time.monotonic()

        timestamps = self._requests[bucket_key]
        timestamps[:] = [t for t in timestamps if now - t < WINDOW_SECONDS]

        if len(timestamps) >= rpm_limit:
            oldest = timestamps[0]
            retry_after = int(WINDOW_SECONDS - (now - oldest)) + 1
            logger.warning(
                "Rate limited %s %s from %s (%d/%d rpm)",
                request.method, path, client_ip, len(timestamps), rpm_limit,
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        timestamps.append(now)

        start = time.monotonic()
        status_code = 0

        async def send_with_status(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 0)
            await send(message)

        await self.app(scope, receive, send_with_status)

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s %d %.0fms",
            request.method, path, status_code, duration_ms,
        )
