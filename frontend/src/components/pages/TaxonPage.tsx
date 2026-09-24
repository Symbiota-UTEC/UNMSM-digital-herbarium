import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Leaf, ChevronLeft, ChevronRight, ChevronDown, Loader2, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { taxonService, type TaxonTreeNode, type TaxonSearchItem } from "@services/taxon.service";
import { FiltersCard, FilterAutocompleteInput, filterLabelClass, useScientificNameAutocomplete } from "../ui/filters";
import { DataTable, type ColumnDef } from "../ui/data-table";

/* --------------------------- Componente fila ------------------------- */

interface TreeRowProps {
  node: TaxonTreeNode;
  depth: number;
  isExpanded: boolean;
  isLoadingChildren: boolean;
  onToggle: () => void;
  childrenNodes?: TaxonTreeNode[];
  canLoadMoreChildren: boolean;
  onLoadMoreChildren?: () => void;
  onViewDetail?: () => void;
  onNavigate?: (page: string, params?: Record<string, any>) => void;
}

function TaxonTreeRow({
  node,
  depth,
  isExpanded,
  isLoadingChildren,
  onToggle,
  childrenNodes,
  canLoadMoreChildren,
  onLoadMoreChildren,
  onViewDetail,
  onNavigate,
}: TreeRowProps) {
  const indentPx = depth * 18;

  const synonymsLabel =
    node.synonyms && node.synonyms.length > 0
      ? node.synonyms
          .map((s) => s.scientificName)
          .filter(Boolean)
          .join("; ")
      : "";

  const rankLabel = node.taxonRank ?? "—";

  const handleEyeClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onViewDetail?.();
  };

  return (
    <div className="text-sm">
      <div
        className="flex items-start gap-2 py-1 hover:bg-muted/60 rounded-md cursor-pointer"
        style={{ paddingLeft: indentPx }}
        onClick={onToggle}
      >
        <div className="mt-0.5">
          {node.hasChildren ? (
            isLoadingChildren ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="inline-block w-4" />
          )}
        </div>

        <div className="flex-1 flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Leaf className="h-3.5 w-3.5 text-primary" />
              <span className="italic">{node.scientificName || "(sin nombre)"}</span>
              {node.scientificNameAuthorship && (
                <span className="text-xs text-muted-foreground">{node.scientificNameAuthorship}</span>
              )}
              <Badge variant="outline" className="text-[10px]">
                {rankLabel}
              </Badge>
            </div>
            {synonymsLabel && <div className="text-[11px] text-muted-foreground">[{synonymsLabel}]</div>}
          </div>

          {onViewDetail && node.taxonId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleEyeClick}
              title="Ver detalle del taxón"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isExpanded &&
        childrenNodes?.map((child) => (
          <TaxonTreeNodeContainer key={child.taxonId} node={child} depth={depth + 1} onNavigate={onNavigate} />
        ))}

      {isExpanded && canLoadMoreChildren && (
        <div className="pl-8 pb-1" style={{ paddingLeft: indentPx + 24 }}>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-2 h-6"
            onClick={(e: ReactMouseEvent) => {
              e.stopPropagation();
              onLoadMoreChildren?.();
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Cargar más taxones…
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------- Contenedor que maneja recursión/estado --------------- */

interface NodeContainerProps {
  node: TaxonTreeNode;
  depth: number;
  onNavigate?: (page: string, params?: Record<string, any>) => void;
}

function TaxonTreeNodeContainer({ node, depth, onNavigate }: NodeContainerProps) {
  const { apiFetch } = useAuth();
  const [children, setChildren] = useState<TaxonTreeNode[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchChildrenPage = async (page: number) => {
    if (!node.wfoTaxonId || !node.hasChildren) return;
    try {
      setLoading(true);
      const data = await taxonService.getTree(apiFetch, {
        parentId: node.wfoTaxonId,
        page,
        size: PAGE_SIZE.TAXON_TREE_CHILDREN,
      });
      setChildren((prev) => (page === 1 ? (data.items ?? []) : [...prev, ...(data.items ?? [])]));
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al cargar las hijas del taxón.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!expanded && node.hasChildren && currentPage === 0) await fetchChildrenPage(1);
    setExpanded((prev) => !prev);
  };

  const canLoadMoreChildren = node.hasChildren && totalPages > 0 && currentPage < totalPages;

  const handleViewDetail = () => {
    if (!node.taxonId) return;
    if (onNavigate) {
      onNavigate("taxon-detail", { taxonId: node.taxonId });
      return;
    }
    window.location.href = `/taxon/${encodeURIComponent(node.taxonId)}`;
  };

  return (
    <TaxonTreeRow
      node={node}
      depth={depth}
      isExpanded={expanded}
      isLoadingChildren={loading}
      onToggle={handleToggle}
      childrenNodes={children}
      canLoadMoreChildren={canLoadMoreChildren}
      onLoadMoreChildren={() => {
        if (currentPage + 1 <= totalPages) fetchChildrenPage(currentPage + 1);
      }}
      onViewDetail={handleViewDetail}
      onNavigate={onNavigate}
    />
  );
}

/* ================================ PAGE ================================ */

interface TaxonPageProps {
  onNavigate?: (page: string, params?: Record<string, any>) => void;
}

export function TaxonPage({ onNavigate }: TaxonPageProps) {
  const { apiFetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tree state
  const [rootNodes, setRootNodes] = useState<TaxonTreeNode[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);
  const [rootCurrentPage, setRootCurrentPage] = useState(0);
  const [rootTotalPages, setRootTotalPages] = useState(0);

  // Filter state — initialize from URL
  const [scientificNameFilter, setScientificNameFilter] = useState(() => searchParams.get("q") ?? "");
  const [appliedQuery, setAppliedQuery] = useState(() => searchParams.get("q") ?? "");

  const { items: sciNameSuggestions, loading: sciNameLoading } = useScientificNameAutocomplete(
    apiFetch,
    scientificNameFilter,
  );

  // Search results state
  const [searchResults, setSearchResults] = useState<TaxonSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(() => !!searchParams.get("q"));
  const [searchCurrentPage, setSearchCurrentPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);

  const fetchRootNodes = async (page = 1) => {
    try {
      setIsLoadingRoot(true);
      const data = await taxonService.getTree(apiFetch, { page, size: PAGE_SIZE.TAXON_TREE_ROOT });
      setRootNodes(data.items ?? []);
      setRootCurrentPage(data.currentPage);
      setRootTotalPages(data.totalPages);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al cargar los taxones.");
    } finally {
      setIsLoadingRoot(false);
    }
  };

  const fetchSearchResults = async (query: string, page: number) => {
    if (!query.trim()) return;
    try {
      setSearchLoading(true);
      const data = await taxonService.search(apiFetch, { q: query.trim(), page, size: 20 });
      setSearchResults(data.items ?? []);
      setSearchCurrentPage(data.currentPage ?? page);
      setSearchTotalPages(data.totalPages ?? 1);
      setSearchTotal(data.total ?? 0);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Error al buscar taxones.");
    } finally {
      setSearchLoading(false);
    }
  };

  // Los resultados previos se conservan (atenuados) hasta que llegue la respuesta.
  const applySearch = (query: string) => {
    const q = query.trim();
    setAppliedQuery(q);
    if (q) {
      setSearchParams({ q }, { replace: true });
      fetchSearchResults(q, 1);
    }
  };

  const handleApplyFilters = () => applySearch(scientificNameFilter);

  const handleClearFilters = () => {
    setScientificNameFilter("");
    setAppliedQuery("");
    setSearchResults([]);
    setSearchCurrentPage(1);
    setSearchTotalPages(1);
    setSearchTotal(0);
    setSearchParams({}, { replace: true });
  };

  const handleSearchPageChange = (newPage: number) => {
    setSearchCurrentPage(newPage);
    const q = appliedQuery.trim();
    if (q) {
      setSearchParams(newPage > 1 ? { q, page: String(newPage) } : { q }, { replace: true });
      fetchSearchResults(q, newPage);
    }
  };

  const handleSearchResultClick = (taxonId: string) => {
    if (!taxonId) return;
    if (onNavigate) {
      onNavigate("taxon-detail", { taxonId });
      return;
    }
    window.location.href = `/taxon/${encodeURIComponent(taxonId)}`;
  };

  const filtersActive = !!appliedQuery.trim();

  useEffect(() => {
    fetchRootNodes(1);
    // Restore search results if URL has a query on mount
    const q = searchParams.get("q");
    if (q) {
      const p = Math.max(1, Number(searchParams.get("page")) || 1);
      fetchSearchResults(q, p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchColumns: ColumnDef<TaxonSearchItem>[] = [
    {
      key: "scientific-name",
      header: "Nombre científico",
      cell: (r) => (
        <div className="space-y-0.5">
          <div className="italic">{r.scientificName || "(sin nombre)"}</div>
          {r.scientificNameAuthorship && (
            <div className="text-xs text-muted-foreground">{r.scientificNameAuthorship}</div>
          )}
        </div>
      ),
    },
    {
      key: "rank",
      header: "Rango",
      cell: (r) =>
        r.taxonRank ? (
          <Badge variant="outline" className="text-[10px]">
            {r.taxonRank}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "status",
      header: "Estado",
      cell: (r) =>
        r.taxonomicStatus ? (
          <Badge variant="secondary" className="text-[10px]">
            {r.taxonomicStatus}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "family",
      header: "Familia",
      cell: (r) => <span className="text-sm">{r.family || "—"}</span>,
    },
    {
      key: "occurrences",
      header: "Ocurrencias",
      cell: (r) => <span className="text-sm tabular-nums">{r.occurrenceCount.toLocaleString("es-PE")}</span>,
    },
    {
      key: "actions",
      header: "Acciones",
      cell: (r) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e: ReactMouseEvent) => {
            e.stopPropagation();
            handleSearchResultClick(r.taxonId);
          }}
          title="Ver detalle del taxón"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Taxones</h1>
        <p className="text-sm text-muted-foreground">Catálogo de clasificación taxonómica</p>
      </div>

      <FiltersCard
        title="Filtrar taxones"
        description="Busca taxones por nombre científico."
        filtersActive={filtersActive}
        onClear={handleClearFilters}
        onApply={handleApplyFilters}
        loading={searchLoading}
      >
        <FilterAutocompleteInput
          label="Nombre científico"
          placeholder="Ej. Lycopersicon hirsutum"
          value={scientificNameFilter}
          onChange={setScientificNameFilter}
          suggestions={sciNameSuggestions}
          loading={sciNameLoading}
          onSelect={applySearch}
        />
      </FiltersCard>

      {filtersActive ? (
        <DataTable<TaxonSearchItem>
          title="Resultados de búsqueda"
          description={
            searchLoading
              ? "Buscando taxones..."
              : `${searchTotal.toLocaleString("es-PE")} coincidencias para "${appliedQuery}"`
          }
          columns={searchColumns}
          data={searchResults}
          keyExtractor={(r) => r.taxonId}
          loading={searchLoading}
          emptyMessage="No se encontraron taxones para esa búsqueda."
          page={Math.max(1, searchCurrentPage)}
          totalPages={Math.max(1, searchTotalPages)}
          onPrevPage={() => handleSearchPageChange(searchCurrentPage - 1)}
          onNextPage={() => handleSearchPageChange(searchCurrentPage + 1)}
          onRowClick={(r) => handleSearchResultClick(r.taxonId)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Árbol taxonómico</CardTitle>
            <CardDescription>
              Explora la jerarquía taxonómica. Haz clic en un taxón para expandir sus hijas. Usa el botón con el ojo
              para ir al detalle de cada taxón.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rootNodes.length === 0 && isLoadingRoot ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cargando clasificación taxonómica…</span>
              </div>
            ) : rootNodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay taxones disponibles aún. Sube un CSV de flora en la sección Cargas.
              </p>
            ) : (
              <div className="space-y-1">
                {rootNodes.map((node) => (
                  <TaxonTreeNodeContainer key={node.taxonId} node={node} depth={0} onNavigate={onNavigate} />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                disabled={rootCurrentPage <= 1 || isLoadingRoot}
                onClick={() => fetchRootNodes(rootCurrentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {rootCurrentPage || 1} de {rootTotalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={rootCurrentPage >= rootTotalPages || isLoadingRoot}
                onClick={() => fetchRootNodes(rootCurrentPage + 1)}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
