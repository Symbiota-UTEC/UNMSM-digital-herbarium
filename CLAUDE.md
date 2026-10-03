# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

UNMSM Digital Herbarium — a Darwin Core (DwC)-compliant web application for managing herbarium specimens. Consists of a FastAPI backend and a React/TypeScript frontend, orchestrated via Docker Compose.

### Environment files

Three `.env.sample` files, one per level — copy each to `.env` next to it and fill in:
- `/.env.sample` — used by both Compose environments for database credentials and frontend build settings.
- `backend/config/.env.sample` — the backend's only `.env` (see `backend/CLAUDE.md` > Environment Variables).
- `frontend/.env.sample` — only needed to run `npm run dev` outside Docker.

## Commands

```bash
# Development (backend --reload + Vite HMR; uses docker-compose.dev.yaml)
make dev          # Frontend: http://localhost:5173 | Backend: http://localhost:8001

# Production (uses docker-compose.prod.yaml; frontend :3000, backend :8000)
make prd

# Backend data (run by hand, never automatic)
make seed-admin   # default admin (ENV=prod for production; SERVICE=backend also selects prod)
make seed-geo     # countries + admin-divisions catalog (ENV=prod for production)
make seed-all     # both; run once the selected backend is healthy
make reset-db     # destructive: wipes and recreates all tables (backend-dev only)

# Stop/teardown
make stop         # stops containers (keeps data)
make stop-all     # stops + removes containers, networks, volumes

make logs         # live logs (ENV=prod for production)
make ps           # container status (ENV=prod for production)

# Frontend only (outside Docker) — see frontend/CLAUDE.md
cd frontend && npm run dev    # port 3000
cd frontend && npm run build
```

## Code Quality (pre-commit)

`.pre-commit-config.yaml` runs on every commit, only over the staged files:

- **Everywhere:** trailing whitespace, final newline, line endings, YAML/JSON validity, merge-conflict markers, files > 1 MB.
- **Backend:** Ruff (`ruff-check --fix` + `ruff-format`, config in `backend/ruff.toml`).
- **Frontend:** ESLint, Prettier and `tsc --noEmit` (config in `frontend/`; they need `cd frontend && npm install`).

Once per clone: `pip install pre-commit && pre-commit install`. On demand over everything: `pre-commit run --all-files`. When a hook fixes files the commit is aborted: review, `git add` and commit again. Don't skip it with `--no-verify`; whatever slips through is caught by the same command in review. `.editorconfig` mirrors the same rules for editors.

The one-off "format everything" commit is listed in `.git-blame-ignore-revs`; enable it with `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Architecture

Two independent apps that talk over a REST API (`/api`); each has its own `CLAUDE.md` with the details, its own `README.md`, and follows the same layout: Overview, Project Structure, Architecture, Running Locally, Conventions.

- **Backend (`backend/`)** — FastAPI + SQLAlchemy 2.0 + PostgreSQL/PostGIS, JWT auth, SeaweedFS for images, in 3 layers (`routers/` → `services/` → `models/`). See [`backend/CLAUDE.md`](backend/CLAUDE.md).
- **Frontend (`frontend/`)** — React 18 + TypeScript + Vite, Tailwind v4 (pre-compiled), shadcn/ui, OpenLayers. See [`frontend/CLAUDE.md`](frontend/CLAUDE.md).

Cross-cutting rules that touch both:
- The API uses camelCase field names (Darwin Core terms) and the frontend types mirror them; a schema change in `backend/schemas/` needs the matching change in `frontend/src/interfaces/` and `services/`.
- Paginated endpoints return `Page[T]` (`items`, `total`, `currentPage`, `totalPages`, …); the frontend consumes them through `DataTable`.

## Docker Services

`docker-compose.yaml` contains the shared PostGIS and SeaweedFS services and named
data volumes. `docker-compose.dev.yaml` adds `backend-dev` (FastAPI `--reload` on
8001) and `frontend-dev` (Vite HMR on 5173), with source mounts. `docker-compose.prod.yaml`
adds the built backend (port 8000) and frontend (port 3000); the database and
SeaweedFS ports are not published in production.

`make dev` and `make prd` select the appropriate files and switch stacks while
preserving volumes. `make stop-all` is destructive and removes volumes. If an older
SeaweedFS container already has uploaded images, export and migrate its `/data`
directory before the first stack switch; see [`docs/deployment.md`](docs/deployment.md).
