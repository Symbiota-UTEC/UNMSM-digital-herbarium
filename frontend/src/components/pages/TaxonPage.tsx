import {
  useState,
  useEffect,
  useRef,
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
  Eye,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { Role } from "@constants/roles";
import type { PaginatedResponse } from "@interfaces/utils/pagination";

/* ----------------------------- Tipos API ----------------------------- */

type TaxonFloraImportJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

interface TaxonFloraImportJob {
  jobId: string;
  filename: string;
  status: TaxonFloraImportJobStatus;
  stage: string | null;
  detail: string | null;
  errorMessage: string | null;
  fileSizeBytes: number | null;
  bytesProcessed: number | null;
  progressPercent: number | null;
  estimatedSecondsRemaining: number | null;
  rowsProcessed: number;
  rowsFilteredOut: number;
  taxaMarkedNotCurrent: number;
  taxaInserted: number;
  taxaUpdated: number;
  taxaSetCurrent: number;
  lastProcessedRow: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  uploadedByUserId: string | null;
}

interface TaxonFloraImportJobListResponse {
  items: TaxonFloraImportJob[];
}

interface TaxonFloraUploadAcceptedResponse {
  status: string;
  backbone: string;
  filename: string;
  detail: string;
  jobId: string;
}

interface TaxonSynonym {
  taxonId: string;
  wfoTaxonId: string | null;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  taxonomicStatus: string | null;
}

interface TaxonTreeNode {
  taxonId: string;
  wfoTaxonId: string | null;
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

const ROOT_PAGE_SIZE = 50;
const CHILDREN_PAGE_SIZE = 50;

const TAXON_FLORA_JOB_POLL_MS = 4000;

function formatJobStatus(status: TaxonFloraImportJobStatus): string {
  switch (status) {
    case "queued":
      return "En cola";
    case "running":
      return "Procesando";
    case "completed":
      return "Completado";
    case "failed":
      return "Falló";
    default:
      return status;
  }
}

function jobBadgeVariant(status: TaxonFloraImportJobStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "failed":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "outline";
  }
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatBytes(value: number | null): string {
  if (value == null || value < 0) return "—";
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = -1;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = size >= 100 ? 0 : 1;
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

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

  const handleEyeClick = (e: any) => {
    e.stopPropagation(); // que no colapse/expanda al hacer click en el ojito
    if (onViewDetail) {
      onViewDetail();
    }
  };

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

        {/* Cuerpo: nombre + autoría + rango + ojito */}
        <div className="flex-1 flex items-center justify-between gap-2">
          <div className="space-y-0.5">
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

          {/* Botón ojito para ver detalle del taxón */}
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

      {/* Hijas ya cargadas */}
      {isExpanded &&
        childrenNodes &&
        childrenNodes.map((child) => (
          <TaxonTreeNodeContainer
            key={child.taxonId}
            node={child}
            depth={depth + 1}
            onNavigate={onNavigate}
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
  const { token } = useAuth();
  const [children, setChildren] = useState<TaxonTreeNode[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  const fetchChildrenPage = async (page: number) => {
    if (!node.wfoTaxonId || !node.hasChildren) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({
        parent_id: node.wfoTaxonId,
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

  const handleViewDetail = () => {
    if (!node.taxonId) return;

    // Si el App te pasó onNavigate, úsalo
    if (onNavigate) {
      onNavigate("taxon-detail", { taxonId: node.taxonId });
      return;
    }

    // Fallback: navegación directa con taxonId en la URL
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
      onLoadMoreChildren={handleLoadMoreChildren}
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
  const { token, user } = useAuth();
  const isSuperuser = user?.role === Role.Admin;
  const completedJobSyncRef = useRef<string | null>(null);

  // Dialog para CSV de flora
  const [open, setOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobHistory, setJobHistory] = useState<TaxonFloraImportJob[]>([]);
  const [activeJob, setActiveJob] = useState<TaxonFloraImportJob | null>(null);

  // Árbol raíz
  const [rootNodes, setRootNodes] = useState<TaxonTreeNode[]>([]);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);

  const syncActiveJobFromHistory = (
    jobs: TaxonFloraImportJob[],
    preferredJobId?: string | null
  ) => {
    if (jobs.length === 0) {
      setActiveJob(null);
      return;
    }

    const preferredJob = preferredJobId
      ? jobs.find((job) => job.jobId === preferredJobId) ?? null
      : null;
    const runningJob =
      jobs.find((job) => job.status === "queued" || job.status === "running") ??
      null;

    setActiveJob(preferredJob ?? runningJob ?? jobs[0]);
  };

  const fetchJobHistory = async (
    preferredJobId?: string | null,
    showError = false
  ) => {
    if (!isSuperuser) return;

    try {
      setIsLoadingJobs(true);
      const res = await fetch(
        `${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV_JOBS}?limit=8`,
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
        throw new Error(txt || "No se pudo obtener el historial de importaciones.");
      }

      const data: TaxonFloraImportJobListResponse = await res.json();
      const jobs = data.items ?? [];
      setJobHistory(jobs);
      syncActiveJobFromHistory(jobs, preferredJobId ?? activeJob?.jobId ?? null);
    } catch (error: any) {
      console.error(error);
      if (showError) {
        toast.error(
          error?.message || "Ocurrió un error al cargar el estado de importación."
        );
      }
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const fetchJob = async (jobId: string, showError = false) => {
    if (!isSuperuser || !jobId) return null;

    try {
      const res = await fetch(
        `${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV_JOB_BY_ID(jobId)}`,
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
        throw new Error(txt || "No se pudo obtener el progreso de la importación.");
      }

      const job: TaxonFloraImportJob = await res.json();
      setActiveJob(job);
      setJobHistory((prev) => {
        const next = [...prev];
        const idx = next.findIndex((item) => item.jobId === job.jobId);
        if (idx >= 0) {
          next[idx] = job;
        } else {
          next.unshift(job);
        }
        return next
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          .slice(0, 8);
      });

      return job;
    } catch (error: any) {
      console.error(error);
      if (showError) {
        toast.error(
          error?.message || "Ocurrió un error al consultar el trabajo de importación."
        );
      }
      return null;
    }
  };

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

      const payload: TaxonFloraUploadAcceptedResponse = await res.json();
      toast.success(
        "CSV de taxones enviado. Puedes seguir el progreso de la importación en esta página."
      );
      setOpen(false);
      setCsvFile(null);
      completedJobSyncRef.current = null;
      await fetchJob(payload.jobId, true);
      await fetchJobHistory(payload.jobId);
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

  useEffect(() => {
    if (!isSuperuser) {
      setJobHistory([]);
      setActiveJob(null);
      return;
    }

    fetchJobHistory(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser, token]);

  useEffect(() => {
    if (!activeJob?.jobId) return;
    if (activeJob.status !== "completed") return;
    if (completedJobSyncRef.current === activeJob.jobId) return;

    completedJobSyncRef.current = activeJob.jobId;
    fetchRootNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.jobId, activeJob?.status]);

  useEffect(() => {
    if (!isSuperuser) return;
    if (!activeJob?.jobId) return;
    if (!(activeJob.status === "queued" || activeJob.status === "running")) return;

    const intervalId = window.setInterval(() => {
      fetchJob(activeJob.jobId, false);
      fetchJobHistory(activeJob.jobId, false);
    }, TAXON_FLORA_JOB_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser, activeJob?.jobId, activeJob?.status, token]);

  const latestJob = activeJob ?? jobHistory[0] ?? null;

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

        {isSuperuser && (
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
                    Selecciona el CSV descargado en tu computadora y súbelo.
                      Luego revisa el estado de importación en el panel de esta
                      página.
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
        )}
      </div>


      {isSuperuser && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Estado de importación</CardTitle>
            <CardDescription>
              Sigue el progreso de la carga del backbone taxonómico y revisa
              las últimas importaciones ejecutadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingJobs && jobHistory.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cargando estado de importación…</span>
              </div>
            ) : latestJob ? (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{latestJob.filename}</div>
                    <div className="text-sm text-muted-foreground">
                      {latestJob.detail || latestJob.stage || "Sin detalle disponible"}
                    </div>
                  </div>
                  <Badge variant={jobBadgeVariant(latestJob.status)}>
                    {formatJobStatus(latestJob.status)}
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Progreso</div>
                    <div className="text-lg font-semibold">
                      {latestJob.progressPercent != null
                        ? `${latestJob.progressPercent.toFixed(1)}%`
                        : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(latestJob.bytesProcessed)} de{" "}
                      {formatBytes(latestJob.fileSizeBytes)}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">ETA</div>
                    <div className="text-lg font-semibold">
                      {formatSeconds(latestJob.estimatedSecondsRemaining)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Inicio: {formatDateTime(latestJob.startedAt || latestJob.createdAt)}
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Última fila</div>
                    <div className="text-lg font-semibold">
                      {latestJob.lastProcessedRow?.toLocaleString("es-PE") || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Finalizó: {formatDateTime(latestJob.finishedAt)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Filas leídas</div>
                    <div className="font-semibold">
                      {latestJob.rowsProcessed.toLocaleString("es-PE")}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Taxones insertados</div>
                    <div className="font-semibold">
                      {latestJob.taxaInserted.toLocaleString("es-PE")}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Taxones actualizados</div>
                    <div className="font-semibold">
                      {latestJob.taxaUpdated.toLocaleString("es-PE")}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Taxones vigentes</div>
                    <div className="font-semibold">
                      {latestJob.taxaSetCurrent.toLocaleString("es-PE")}
                    </div>
                  </div>
                </div>

                {latestJob.errorMessage && (
                  <Alert variant="destructive">
                    <Info className="h-4 w-4" />
                    <AlertDescription>{latestJob.errorMessage}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no hay importaciones registradas.
              </p>
            )}

            <div className="space-y-2">
              <div className="text-sm font-medium">Historial reciente</div>
              {jobHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay historial de importaciones todavía.
                </p>
              ) : (
                <div className="space-y-2">
                  {jobHistory.map((job) => (
                    <div
                      key={job.jobId}
                      className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-medium">{job.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(job.createdAt)} · {job.rowsProcessed.toLocaleString("es-PE")} filas ·{" "}
                          {job.progressPercent != null
                            ? `${job.progressPercent.toFixed(1)}%`
                            : "sin porcentaje"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(job.status === "queued" || job.status === "running") && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        <Badge variant={jobBadgeVariant(job.status)}>
                          {formatJobStatus(job.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Árbol taxonómico */}
      <Card>
        <CardHeader>
          <CardTitle>Árbol taxonómico</CardTitle>
          <CardDescription>
            Explora la jerarquía taxonómica tal como se encuentra en el
            backbone de flora. Haz clic en un taxón para expandir sus hijas.
            Usa el botón con el ojo para ir al detalle de cada taxón.
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
                  key={node.taxonId}
                  node={node}
                  depth={0}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
