import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { MapPin, Calendar, Leaf, Eye, University } from "lucide-react";
import { useAuth } from "@contexts/AuthContext";
import { occurrencesService } from "@services/occurrences.service";
import type { OccurrenceListItem } from "@services/occurrences.service";
import { FiltersCard } from "../ui/filters";
import {
  OccurrenceFilterFields,
  EMPTY_OCCURRENCE_FILTERS,
  hasActiveOccurrenceFilters,
  type OccurrenceFilterValues,
} from "../OccurrenceFilterFields";
import { DataTable, type ColumnDef } from "../ui/data-table";

interface OccurrencesPageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

const PAGE_SIZE_DEFAULT = 20;

type FiltersSnapshot = OccurrenceFilterValues;

export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
  const { apiFetch, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState<OccurrenceListItem[]>([]);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<OccurrenceFilterValues>(() => ({
    code: searchParams.get("code") ?? "",
    scientificName: searchParams.get("name") ?? "",
    family: searchParams.get("family") ?? "",
    institution: searchParams.get("institution") ?? "",
    location: searchParams.get("location") ?? "",
    collector: searchParams.get("collector") ?? "",
    dateFrom: searchParams.get("from") ?? "",
    dateTo: searchParams.get("to") ?? "",
  }));

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize]);

  const filtersActive = hasActiveOccurrenceFilters(filters);

  const syncURL = (filters: FiltersSnapshot, pageNum: number) => {
    const p = new URLSearchParams();
    if (filters.code) p.set("code", filters.code);
    if (filters.scientificName) p.set("name", filters.scientificName);
    if (filters.family) p.set("family", filters.family);
    if (filters.institution) p.set("institution", filters.institution);
    if (filters.location) p.set("location", filters.location);
    if (filters.collector) p.set("collector", filters.collector);
    if (filters.dateFrom) p.set("from", filters.dateFrom);
    if (filters.dateTo) p.set("to", filters.dateTo);
    if (pageNum > 1) p.set("page", String(pageNum));
    setSearchParams(p, { replace: true });
  };

  const fetchOccurrences = async ({ page: targetPage, filters }: { page: number; filters: FiltersSnapshot }) => {
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
    fetchOccurrences({ page, filters: filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-PE", { dateStyle: "medium" });
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_OCCURRENCE_FILTERS);
    setPage(1);
    syncURL(EMPTY_OCCURRENCE_FILTERS, 1);
    fetchOccurrences({ page: 1, filters: EMPTY_OCCURRENCE_FILTERS });
  };

  const handleApplyFilters = () => {
    const snapshot = filters;
    setPage(1);
    syncURL(snapshot, 1);
    fetchOccurrences({ page: 1, filters: snapshot });
  };

  const handlePrevPage = () => {
    if (page <= 1 || loading) return;
    const newPage = page - 1;
    const snapshot = filters;
    setPage(newPage);
    syncURL(snapshot, newPage);
    fetchOccurrences({ page: newPage, filters: snapshot });
  };

  const handleNextPage = () => {
    if (page >= totalPages || loading) return;
    const newPage = page + 1;
    const snapshot = filters;
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
        <OccurrenceFilterFields values={filters} onChange={setFilters} />
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
