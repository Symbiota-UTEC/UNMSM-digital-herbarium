Reference for the UNMSM Digital Herbarium design system. Read this before creating or modifying any visual component or page.

---

## Color Palette

| Token | Variable | Hex | Use |
|---|---|---|---|
| Primary | `--primary` | `#8B2323` | Main actions, active states, focus rings, primary buttons |
| Primary foreground | `--primary-foreground` | `#FFFFFF` | Text/icons on primary backgrounds |
| Secondary | `--secondary` | `#F4F5F7` | Secondary buttons, input backgrounds, muted surfaces |
| Secondary foreground | `--secondary-foreground` | `#1A1A2E` | Text on secondary backgrounds |
| Tertiary / Accent | `--accent` | `#BA7E7E` | Decorative accents, secondary highlights |
| Neutral / Muted fg | `--muted-foreground` | `#6B7280` | Placeholder text, captions, inactive icons |
| Background | `--background` | `#EAECF3` | Page background (light grayish-blue) |
| Card | `--card` | `#FFFFFF` | Card surfaces |
| Foreground | `--foreground` | `#1A1A2E` | Primary body text |
| Destructive | `--destructive` | `#E02040` | Delete/danger actions only |

**Sidebar** uses hardcoded constants in `PrivateSidebar.tsx` (not CSS variables):
- `BG = "#1f0909"` — dark base
- `BG_HOVER = "#2e1010"` — hover state
- `BG_ACTIVE = "#8b2323"` — active/selected item (primary red)

---

## Typography

| Role | Font | Tailwind | Applied to |
|---|---|---|---|
| Headline | Hanken Grotesk | `font-semibold` / `font-bold` | `h1`–`h6`, page titles, card titles |
| Body | Inter | `text-sm` / `text-base` | All other text |
| Label | Inter | `text-xs font-semibold text-muted-foreground` | Form labels, filter labels (`filterLabelClass`) |
| Caption | Inter | `text-xs text-muted-foreground` | Descriptions, hints, badges |

**Fonts are loaded via Google Fonts in `index.html`** and applied via CSS rules in `index.css`:
- `body` → `'Inter'`
- `h1–h6` → `'Hanken Grotesk'`

---

## Visual Hierarchy (strictly enforced)

```
Page title (h1)          text-3xl font-semibold  — largest
Section title (h2/CardTitle)  text-lg font-semibold  — section heading
Body text                text-sm                 — content
Filter / form labels     text-xs font-semibold text-muted-foreground — smallest
Captions / hints         text-xs text-muted-foreground
```

**Rule**: In any given card or section, the title must always be visually larger than the labels inside it. Never use `text-sm` or larger for form field labels.

---

## Buttons

| Variant | Background | Text | Use |
|---|---|---|---|
| `default` (Primary) | `#8B2323` | white | Main CTA — "Aplicar", "Guardar", "Importar" |
| `secondary` | `#F4F5F7` | `#1A1A2E` | Secondary actions |
| `outline` | transparent | `#1A1A2E` | Auxiliary actions — "Limpiar", "Cancelar" |
| `ghost` | transparent | `#1A1A2E` | Icon-only buttons in tables, subtle actions |
| `destructive` | `#E02040` | white | Delete only |

---

## Page Layout

Every page follows this structure:

```tsx
<div className="container mx-auto px-4 py-8 space-y-6">
  {/* Page header */}
  <div className="flex justify-between items-center">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Título</h1>
      <p className="text-sm text-muted-foreground">Subtítulo</p>
    </div>
    {/* Optional top-right action button */}
  </div>

  {/* Optional FiltersCard */}
  <FiltersCard ...>...</FiltersCard>

  {/* Main content — DataTable or Card */}
  <DataTable ... />
</div>
```

---

## Cards

- Background: `--card` (`#FFFFFF`)
- Border: use `border border-border` (renders as `rgba(0,0,0,0.09)`)
- Radius: `rounded-lg` (`.625rem`)
- Shadow: `shadow-sm`
- For filter cards specifically: add `border-primary/30` to signal interactivity

---

## Filter Components (`components/ui/filters.tsx`)

- `filterLabelClass` = `"text-xs font-semibold text-muted-foreground"` — use for ALL form field labels
- `filterInputClass` = `"h-9 w-full rounded-md border border-primary/40 ..."` — use for ALL filter inputs
- `FiltersCard` title: `text-lg font-semibold` — always larger than labels
- Action buttons: "Limpiar" uses `variant="outline"`, "Aplicar" uses `variant="default"` when filters are active

---

## Tables

- Use `DataTable` (from `components/ui/data-table.tsx`) for all paginated lists.
- **All columns default to left-aligned** — never use `text-center`, `justify-center`, or `textAlign: "center"` on any column, including badge/tag columns.
- Last column is always right-aligned automatically by `DataTable`.
- For raw `<Table>`: apply `style={{ width: "1px", textAlign: "right" }}` to the last `<TableHead>`, and wrap last `<TableCell>` content in `<div className="flex justify-end gap-2">`.
- Role/status badges render as `<span className="text-xs px-2 py-0.5 rounded-full {color}">` left-aligned inside the cell, no wrapper flex needed.

---

## Modifying Theme Colors

Edit the `:root` block in `frontend/src/index.css` around line 2642. All color tokens live there. **Do not rebuild Tailwind** — edit the compiled file directly.

To update sidebar colors, change the `BG`, `BG_HOVER`, `BG_ACTIVE` constants at the top of `frontend/src/components/PrivateSidebar.tsx`.

---

## Tailwind — Safe Classes Only

`index.css` is pre-compiled. Classes NOT present will silently have no effect. Use `style={{}}` for values not confirmed in the compiled file.

**Confirmed missing** (use inline style instead):
- `text-[11px]`, `font-bold`, `uppercase`, `tracking-wider`, `tracking-wide`, `gap-1.5`, `py-1.5`
