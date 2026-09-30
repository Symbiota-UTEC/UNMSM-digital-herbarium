import { useEffect, useRef, useState, type BaseSyntheticEvent, type ChangeEvent } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Upload, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { Role } from "@constants/roles";
import { ImportJobStatus } from "@constants/enums";
import { uploadService } from "@services/upload.service";
import type { TaxonFloraImportJob } from "@interfaces/upload";
import { DataTable, type ColumnDef } from "../ui/data-table";
import { totalPagesFor } from "@utils/pagination";
import { formatDateTime } from "@utils/dates";

const POLL_MS = 4000;

function formatStatus(status: ImportJobStatus): string {
  switch (status) {
    case ImportJobStatus.Queued:
      return "En cola";
    case ImportJobStatus.Running:
      return "Procesando";
    case ImportJobStatus.Completed:
      return "Completado";
    case ImportJobStatus.Failed:
      return "Falló";
    default:
      return status;
  }
}

function badgeVariant(status: ImportJobStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case ImportJobStatus.Completed:
      return "default";
    case ImportJobStatus.Failed:
      return "destructive";
    case ImportJobStatus.Running:
      return "secondary";
    default:
      return "outline";
  }
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

function formatJobDuration(job: Pick<TaxonFloraImportJob, "status" | "startedAt" | "finishedAt">): string {
  if (!job.startedAt) return job.status === ImportJobStatus.Queued ? "En cola" : "—";

  const startedAt = new Date(job.startedAt).getTime();
  const finishedAt = job.finishedAt
    ? new Date(job.finishedAt).getTime()
    : job.status === ImportJobStatus.Running
      ? Date.now()
      : Number.NaN;
  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) return "—";

  return formatSeconds(Math.max(0, Math.floor((finishedAt - startedAt) / 1000)));
}

/* Mismas clases de caja que ReadOnlyField (border + bg-muted/40 + p-3); leyenda opcional debajo
 * del valor, para las métricas del job que no aparecen ya en su fila de la tabla. */
