from __future__ import annotations

from backend.config.env import getenv

secret_key = getenv("SECRET_KEY")

if not secret_key:
    raise RuntimeError("SECRET_KEY is required (set it in backend/config/.env)")

algorithm = getenv("ALGORITHM", "HS256")

try:
    access_token_expire_minutes = int(getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
except ValueError:
    access_token_expire_minutes = 60
