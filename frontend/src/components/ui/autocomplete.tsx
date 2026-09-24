import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { LoadingOverlay } from "./loading-overlay";

// ---------------------------------------------------------------------------
// useSuggestions — debounce + minChars; keeps the previous items while refetching
// (`loading` turns true as soon as the query changes, so the UI never flashes
// "Sin coincidencias" during the debounce window).
// ---------------------------------------------------------------------------
export function useSuggestions<T>(
  fetcher: (query: string) => Promise<T[]>,
  query: string,
  options?: { minChars?: number; debounceMs?: number; enabled?: boolean },
) {
  const { minChars = 2, debounceMs = 300, enabled = true } = options ?? {};
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (trimmed.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const data = await fetcherRef.current(trimmed);
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          console.error("Autocomplete failed:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, minChars, debounceMs, enabled]);

  return { items, loading };
}

// ---------------------------------------------------------------------------
// AutocompleteDropdown — the single suggestions panel used by every autocomplete.
// The parent decides when it is visible; this only renders its content:
// "Buscando…" (nothing to show yet), the list (dimmed while refetching) or
// "Sin coincidencias".
// ---------------------------------------------------------------------------
export interface AutocompleteDropdownProps<T> {
  items: T[];
  loading: boolean;
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  emptyText?: string;
}

export function AutocompleteDropdown<T>({
  items,
  loading,
  keyOf,
  renderItem,
  onSelect,
  emptyText = "Sin coincidencias",
}: AutocompleteDropdownProps<T>) {
  return (
    <div className="absolute left-0 right-0 z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
      <LoadingOverlay active={loading && items.length > 0} spinner={false} blockInteraction={false}>
        <ul className="max-h-56 overflow-y-auto py-1">
          {items.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Search className="h-3 w-3 shrink-0" />
              {loading ? "Buscando…" : emptyText}
            </li>
          )}
          {items.map((item, i) => (
            <li key={keyOf(item, i)}>
              <button
                type="button"
                className="hb-option flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                style={{ color: "var(--foreground)" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
              >
                <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      </LoadingOverlay>
    </div>
  );
}
