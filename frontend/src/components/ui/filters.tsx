import { useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Badge } from "./badge";
import { Button } from "./button";
import {
  Filter,
  ChevronUp,
  ChevronDown,
  Trash2,
  Search,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import { autocompleteService } from "@services/autocomplete.service";
import { AutocompleteDropdown, useSuggestions } from "./autocomplete";

// ---------------------------------------------------------------------------
// Shared class tokens (only use classes confirmed in pre-compiled index.css)
// ---------------------------------------------------------------------------
export const filterInputClass =
  "h-9 w-full rounded-md border border-primary/40 bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

// text-xs (12px) muted — always smaller than the FiltersCard title (text-lg)
export const filterLabelClass = "text-xs font-semibold text-muted-foreground";

// ---------------------------------------------------------------------------
// String autocomplete hook (generic /autocomplete/<endpoint> suggestions)
// ---------------------------------------------------------------------------
export function useAutocomplete(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  endpoint: string,
  query: string,
  options?: { minChars?: number; debounceMs?: number; limit?: number },
) {
  const { limit = 10, ...rest } = options ?? {};
  return useSuggestions(
    (q) => autocompleteService.query(apiFetch, endpoint, q, limit),
    query,
    rest,
  );
}

/** Nombres científicos (backbone WFO) como strings, para los filtros. */
export function useScientificNameAutocomplete(
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  query: string,
) {
  return useSuggestions(
    async (q) => (await autocompleteService.scientificNames(apiFetch, q, 10)).map((r) => r.scientificName),
    query,
  );
}

// ---------------------------------------------------------------------------
// Autocomplete input with dropdown suggestions
// ---------------------------------------------------------------------------
export interface FilterAutocompleteInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  suggestions: string[];
  loading: boolean;
  minChars?: number;
}

export function FilterAutocompleteInput({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  suggestions,
  loading,
  minChars = 2,
}: FilterAutocompleteInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label className={filterLabelClass}>{label}</label>
      <div className="relative">
        <input
          className={filterInputClass}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {open && value.trim().length >= minChars && (
          <AutocompleteDropdown
            items={suggestions}
            loading={loading}
            keyOf={(item) => item}
            renderItem={(item) => <span className="truncate">{item}</span>}
            onSelect={(item) => { onChange(item); setOpen(false); onSelect?.(item); }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date range picker — two native date inputs in a single styled container.
// Uses browser-native pickers (no react-day-picker CSS dependency).
// ---------------------------------------------------------------------------
export interface FilterDateRangePickerProps {
  label?: string;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

export function FilterDateRangePicker({
  label = "Fecha (rango)",
  from,
  to,
  onFromChange,
  onToChange,
}: FilterDateRangePickerProps) {
  const hasValue = !!(from || to);

  return (
    <div className="flex flex-col gap-1">
      <label className={filterLabelClass}>{label}</label>
      <div
        className="flex items-center gap-2 w-full rounded-md border border-primary/40 bg-background px-3 shadow-sm"
        style={{ minHeight: "2.25rem" }}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="date"
          className="flex-1 bg-transparent outline-none text-sm py-1 min-w-0"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          title="Fecha de inicio"
        />
        <span className="text-sm text-muted-foreground" style={{ userSelect: "none" }}>
          →
        </span>
        <input
          type="date"
          className="flex-1 bg-transparent outline-none text-sm py-1 min-w-0"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          title="Fecha de fin"
        />
        {hasValue && (
          <button
            type="button"
            title="Limpiar rango de fechas"
            onClick={() => { onFromChange(""); onToChange(""); }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FiltersCard — wrapper with header, badge, collapse toggle and action buttons
// Design rule: card title (text-lg) > field labels (text-xs) — hierarchy is
// maintained by size: title is largest element, labels are smallest.
// ---------------------------------------------------------------------------
export interface FiltersCardProps {
  title?: string;
  description?: string;
  filtersActive: boolean;
  onClear: () => void;
  onApply: () => void;
  loading?: boolean;
  defaultVisible?: boolean;
  children: ReactNode;
}

export function FiltersCard({
  title = "Formulario de filtros",
  description,
  filtersActive,
  onClear,
  onApply,
  loading = false,
  defaultVisible = true,
  children,
}: FiltersCardProps) {
  const [visible, setVisible] = useState(defaultVisible);

  return (
    <Card className="border border-primary/30 shadow-sm">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full bg-primary/10"
              style={{ width: "2rem", height: "2rem", flexShrink: 0 }}
            >
              <Filter className="h-4 w-4 text-primary" />
            </div>
            <div>
              {/* Title must always be larger than filterLabelClass (text-xs) */}
              <CardTitle className="text-lg font-semibold tracking-tight">
                {title}
              </CardTitle>
              {description && (
                <CardDescription className="text-xs">{description}</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={filtersActive ? "default" : "outline"}
              className="text-xs hidden sm:inline-flex"
            >
              {filtersActive ? "Filtros activos" : "Sin filtros"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Ocultar filtros" : "Mostrar filtros"}
            >
              {visible
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {visible && (
        <CardContent className="pt-4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {children}
          <div className="flex items-center justify-between border-t border-dashed" style={{ paddingTop: "0.875rem", paddingBottom: "0.25rem" }}>
            <span className="text-xs text-muted-foreground">
              Clic en{" "}
              <span className="font-semibold text-foreground">Aplicar</span>
              {" "}para filtrar los resultados.
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onClear}
                disabled={loading}
                className="h-8 text-xs px-3 gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Limpiar
              </Button>
              <Button
                variant={filtersActive ? "default" : "secondary"}
                size="sm"
                type="button"
                onClick={onApply}
                disabled={loading}
                className="h-8 text-xs px-3 gap-1"
              >
                <Search className="h-3 w-3" />
                Aplicar
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
