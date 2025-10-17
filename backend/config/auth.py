from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

def _getenv(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.getenv(name)
    return val if val is not None else default

secret_key = _getenv("SECRET_KEY")

if not secret_key:
    raise RuntimeError("SECRET_KEY is required (set it in backend/config/.env)")

algorithm = _getenv("ALGORITHM", "HS256")

try:
    access_token_expire_minutes = int(_getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
except ValueError:
    access_token_expire_minutes = 60
