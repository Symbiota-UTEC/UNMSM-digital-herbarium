import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { MapPin, Calendar, Leaf, Eye, University } from "lucide-react";
import { useAuth } from "@contexts/AuthContext";
import { occurrencesService } from "@services/occurrences.service";
import type { OccurrenceListItem } from "@services/occurrences.service";
import { autocompleteService } from "@services/autocomplete.service";
import {
  FiltersCard,
  FilterAutocompleteInput,
  FilterDateRangePicker,
  useAutocomplete,
  filterInputClass,
  filterLabelClass,
} from "../ui/filters";
import { DataTable, type ColumnDef } from "../ui/data-table";

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

export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
  const { apiFetch, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<OccurrenceListItem[]>([]);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [codeFilter, setCodeFilter] = useState(() => searchParams.get("code") ?? "");
  const [scientificNameFilter, setScientificNameFilter] = useState(() => searchParams.get("name") ?? "");
  const [familyFilter, setFamilyFilter] = useState(() => searchParams.get("family") ?? "");
  const [institutionFilter, setInstitutionFilter] = useState(() => searchParams.get("institution") ?? "");
  const [locationFilter, setLocationFilter] = useState(() => searchParams.get("location") ?? "");
  const [collectorFilter, setCollectorFilter] = useState(() => searchParams.get("collector") ?? "");
  const [dateFromFilter, setDateFromFilter] = useState(() => searchParams.get("from") ?? "");
  const [dateToFilter, setDateToFilter] = useState(() => searchParams.get("to") ?? "");

  const [sciNameSuggestions, setSciNameSuggestions] = useState<string[]>([]);
  const [sciNameLoading, setSciNameLoading] = useState(false);
  useEffect(() => {
    const q = scientificNameFilter.trim();
    if (q.length < 2) { setSciNameSuggestions([]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        setSciNameLoading(true);
        const results = await autocompleteService.scientificNames(apiFetch, q, 10);
        if (!cancelled) setSciNameSuggestions(results.map((r) => r.scientificName));
      } catch { if (!cancelled) setSciNameSuggestions([]); }
      finally { if (!cancelled) setSciNameLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scientificNameFilter]);
  const { items: familySuggestions, loading: familyLoading } =
    useAutocomplete(apiFetch, "family", familyFilter);
  const { items: institutionSuggestions, loading: institutionLoading } =
    useAutocomplete(apiFetch, "institution", institutionFilter, { minChars: 1 });
  const { items: locationSuggestions, loading: locationLoading } =
    useAutocomplete(apiFetch, "location", locationFilter);
  const { items: collectorSuggestions, loading: collectorLoading } =
    useAutocomplete(apiFetch, "collector", collectorFilter);

  const totalPages = useMemo(
    () => Math.max(Math.ceil(total / pageSize), 1),
    [total, pageSize],
  );

  const filtersActive = Boolean(
    codeFilter || scientificNameFilter || familyFilter ||
    institutionFilter || locationFilter || collectorFilter ||
    dateFromFilter || dateToFilter,
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

  const syncURL = (filters: FiltersSnapshot, pageNum: number) => {
    const p = new URLSearchParams();
    if (filters.code)           p.set("code",        filters.code);
    if (filters.scientificName) p.set("name",        filters.scientificName);
    if (filters.family)         p.set("family",      filters.family);
    if (filters.institution)    p.set("institution", filters.institution);
    if (filters.location)       p.set("location",    filters.location);
    if (filters.collector)      p.set("collector",   filters.collector);
    if (filters.dateFrom)       p.set("from",        filters.dateFrom);
    if (filters.dateTo)         p.set("to",          filters.dateTo);
    if (pageNum > 1)            p.set("page",        String(pageNum));
    setSearchParams(p, { replace: true });
  };

  const fetchOccurrences = async ({
    page: targetPage,
    filters,
  }: {
    page: number;
    filters: FiltersSnapshot;
  }) => {
    setLoading(true);
    try {
      const data = await occurrencesService.list(apiFetch, {
        page: targetPage,
        pageSize,
        code: filters.code,
        scientificName: filters.scientificName,
        family: filters.family,
        institution: filters.institution,
        location: filters.location,
        collector: filters.collector,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchOccurrences({ page, filters: buildFiltersSnapshot() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

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
    const empty: FiltersSnapshot = {
      code: "", scientificName: "", family: "", institution: "",
      location: "", collector: "", dateFrom: "", dateTo: "",
    };
    setPage(1);
    syncURL(empty, 1);
    fetchOccurrences({ page: 1, filters: empty });
  };

  const handleApplyFilters = () => {
    const snapshot = buildFiltersSnapshot();
    setPage(1);
    syncURL(snapshot, 1);
    fetchOccurrences({ page: 1, filters: snapshot });
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const newPage = page - 1;
    const snapshot = buildFiltersSnapshot();
    setPage(newPage);
    syncURL(snapshot, newPage);
    fetchOccurrences({ page: newPage, filters: snapshot });
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const newPage = page + 1;
    const snapshot = buildFiltersSnapshot();
    setPage(newPage);
    syncURL(snapshot, newPage);
    fetchOccurrences({ page: newPage, filters: snapshot });
  };

  const columns: ColumnDef<OccurrenceListItem>[] = [
    {
      key: "code",
      header: "Código",
      cell: (occ) => (
        <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 rounded-full">
          {occ.code ?? "—"}
        </Badge>
      ),
    },
    {
      key: "scientific-name",
      header: "Nombre científico",
      cell: (occ) => (
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-primary" />
          <span className="italic text-sm">{occ.scientificName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "family",
      header: "Familia",
      cell: (occ) => <span className="text-sm">{occ.family ?? "—"}</span>,
    },
    {
      key: "institution",
      header: "Institución",
      cell: (occ) => (
        <div className="flex items-center gap-1 text-sm">
          <University className="h-3 w-3 text-muted-foreground" />
          <span>{occ.institutionName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "location",
      header: "Localidad",
      cell: (occ) => (
        <div className="flex items-center gap-1 text-sm">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span>{occ.location ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "collector",
      header: "Colector",
      cell: (occ) => <span className="text-sm">{occ.collector ?? "—"}</span>,
    },
    {
      key: "date",
      header: "Fecha",
      cell: (occ) => (
        <div className="flex items-center gap-1 text-sm">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span>{formatDate(occ.date)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      cell: (occ) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onNavigate("occurrence-detail", { occurrenceId: occ.occurrenceId })}
          title="Ver detalles de la ocurrencia"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Ocurrencias</h1>
          <p className="text-sm text-muted-foreground">
            Registro de ocurrencias a las que tienes acceso dentro del herbarium digital.
          </p>
        </div>
      </div>

      <FiltersCard
        title="Filtrar ocurrencias"
        description="Refina la lista por código, taxonomía, institución, localidad, colector y rango de fechas."
        filtersActive={filtersActive}
        onClear={handleClearFilters}
        onApply={handleApplyFilters}
        loading={loading}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className={filterLabelClass}>Código (exacto)</label>
            <input
              className={filterInputClass}
              placeholder="Ej. 280687"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
            />
          </div>

          <FilterAutocompleteInput
            label="Nombre científico"
            placeholder="Ej. Lycopersicon hirsutum"
            value={scientificNameFilter}
            onChange={setScientificNameFilter}
            suggestions={sciNameSuggestions}
            loading={sciNameLoading}
          />

          <FilterAutocompleteInput
            label="Familia"
            placeholder="Ej. Solanaceae"
            value={familyFilter}
            onChange={setFamilyFilter}
            suggestions={familySuggestions}
            loading={familyLoading}
          />

          <FilterAutocompleteInput
            label="Institución"
            placeholder="Ej. San Marcos"
            value={institutionFilter}
            onChange={setInstitutionFilter}
            suggestions={institutionSuggestions}
            loading={institutionLoading}
            minChars={1}
          />

          <FilterAutocompleteInput
            label="Localidad"
            placeholder="Ej. Cajamarca"
            value={locationFilter}
            onChange={setLocationFilter}
            suggestions={locationSuggestions}
            loading={locationLoading}
          />

          <FilterAutocompleteInput
            label="Colector"
            placeholder="Ej. Antonio Raimondi"
            value={collectorFilter}
            onChange={setCollectorFilter}
            suggestions={collectorSuggestions}
            loading={collectorLoading}
          />

          <div className="md:col-span-2 lg:col-span-2">
            <FilterDateRangePicker
              from={dateFromFilter}
              to={dateToFilter}
              onFromChange={setDateFromFilter}
              onToChange={setDateToFilter}
            />
          </div>
        </div>
      </FiltersCard>

      <DataTable<OccurrenceListItem>
        title="Ocurrencias compartidas"
        description="Listado paginado de las ocurrencias visibles para tu usuario."
        columns={columns}
        data={items}
        keyExtractor={(row) => row.occurrenceId}
        loading={loading}
        emptyMessage="No se encontraron ocurrencias."
        page={page}
        totalPages={totalPages}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
      />
    </div>
  );
}
