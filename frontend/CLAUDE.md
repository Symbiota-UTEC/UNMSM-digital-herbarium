# Frontend — UNMSM Digital Herbarium UI

## Overview

React single-page app for browsing and digitizing herbarium specimens (Darwin Core), talking to the FastAPI backend in [`../backend`](../backend/CLAUDE.md). Human quick start: [`README.md`](README.md).

- **Framework:** React 18 + TypeScript
- **Build:** Vite 6 (SWC), output in `build/`
- **Routing:** React Router 6, centralized in `App.tsx`
- **UI:** shadcn/ui (Radix) + Tailwind v4 (**pre-compiled**, see "CSS / Theming")
- **Maps:** OpenLayers 10 (no API keys: Esri satellite, OpenTopoMap, OSM)
- **Toasts / icons:** `sonner`, `lucide-react`

---

## Project Structure

```
frontend/
├── index.html
├── vite.config.ts            # Path aliases, dev server (port 3000)
├── tsconfig.json             # Type-check only (Vite does the build); `paths` must mirror the aliases
├── eslint.config.mjs         # ESLint (flat config) · .prettierrc.json / .prettierignore: Prettier
├── .env.sample               # Copy to .env — see "Environment Variables"
└── src/
    ├── main.tsx              # Entry point
    ├── App.tsx               # Router, navigation (`onNavigate`), param routes
    ├── index.css             # PRE-COMPILED Tailwind output (what the browser reads)
    ├── styles/globals.css    # Tailwind source for index.css
    ├── config/env.ts         # The only reader of `import.meta.env` (VITE_*)
    ├── constants/            # api.ts (endpoints), roles.ts, storageKeys.ts, dwc.ts, ui.ts
    ├── contexts/             # AuthContext.tsx (session, `apiFetch`)
    ├── interfaces/           # Types that mirror backend schemas (camelCase, like the API)
    ├── services/             # One `<resource>.service.ts` per backend resource + api.error.ts
    ├── utils/                # Pure helpers: dates, geo, geocoding, basemaps, polygonDraw, mapStyles
    └── components/
        ├── pages/            # One file per route (XxxPage.tsx)
        ├── ui/               # shadcn primitives + shared building blocks (see below)
        └── *.tsx             # Feature components shared by pages (LocationPicker, DwcTerm, ImageManager + ImageLightbox, …)
```

Shared building blocks in `components/ui/` that are **not** stock shadcn: `data-table.tsx`, `filters.tsx`, `autocomplete.tsx`, `loading-overlay.tsx` (+ `feedback.css`). Reuse them; don't rebuild tables, filter cards or dropdowns.

---

## Architecture

### Routing and navigation

`App.tsx` owns every route. Pages never call `useNavigate`: they receive `onNavigate(page, params)` as a prop, and `buildRoute()` maps `(page, params)` to a path + router `state` (`returnTo`, `restoreSearch`, `collectionId`, …). Routes with URL params (`/collections/:id`, `/occurrences/:id`, …) use small wrapper components defined **at module level** in `App.tsx` that read `useParams()`/`useLocation().state` and forward them as props.

Filter pages (`/occurrences`, `/taxon`, `/collections`) keep their last query string across navigation (`lastSearch` ref in `App.tsx`).

### Service layer and auth

All HTTP goes through `services/*.service.ts`, which receive `apiFetch` from `useAuth()` (never `fetch` directly). `apiFetch` adds the Bearer token and calls `logout()` on a 401/403. `AuthContext` keeps the JWT in `localStorage`, schedules an auto-logout at expiry, and memoizes `login`/`logout`/`apiFetch`/the provider value — keep them stable, since pages list `apiFetch` in effect dependencies.

Endpoint paths live in `constants/api.ts`; responses are typed with `interfaces/` (backend fields are camelCase, so are the types).

### Path aliases

Defined in `vite.config.ts` **and** mirrored in `tsconfig.json` (`paths`) — a missing `tsconfig` entry only shows up as red in the editor.

- `@constants` → `src/constants/` · `@config` → `src/config/` · `@interfaces` → `src/interfaces/`
- `@contexts` → `src/contexts/` · `@utils` → `src/utils/` · `@services` → `src/services/` · `@` → `src/`

### Imports

- Package names carry no version (`from "sonner"`, never `"sonner@2.0.3"`); versions live only in `package.json`.
- Named imports: `import { useState, type ReactNode } from "react"`. Types only → `import type { ... }`. Never `import * as React` nor a bare `React.X`.
- `import * as X` is only for packages that export generic names shared across packages: the Radix `*Primitive` (`Root`, `Trigger`, `Content`…), `recharts`, `react-resizable-panels`. `lucide-react` icons are named imports.

---

## Running Locally

### Environment Variables

Only needed to run `npm run dev` outside Docker: copy [`.env.sample`](.env.sample) to `.env`. Vite exposes only `VITE_*` variables to the client, and they are read in one place, `src/config/env.ts`. `make dev` injects them directly into the `frontend-dev` service. For `make prd` they are build args (see `/.env.sample`).

