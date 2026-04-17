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
│   ├── settings.py           # CORS origins, SeaweedFS URLs (env-driven)
│   ├── database.py           # SQLAlchemy engine, SessionLocal, get_db dependency
│   └── auth.py               # SECRET_KEY, ALGORITHM, token expiry settings
├── models/
│   └── models.py             # All SQLAlchemy ORM models (single file)
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
├── routers/                  # One file per resource; all mounted under /api
│   ├── auth.py
│   ├── users.py
│   ├── collections.py
│   ├── occurrence.py
│   ├── taxon.py
│   ├── upload.py
│   ├── institutions.py
│   ├── admin.py
│   └── autocomplete.py
├── auth/
│   └── jwt.py                # Token creation, verification, auth dependencies
├── services/
│   └── occurrence_filters.py # Filter dependency + SQLAlchemy filter builder
├── utils/
│   ├── dwc.py                # DwC CSV header validation constants
│   └── security.py           # hash_password, verify_password
└── scripts/
    └── create_admin.py       # Bootstrap: creates default institution + admin user
```

---

## Running Locally

### Environment Variables

Minimum required:

```bash
# Database
USERNAME=postgres
PASSWORD=postgres
HOST=localhost
PORT=5432
DATABASE=herbarium

# Auth (required — app crashes without it)
SECRET_KEY=your-secret-key

# Optional
ACCESS_TOKEN_EXPIRE_MINUTES=60        # default 60
BACKEND_CORS_ALLOW_ORIGINS=http://localhost:5173

# SeaweedFS
SEAWEEDFS_INTERNAL_URL=http://localhost:8888
SEAWEEDFS_PUBLIC_URL=http://localhost:8888

# Bootstrap admin (used by scripts/create_admin.py)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme
INSTITUTION_CODE=UNMSM
INSTITUTION_NAME="Universidad Nacional Mayor de San Marcos"
```

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

Core Darwin Core entities live in `models/models.py` (single file, all models in one place):

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
- **Collection roles** — `owner`, `editor`, `viewer` stored in `CollectionPermission`

---

## Schema Conventions

- All output schemas extend `ORMBaseModel` (enables `from_attributes=True` for ORM serialization).
- All input schemas extend `StrictBaseModel` (`extra="forbid"` — unknown fields raise 422).
- Paginated responses use the generic `Page[T]` (fields: `items`, `total`, `limit`, `offset`, `currentPage`, `totalPages`, `remainingPages`).

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

1. Add the ORM model to `models/models.py`.
2. Add Pydantic schemas to a new file in `schemas/`.
3. Create a router file in `routers/`, using `get_db` and auth dependencies.
4. Register the router in `main.py` with `app.include_router(...)`.
