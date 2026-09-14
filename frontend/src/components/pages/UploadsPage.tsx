import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
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
import { Upload, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { Role } from "@constants/roles";
import {
  uploadService,
  type TaxonFloraImportJob,
  type TaxonFloraImportJobStatus,
} from "@services/upload.service";
import { DataTable, type ColumnDef } from "../ui/data-table";

const POLL_MS = 4000;

function formatStatus(status: TaxonFloraImportJobStatus): string {
  switch (status) {
    case "queued":    return "En cola";
    case "running":   return "Procesando";
    case "completed": return "Completado";
    case "failed":    return "Falló";
    default:          return status;
  }
}

function badgeVariant(status: TaxonFloraImportJobStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed": return "default";
    case "failed":    return "destructive";
    case "running":   return "secondary";
    default:          return "outline";
  }
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(value: number | null): string {
  if (value == null || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex += 1; }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function UploadsPage() {
  const { apiFetch, user } = useAuth();
  const isSuperuser = user?.role === Role.Admin;
  const completedJobSyncRef = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobHistory, setJobHistory] = useState<TaxonFloraImportJob[]>([]);
  const [activeJob, setActiveJob] = useState<TaxonFloraImportJob | null>(null);
  const [jobHistoryOffset, setJobHistoryOffset] = useState(0);
  const [jobHistoryTotal, setJobHistoryTotal] = useState(0);

  const syncActiveJobFromHistory = (
    jobs: TaxonFloraImportJob[],
    preferredJobId?: string | null,
  ) => {
    if (jobs.length === 0) { setActiveJob(null); return; }
    const preferred = preferredJobId ? jobs.find((j) => j.jobId === preferredJobId) ?? null : null;
    const running = jobs.find((j) => j.status === "queued" || j.status === "running") ?? null;
    setActiveJob(preferred ?? running ?? jobs[0]);
  };

  const fetchJobHistory = async (
    preferredJobId?: string | null,
    showError = false,
    offset = 0,
  ) => {
    if (!isSuperuser) return;
    try {
      setIsLoadingJobs(true);
      const data = await uploadService.getTaxonFloraCsvJobs(apiFetch, PAGE_SIZE.TAXON_FLORA_JOBS, offset);
      const jobs = data.items ?? [];
      setJobHistory(jobs);
      setJobHistoryTotal(data.total);
      if (offset === 0) syncActiveJobFromHistory(jobs, preferredJobId ?? activeJob?.jobId ?? null);
    } catch (error: any) {
      console.error(error);
      if (showError) toast.error(error?.message || "Error al cargar el historial de importaciones.");
    } finally {
      setIsLoadingJobs(false);
    }
  };

  const fetchJob = async (jobId: string, showError = false) => {
    if (!isSuperuser || !jobId) return null;
    try {
      const job = await uploadService.getTaxonFloraCsvJobById(apiFetch, jobId);
      setActiveJob(job);
      setJobHistory((prev) => {
        const next = [...prev];
        const idx = next.findIndex((item) => item.jobId === job.jobId);
        if (idx >= 0) next[idx] = job; else next.unshift(job);
        return next
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, PAGE_SIZE.TAXON_FLORA_JOBS);
      });
      return job;
    } catch (error: any) {
      console.error(error);
      if (showError) toast.error(error?.message || "Error al consultar el trabajo de importación.");
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

  const handleUpload = async (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (!csvFile) { toast.error("Selecciona primero un archivo CSV de flora"); return; }
    try {
      setIsUploading(true);
      const payload = await uploadService.uploadTaxonFloraCsv(apiFetch, csvFile);
      toast.success("CSV enviado. Sigue el progreso en esta página.");
      setOpen(false);
      setCsvFile(null);
      completedJobSyncRef.current = null;
      setJobHistoryOffset(0);
      await fetchJob(payload.jobId, true);
      await fetchJobHistory(payload.jobId, true, 0);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error al subir el CSV de taxones");
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!isSuperuser) { setJobHistory([]); setActiveJob(null); return; }
    fetchJobHistory(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser]);

  useEffect(() => {
    if (!isSuperuser) return;
    if (!activeJob?.jobId) return;
    if (!(activeJob.status === "queued" || activeJob.status === "running")) return;

    const intervalId = window.setInterval(() => {
      fetchJob(activeJob.jobId, false);
      fetchJobHistory(activeJob.jobId, false, 0);
    }, POLL_MS);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser, activeJob?.jobId, activeJob?.status]);

  const latestJob = activeJob ?? jobHistory[0] ?? null;
  const jobCurrentPage = Math.floor(jobHistoryOffset / PAGE_SIZE.TAXON_FLORA_JOBS) + 1;
  const jobTotalPages = Math.ceil(jobHistoryTotal / PAGE_SIZE.TAXON_FLORA_JOBS) || 1;

  const handleHistorialPrev = () => {
    const prev = Math.max(0, jobHistoryOffset - PAGE_SIZE.TAXON_FLORA_JOBS);
    setJobHistoryOffset(prev);
    fetchJobHistory(activeJob?.jobId, false, prev);
  };

  const handleHistorialNext = () => {
    const next = jobHistoryOffset + PAGE_SIZE.TAXON_FLORA_JOBS;
    setJobHistoryOffset(next);
    fetchJobHistory(activeJob?.jobId, false, next);
  };

  const historialColumns: ColumnDef<TaxonFloraImportJob>[] = [
    {
      key: "filename",
      header: "Archivo",
      cell: (job) => (
        <div>
          <div className="font-medium text-sm">{job.filename}</div>
          {(job.detail || job.stage) && (
            <div className="text-xs text-muted-foreground">{job.detail || job.stage}</div>
          )}
        </div>
      ),
    },
    {
      key: "created-at",
      header: "Fecha",
      cell: (job) => <span className="text-sm">{formatDateTime(job.createdAt)}</span>,
    },
    {
      key: "rows",
      header: "Filas",
      cell: (job) => (
        <span className="text-sm tabular-nums">{job.rowsProcessed.toLocaleString("es-PE")}</span>
      ),
    },
    {
      key: "progress",
      header: "Progreso",
      cell: (job) => (
        <span className="text-sm tabular-nums">
          {job.progressPercent != null ? `${job.progressPercent.toFixed(1)}%` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      cell: (job) => (
        <div className="flex items-center justify-end gap-2">
          {(job.status === "queued" || job.status === "running") && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Badge variant={badgeVariant(job.status)}>
            {formatStatus(job.status)}
          </Badge>
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Cargas</h1>
          <p className="text-sm text-muted-foreground">
            Importaciones del backbone taxonómico
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
                    <li>No modifiques los encabezados originales del archivo.</li>
                    <li>
                      Selecciona el CSV y súbelo. El progreso se muestra en
                      esta página.
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
                      onClick={() => document.getElementById("flora-csv-input")?.click()}
                      disabled={isUploading}
                    >
                      Seleccionar archivo
                    </Button>
                    <span className="text-sm text-muted-foreground truncate">
                      {csvFile ? csvFile.name : "Ningún archivo seleccionado aún"}
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
                    Formato esperado: <code>.csv</code> (classification.csv de la flora de referencia).
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setOpen(false); setCsvFile(null); }}
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

      {/* Job activo */}
      <Card>
        <CardHeader>
          <CardTitle>Estado de última importación</CardTitle>
          <CardDescription>
            Sigue el progreso de la carga del backbone taxonómico.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                <Badge variant={badgeVariant(latestJob.status)}>
                  {formatStatus(latestJob.status)}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Progreso</div>
                  <div className="text-lg font-semibold">
                    {latestJob.progressPercent != null ? `${latestJob.progressPercent.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(latestJob.bytesProcessed)} de {formatBytes(latestJob.fileSizeBytes)}
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
                  <div className="font-semibold">{latestJob.rowsProcessed.toLocaleString("es-PE")}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Taxones insertados</div>
                  <div className="font-semibold">{latestJob.taxaInserted.toLocaleString("es-PE")}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Taxones actualizados</div>
                  <div className="font-semibold">{latestJob.taxaUpdated.toLocaleString("es-PE")}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Taxones vigentes</div>
                  <div className="font-semibold">{latestJob.taxaSetCurrent.toLocaleString("es-PE")}</div>
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
        </CardContent>
      </Card>

      {/* Historial */}
      <DataTable<TaxonFloraImportJob>
        title="Historial de importaciones"
        description={
          jobHistoryTotal > 0
            ? `${jobHistoryTotal} ${jobHistoryTotal === 1 ? "importación" : "importaciones"} en total`
            : "Importaciones ejecutadas previamente."
        }
        columns={historialColumns}
        data={jobHistory}
        keyExtractor={(row) => row.jobId}
        loading={isLoadingJobs}
        emptyMessage="No hay historial de importaciones todavía."
        page={jobCurrentPage}
        totalPages={jobTotalPages}
        onPrevPage={handleHistorialPrev}
        onNextPage={handleHistorialNext}
      />
    </div>
  );
}
