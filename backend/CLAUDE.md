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
├── services/                  # One file per resource — see "Architecture: 3 Layers" below
│   ├── occurrence_filters.py    # Filter dependency + SQLAlchemy filter builder
│   ├── collection_permissions.py  # Collection authorization (view/edit/manage-permissions)
│   ├── occurrences.py         # Business logic for routers/occurrence.py
│   ├── collections.py         # Business logic for routers/collections.py
│   ├── taxon.py               # Business logic for routers/taxon.py
│   ├── users.py               # Business logic for routers/users.py
│   ├── institutions.py        # Business logic for routers/institutions.py
│   ├── auth.py                # Business logic for routers/auth.py
│   ├── admin_metrics.py       # Business logic for routers/admin.py
│   ├── autocomplete.py        # Business logic for routers/autocomplete.py
│   ├── dwc_import.py          # Business logic for routers/upload/dwc_csv.py
│   ├── images.py              # Business logic for routers/upload/images.py
│   └── taxon_flora_import.py  # Business logic for routers/upload/taxon_flora.py
├── utils/
│   ├── dwc.py                # DwC CSV header validation constants
│   └── security.py           # hash_password, verify_password
├── scripts/
│   └── create_admin.py       # Bootstrap: creates default institution + admin user
└── samples/                  # Sample/reference files (not code)
    └── wfo_classification_solanum_tuberosum_lineage.csv  # 9 WFO taxa: Plantae -> Solanum tuberosum
