import { useEffect, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { taxonService, type TaxonSearchItem } from "@services/taxon.service";
import { useAuth } from "@contexts/AuthContext";
import { useDebounce } from "@utils/useDebounce";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const SEARCH_PAGE_SIZE = 20;

interface TaxonSearchPanelProps {
  onNavigate?: (page: string, params?: Record<string, any>) => void;
}

export function TaxonSearchPanel({ onNavigate }: TaxonSearchPanelProps) {
  const { apiFetch } = useAuth();
  const searchRequestIdRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<TaxonSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCurrentPage, setSearchCurrentPage] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);

  const performSearch = async (query: string, page: number) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const requestId = ++searchRequestIdRef.current;

    try {
      setIsSearching(true);
      setSearchError(null);

      const data = await taxonService.search(apiFetch, {
        q: trimmedQuery,
        page,
        size: SEARCH_PAGE_SIZE,
      });

      if (requestId !== searchRequestIdRef.current) return;

      setSearchResults((prev) =>
        page === 1 ? data.items ?? [] : [...prev, ...(data.items ?? [])]
      );
      setSearchCurrentPage(data.currentPage);
      setSearchTotalPages(data.totalPages);
      setSearchTotal(data.total);
    } catch (error: any) {
      if (requestId !== searchRequestIdRef.current) return;
      console.error(error);
      setSearchError(
        error?.detail ||
          error?.message ||
          "Ocurrió un error al buscar taxones."
      );
      if (page === 1) {
        setSearchResults([]);
        setSearchCurrentPage(0);
        setSearchTotalPages(0);
        setSearchTotal(0);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
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

  const handleLoadMoreSearchResults = async () => {
    const nextPage = searchCurrentPage + 1;
    if (nextPage <= searchTotalPages && !isSearching) {
      await performSearch(debouncedSearchQuery, nextPage);
    }
  };

  useEffect(() => {
    const trimmedQuery = debouncedSearchQuery.trim();

    if (!trimmedQuery) {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setSearchError(null);
      setSearchCurrentPage(0);
      setSearchTotalPages(0);
      setSearchTotal(0);
      setIsSearching(false);
      return;
    }

    performSearch(trimmedQuery, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchQuery, apiFetch]);

  const hasActiveSearch = debouncedSearchQuery.trim().length > 0;
  const canLoadMoreSearchResults =
    searchTotalPages > 0 && searchCurrentPage < searchTotalPages;

  return (
    <div className="mb-6 space-y-3">
      <div className="space-y-2">
        <Label htmlFor="taxon-search-input">Buscar taxón</Label>
        <Input
          id="taxon-search-input"
          type="search"
          placeholder="Busca por nombre científico"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {hasActiveSearch && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">Resultados de búsqueda</div>
              <div className="text-sm text-muted-foreground">
                {isSearching && searchCurrentPage === 0
                  ? "Buscando taxones..."
                  : `${searchTotal.toLocaleString("es-PE")} coincidencias para "${debouncedSearchQuery.trim()}".`}
              </div>
            </div>
            {isSearching && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {searchError ? (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          ) : isSearching && searchCurrentPage === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Buscando taxones...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No se encontraron taxones para esa búsqueda.
            </p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((result) => (
                <button
                  key={result.taxonId}
                  type="button"
                  className="w-full rounded-md border px-3 py-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => handleSearchResultClick(result.taxonId)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="italic">
                      {result.scientificName || "(sin nombre)"}
                    </span>
                    {result.scientificNameAuthorship && (
                      <span className="text-xs text-muted-foreground">
                        {result.scientificNameAuthorship}
                      </span>
                    )}
                    {result.taxonRank && (
                      <Badge variant="outline" className="text-[10px]">
                        {result.taxonRank}
                      </Badge>
                    )}
                    {result.taxonomicStatus && (
                      <Badge variant="secondary" className="text-[10px]">
                        {result.taxonomicStatus}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {result.family
                      ? `Familia: ${result.family}`
                      : "Sin familia registrada"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {result.occurrenceCount.toLocaleString("es-PE")} ocurrencias asociadas
                  </div>
                </button>
              ))}

              {canLoadMoreSearchResults && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMoreSearchResults}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cargando...
                    </>
                  ) : (
                    "Cargar más resultados"
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
