"""Encryption utilities for sensitive data at rest.

Uses Fernet symmetric encryption. The key is loaded from the
MCP_ENCRYPTION_KEY environment variable. If not set, a key is
auto-generated and written to .encryption_key on first run.
"""

import json
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_KEY_ENV = "MCP_ENCRYPTION_KEY"
_KEY_FILE = Path(".encryption_key")
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.getenv(_KEY_ENV)
    if not key:
        if _KEY_FILE.exists():
            key = _KEY_FILE.read_text().strip()
        else:
            key = Fernet.generate_key().decode()
            _KEY_FILE.write_text(key)
            _KEY_FILE.chmod(0o600)
            logger.info("Generated new encryption key at %s", _KEY_FILE)

    _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_env(env_dict: dict[str, str]) -> str:
    """Encrypt an env vars dict to an opaque string."""
    if not env_dict:
        return ""
    plaintext = json.dumps(env_dict).encode()
    return _get_fernet().encrypt(plaintext).decode()


def decrypt_env(encrypted: str) -> dict[str, str]:
    """Decrypt an env vars string back to a dict."""
    if not encrypted:
        return {}
    try:
        plaintext = _get_fernet().decrypt(encrypted.encode())
        return json.loads(plaintext)
    except (InvalidToken, json.JSONDecodeError):
        logger.warning("Failed to decrypt env vars, returning empty dict")
        return {}


def mask_env(env_dict: dict[str, str]) -> dict[str, str]:
    """Mask env var values for API responses."""
    masked = {}
    for key, value in env_dict.items():
        if len(value) <= 4:
            masked[key] = "****"
        else:
            masked[key] = value[:2] + "*" * (len(value) - 4) + value[-2:]
    return masked
