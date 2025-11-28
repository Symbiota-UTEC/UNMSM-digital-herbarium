import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  MapPin,
  Calendar,
  Leaf,
  Eye,
  Users,
  University,
  Filter,
  Trash2,
  Search,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { API } from "@constants/api";
import { useAuth } from "@contexts/AuthContext";

export interface OccurrenceListItem {
  id: number;
  code?: string | null;
  scientificName?: string | null;
  family?: string | null;
  institutionName?: string | null;
  location?: string | null;
  collector?: string | null;
  date?: string | null; // ISO string
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  currentPage: number;
  totalPages: number;
  remainingPages: number;
}

interface OccurrencesPageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

const PAGE_SIZE_DEFAULT = 20;

type FiltersSnapshot = {
  code: string;
  scientificName: string;
  family: string;
  institution: string;
  location: string;
  collector: string;
  dateFrom: string;
  dateTo: string;
};

type SuggestionListResponse = {
  items: string[];
};

// Clase base de inputs
const filterInputClass =
  "h-9 w-full rounded-md border border-primary/40 bg-background px-3 py-2 text-xs md:text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

// ---------------------------------------------------------------------------
// Hook genérico de autocomplete (con debounce + minChars)
// ---------------------------------------------------------------------------
function useAutocomplete(
  token: string | null,
  endpoint: string,
  query: string,
  options?: { minChars?: number; debounceMs?: number; limit?: number },
) {
  const { minChars = 2, debounceMs = 300, limit = 10 } = options || {};
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          q: trimmed,
          limit: String(limit),
        });

        const res = await fetch(
          `${API.BASE_URL}/autocomplete/${endpoint}?${params.toString()}`,
          {
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          console.error(
            `Autocomplete ${endpoint} error:`,
            res.status,
            await res.text().catch(() => ""),
          );
          return;
        }

        const data: SuggestionListResponse = await res.json();
        setItems(data.items ?? []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error(`Autocomplete ${endpoint} failed:`, err);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [token, endpoint, query, minChars, debounceMs, limit]);

  return { items, loading };
}

// ---------------------------------------------------------------------------
// Input reutilizable con dropdown de sugerencias
// ---------------------------------------------------------------------------
interface FilterAutocompleteInputProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  loading: boolean;
  minChars?: number;
}

