# backend/entrypoint.sh
#!/usr/bin/env sh
set -e

python -m backend.scripts.create_admin

exec python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
