# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

UNMSM Digital Herbarium — a Darwin Core (DwC)-compliant web application for managing herbarium specimens. Consists of a FastAPI backend and a React/TypeScript frontend, orchestrated via Docker Compose.

### Environment files

Three `.env.sample` files, one per level — copy each to `.env` next to it and fill in:
- `/.env.sample` — only needed for `docker compose`/`make dev`/`make prd`; seeds the Postgres container.
- `backend/config/.env.sample` — the backend's only `.env` (see `backend/CLAUDE.md` > Environment Variables).
- `frontend/.env.sample` — only needed to run `npm run dev` outside Docker.

## Commands

```bash
# Development (backend --reload + Vite HMR)
make dev          # Frontend: http://localhost:5173 | Backend: http://localhost:8001

# Production (rebuilds without cache)
make prd

# Stop/teardown
make stop         # stops containers (keeps data)
make stop-all     # stops + removes containers, networks, volumes

make logs         # live logs
make ps           # container status

# Frontend only (outside Docker)
cd frontend && npm run dev    # port 3000
cd frontend && npm run build
cd frontend && npm run lint
```

## Architecture

### Backend (`backend/`)

FastAPI app with SQLAlchemy 2.0 ORM, PostgreSQL, and JWT auth. See [`backend/CLAUDE.md`](backend/CLAUDE.md) for full details.

**Key patterns:**
- All routes prefixed `/api`, one router file per resource in `routers/`
- Auth dependencies: `get_current_user`, `require_admin`, `require_superuser` from `auth/jwt.py`
- Models split by domain under `models/` (one file per aggregate); `models/models.py` re-exports all of them so `from backend.models.models import X` keeps working everywhere. UUID PKs throughout
- No Alembic — schema changes require manual DDL or `Base.metadata.create_all()`
- Paginated responses use generic `Page[T]` schema (fields: `items`, `total`, `currentPage`, `totalPages`, etc.)

### Frontend (`frontend/src/`)

React 18 + TypeScript, Vite, Tailwind v4, shadcn/ui components.

**Routing:** `App.tsx` manages all navigation via React Router. `onNavigate(page, params)` is passed to every page component as a prop — pages call it instead of using `useNavigate` directly.

**Service layer:** All API calls go through `@services/*.service.ts` files using `apiFetch` from `useAuth()`. The `apiFetch` wrapper automatically attaches the Bearer token.

**Path aliases (defined in `vite.config.ts`):**
- `@constants` → `src/constants/`
- `@config` → `src/config/`
- `@interfaces` → `src/interfaces/`
- `@contexts` → `src/contexts/`
- `@utils` → `src/utils/`
- `@services` → `src/services/`
- `@` → `src/`

**UI components:** shadcn/ui components live in `src/components/ui/`. Use `Table`, `Card`, `Badge`, `Button`, `Dialog`, `Select`, `Input`, `Label`, `Textarea` from there.

**Page structure convention:**
```tsx
<div className="container mx-auto px-4 py-8">
  <div className="flex justify-between items-center mb-6">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Page Title</h1>
      <p className="text-sm text-muted-foreground">Subtitle</p>
    </div>
    {/* action button */}
  </div>
  <Card>
    <CardHeader>...</CardHeader>
    <CardContent>
      <Table>...</Table>
      {/* pagination */}
    </CardContent>
  </Card>
</div>
```

### Loading states (no flicker)

Never swap a list for a "Cargando…" placeholder on refetch — it collapses the page and resets scroll.
- Lists: use `DataTable` (`ui/data-table.tsx`). Skeleton only on the first load; on refresh the rows stay and are dimmed via `LoadingOverlay` (`ui/loading-overlay.tsx`, dim and spinner delayed 200 ms). For non-table lists wrap them in `LoadingOverlay` and use `SkeletonBar` + `useSettled(loading)` for the first load.
- Pages that fetch on mount start with `loading = true`; background polling must not toggle `loading`.
- Autocomplete: `useSuggestions` + `AutocompleteDropdown` (`ui/autocomplete.tsx`); don't build another dropdown. Previous suggestions stay (dimmed) while refetching.
- Route components with params live at module level in `App.tsx`; never define a component inside another component (it remounts on every render). Context values and `apiFetch` are memoized in `AuthContext`.
- Styles for this live in `ui/feedback.css` (`index.css` is precompiled).

### CSS / Theming

**Critical:** `frontend/src/index.css` is the **pre-compiled Tailwind v4 output** — the browser reads this file directly. `frontend/src/styles/globals.css` is the source that needs to be recompiled with Tailwind CLI to update `index.css`.

**To change theme colors without rebuilding:** Edit the `:root` block directly in `index.css` (around line 2642). All theme tokens (`--background`, `--card`, `--foreground`, `--primary`, etc.) live there.

**New Tailwind utility classes** not already present in `index.css` won't apply via Vite HMR. Use inline `style={{}}` props for one-off values, or rebuild Tailwind.

### Sidebar

`PrivateSidebar.tsx` uses hardcoded color constants (`BG`, `BG_HOVER`, `BG_ACTIVE`) rather than CSS variables. Change those constants directly when adjusting sidebar colors.

## Docker Services

```yaml
db          # PostgreSQL 16
seaweedfs   # Image/file storage
backend-dev # FastAPI --reload on port 8001
frontend-dev# Vite dev server on port 5173
```

`backend`, `backend-dev` and `frontend` all build from a Dockerfile (`backend-dev`
reuses `backend/Dockerfile`, just with `--reload` and a live-reload volume mount for
`backend/`) — dependencies get installed once at `docker compose build`, not on every
`up`. Only `frontend-dev` still installs live (`npm install` on each start).
