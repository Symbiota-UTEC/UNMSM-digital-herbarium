import {
  useState,
  useEffect,
  FormEvent,
  ChangeEvent,
} from "react";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Leaf,
  ChevronRight,
  ChevronDown,
  Upload,
  Info,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
// ajusta la ruta si tu alias es distinto
import type { PaginatedResponse } from "@interfaces/utils/pagination";

/* ----------------------------- Tipos API ----------------------------- */

interface TaxonSynonym {
  id: number;
  taxonID: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  taxonomicStatus: string | null;
}

interface TaxonTreeNode {
  id: number;
  taxonID: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  fullName: string | null;
  taxonRank: string | null;
  parentNameUsageID: string | null;
  acceptedNameUsageID: string | null;
  taxonomicStatus: string | null;
  isCurrent: boolean;
  hasChildren: boolean;
  synonyms: TaxonSynonym[];
}

/* ---------------------- Config paginación árbol ---------------------- */

const ROOT_PAGE_SIZE = 50;      // por si algún día hay muchos "root"
const CHILDREN_PAGE_SIZE = 50;  // nº de hijas por página en cada nivel

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

  return (
    <div className="text-sm">
      <div
        className="flex items-start gap-2 py-1 hover:bg-muted/60 rounded-md cursor-pointer"
        style={{ paddingLeft: indentPx }}
        onClick={onToggle}
      >
        {/* Icono de expandir/colapsar */}
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

        {/* Icono + nombre */}
        <div className="flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Leaf className="h-3.5 w-3.5 text-primary" />
            <span className="italic">
              {node.scientificName || "(sin nombre)"}
            </span>
            {node.scientificNameAuthorship && (
              <span className="text-xs text-muted-foreground">
                {node.scientificNameAuthorship}
              </span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {rankLabel}
            </Badge>
          </div>

          {synonymsLabel && (
            <div className="text-[11px] text-muted-foreground">
              [{synonymsLabel}]
            </div>
          )}
        </div>
      </div>

      {/* Hijas ya cargadas */}
      {isExpanded &&
        childrenNodes &&
        childrenNodes.map((child) => (
          <TaxonTreeNodeContainer
            key={child.taxonID ?? `id-${child.id}`}
            node={child}
            depth={depth + 1}
          />
        ))}

      {/* Botón "cargar más hijas" */}
      {isExpanded && canLoadMoreChildren && (
        <div
          className="pl-8 pb-1"
          style={{ paddingLeft: indentPx + 24 }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-2 h-6"
            onClick={(e) => {
              e.stopPropagation(); // que no colapse el nodo
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
}

function TaxonTreeNodeContainer({ node, depth }: NodeContainerProps) {
  const { token } = useAuth();
  const [children, setChildren] = useState<TaxonTreeNode[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);        // página de hijas ya cargada
  const [totalPages, setTotalPages] = useState<number>(0);  // total de páginas de hijas

  const fetchChildrenPage = async (page: number) => {
    if (!node.taxonID || !node.hasChildren) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        parent_id: node.taxonID,
        page: page.toString(),
        size: CHILDREN_PAGE_SIZE.toString(),
      });

      const res = await fetch(
        `${API.BASE_URL}/taxon/tree?${params.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(
          txt || "No se pudo obtener las hijas de este taxón."
        );
      }

      const data: PaginatedResponse<TaxonTreeNode> = await res.json();
      setChildren((prev) =>
        page === 1 ? data.items ?? [] : [...prev, ...(data.items ?? [])]
      );
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      console.error(error);
      toast.error(
        error?.message || "Ocurrió un error al cargar las hijas del taxón."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!expanded && node.hasChildren && currentPage === 0) {
      await fetchChildrenPage(1);
    }
    setExpanded((prev) => !prev);
  };

  const handleLoadMoreChildren = async () => {
    const nextPage = currentPage + 1;
    if (nextPage <= totalPages) {
      await fetchChildrenPage(nextPage);
    }
  };

  const canLoadMoreChildren =
    node.hasChildren && totalPages > 0 && currentPage < totalPages;

  return (
    <TaxonTreeRow
      node={node}
      depth={depth}
      isExpanded={expanded}
      isLoadingChildren={loading}
      onToggle={handleToggle}
      childrenNodes={children}
      canLoadMoreChildren={canLoadMoreChildren}
      onLoadMoreChildren={handleLoadMoreChildren}
    />
  );
}

/* ================================ PAGE ================================ */

export function TaxonPage() {
  const { token } = useAuth();

  // Dialog para CSV de flora
  const [open, setOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Árbol raíz
  const [rootNodes, setRootNodes] = useState<TaxonTreeNode[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Por favor selecciona un archivo .csv");
      return;
    }

    setCsvFile(file);
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();

    if (!csvFile) {
      toast.error("Selecciona primero un archivo CSV de flora");
      return;
    }

    try {
      setIsUploading(true);

      const form = new FormData();
      form.append("file", csvFile);

      const res = await fetch(`${API.BASE_URL}/upload/taxon-flora-csv`, {
        method: "POST",
        body: form,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "No se pudo subir el CSV de flora");
      }

      toast.success(
        "CSV de taxones enviado. El backend procesará los nombres en segundo plano."
      );
      setOpen(false);
      setCsvFile(null);

      // Recargar raíces después de un upload exitoso
      await fetchRootNodes();
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.message || "Ocurrió un error al subir el CSV de taxones"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const fetchRootNodes = async () => {
    try {
      setIsLoadingRoot(true);

      const params = new URLSearchParams({
        page: "1",
        size: ROOT_PAGE_SIZE.toString(),
      });

      const res = await fetch(
        `${API.BASE_URL}/taxon/tree?${params.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(
          txt || "No se pudo obtener el árbol taxonómico."
        );
      }

      const data: PaginatedResponse<TaxonTreeNode> = await res.json();
      setRootNodes(data.items ?? []);
    } catch (error: any) {
      console.error(error);
      toast.error(
        error?.message || "Ocurrió un error al cargar los taxones."
      );
    } finally {
      setIsLoadingRoot(false);
    }
  };

  useEffect(() => {
    fetchRootNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header + botón CSV */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl mb-2">Taxones</h1>
          <p className="text-muted-foreground">
            Catálogo de clasificación taxonómica
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Cargar CSV de flora
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cargar CSV de Flora</DialogTitle>
              <DialogDescription>
                Sube un archivo CSV con los taxones de flora para poblar el
                catálogo taxonómico.
              </DialogDescription>
            </DialogHeader>

            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <ol className="list-decimal pl-5 space-y-1 text-sm mt-2">
                  <li>
                    Descarga el archivo de taxones de tu flora de referencia
                    (el CSV <code>classification.csv</code> de{" "}
                    <a
                      href="https://wfoplantlist.org/classifications"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      World Flora Online
                    </a>
                    ).
                  </li>
                  <li>
                    No modifiques los encabezados originales del archivo para
                    mantener la compatibilidad con Darwin Core.
                  </li>
                  <li>
                    Selecciona el CSV descargado en tu computadora y súbelo. El
                    servidor procesará los nombres e integrará los taxones
                    válidos al sistema.
                  </li>
                </ol>
              </AlertDescription>
            </Alert>

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="flora-csv-input">Archivo CSV de flora</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      document.getElementById("flora-csv-input")?.click()
                    }
                    disabled={isUploading}
                  >
                    Seleccionar archivo
                  </Button>
                  <span className="text-sm text-muted-foreground truncate">
                    {csvFile
                      ? csvFile.name
                      : "Ningún archivo seleccionado aún"}
                  </span>
                </div>
                <Input
                  id="flora-csv-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formato esperado: <code>.csv</code> (por ejemplo, el
                  classification.csv de la flora de referencia).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setCsvFile(null);
                  }}
                  disabled={isUploading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={!csvFile || isUploading}>
                  {isUploading ? "Subiendo..." : "Subir CSV de taxones"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Árbol taxonómico */}
      <Card>
        <CardHeader>
          <CardTitle>Árbol taxonómico</CardTitle>
          <CardDescription>
            Explora la jerarquía taxonómica tal como se encuentra en el
            backbone de flora. Haz clic en un taxón para expandir sus hijas.
            En niveles con muchas especies, usa el botón “Cargar más taxones…”
            para verlas por partes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRoot ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Cargando clasificación taxonómica…</span>
            </div>
          ) : rootNodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay taxones disponibles aún. Sube un CSV de flora para poblar
              el backbone taxonómico.
            </p>
          ) : (
            <div className="space-y-1">
              {rootNodes.map((node) => (
                <TaxonTreeNodeContainer
                  key={node.taxonID ?? `id-${node.id}`}
                  node={node}
                  depth={0}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
