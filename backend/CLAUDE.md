# Backend — UNMSM Digital Herbarium API

## Overview

FastAPI application exposing a Darwin Core (DwC)-compliant REST API for managing herbarium specimens. Backed by PostgreSQL, with SeaweedFS for image storage.

- **Framework:** FastAPI
- **ORM:** SQLAlchemy 2.0 (declarative, future-mode)
- **Database:** PostgreSQL via `psycopg2-binary`
- **Auth:** JWT (HS256) via `python-jose`, passwords via `passlib` bcrypt_sha256
- **Validation:** Pydantic v2 (`>=2.5,<3`)

---

## Project Structure

```
backend/
├── main.py                   # App factory, CORS, router registration, DB init
├── config/
│   ├── .env.sample           # Copy to config/.env and fill in — see "Environment Variables" below
│   ├── env.py                # SINGLE place that loads `.env` and exposes getenv()/getenv_list()
│   ├── settings.py           # CORS origins, SeaweedFS URLs (env-driven)
│   ├── database.py           # SQLAlchemy engine, SessionLocal, get_db dependency
│   └── auth.py               # SECRET_KEY, ALGORITHM, token expiry settings
├── models/                    # One file per domain; models.py re-exports all of them
│   ├── models.py             # Aggregator + cross-model Index(...) definitions
│   ├── institution.py        # Institution
│   ├── collection.py         # Collection, CollectionPermission
│   ├── user.py                # User
│   ├── registration_request.py  # RegistrationRequest
│   ├── taxon.py               # Taxon
│   ├── occurrence.py          # Occurrence, OccurrenceImage
│   ├── identification.py      # Identification, Identifier
│   └── upload_jobs.py         # TaxonFloraImportJob
├── schemas/
│   ├── common/
│   │   ├── base.py           # ORMBaseModel, StrictBaseModel
│   │   └── pages.py          # Generic Page[T] paginated response
│   ├── auth.py
│   ├── occurrence.py
│   ├── taxon.py
│   ├── collections.py
│   ├── institutions.py
│   ├── admin.py
│   └── autocomplete.py
├── routers/                  # One file (or package) per resource; all mounted under /api
│   ├── auth.py
│   ├── users.py
│   ├── collections.py
│   ├── occurrence.py
│   ├── taxon.py
│   ├── upload/                # Package: dwc_csv.py, taxon_flora.py, images.py
│   │   ├── __init__.py       # Aggregates the 3 sub-routers under prefix="/upload"
│   │   ├── dwc_csv.py         # POST /upload/dwc-csv
│   │   ├── taxon_flora.py     # POST/GET /upload/taxon-flora-csv[...] (async job)
│   │   └── images.py          # /upload/image[...] via SeaweedFS
│   ├── institutions.py
│   ├── admin.py
│   └── autocomplete.py
├── auth/
│   └── jwt.py                # Token creation, verification, auth dependencies
├── services/
│   ├── occurrence_filters.py    # Filter dependency + SQLAlchemy filter builder
│   └── collection_permissions.py  # Single source of truth for Collection authorization
│                                   # (view / edit / manage-permissions); used by
│                                   # routers/occurrence.py, routers/collections.py and
│                                   # routers/upload/*
├── utils/
│   ├── dwc.py                # DwC CSV header validation constants
│   └── security.py           # hash_password, verify_password
└── scripts/
    └── create_admin.py       # Bootstrap: creates default institution + admin user
```

---

## Running Locally

### Environment Variables

All of `config/database.py`, `config/settings.py`, `config/auth.py` and
`scripts/create_admin.py` read from the **same** `backend/config/.env` file,
but none of them loads it directly anymore — `config/env.py` is the single
place that resolves its path and calls `load_dotenv()`; every other module
imports `getenv()`/`getenv_list()` from there instead of reading `os.environ`
or calling `load_dotenv()` itself. If you add a new config value, read it via
`from backend.config.env import getenv` rather than `os.getenv` directly.

The full, code-verified list of variables (with working local-dev defaults)
lives in [`config/.env.sample`](config/.env.sample) — copy it to
`config/.env` and adjust. Don't duplicate that list here; it drifts (this
section used to list a stale `INSTITUTION_CODE` that no code ever read).

