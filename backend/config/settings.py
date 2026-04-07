from __future__ import annotations

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)


def _getenv(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value is not None else default


def _getenv_list(name: str, default: str) -> List[str]:
    raw = _getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


cors_allow_origins = _getenv_list(
    "BACKEND_CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)
seaweedfs_internal_url = _getenv(
    "SEAWEEDFS_INTERNAL_URL",
    "http://herbarium_seaweedfs:8888",
).rstrip("/")
seaweedfs_public_url = _getenv(
    "SEAWEEDFS_PUBLIC_URL",
    "http://localhost:8888",
).rstrip("/")
