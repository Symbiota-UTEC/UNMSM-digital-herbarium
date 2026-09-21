# UNMSM Digital Herbarium — Backend

REST API (FastAPI) for the herbarium: Darwin Core occurrences, taxonomy (WFO backbone), collections and permissions, geospatial search (PostGIS) and image storage (SeaweedFS). The web client lives in [`../frontend`](../frontend/README.md).

## Stack

FastAPI · SQLAlchemy 2.0 + GeoAlchemy2 · PostgreSQL 16 + PostGIS · JWT auth · Pydantic v2 · Python 3.10

## Quick start

The easiest way is Docker, from the repo root:

```bash
cp .env.sample .env                              # Postgres credentials for docker compose
cp backend/config/.env.sample backend/config/.env   # backend settings (set SECRET_KEY)
make dev                                         # API on http://localhost:8001
```

Interactive docs (Swagger): http://localhost:8001/docs

Without Docker (from the repo root, with a PostGIS database reachable as configured in `backend/config/.env`):

```bash
pip install -r backend/requirements.txt
python -m backend.scripts.create_models     # create tables
python -m backend.scripts.create_admin      # default institution + admin user
python -m uvicorn backend.main:app --reload --port 8000
```

The default admin comes from the `ADMIN_*` variables in `backend/config/.env`.

## Configuration

Everything is read from `backend/config/.env` (template: [`config/.env.sample`](config/.env.sample)). Only `SECRET_KEY` is required. `USERNAME`/`PASSWORD`/`DATABASE` must match the root `.env` when using `docker compose`.

## Layout

```
routers/    HTTP only: parse the request, call one service, map the response
services/   Business logic, permissions, queries
models/     SQLAlchemy entities (one file per aggregate)
schemas/    Pydantic input/output models
auth/       JWT and role dependencies
scripts/    create_models.py, create_admin.py
samples/    Sample files (e.g. a small WFO CSV to try the taxonomy import)
```

There are no migrations (no Alembic): schema changes need manual DDL or a `create_all()` on a fresh database.

## More

Architecture, conventions, geospatial rules and how to add an endpoint: [`CLAUDE.md`](CLAUDE.md).
