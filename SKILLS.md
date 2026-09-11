# SKILLS.md — Frontend Design Guidelines

Design rules to follow when building or editing frontend UI in this project.

---

## Filter Components — Visual Hierarchy

Filter cards must follow a strict visual hierarchy where **larger = more important**:

| Element | Class | Size | Role |
|---|---|---|---|
| `FiltersCard` title (CardTitle) | `text-lg font-semibold` | 18px | Most prominent — the section heading |
| Input values | `text-sm` | 14px | Main interactive content |
| Field labels (`filterLabelClass`) | `text-xs font-semibold text-muted-foreground` | 12px | Smallest — subordinate to title and inputs |
| Hint / footer text | `text-xs text-muted-foreground` | 12px | Least important context |

**Rule**: The card title must always use a larger font size class than `filterLabelClass`. Never use `text-sm` or larger for field labels if the card title is `text-lg` — that would invert the hierarchy.

**Wrong** (do not do this):
```tsx
<CardTitle className="text-sm ...">Filtrar taxones</CardTitle>
<label className="text-lg ...">Nombre científico</label>  {/* label bigger than title */}
```

**Correct**:
```tsx
<CardTitle className="text-lg font-semibold tracking-tight">Filtrar taxones</CardTitle>
<label className={filterLabelClass}>Nombre científico</label>  {/* text-xs, always smaller */}
```

---

## Tailwind CSS — Only Use Pre-Compiled Classes

`frontend/src/index.css` is a **pre-compiled Tailwind v4 output**. New utility classes added to JSX that are not already in `index.css` will silently have no effect (no error, just no style).

**Before using any Tailwind class not seen elsewhere in the codebase**, verify it exists in `index.css`:
```bash
grep -o "\.your-class-name\b" frontend/src/index.css
```

**Classes confirmed NOT in `index.css`** (use inline `style={{}}` instead):
- `text-[11px]`, `text-[13px]` — arbitrary font sizes
- `uppercase`, `lowercase`, `capitalize` — text transforms
- `tracking-wide`, `tracking-wider`, `tracking-widest` — letter spacing (only `tracking-tight` is compiled)
- `gap-1.5`, `gap-2.5`, `gap-3.5` — fractional gaps (only integer gap values are compiled)
- `py-1.5`, `px-1.5` — fractional padding
- `font-bold` — only `font-medium` and `font-semibold` are compiled

**Workaround**: Use inline `style={{ fontSize: '11px', letterSpacing: '0.05em' }}` for values not in the compiled CSS.

---

## Tables — Last Column Always Right-Aligned

The last column of every table (typically "Acciones") must be pinned to the right edge. Two things are required:

1. **Collapse the column** with `style={{ width: "1px" }}` so all remaining space goes to other columns.
2. **Right-align content** — `text-right` alone only works for text/inline elements. For buttons or any block/flex content, wrap the cell content in a flex container with `justify-end`.

### When using `DataTable` (from `components/ui/data-table.tsx`)

This is handled automatically — `DataTable` applies `style={{ width: "1px" }}`, `whitespace-nowrap`, and a `justify-end` flex wrapper to the last column of every row. No extra work needed.

### When using raw `<Table>` directly

Apply manually to the last `<TableHead>` and `<TableCell>`:

```tsx
{/* Header */}
<TableHead
  className="text-right whitespace-nowrap"
  style={{ width: "1px" }}
>
  Acciones
</TableHead>

{/* Cell */}
<TableCell
  className="whitespace-nowrap align-middle"
  style={{ width: "1px" }}
>
  <div className="flex justify-end gap-2">
    <Button>...</Button>
  </div>
</TableCell>
```

**Never** use `text-center` or `justify-center` on the last column — action buttons must always sit at the right edge.

---

## Date Range Picker

Use `FilterDateRangePicker` from `components/ui/filters.tsx`. It uses two native `<input type="date">` elements inside a single styled container — do **not** replace it with a `Calendar` (react-day-picker) inside a `Popover`, because react-day-picker's CSS is not compiled into `index.css`.
