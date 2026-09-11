Adds or fixes a column in a table in this project, enforcing the last-column right-alignment rule.

## Which table component is being used?

First, read the target file and identify whether it uses:

- **`DataTable`** (from `components/ui/data-table.tsx`) — right-alignment is automatic. Only define the `ColumnDef`.
- **Raw `<Table>`** (direct shadcn import) — right-alignment must be applied manually.

---

## Adding a column to `DataTable`

Add an entry to the `ColumnDef<T>[]` array. The last column is always right-aligned automatically by `DataTable` (it wraps the cell content in `<div style={{ display: "flex", justifyContent: "flex-end" }}>` and sets `style={{ width: "1px" }}`).

```tsx
const columns: ColumnDef<MyType>[] = [
  {
    key: "name",
    header: "Nombre",
    cell: (row) => <span>{row.name}</span>,
  },
  // Last column — DataTable handles right-alignment automatically
  {
    key: "actions",
    header: "Acciones",
    cell: (row) => (
      <Button variant="ghost" size="icon" onClick={() => handleView(row.id)}>
        <Eye className="h-4 w-4" />
      </Button>
    ),
  },
];
```

When there are multiple action buttons in the last column, put them in a `flex gap-1` container — `DataTable`'s outer `justify-end` wrapper will push the whole group to the right:

```tsx
cell: (row) => (
  <div className="flex gap-1">
    <Button ...><Eye /></Button>
    <Button ...><Pencil /></Button>
  </div>
),
```

---

## Adding or fixing a column in a raw `<Table>`

For the **last column**, three things are required on both `<TableHead>` and `<TableCell>`:

| What | Why |
|---|---|
| `style={{ width: "1px" }}` | Collapses the column to minimum width so other columns take remaining space, pinning it to the right edge |
| `whitespace-nowrap` on the header | Prevents the header text from wrapping |
| `<div className="flex justify-end gap-2">` inside the cell | Pushes button/icon content to the right (text-right alone doesn't work on block elements) |

```tsx
{/* Header — use style for textAlign, NOT className="text-right".
    TableHead applies text-left by default; in Tailwind v4 the compiled
    order determines which class wins, so inline style is the safe override. */}
<TableHead
  className="whitespace-nowrap"
  style={{ width: "1px", textAlign: "right" }}
>
  Acciones
</TableHead>

{/* Cell */}
<TableCell
  className="whitespace-nowrap align-middle"
  style={{ width: "1px" }}
>
  <div className="flex justify-end gap-2">
    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
      <Eye className="h-4 w-4" />
    </Button>
  </div>
</TableCell>
```

**Rules**:
- Never use `text-center` or `justify-center` on the last column — actions always sit at the right edge.
- Never omit `style={{ width: "1px" }}` — without it the column may not reach the right edge even if content is right-aligned.
- The `width: 1px` trick only works when the `<Table>` itself is full-width (`w-full`), which it is by default in this project.

---

## Checklist before finishing

- [ ] Last `<TableHead>`: has `text-right`, `whitespace-nowrap`, and `style={{ width: "1px" }}`
- [ ] Last `<TableCell>`: has `whitespace-nowrap`, `style={{ width: "1px" }}`, and content wrapped in `flex justify-end`
- [ ] No `text-center` or `justify-center` on the last column
- [ ] If using `DataTable`: no manual alignment needed — only define the `ColumnDef`
