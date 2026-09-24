Adds a new filter field to an existing page that uses `FiltersCard` from `components/ui/filters.tsx`.

## Steps

1. **Identify the target page** from the user's message or the currently open file in the IDE.

2. **Read the page file** to understand:
   - Which filters already exist (state variables, `FiltersSnapshot` type, `buildFiltersSnapshot`, `handleClearFilters`, `handleApplyFilters`, and the `FiltersCard` JSX block)
   - Which service call receives filter params (usually `occurrencesService.list(...)` or similar)
   - The grid layout inside `FiltersCard` (`grid-cols-1 md:grid-cols-3 lg:grid-cols-4` or similar)

3. **Determine the filter type** from the user's description:
   - **Free-text exact match** → plain `<input>` with `filterInputClass`
   - **Autocomplete** → `FilterAutocompleteInput` + `useAutocomplete` hook (requires an autocomplete endpoint)
   - **Date range** → `FilterDateRangePicker` (from/to string pair)
   - **Select / enum** → `<select>` with `filterInputClass` or shadcn `Select`

4. **Make all changes in one pass** (read once, edit once):

   a. Add state variable(s) — e.g. `const [xyzFilter, setXyzFilter] = useState("")`

   b. If autocomplete: add `useAutocomplete` call with the correct endpoint and `minChars`

   c. Extend `FiltersSnapshot` type with the new field(s)

   d. Add the field to `buildFiltersSnapshot()` return object

   e. Reset the field in `handleClearFilters()` (set to `""` and include in the `empty` snapshot)

   f. Pass the field to the service call inside `fetchOccurrences` (or equivalent fetch function)

   g. Add the JSX inside the `FiltersCard` grid — one `<div className="flex flex-col gap-1">` per field for plain inputs, or the appropriate component for autocomplete/date

   h. Update `filtersActive` boolean to include the new field if it affects the "active" state

5. **Visual hierarchy rules** (from frontend/CLAUDE.md > "Design rules" and "CSS / Theming" — must be followed):
   - Field labels use `className={filterLabelClass}` (which is `text-xs font-semibold text-muted-foreground`) — never larger
   - `FiltersCard` title stays `text-lg` — always larger than labels
   - Only use Tailwind classes confirmed in the compiled `index.css`. For anything else use inline `style={{}}`:
     - **Safe**: `text-xs`, `text-sm`, `font-semibold`, `font-medium`, `text-muted-foreground`, `gap-1`, `gap-2`, `gap-3`, `flex`, `flex-col`, `items-center`, `rounded-md`, `border`, `px-3`, `py-1`, `py-2`, `h-9`, `w-full`, `shadow-sm`, `outline-none`
     - **Not safe** (not compiled): `text-[11px]`, `uppercase`, `tracking-wider`, `tracking-wide`, `gap-1.5`, `py-1.5`, `font-bold`

6. **Do not touch** anything outside the filter-related code: columns, `DataTable`, pagination handlers, or unrelated state.

7. After editing, confirm which file was changed and list the new state variables and snapshot fields added.