Only `SECRET_KEY` is truly required — the app raises `RuntimeError` at
import time without it. Every other variable has a working default in code
(see `config/database.py`, `config/settings.py`, `config/auth.py`,
`scripts/create_admin.py`).

If you also run this via `docker compose` / `make dev` / `make prd` from the
repo root, see [`/.env.sample`](../.env.sample) too — `USERNAME`/`PASSWORD`/`DATABASE`
there must match the same-named variables in `config/.env`.

### Start (development)

```bash
cd backend
python -m uvicorn backend.main:app --reload --port 8000
```

Interactive docs: `http://localhost:8000/docs`

### Start (Docker)

```bash
docker build -t herbarium-backend .
docker run --env-file .env -p 8000:8000 herbarium-backend
```

The `entrypoint.sh` runs `scripts/create_admin.py` before starting Uvicorn.

---

## API Structure

All routes are prefixed with `/api`.

| Router         | Prefix                  | Key responsibilities                                    |
|----------------|-------------------------|---------------------------------------------------------|
| auth           | `/api/auth`             | Login (JWT), registration requests                      |
| users          | `/api/users`            | User lookup                                             |
| collections    | `/api/collections`      | CRUD, permission management, occurrence listing         |
| occurrences    | `/api/occurrences`      | CRUD, dynamic properties, filtered listing              |
| taxon          | `/api/taxon`            | Taxonomic tree, taxon detail with identifications       |
| upload         | `/api/upload`           | DwC CSV bulk import, Flora CSV, SeaweedFS image upload  |
| institutions   | `/api/institutions`     | CRUD (superuser/admin only for writes)                  |
| admin          | `/api/admin`            | Aggregate metrics                                       |
| autocomplete   | `/api/autocomplete`     | Type-ahead suggestions (names, families, locations)     |

---

## Data Model

Core Darwin Core entities live under `models/`, one file per aggregate (`institution.py`, `collection.py`, `user.py`, `taxon.py`, `occurrence.py`, `identification.py`, `registration_request.py`, `upload_jobs.py`). `models/models.py` re-exports everything, so existing `from backend.models.models import X` imports elsewhere in the codebase are unaffected:

```
Institution ──< User
Institution ──< Collection ──< CollectionPermission >── User
Collection  ──< Occurrence ──< Identification >── Taxon
Occurrence  ──< OccurrenceAgent >── Agent
Occurrence  ──< OccurrenceImage
Identification ──< IdentificationIdentifier >── Identifier
```

- **Occurrence** is a denormalized/flattened DwC record: contains fields from the DwC *Occurrence*, *Event*, and *Location* classes in a single table.
- **Taxon** is loaded from the WFO (World Flora Online) backbone via CSV import (`/api/upload/taxon-flora-csv`). Has a `isCurrent` flag to mark the active Flora version.
- **Identification** links an Occurrence to a Taxon. `isCurrent=True` marks the accepted determination.

### UUID primary keys

All models use `UUID` PKs (Python `uuid.uuid4`).

---

## Authentication & Authorization

### Token flow
1. `POST /api/auth/login` — accepts form-encoded `username`/`password`, returns `{"access_token": "...", "token_type": "bearer"}`.
2. Subsequent requests include `Authorization: Bearer <token>`.

### Auth dependencies (in `auth/jwt.py`)

| Dependency             | Effect                                           |
|------------------------|--------------------------------------------------|
| `get_current_user`     | Returns authenticated User; 401 otherwise        |
| `require_admin`        | Requires `isSuperuser` OR `isInstitutionAdmin`   |
| `require_superuser`    | Requires `isSuperuser` only                      |

### Roles
- **Superuser** — full access across all institutions
- **Institution admin** — manages their own institution's data
- **Collection roles** — `owner`, `editor`, `viewer` stored in `CollectionPermission`. Whether a user can view/edit/manage-permissions-of a given `Collection` is decided by `services/collection_permissions.py` (`user_can_view_collection`, `user_can_edit_collection`, `user_can_manage_collection_permissions`) — don't reimplement this check in a router, import it.

---

## Schema Conventions

- All output schemas extend `ORMBaseModel` (enables `from_attributes=True` for ORM serialization).
- All input schemas extend `StrictBaseModel` (`extra="forbid"` — unknown fields raise 422).
- Paginated responses use the generic `Page[T]` (fields: `items`, `total`, `limit`, `offset`, `currentPage`, `totalPages`, `remainingPages`).

