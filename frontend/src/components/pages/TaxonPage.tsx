import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import {
  Leaf,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Plus,
  Eye,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { taxonService, type TaxonTreeNode } from "@services/taxon.service";
import { TaxonSearchPanel } from "./TaxonSearchPanel";

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
      ? node.synonyms.map((s) => s.scientificName).filter(Boolean).join("; ")
      : "";

  const rankLabel = node.taxonRank ?? "—";

  const handleEyeClick = (e: React.MouseEvent) => {
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
                <span className="text-xs text-muted-foreground">
                  {node.scientificNameAuthorship}
                </span>
              )}
              <Badge variant="outline" className="text-[10px]">{rankLabel}</Badge>
            </div>
            {synonymsLabel && (
              <div className="text-[11px] text-muted-foreground">[{synonymsLabel}]</div>
            )}
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

      {isExpanded && childrenNodes?.map((child) => (
        <TaxonTreeNodeContainer
          key={child.taxonId}
          node={child}
          depth={depth + 1}
          onNavigate={onNavigate}
        />
      ))}

      {isExpanded && canLoadMoreChildren && (
        <div className="pl-8 pb-1" style={{ paddingLeft: indentPx + 24 }}>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-2 h-6"
            onClick={(e) => { e.stopPropagation(); onLoadMoreChildren?.(); }}
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
      setChildren((prev) => page === 1 ? data.items ?? [] : [...prev, ...(data.items ?? [])]);
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
    if (onNavigate) { onNavigate("taxon-detail", { taxonId: node.taxonId }); return; }
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
      onLoadMoreChildren={() => { if (currentPage + 1 <= totalPages) fetchChildrenPage(currentPage + 1); }}
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

  const [rootNodes, setRootNodes] = useState<TaxonTreeNode[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);
  const [rootCurrentPage, setRootCurrentPage] = useState(0);
  const [rootTotalPages, setRootTotalPages] = useState(0);

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

  useEffect(() => {
    fetchRootNodes(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Taxones</h1>
        <p className="text-sm text-muted-foreground">Catálogo de clasificación taxonómica</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Árbol taxonómico</CardTitle>
          <CardDescription>
            Explora la jerarquía taxonómica. Haz clic en un taxón para expandir
            sus hijas. Usa el botón con el ojo para ir al detalle de cada taxón.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonSearchPanel onNavigate={onNavigate} />

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
                <TaxonTreeNodeContainer
                  key={node.taxonId}
                  node={node}
                  depth={0}
                  onNavigate={onNavigate}
                />
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
    </div>
  );
}