function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
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
  const [jobHistoryPage, setJobHistoryPage] = useState(1);
  const [jobHistoryTotal, setJobHistoryTotal] = useState(0);
  const [expandedJobKey, setExpandedJobKey] = useState<string | null>(null);

  const syncActiveJobFromHistory = (jobs: TaxonFloraImportJob[], preferredJobId?: string | null) => {
    if (jobs.length === 0) {
      setActiveJob(null);
      return;
    }
    const preferred = preferredJobId ? (jobs.find((j) => j.jobId === preferredJobId) ?? null) : null;
    const running =
      jobs.find((j) => j.status === ImportJobStatus.Queued || j.status === ImportJobStatus.Running) ?? null;
    setActiveJob(preferred ?? running ?? jobs[0]);
  };

  const fetchJobHistory = async (preferredJobId?: string | null, showError = false, page = 1, silent = false) => {
    if (!isSuperuser) return;
    try {
      if (!silent) setIsLoadingJobs(true);
      const data = await uploadService.getTaxonFloraCsvJobs(apiFetch, PAGE_SIZE.TAXON_FLORA_JOBS, page);
      const jobs = data.items ?? [];
      setJobHistory(jobs);
      setJobHistoryTotal(data.total);
      if (page === 1) syncActiveJobFromHistory(jobs, preferredJobId ?? activeJob?.jobId ?? null);
    } catch (error: any) {
      console.error(error);
      if (showError) toast.error(error?.message || "Error al cargar el historial de importaciones.");
    } finally {
      if (!silent) setIsLoadingJobs(false);
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
        if (idx >= 0) next[idx] = job;
        else next.unshift(job);
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

  const handleUpload = async (e: BaseSyntheticEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Selecciona primero un archivo CSV de flora");
      return;
    }
    try {
      setIsUploading(true);
      const payload = await uploadService.uploadTaxonFloraCsv(apiFetch, csvFile);
      toast.success("CSV enviado. Sigue el progreso en esta página.");
      setOpen(false);
      setCsvFile(null);
      completedJobSyncRef.current = null;
      setJobHistoryPage(1);
      await fetchJob(payload.jobId, true);
      await fetchJobHistory(payload.jobId, true, 1);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Error al subir el CSV de taxones");
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!isSuperuser) {
      setJobHistory([]);
      setActiveJob(null);
      return;
    }
    fetchJobHistory(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser]);

  useEffect(() => {
    if (!isSuperuser) return;
    if (!activeJob?.jobId) return;
    if (!(activeJob.status === ImportJobStatus.Queued || activeJob.status === ImportJobStatus.Running)) return;

    const intervalId = window.setInterval(() => {
      fetchJob(activeJob.jobId, false);
      fetchJobHistory(activeJob.jobId, false, 1, true); // silent: el polling no debe parpadear
    }, POLL_MS);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperuser, activeJob?.jobId, activeJob?.status]);

  const latestJob = activeJob ?? jobHistory[0] ?? null;
  const jobCurrentPage = jobHistoryPage;
  const jobTotalPages = totalPagesFor(jobHistoryTotal, PAGE_SIZE.TAXON_FLORA_JOBS);

  // Abre sola la fila del job más reciente (p.ej. al cargar la página, o cuando arranca uno
  // nuevo); si el usuario la colapsa a mano, no se vuelve a abrir sola mientras siga siendo
  // el mismo job.
  useEffect(() => {
    if (latestJob) setExpandedJobKey(latestJob.jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestJob?.jobId]);

  // Solo lo que la fila de la tabla no muestra ya (Duración, Filas y Progreso están ahí).
  // Mismo StatTile para las 5 métricas, en una sola grilla: todas iguales en tamaño y forma,
  // sin mezclar tarjetas con leyenda y cajas con subtítulo interno.
  const renderJobDetail = (job: TaxonFloraImportJob) => (
    <div className="space-y-3">
      {/* 5 columnas no están compiladas en index.css (solo grid-cols-2 y md:grid-cols-3);
          auto-fit/minmax evita ese límite: cabe en una sola fila cuando hay espacio y se
          reparte en menos columnas solo cuando de verdad no entran, sin depender de un
          breakpoint fijo. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <StatTile label="ETA" value={formatSeconds(job.estimatedSecondsRemaining)} />
        <StatTile label="Última fila" value={job.lastProcessedRow?.toLocaleString("es-PE") || "—"} />
        <StatTile label="Taxones insertados" value={job.taxaInserted.toLocaleString("es-PE")} />
        <StatTile label="Taxones actualizados" value={job.taxaUpdated.toLocaleString("es-PE")} />
        <StatTile label="Taxones vigentes" value={job.taxaSetCurrent.toLocaleString("es-PE")} />
      </div>

      {job.errorMessage && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>{job.errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const handleHistorialPrev = () => {
    const prev = Math.max(1, jobHistoryPage - 1);
    setJobHistoryPage(prev);
    fetchJobHistory(activeJob?.jobId, false, prev);
  };

  const handleHistorialNext = () => {
    const next = jobHistoryPage + 1;
    setJobHistoryPage(next);
    fetchJobHistory(activeJob?.jobId, false, next);
  };

  const historialColumns: ColumnDef<TaxonFloraImportJob>[] = [
    {
      key: "filename",
      header: "Archivo",
      cell: (job) => (
        <div>
          <div className="font-medium text-sm">{job.filename}</div>
          {(job.detail || job.stage) && <div className="text-xs text-muted-foreground">{job.detail || job.stage}</div>}
        </div>
      ),
    },
    {
      key: "created-at",
      header: "Fecha",
      cell: (job) => <span className="text-sm">{formatDateTime(job.createdAt, "—")}</span>,
    },
    {
      key: "duration",
      header: "Duración",
      cell: (job) => <span className="text-sm tabular-nums">{formatJobDuration(job)}</span>,
    },
    {
      key: "rows",
      header: "Filas",
      cell: (job) => <span className="text-sm tabular-nums">{job.rowsProcessed.toLocaleString("es-PE")}</span>,
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
          {(job.status === ImportJobStatus.Queued || job.status === ImportJobStatus.Running) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Badge variant={badgeVariant(job.status)}>{formatStatus(job.status)}</Badge>
        </div>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Cargas</h1>
          <p className="text-sm text-muted-foreground">Importaciones del backbone taxonómico</p>
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
                  Sube un archivo CSV con los taxones de flora para poblar el catálogo taxonómico.
                </DialogDescription>
              </DialogHeader>

              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <ol className="list-decimal pl-5 space-y-1 text-sm mt-2">
                    <li>
                      Descarga el archivo de taxones de tu flora de referencia (el CSV <code>classification.csv</code>{" "}
                      de{" "}
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
                    <li>Selecciona el CSV y súbelo. El progreso se muestra en esta página.</li>
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

      {/* Importaciones: cada fila se puede expandir para ver el detalle del job (la de arriba
          es la más reciente y se abre sola mientras está en cola o corriendo). */}
      <DataTable<TaxonFloraImportJob>
        title="Importaciones"
        description={
          jobHistoryTotal > 0
            ? `${jobHistoryTotal} ${jobHistoryTotal === 1 ? "importación" : "importaciones"} en total`
            : "Progreso y resultados de cada carga del backbone taxonómico."
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
        renderExpanded={renderJobDetail}
        expandedKey={expandedJobKey}
        onExpandedKeyChange={setExpandedJobKey}
      />
    </div>
  );
}