### Start (development)

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in build/
```

```bash
npm run lint          # ESLint (config: eslint.config.mjs)
npm run lint:fix
npm run format        # Prettier (config: .prettierrc.json); `format:check` only reports
npm run typecheck     # tsc --noEmit (should print nothing)
```

These also run on every commit through pre-commit (see the root `CLAUDE.md`). `src/index.css` is excluded from all of them because it is generated. There is no test script. ESLint starts permissive (`no-explicit-any` off, unused vars and hook dependencies as warnings); tighten it gradually rather than in one go.

### Start (Docker)

From the repo root: `make dev` (Vite HMR on http://localhost:5173, API on 8001) or `make prd` (Nginx on http://localhost:3000). See the root `CLAUDE.md`.

---

## Conventions

### Page structure

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

Use `Table`, `Card`, `Badge`, `Button`, `Dialog`, `Select`, `Input`, `Label`, `Textarea` from `components/ui/`. Lists are `DataTable`; filter forms are `FiltersCard` + the field components in `ui/filters.tsx` (occurrence filters are shared by the list and the map through `OccurrenceFilterFields`). Visual rules for them are under "Design rules" below.

### Loading states (no flicker)

Never swap a list for a "Cargando…" placeholder on refetch — it collapses the page and resets scroll.

- **Lists:** `DataTable` shows a skeleton only on the first load; on refresh the rows stay and are dimmed by `LoadingOverlay` (dim and spinner delayed 200 ms, so a fast response changes nothing). For non-table lists wrap them in `LoadingOverlay` and use `SkeletonBar` + `useSettled(loading)` for the first load.
- Pages that fetch on mount start with `loading = true`; background polling (e.g. `UploadsPage`) must not toggle `loading`.
- **Autocomplete:** `useSuggestions` + `AutocompleteDropdown` (`ui/autocomplete.tsx`); don't build another dropdown. Previous suggestions stay (dimmed) while refetching.
- Never define a component inside another component (it remounts on every render, refetching and resetting state).
- The styles live in `ui/feedback.css`, because `index.css` is pre-compiled.

### CSS / Theming

**Critical:** `src/index.css` is the **pre-compiled Tailwind v4 output** — the browser reads it directly. `src/styles/globals.css` is the source, and it needs the Tailwind CLI to regenerate `index.css`.

- **Theme colors:** edit the `:root` block in `index.css` (around line 2642); all tokens (`--background`, `--card`, `--primary`, …) live there.
- **New Tailwind utility classes** not already in `index.css` fail silently (no error, no style). Before using a class not seen elsewhere in the codebase, check it: `grep -o "\.your-class-name\b" src/index.css`. Otherwise use inline `style={{}}` for one-off values, a plain `.css` file imported by the component (precedent: `utils/map.css`, `ui/feedback.css`), or rebuild Tailwind.
- **Known to be missing** (use inline `style`, e.g. `{ fontSize: "11px", letterSpacing: "0.05em" }`): arbitrary sizes (`text-[11px]`), text transforms (`uppercase`, `capitalize`), `tracking-wide/wider/widest` (only `tracking-tight` exists), fractional spacing (`gap-1.5`, `py-1.5`, `px-1.5`; only integers exist), and `font-bold` (only `font-medium` and `font-semibold`).
- **Sidebar:** `PrivateSidebar.tsx` uses hardcoded color constants (`BG`, `BG_HOVER`, `BG_ACTIVE`) instead of CSS variables; change those.

### Design rules

**Filter cards — larger = more important.** The `FiltersCard` title must always be a bigger size than the field labels; never invert it.

| Element | Class | Size |
|---|---|---|
| `FiltersCard` title (`CardTitle`) | `text-lg font-semibold tracking-tight` | 18px |
| Input values | `text-sm` | 14px |
| Field labels (`filterLabelClass`) | `text-xs font-semibold text-muted-foreground` | 12px |
| Hint / footer text | `text-xs text-muted-foreground` | 12px |

**Tables — the last column ("Acciones") is pinned to the right edge.**
- `DataTable` already does it (`width: 1px`, `whitespace-nowrap` and a `justify-end` flex wrapper on the last column).
- With a raw `<Table>`, do it by hand: `style={{ width: "1px" }}` on the last `TableHead` and `TableCell`, `whitespace-nowrap` on both, and the cell content inside `<div className="flex justify-end gap-2">` (`text-right` alone doesn't move buttons).
- Never `text-center`/`justify-center` on the last column.

**Date ranges:** use `FilterDateRangePicker` (`ui/filters.tsx`, two native `<input type="date">`). Don't replace it with a `Calendar` (react-day-picker) in a `Popover`: its CSS isn't compiled into `index.css`.

### Maps and geolocation

OpenLayers code lives in `LocationPicker.tsx` (form: point/polygon picker + administrative-unit autocompletion via Nominatim), `OccurrenceLocationMap.tsx` (read-only detail map) and `pages/MapPage.tsx` (search by radius/polygon), with helpers in `utils/` (`basemaps`, `polygonDraw`, `geo`, `geocoding`, `mapStyles`).

- A polygon is always **one simple `POLYGON`**: no holes, no self-crossing (`utils/polygonDraw.ts` refuses it while drawing). The backend is the source of truth and re-validates it.
- For a polygon the client computes the representative point and sends it as lat/lon together with the WKT; the API never derives one.
- The map shows two kinds of records: exact location (red) vs. approximate — uncertainty circle or polygon (blue).
- Darwin Core fields get an info tooltip through `<DwcTerm term="…" />`.

---

## Adding a New Page

1. **Types + service:** add the interface in `interfaces/` and a `services/<resource>.service.ts` that takes `apiFetch` (endpoint paths in `constants/api.ts`).
2. **Page:** create `components/pages/XxxPage.tsx` following the page structure above; navigate only through the `onNavigate` prop.
3. **Route:** in `App.tsx` add it to `routeConfigs`, `buildRoute()` and `resolveCurrentPage()`, and a `<Route>`. If it needs URL params or router state, add a module-level wrapper next to the existing ones.
4. **Menu:** if it belongs in the sidebar, add the entry in `PrivateSidebar.tsx`.
5. **Check:** `npm run build`, the `tsc` command above, and open the page in the browser.