```

---

## Architecture: 3 Layers

The backend is organized in 3 layers, each with one job:

```
routers/*.py    HTTP only: parse the request (Query/Body/Depends), call ONE
                function in services/, map the result to a response_model
                (or raise HTTPException for something the service didn't
                already raise). No SQLAlchemy `select()`/`db.execute()` here.
     │
     ▼
services/*.py   Business logic: permission checks, orchestration across
                models, query construction. Takes `db: Session` plus plain
                arguments (UUIDs, strings, already-validated Pydantic
                schemas); returns ORM model instances, or an already-built
                `Page[T]` / plain dict when that's the natural response shape.
     │
     ▼
models/*.py     SQLAlchemy ORM entities (already split by domain).
```

This mirrors the routing/models split already documented above, closing the
gap that used to exist: before, every router built its own `select()`
statements and business logic inline, and `services/` only held cross-cutting
helpers (`occurrence_filters.py`, `collection_permissions.py`) shared by
several routers. Now each router has a matching `services/<name>.py` that
owns 100% of that resource's logic — the router is just wiring.

**Deliberate compromise — services may raise `HTTPException` directly.**
A "pure" service layer wouldn't know about HTTP at all (it would raise plain
domain exceptions and let the router translate them into status codes). This
codebase does not do that: services import `fastapi.HTTPException` and raise
it straight from deep inside business logic (e.g. "Taxon no encontrado" while
building an Identification). This was a conscious choice, not an oversight:
FastAPI catches `HTTPException` regardless of how deep in the call stack it's
raised, so moving a function's body into `services/` verbatim — status codes,
messages and all — is a zero-risk, mechanically-verifiable change. Inventing
a parallel exception-translation layer would be "more correct" textbook
layering, but it means touching every error path by hand with real risk of
silently changing a status code or message along the way. If this project
ever needs services usable outside of FastAPI (a CLI, a worker with no HTTP
context), revisit this — but that need doesn't exist today.

**What this is NOT:** this is not Clean Architecture / hexagonal (4 layers:
entities, use cases, interface adapters, frameworks). There's no repository
interface abstracting SQLAlchemy away, and no framework-independent domain
entity separate from the ORM model — `services/` talks to SQLAlchemy
directly. That's a deliberate scope call for a single-database, single-team
FastAPI app: it gets most of the practical benefit (business logic is
testable without going through HTTP, routers are thin and predictable,
logic is reusable outside of a single endpoint) at a fraction of the
indirection cost. Reconsider only if a second persistence backend or a
second delivery mechanism (gRPC, CLI-as-a-product) actually shows up.

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

### Geospatial queries (PostGIS)

`db` runs `postgis/postgis:16-3.4` (not plain `postgres`). `Occurrence` has two
PostGIS columns that are **never set directly by input schemas** — they're
derived server-side, the same pattern as `year`/`month`/`day` being derived
from `eventDate`:

| DwC field (source of truth)                                              | Derived PostGIS column          | Used for                                     |
|---------------------------------------------------------------------------|----------------------------------|-----------------------------------------------|
| `decimalLatitude` + `decimalLongitude`                                    | `location` (`geography(Point)`)  | search: the point is inside the area           |
| `footprintWKT` (one simple `POLYGON`) or, without it, `coordinateUncertaintyInMeters` | `footprintGeom` (`geometry`) | search: the shape touches the area |

`footprintGeom` is the record's **shape**, chosen by priority: the polygon if
`footprintWKT` exists; otherwise the circle of radius `coordinateUncertaintyInMeters`
(> 0, DwC) around the point; otherwise `NULL` (an exact point). When a polygon exists
the uncertainty is stored but never turned into a circle — the polygon is more precise
than the circle that would enclose it.

**The API is agnostic about how a record was located.** It never derives a
point from a polygon: the client sends `decimalLatitude`/`decimalLongitude`
(and optionally `footprintWKT`). For a record entered as a polygon, the
frontend computes the representative point (`getInteriorPoint()`) and sends it
as lat/lon together with the WKT. A record with `footprintWKT` and no lat/lon
(e.g. a CSV import) simply has `location = NULL`.

`services/occurrences.py::sync_geo_columns()` recomputes `location`/
`footprintGeom` on every `create_occurrence`/`update_occurrence` call and on
every row of the DwC CSV import (`services/dwc_import.py`), regardless of
which fields changed. Any new code path that creates or edits an `Occurrence`
must call it too, otherwise those rows are invisible to spatial search.

**Polygons are a single, simple `POLYGON`** — never a `MULTIPOLYGON`, never
self-intersecting (a concave shape is fine, and so is any winding order), and with
no holes. `services/geometry.py::check_simple_polygon()` enforces it with
PostGIS (`ST_IsValid`), and it is the one rule shared by `footprintWKT` (`422`
on create/update, and the whole DwC CSV import is rejected) and by the search
polygon `withinPolygon` (`400`). `footprintGeom` is typed `geometry(Polygon)`, so
the database rejects anything else too. The frontend refuses to draw a
self-crossing polygon (`utils/polygonDraw.ts`), but this backend check is the
source of truth for other clients and for CSV rows.

**Search filters** (`OccurrenceFilters` / `get_occurrence_filters` /
`build_geo_condition` in `services/occurrence_filters.py`), accepted by both
`GET /api/occurrences` and `GET /api/occurrences/map`:

- **Radius**: `nearLat` + `nearLon` + `radiusKm` (all three or none — a
  partial combination is a `400`). `ST_DWithin` on `geography`, so distance is
  true great-circle meters.
- **Polygon**: `withinPolygon` (one simple WKT `POLYGON(...)`,
  WGS84). `ST_Contains` on `location` cast to `geometry` — a planar
  point-in-polygon check in degree-space, accurate enough at herbarium scale
  (no antimeridian or polar regions). An invalid polygon is a `400`.

There is **one matching rule, with no options**: a record matches an area if
its location — the point, the uncertainty circle or the polygon
(`location` / `footprintGeom`) — touches it. Users don't need to know how a
record was located. If both a radius and a polygon are sent, both must match;
attribute filters (collector, family, dates…) are ANDed on top.

**`GET /api/occurrences/map`** returns every matching point unpaginated (up to
`limit`, default 5000, with `truncated` when there were more) for the map view.
Each point carries a `locationType` (`point` exact, `circle` = point with
`coordinateUncertaintyInMeters`, `polygon` = `footprintWKT`) and
`uncertaintyMeters`; the UI only uses them to tell exact from approximate
locations. With no area it returns every record that has coordinates. A
polygon-only record with no lat/lon is drawn at `ST_PointOnSurface` of its
polygon — display only, nothing stored.

The paginated list and the map share `_visible_occurrences_select()` in
`services/occurrences.py`, so they apply identical access rules and filters.
Keep it that way: don't add a third copy of the permission logic.

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

## Adding a New Resource / Endpoint

Follow the 3 layers (see "Architecture" above) in this order:

1. **Model** — add the ORM entity to the right domain file under `models/`
   (or a new file, for a new aggregate) and re-export it from `models/models.py`.
2. **Schemas** — add Pydantic input/output schemas to `schemas/<resource>.py`.
   Output schemas extend `ORMBaseModel`, input schemas extend `StrictBaseModel`
   (see "Schema Conventions"). Use `Page[T]` for anything paginated.
3. **Service** — create (or extend) `services/<resource>.py`. Put ALL of the
   logic here: permission checks (reuse `services/collection_permissions.py`
   if it's about a `Collection`; write a similar module for a new aggregate
   that needs its own view/edit rules — don't inline permission checks in a
   router), query construction, orchestration, and `raise HTTPException(...)`
   for anything that can go wrong (404/403/409/422/...). A service function
   signature looks like:
   ```python
   def do_the_thing(db: Session, some_id: UUID, payload: SomeIn, current_user: User) -> SomeModel:
       ...
   ```
   Return the ORM instance (or an already-built `Page[T]`/dict) — don't
   import `fastapi` response schemas into the service just to instantiate
   them, unless the schema *is* the natural return shape (a service that
   already needs to hand back paginated, resolved-role data, say).
4. **Router** — create/extend `routers/<resource>.py`. Each endpoint:
   - declares its `Query`/`Body`/`Depends` parameters and `response_model`,
   - keeps its **docstring** — FastAPI uses it as the OpenAPI `description`;
     move logic to the service, but leave (or copy) the docstring on the
     router function, otherwise the endpoint silently loses its `/docs` text,
   - calls exactly one function in `services/<resource>.py`,
   - maps the result to the response schema when the service returns a raw
     ORM model (`SomeOut.model_validate(obj, from_attributes=True)`) — for
     everything else (`Page[T]`, a plain dict, an ORM model whose schema
     already tolerates `from_attributes` via `response_model=`), just
     `return` what the service gave you.
   No `select()`, no `db.execute()`, no business `if` branching in the router.
5. Register the router in `main.py` with `app.include_router(..., prefix="/api")`.

If a new endpoint's logic is trivial (a single lookup, no branching) it's
still worth a one-line service function — consistency beats saving one file,
and it keeps `routers/` reliably free of direct DB access.
