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
make seed-all                                    # once backend-dev is healthy: default admin + admin divisions
```

Interactive docs (Swagger): http://localhost:8001/docs

Neither `make dev` nor `make prd` ever wipes the database — tables and extensions are created
automatically (see "Database Initialization" in [`CLAUDE.md`](CLAUDE.md)). Want a clean local
database instead? `make reset-db` (destructive, `backend-dev` only, run it yourself when you
actually want one).

Without Docker (from the repo root, with a PostGIS database reachable as configured in `backend/config/.env`):

```bash
pip install -r backend/requirements.txt
python -m backend.scripts.create_admin      # default institution + admin user
python -m uvicorn backend.main:app --reload --port 8000
```

The default admin comes from the `ADMIN_*` variables in `backend/config/.env`.

## Lint and format

Ruff (config in [`ruff.toml`](ruff.toml)), run automatically on every commit through pre-commit (see the root [`CLAUDE.md`](../CLAUDE.md)). By hand, from the repo root: `ruff check backend --fix` and `ruff format backend`.

## Configuration

Everything is read from `backend/config/.env` (template: [`config/.env.sample`](config/.env.sample)). Only `SECRET_KEY` is required. `USERNAME`/`PASSWORD`/`DATABASE` must match the root `.env` when using `docker compose`.

## Layout

```
routers/    HTTP only: parse the request, call one service, map the response
services/   Business logic, permissions, queries
models/     SQLAlchemy entities (one file per aggregate)
schemas/    Pydantic input/output models
auth/       JWT and role dependencies
scripts/    create_admin.py, seed_admin_divisions.py, reset_database.py (destructive, opt-in — see make reset-db)
samples/    Sample files (e.g. a small WFO CSV to try the taxonomy import)
```

There are no migrations (no Alembic): schema changes need manual DDL or a `create_all()` on a fresh database.

## More

Architecture, conventions, geospatial rules and how to add an endpoint: [`CLAUDE.md`](CLAUDE.md).
