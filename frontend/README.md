# UNMSM Digital Herbarium — Frontend

Web client for the herbarium: browse and digitize Darwin Core occurrences, explore the taxonomic tree, search on a map by radius or polygon, and manage collections, users and imports. It talks to the API in [`../backend`](../backend/README.md).

## Stack

React 18 · TypeScript · Vite 6 · React Router 6 · Tailwind v4 (pre-compiled) · shadcn/ui · OpenLayers

## Quick start

The easiest way is Docker, from the repo root:

```bash
make dev        # http://localhost:5173 (API on http://localhost:8001)
```

Without Docker:

```bash
cd frontend
cp .env.sample .env    # points VITE_API_URL to the backend
npm install
npm run dev            # http://localhost:3000
npm run build          # production bundle in build/
```

Quality checks: `npm run lint`, `npm run format`, `npm run typecheck` (they also run on every commit via pre-commit, see the root [`CLAUDE.md`](../CLAUDE.md)).

## Configuration

Only `VITE_*` variables reach the browser, and they are read in one place, `src/config/env.ts` (template: [`.env.sample`](.env.sample)).

## Layout

```
src/App.tsx          Router and navigation
src/components/      pages/ (one per route), ui/ (shadcn + shared table, filters, autocomplete), feature components
src/services/        One service per backend resource (all HTTP goes through here)
src/contexts/        AuthContext (session and authenticated fetch)
src/interfaces/      Types that mirror the API
src/utils/           Dates, geo, basemaps, polygon drawing
src/index.css        Pre-compiled Tailwind: new utility classes won't apply, see CLAUDE.md
```

## More

Conventions (imports, loading states, theming, design rules, maps) and how to add a page: [`CLAUDE.md`](CLAUDE.md).