### Building a `Page[T]`

**Always build paginated responses with `Page[T].of(items, total=..., limit=..., offset=...)`**
(defined in `schemas/common/pages.py`) — never compute `currentPage`/`totalPages`/`remainingPages`
by hand in a router. The formula, applied uniformly across every paginated endpoint:

```
totalPages     = ceil(total / limit)
currentPage    = (offset // limit) + 1
remainingPages = max(totalPages - currentPage, 0)
```

- No clamping: if a client requests an `offset` past the end, `currentPage` reflects
  that honestly (e.g. `currentPage` can end up higher than `totalPages`) instead of
  silently capping it — `remainingPages` will just be `0`. This is deliberate.
- Requires `limit > 0`, which every paginated endpoint already enforces via
  `Query(..., ge=1)`. With `limit <= 0`, `Page.of` returns a safe empty page
  (`currentPage=1, totalPages=0, remainingPages=0`) instead of raising `ZeroDivisionError`.

**Why this exists:** before it, six routers each computed these three fields inline,
and they had quietly drifted into three different formulas (some clamped `currentPage`
to `totalPages`, some special-cased `total == 0`, one — `routers/users.py` — never set
`currentPage` at all, which made `GET /api/users/` raise a Pydantic `ValidationError`
on every call). Unifying picked the formula the majority of endpoints already followed
(no clamping, no special-casing). Practical effect of the unification:
  - `routers/occurrence.py` (`list_occurrences_basic`) and the three paginated
    endpoints in `routers/collections.py` used to clamp `currentPage` to `totalPages`
    and force `currentPage=1` when `total==0`; they no longer do — only relevant if a
    caller requests an `offset` beyond the last page.
  - `routers/users.py` (`GET /api/users/`) is fixed: it now returns a valid `Page`
    instead of crashing.
  - `routers/taxon.py`'s `GET /taxon/tree` now rejects `size <= 0` with a normal 422
    instead of crashing with a `ZeroDivisionError` (`size` gained `ge=1`, matching
    every other paginated endpoint).
  - `routers/auth.py`, `routers/institutions.py`, `routers/taxon.py` (`size`-based
    pagination) and `routers/upload/taxon_flora.py` already matched this formula
    exactly, so nothing observable changes for them.

---

## Darwin Core CSV Import

`POST /api/upload/dwc-csv`

- Accepts a `.csv` file with headers in the format `dwc:Entity:field` (e.g., `dwc:Occurrence:catalogNumber`).
- Validation logic lives in `utils/dwc.py` — `ALLOWED_FIELDS` maps Entity → allowed field names.
- Invalid headers return a structured error listing the rejected columns.
- Rows are processed and inserted/updated in batch.

---

## Full-Text / Accent-Insensitive Search

Filtering on `recordedBy`, `locality`, scientific names, and families uses PostgreSQL's `unaccent` extension via a custom immutable wrapper `unaccent_immutable`. All search helpers are in `services/occurrence_filters.py`.

The database must have the `unaccent` extension enabled:

```sql
CREATE EXTENSION IF NOT EXISTS unaccent;
```

---

## Image Storage (SeaweedFS)

- `POST /api/upload/image-seaweedfs` — uploads a file to SeaweedFS, stores the returned `fid` path in `OccurrenceImage.imagePath`.
- `GET /api/upload/image-seaweedfs?image_path=<fid>` — proxies the file from SeaweedFS (with collection-level access control).
- Internal SeaweedFS URL is used for server-to-server calls; the public URL is used for direct browser access.

---

## Database Initialization

On startup, `main.py` calls:

```python
Base.metadata.create_all(bind=engine)
```

This creates any missing tables but does not run migrations. There is no Alembic setup — schema changes require manual table alterations or a `reset_database()` call (destructive).

---

## Adding a New Resource

1. Add the ORM model to the right domain file under `models/` (or a new one) and re-export it from `models/models.py`.
2. Add Pydantic schemas to a new file in `schemas/`.
3. Create a router file in `routers/`, using `get_db` and auth dependencies.
4. Register the router in `main.py` with `app.include_router(...)`.
