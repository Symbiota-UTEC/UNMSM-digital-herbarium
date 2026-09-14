from __future__ import annotations

from backend.config.env import getenv, getenv_list

cors_allow_origins = getenv_list(
    "BACKEND_CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)
seaweedfs_internal_url = getenv(
    "SEAWEEDFS_INTERNAL_URL",
    "http://herbarium_seaweedfs:8888",
).rstrip("/")
seaweedfs_public_url = getenv(
    "SEAWEEDFS_PUBLIC_URL",
    "http://localhost:8888",
).rstrip("/")
