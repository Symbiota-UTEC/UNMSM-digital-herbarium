# Backend — UNMSM Digital Herbarium API

## Overview

FastAPI application exposing a Darwin Core (DwC)-compliant REST API for managing herbarium specimens. Backed by PostgreSQL/PostGIS, with SeaweedFS for image storage. Human quick start: [`README.md`](README.md). The client that consumes this API is documented in [`../frontend/CLAUDE.md`](../frontend/CLAUDE.md).

- **Framework:** FastAPI
- **ORM:** SQLAlchemy 2.0 (declarative, future-mode) + GeoAlchemy2
- **Database:** PostgreSQL 16 + PostGIS via `psycopg2-binary`
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

Run from the **repo root** (the package is `backend`, so `backend.main` must be importable), with a PostGIS database up (`docker compose up db` exposes it on port 5433):

```bash
pip install -r backend/requirements.txt
python -m backend.scripts.create_admin      # default institution + admin
python -m uvicorn backend.main:app --reload --port 8000
```

Tables and extensions are created on import by `main.py` itself (see "Database Initialization"
below) — no separate table-creation step needed. Want a clean slate instead? `python -m
backend.scripts.reset_database` drops and recreates the whole `public` schema (destructive).

Interactive docs: `http://localhost:8000/docs`

### Lint and format

