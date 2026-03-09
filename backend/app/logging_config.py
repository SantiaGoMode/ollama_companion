"""Centralized logging configuration.

Environment variables:
  LOG_LEVEL  - root log level (default: INFO)
  LOG_FILE   - path to log file (default: logs/agent-hub.log)
  LOG_FORMAT - "json" for JSON lines, "text" for human-readable (default: text)
"""

import logging
import logging.handlers
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FILE = os.getenv("LOG_FILE", "logs/agent-hub.log")
LOG_FORMAT = os.getenv("LOG_FORMAT", "text")

MAX_BYTES = 10 * 1024 * 1024  # 10 MB per file
BACKUP_COUNT = 5


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            entry["request_id"] = record.request_id
        return json.dumps(entry, default=str)


TEXT_FMT = "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s"
TEXT_DATE_FMT = "%Y-%m-%d %H:%M:%S"


def setup_logging() -> None:
    root = logging.getLogger()
    root.setLevel(LOG_LEVEL)

    if root.handlers:
        return

    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(LOG_LEVEL)
    if LOG_FORMAT == "json":
        console.setFormatter(JSONFormatter())
    else:
        console.setFormatter(logging.Formatter(TEXT_FMT, datefmt=TEXT_DATE_FMT))
    root.addHandler(console)

    # File handler with rotation
    log_path = Path(LOG_FILE)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setLevel(LOG_LEVEL)
    if LOG_FORMAT == "json":
        file_handler.setFormatter(JSONFormatter())
    else:
        file_handler.setFormatter(logging.Formatter(TEXT_FMT, datefmt=TEXT_DATE_FMT))
    root.addHandler(file_handler)

    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("chromadb").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("langchain").setLevel(logging.WARNING)