function FilterAutocompleteInput({
  label,
  placeholder,
  value,
  onChange,
  suggestions,
  loading,
  minChars = 2,
}: FilterAutocompleteInputProps) {
  const [open, setOpen] = useState(false);

  const trimmedLength = value.trim().length;
  const showDropdown =
    open &&
    trimmedLength >= minChars &&
    (loading || suggestions.length > 0);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <div className="relative">
        <input
          className={filterInputClass}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // pequeño delay para permitir click en la sugerencia
            setTimeout(() => setOpen(false), 120);
          }}
        />

        {showDropdown && (
          <div
            className="
              absolute left-0 right-0
              z-50 mt-1
              max-h-56 w-full
              rounded-md border border-border
              bg-card text-xs shadow-xl
            "
          >
            <div className="max-h-56 overflow-y-auto">
              {loading && (
                <div className="px-2 py-1 text-muted-foreground">
                  Buscando…
                </div>
              )}

              {!loading &&
                suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="flex w-full cursor-pointer items-center px-2 py-1 text-left hover:bg-muted"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    {item}
                  </button>
                ))}

              {!loading && suggestions.length === 0 && (
                <div className="px-2 py-1 text-muted-foreground">
                  Sin coincidencias
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
  const { token } = useAuth();

  const [items, setItems] = useState<OccurrenceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Mostrar / ocultar filtros
  const [filtersVisible, setFiltersVisible] = useState(true);

  // Filtros avanzados
  const [codeFilter, setCodeFilter] = useState("");
  const [scientificNameFilter, setScientificNameFilter] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [collectorFilter, setCollectorFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");

  // --- Autocompletes (cada uno con su endpoint) ---
  const {
    items: sciNameSuggestions,
    loading: sciNameLoading,
  } = useAutocomplete(token ?? null, "scientific-name", scientificNameFilter);

  const {
    items: familySuggestions,
    loading: familyLoading,
  } = useAutocomplete(token ?? null, "family", familyFilter);

  const {
    items: institutionSuggestions,
    loading: institutionLoading,
  } = useAutocomplete(token ?? null, "institution", institutionFilter, {
    minChars: 1,
  });

  const {
    items: locationSuggestions,
    loading: locationLoading,
  } = useAutocomplete(token ?? null, "location", locationFilter);

  const {
    items: collectorSuggestions,
    loading: collectorLoading,
  } = useAutocomplete(token ?? null, "collector", collectorFilter);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(total / pageSize), 1),
    [total, pageSize],
  );

  const filtersActive = Boolean(
    codeFilter ||
      scientificNameFilter ||
      familyFilter ||
      institutionFilter ||
      locationFilter ||
      collectorFilter ||
      dateFromFilter ||
      dateToFilter,
  );

  const buildFiltersSnapshot = (): FiltersSnapshot => ({
    code: codeFilter,
    scientificName: scientificNameFilter,
    family: familyFilter,
    institution: institutionFilter,
    location: locationFilter,
    collector: collectorFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
  });

  const fetchOccurrences = async ({
    page: targetPage,
    filters,
  }: {
    page: number;
    filters: FiltersSnapshot;
  }) => {
    if (!token) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        page_size: String(pageSize),
      });

      if (filters.code.trim()) {
        params.set("code", filters.code.trim());
      }
      if (filters.scientificName.trim()) {
        params.set("scientificName", filters.scientificName.trim());
      }
      if (filters.family.trim()) {
        params.set("family", filters.family.trim());
      }
      if (filters.institution.trim()) {
        params.set("institution", filters.institution.trim());
      }
      if (filters.location.trim()) {
        params.set("location", filters.location.trim());
      }
      if (filters.collector.trim()) {
        params.set("collector", filters.collector.trim());
      }
      if (filters.dateFrom) {
        params.set("dateFrom", filters.dateFrom);
      }
      if (filters.dateTo) {
        params.set("dateTo", filters.dateTo);
      }

      const res = await fetch(
        `${API.BASE_URL}/occurrences?${params.toString()}`,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const data: PaginatedResponse<OccurrenceListItem> = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial al tener token
  useEffect(() => {
    if (!token) return;
    const snapshot = buildFiltersSnapshot();
    fetchOccurrences({ page, filters: snapshot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleViewClick = (occurrenceId: number) => {
    onNavigate("occurrence-detail", { occurrenceId });
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-PE", { dateStyle: "medium" });
  };

  const handleClearFilters = () => {
    setCodeFilter("");
    setScientificNameFilter("");
    setFamilyFilter("");
    setInstitutionFilter("");
    setLocationFilter("");
    setCollectorFilter("");
    setDateFromFilter("");
    setDateToFilter("");

    const emptySnapshot: FiltersSnapshot = {
      code: "",
      scientificName: "",
      family: "",
      institution: "",
      location: "",
      collector: "",
      dateFrom: "",
      dateTo: "",
    };

    setPage(1);
    fetchOccurrences({ page: 1, filters: emptySnapshot });
  };

  const handleApplyFilters = () => {
    const snapshot = buildFiltersSnapshot();
    setPage(1);
    fetchOccurrences({ page: 1, filters: snapshot });
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const newPage = page - 1;
    const snapshot = buildFiltersSnapshot();
    setPage(newPage);
    fetchOccurrences({ page: newPage, filters: snapshot });
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const newPage = page + 1;
    const snapshot = buildFiltersSnapshot();
    setPage(newPage);
    fetchOccurrences({ page: newPage, filters: snapshot });
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">
            Ocurrencias
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro de ocurrencias a las que tienes acceso dentro del herbarium
            digital.
          </p>
        </div>

        <div className="text-xs md:text-sm text-muted-foreground md:text-right">
          <div>
            {loading
              ? "Cargando ocurrencias…"
              : `${total} ocurrencias encontradas`}
          </div>
          <div className="mt-1">
            Página {page} de {totalPages}
          </div>
        </div>
      </div>

      {/* Card de filtros avanzados */}
      <Card className="border border-primary/30 bg-muted/40 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/60 bg-muted/60 rounded-t-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                <Filter className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base md:text-lg">
                  Formulario de filtros
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Refina la lista por código, taxonomía, institución, localidad,
                  colector y rango de fechas.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                variant={filtersActive ? "default" : "outline"}
                className="text-[11px]"
              >
                {filtersActive ? "Filtros activos" : "Sin filtros activos"}
              </Badge>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setFiltersVisible((v) => !v)}
                aria-label={filtersVisible ? "Ocultar filtros" : "Mostrar filtros"}
              >
                {filtersVisible ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {filtersVisible && (
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Código (igualdad, sin autocomplete) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">
                  Código (exacto)
                </label>
                <input
                  className={filterInputClass}
                  placeholder="Ej. 280687"
                  value={codeFilter}
                  onChange={(e) => setCodeFilter(e.target.value)}
                />
              </div>

              {/* Nombre científico */}
              <FilterAutocompleteInput
                label="Nombre científico"
                placeholder="Ej. Lycopersicon hirsutum"
                value={scientificNameFilter}
                onChange={setScientificNameFilter}
                suggestions={sciNameSuggestions}
                loading={sciNameLoading}
              />

              {/* Familia */}
              <FilterAutocompleteInput
                label="Familia"
                placeholder="Ej. Solanaceae"
                value={familyFilter}
                onChange={setFamilyFilter}
                suggestions={familySuggestions}
                loading={familyLoading}
              />

              {/* Institución */}
              <FilterAutocompleteInput
                label="Institución"
                placeholder="Ej. San Marcos"
                value={institutionFilter}
                onChange={setInstitutionFilter}
                suggestions={institutionSuggestions}
                loading={institutionLoading}
                minChars={1}
              />

              {/* Localidad */}
              <FilterAutocompleteInput
                label="Localidad"
                placeholder="Ej. Cajamarca"
                value={locationFilter}
                onChange={setLocationFilter}
                suggestions={locationSuggestions}
                loading={locationLoading}
              />

              {/* Colector */}
              <FilterAutocompleteInput
                label="Colector"
                placeholder="Ej. Antonio Raimondi"
                value={collectorFilter}
                onChange={setCollectorFilter}
                suggestions={collectorSuggestions}
                loading={collectorLoading}
              />

              {/* Fecha (rango combinado) */}
              <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-2">
                <label className="text-xs font-semibold text-foreground">
                  Fecha (rango)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="date"
                      className={filterInputClass}
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                    />
                    <span className="text-[11px] text-muted-foreground">a</span>
                    <input
                      type="date"
                      className={filterInputClass}
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                    />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Selecciona una fecha de inicio y fin para acotar las
                  ocurrencias por fecha del evento.
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between pt-2 border-t border-dashed border-border/60">
              <span className="text-[11px] text-muted-foreground">
                Los filtros se aplican al hacer clic en{" "}
                <span className="font-semibold">“Aplicar filtros”</span>.
              </span>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={handleClearFilters}
                  disabled={loading}
                  title="Limpiar filtros"
                  aria-label="Limpiar filtros"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>

                <Button
                  variant={filtersActive ? "default" : "secondary"}
                  size="icon"
                  type="button"
                  onClick={handleApplyFilters}
                  disabled={loading}
                  title="Aplicar filtros"
                  aria-label="Aplicar filtros"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabla de ocurrencias */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base md:text-lg font-semibold">
                Ocurrencias compartidas
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Listado paginado de las ocurrencias visibles para tu usuario.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Código
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Nombre científico
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Familia
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Institución
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Localidad
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Colector
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Fecha
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No se encontraron ocurrencias.
                    </TableCell>
                  </TableRow>
                )}

                {items.map((occ) => (
                  <TableRow key={occ.id}>
                    {/* Código */}
                    <TableCell className="align-middle">
                      <Badge
                        variant="outline"
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                      >
                        {occ.code ?? "—"}
                      </Badge>
                    </TableCell>

                    {/* Nombre científico */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <Leaf className="h-4 w-4 text-primary" />
                        <span className="italic text-sm">
                          {occ.scientificName ?? "—"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Familia */}
                    <TableCell className="align-middle text-sm">
                      {occ.family ?? "—"}
                    </TableCell>

                    {/* Institución */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <University className="h-3 w-3 text-muted-foreground" />
                        <span>{occ.institutionName ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Localidad */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{occ.location ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Colector */}
                    <TableCell className="align-middle text-sm">
                      {occ.collector ?? "—"}
                    </TableCell>

                    {/* Fecha */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{formatDate(occ.date)}</span>
                      </div>
                    </TableCell>

                    {/* Acciones */}
                    <TableCell className="align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClick(occ.id)}
                        title="Ver detalles de la ocurrencia"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Cargando…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-4">
            <span className="text-xs md:text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={handlePrevPage}
              >
                Anterior
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={handleNextPage}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