[Ruff](https://docs.astral.sh/ruff/) does both, configured in [`ruff.toml`](ruff.toml) (line length 100; rules E4/E7/E9, F and import sorting). It runs on every commit through pre-commit (see the root `CLAUDE.md`); by hand, from the repo root:

```bash
pip install ruff
ruff check backend --fix
ruff format backend
```

If a rule is wrong for a specific file, add a `per-file-ignores` entry with the reason (as done for `models/*.py`, where `relationship("Name")` resolves by name) instead of scattering `# noqa`.

### Start (Docker)

From the repo root: `make dev` (backend with `--reload` on http://localhost:8001, plus db, SeaweedFS and the frontend) or `make prd` (backend on http://localhost:8000). Neither wipes the database on start (see "Database Initialization") and neither creates the default admin or the admin-divisions catalog — `make seed-admin` (`scripts/create_admin.py`), `make seed-geo` (`scripts/seed_admin_divisions.py`) and `make seed-all` (both) do that once the backend container is healthy; all three default to `backend-dev` and take `SERVICE=backend` to target `make prd` instead. Want a clean local database? `make reset-db` (destructive, `backend-dev` only, run on demand — never part of `make dev` itself). See the root `CLAUDE.md`.

---

## API Structure

All routes are prefixed with `/api`.

| Router         | Prefix                  | Key responsibilities                                    |
|----------------|-------------------------|---------------------------------------------------------|
| auth           | `/api/auth`             | Login (JWT), registration requests                      |
| users          | `/api/users`            | User lookup                                             |
| collections    | `/api/collections`      | List/detail/create, permission management, occurrence listing |
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
- **One current identification per occurrence** is enforced by the partial unique index `uq_identification_one_current_per_occurrence` (on `identification(occurrence_id) WHERE is_current`, defined in `models/models.py`). It is not DEFERRABLE — write paths in `services/occurrences.py` demote the previous current row and flush before promoting the new one; keep that ordering in any new code that touches `isCurrent`.

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
`GET /api/occurrences` and `GET /api/occurrences/map`. Every query param here
is camelCase on the wire (`nearLat`, `dateFrom`, `pageSize`, …), same as
response fields — the Python parameter names are snake_case (FastAPI
convention) but always carry an explicit `alias=` for the camelCase one
actually sent/received; a param with no alias is a bug, not an exception:

- **Radius**: `nearLat` + `nearLon` + `radiusKm`. `nearLat`/`nearLon` always go
  together (a `400` if only one is sent); `radiusKm` additionally requires
  both (a `400` otherwise) — but `nearLat`/`nearLon` alone, with no
  `radiusKm`, is valid too: no area restriction, just an origin point for
  `sort=distance` (see below). `ST_DWithin` on `geography`, so distance is
  true great-circle meters.
- **Polygon**: `withinPolygon` (one simple WKT `POLYGON(...)`,
  WGS84). `ST_Contains` on `location` cast to `geometry` — a planar
  point-in-polygon check in degree-space, accurate enough at herbarium scale
  (no antimeridian or polar regions). An invalid polygon is a `400`.
- **Sort**: `sort` + `order` (`build_order_by` in
  `services/occurrence_filters.py`) — one field at a time, no combining.
  `order` is `asc`/`desc` and requires `sort` (else `400`); omitted, every
  field defaults to `asc` except `date`, which defaults to `desc` (most
  recent first) — that's the one hardcoded exception in `build_order_by`,
  not a lookup table, since it's the only field that doesn't want `asc`.
  Each field has a dedicated index (all in `models/models.py`) so ordering
  doesn't mean a full scan:
  - `distance` — via the PostGIS KNN operator `<->` (not `ST_Distance`, which
    can't use an index for ordering) on `location`, backed by
    `ix_occurrence_location_gist`. Requires `nearLat`/`nearLon`, else `400`.
    For a polygon search, the frontend sends the polygon's own representative
    point (`representativePoint()` in `utils/geo.ts`, the same one used when
    saving an occurrence drawn as a polygon) as `nearLat`/`nearLon` with no
    `radiusKm`, so this works for `withinPolygon` too without an added radius
    restriction. `GET /api/occurrences` also returns `distanceMeters` per row
    (`build_distance_expr`, plain `ST_Distance`) whenever `nearLat`/`nearLon`
    are present — `None` otherwise — independently of `sort`.
  - `date` — by event date (`year, month, day`, not the `eventDate` string).
  - `scientificName`, `family`, `collector`, `location`, `institution` —
    alphabetical, via `func.unaccent_immutable(func.lower(...))` on the same
    expression as that field's `ix_*_unaccent` index (sorting the raw column
    instead would silently skip the index).
  - No `sort` at all: `createdAt desc` (not `occurrenceId desc` — it's a
    random `uuid4`, not time-ordered, despite looking like a reasonable
    "newest first" proxy). `Occurrence.createdAt` has `ix_occurrence_created_at`.
  - Nulls always sort last regardless of direction (`.nulls_last()`), so
    records missing a field don't dominate the top of an ascending sort or the
    bottom disappear in a descending one.
  - Same `sort`/`order` on `GET /api/occurrences/map`: with `limit`, it also
    decides which records survive truncation (closest/most-recent/etc.
    instead of an arbitrary subset).

There is **one matching rule, with no options**: a record matches an area if
its location — the point, the uncertainty circle or the polygon
(`location` / `footprintGeom`) — touches it. Users don't need to know how a
record was located. If both a radius and a polygon are sent, both must match;
attribute filters (collector, family, dates…) are ANDed on top.

**`GET /api/occurrences/map`** returns every matching point unpaginated (up to
`limit`, default 5000, with `truncated` when there were more) for the map view.
Each point carries a `locationType` (`point` exact, `circle` = point with
`coordinateUncertaintyInMeters`, `polygon` = `footprintWKT`) and
`uncertaintyMeters`, which the UI uses to describe how a record was located
(exact point vs. circle vs. polygon). With no area it returns every record
that has coordinates. A polygon-only record with no lat/lon is drawn at
`ST_PointOnSurface` of its polygon — display only, nothing stored. With
`sort=distance`, closer records are also the ones kept when `limit` truncates.

Each point also carries `fullyContained` (`build_full_containment_expr` in
`services/occurrence_filters.py`): `None` with no area; with an area (radius
and/or polygon), `True` if it fully contains the record's real shape
(`footprintGeom`, or the point if there's no footprint) and `False` if it only
touches it — i.e. the record matched the filter but, because of its own
uncertainty circle or polygon, part of it could actually be outside the
searched area. The UI colors these two cases differently on the map so a
"confirmed" match is visually distinct from a "possibly outside" one; this has
nothing to do with `locationType`, which is about how the record was located,
not whether it fits the current search.

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

**The client never derives permissions.** `collection_capabilities(user, collection, role)` (pure, in `services/collection_permissions.py`) is the single source of truth, and the API exposes its result: `CollectionOut.canEdit` / `canManage` (from `GET /api/collections/{id}` and the list) and `OccurrenceOut.collection.{myRole, canEdit, canManage}` (built by `occurrences_service.to_occurrence_out`, used by every occurrence endpoint that returns `OccurrenceOut`). `canEdit` = create/edit occurrences and import CSV (superuser, admin of the same institution, editor, owner); `canManage` = access management and the collection itself (superuser, admin of the same institution, owner). Add new permission-dependent UI by extending these flags, not by re-implementing the rule in the frontend.

---

## Schema Conventions

**Closed sets of values are enums, never string literals.** They live in `models/enums.py` (`CollectionRole`, `EffectiveRole`, `CollectionAccess`, `RegistrationStatus`, `ImportJobStatus`) as `str` + `Enum`: use the members (`CollectionRole.OWNER`) in services, models and schemas; they still serialize as `"owner"` in JSON and compare equal to it. The PostgreSQL ENUM columns are declared with `db_enum(EnumClass, "type_name")`, which stores the `value`s as labels, so the database already matches. Adding a member means `ALTER TYPE <type_name> ADD VALUE '...'` by hand (there is no Alembic) and mirroring it in `frontend/src/constants/enums.ts`.

- All output schemas extend `ORMBaseModel` (enables `from_attributes=True` for ORM serialization).
- All input schemas extend `StrictBaseModel` (`extra="forbid"` — unknown fields raise 422).
- Paginated responses use the generic `Page[T]` (fields: `items`, `total`, `limit`, `offset`, `currentPage`, `totalPages`, `remainingPages`).
- **Every paginated endpoint's query params are `page` (1-based) + `pageSize`** — never
  `limit`/`offset` on the wire, even though `Page[T]` and `Page.of()` are limit/offset
  internally (see below). The router passes `page`/`page_size` straight through, unconverted
  — the `offset = (page - 1) * page_size` conversion happens at the top of the *service*
  function, right before it's needed, not in the router (that was inconsistent for a while:
  `occurrence.py`/`taxon.py` always converted in the service, the rest briefly converted in
  the router when they were first migrated to `page`/`pageSize` — now unified on the service
  doing it, so a router is never more than a thin adapter over `Depends`/`Query`). `page_size`
  always carries `alias="pageSize"` (same camelCase rule as every other query param); `page`
  needs none, being a single word already. `GET /occurrences/map` is the
  one exception: it's deliberately unpaginated (`limit` + `truncated`, no `Page[T]`, no
  `page`), since capping how many map points render isn't the same thing as paging through
  a list.

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

All under `/api/upload/image` (`routers/upload/images.py`, logic in `services/images.py`):

- `POST` — multipart `occurrence_id`, `file` and an optional `photographer`. Uploads the file to the SeaweedFS Filer and creates an `OccurrenceImage` whose `imagePath` is the Filer path (`/images/<institution>/<collection>/<catalogNumber>/<uuid>_<name>`).
- `PATCH /{image_id}` — edits the photographer (`ImageUpdateIn`).
- `GET /{image_id}` — streams the file through the backend. It has no auth dependency on purpose: it is used as `<img src>`, and a browser can't attach the Bearer header there.
- `DELETE /{image_id}` — removes the file and the row.
- Upload, edit and delete require edit rights on the collection (`user_can_edit_collection`).

**`photographer` is written by the person, never derived from the logged-in user**: empty or blank is stored as `NULL`.

The backend talks to SeaweedFS through `SEAWEEDFS_INTERNAL_URL` (Docker network hostname); `SEAWEEDFS_PUBLIC_URL` is only echoed back as `publicUrl` on upload.

---

## Database Initialization

On startup, `main.py` calls:

```python
Base.metadata.create_all(bind=engine)
```

This creates any missing tables but does not run migrations, and it never drops or touches
existing data — it runs unconditionally on every start (`make dev`, `make prd`, or importing
`backend.main` directly), by design. There is no Alembic setup — a real schema change (renaming
or dropping a column, changing a type) needs manual DDL, since `create_all()` only adds what's
missing.

For a full wipe (drop `public` and recreate it empty), `scripts/reset_database.py` calls
`reset_database()` — destructive, opt-in only, wired into `make reset-db` (`backend-dev`, not the
production `backend` service). It is never part of the normal startup path.

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
   def do_the_thing(db: Session, some_id: UUID, payload: SomeIn, current_user: User) -> SomeModel: ...
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
