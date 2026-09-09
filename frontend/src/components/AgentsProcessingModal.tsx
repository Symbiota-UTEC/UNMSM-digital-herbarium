/**
 * Modal de procesamiento con IA de una imagen de lamina de herbario.
 *
 * Orquesta el recorrido completo, que NO es de una sola pasada: el grafo del
 * microservicio se detiene dos veces a pedir intervencion humana.
 *
 *   1) Lanza el job (POST asincrono) y hace polling.
 *   2) El grafo se pausa en el HITL1 y se abre `RegionEditor` para corregir las
 *      zonas detectadas antes de gastar una llamada al modelo por cada una.
 *   3) Con las regiones confirmadas corre el fan-out y el grafo se vuelve a
 *      pausar en el HITL2, que pide confirmar los campos criticos.
 *   4) Recien entonces llega a `completed` y el padre prellena el formulario.
 *
 * Antes esperaba `completed` directamente, asi que con el HITL1 activo se
 * quedaba haciendo polling sobre una pausa que nadie iba a resolver hasta
 * agotar su propio timeout.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { RegionEditor } from "./RegionEditor";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
    agentsService,
    isRegionReviewInterrupt,
    type AgentExtractionResult,
    type AgentJobStatus,
    type AgentJobStatusOut,
    type AgentRegion,
    AgentsServiceError,
} from "@services/agents.service";

interface AgentsProcessingModalProps {
    open: boolean;
    imageFile: File | null;
    onClose: () => void;
    /** Llamado cuando el grafo termina exitosamente. El padre prellena el form. */
    onComplete: (extraction: AgentExtractionResult) => void;
}

const STATUS_LABEL: Record<AgentJobStatus, string> = {
    pending: "En cola...",
    detecting_regions: "Detectando regiones de interes...",
    awaiting_region_review: "Esperando que revises las regiones",
    extracting_fields: "Extrayendo campos de las etiquetas...",
    merging_results: "Consolidando resultados...",
    validating_gbif: "Validando con GBIF...",
    awaiting_field_review: "Esperando que confirmes los campos",
    completed: "Completado",
    error: "Error",
};

const ESTILO_ERROR = {
    borderColor: "rgba(220, 38, 38, 0.3)",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    color: "#b91c1c",
} as const;

const ESTILO_OK = {
    borderColor: "rgba(16, 185, 129, 0.3)",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
} as const;

export function AgentsProcessingModal({
    open,
    imageFile,
    onClose,
    onComplete,
}: AgentsProcessingModalProps) {
    const [snapshot, setSnapshot] = useState<AgentJobStatusOut | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    /** Error de un POST de reanudacion: se puede reintentar sin perder el job. */
    const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const jobIdRef = useRef<string | null>(null);
    const lastFileRef = useRef<File | null>(null);
    /** Evita prellenar el formulario dos veces si el efecto se re-dispara. */
    const completadoRef = useRef(false);

    const manejarFallo = useCallback((err: unknown) => {
        setRunning(false);
        if (err instanceof AgentsServiceError) {
            setError(`${err.message}${err.detail ? `: ${err.detail}` : ""}`);
        } else if (err instanceof Error) {
            setError(err.message);
        } else {
            setError("Error desconocido procesando la imagen");
        }
    }, []);

    /**
     * Sigue el job hasta el proximo punto de parada.
     *
     * Puede ser el final o una de las dos pausas; el render decide que mostrar
     * mirando `awaiting_action`.
     */
    const seguir = useCallback(
        async (jobId: string, signal: AbortSignal) => {
            setRunning(true);
            try {
                const snap = await agentsService.pollUntilSettled(
                    jobId,
                    (s) => setSnapshot(s),
                    signal,
                );
                setSnapshot(snap);
                setRunning(false);
                if (
                    snap.status === "completed" &&
                    snap.extraction &&
                    !completadoRef.current
                ) {
                    completadoRef.current = true;
                    onComplete(snap.extraction);
                }
            } catch (err) {
                manejarFallo(err);
            }
        },
        [manejarFallo, onComplete],
    );

    useEffect(() => {
        if (!open || !imageFile) return;

        // Evita re-disparar si re-render con la misma imagen
        if (lastFileRef.current === imageFile && (snapshot || error)) return;
        lastFileRef.current = imageFile;

        setSnapshot(null);
        setError(null);
        setErrorEnvio(null);
        completadoRef.current = false;

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setRunning(true);
        agentsService
            .startJob(imageFile)
            .then((start) => {
                jobIdRef.current = start.job_id;
                return seguir(start.job_id, ctrl.signal);
            })
            .catch(manejarFallo);

        return () => {
            ctrl.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, imageFile]);

    /** HITL1: manda las regiones corregidas y vuelve al polling. */
    const confirmarRegiones = async (
        regions: AgentRegion[],
        reviewNotes?: string,
    ) => {
        const jobId = jobIdRef.current;
        if (!jobId) return;

        setEnviando(true);
        setErrorEnvio(null);
        try {
            await agentsService.reviewRegions(jobId, regions, reviewNotes);
            setEnviando(false);
            const ctrl = abortRef.current ?? new AbortController();
            await seguir(jobId, ctrl.signal);
        } catch (err) {
            setEnviando(false);
            // No es fatal: el grafo sigue pausado y el curador puede corregir y
            // reintentar. El 422 de "al menos una region activa" cae aca.
            setErrorEnvio(
                err instanceof AgentsServiceError
                    ? `${err.message}${err.detail ? `: ${err.detail}` : ""}`
                    : err instanceof Error
                      ? err.message
                      : "No se pudieron enviar las regiones",
            );
        }
    };

    /** HITL2: confirma los criticos que exige el servidor. */
    const confirmarCampos = async () => {
        const jobId = jobIdRef.current;
        if (!jobId) return;

        const aConfirmar = snapshot?.critical_fields ?? [];
        setEnviando(true);
        setErrorEnvio(null);
        try {
            const finalSnap = await agentsService.confirmFields(jobId, aConfirmar);
            setEnviando(false);
            setSnapshot(finalSnap);
            if (finalSnap.extraction && !completadoRef.current) {
                completadoRef.current = true;
                onComplete(finalSnap.extraction);
            }
        } catch (err) {
            setEnviando(false);
            setErrorEnvio(
                err instanceof AgentsServiceError
                    ? `${err.message}${err.detail ? `: ${err.detail}` : ""}`
                    : err instanceof Error
                      ? err.message
                      : "No se pudieron confirmar los campos",
            );
        }
    };

    const handleCancel = () => {
        abortRef.current?.abort();
        onClose();
    };

    const status = snapshot?.status ?? "pending";
    const progressPct = Math.round((snapshot?.progress ?? 0) * 100);
    const numRegions = snapshot?.regions?.length ?? 0;
    const extraction = snapshot?.extraction;

    const revisandoRegiones =
        snapshot?.awaiting_action === "review_regions" &&
        isRegionReviewInterrupt(snapshot.interrupt);
    const confirmandoCampos = snapshot?.awaiting_action === "confirm_fields";
    const ocupado = running || enviando;

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o && !ocupado) onClose();
            }}
        >
            {/* El editor de regiones necesita ancho para que la lamina sea
                utilizable; el resto del recorrido cabe en el modal chico.
                Va en `style` y no en una clase porque `DialogContent` ya trae
                `sm:max-w-lg`, y una clase base como `max-w-4xl` perderia contra
                esa variante en cuanto la pantalla pasa los 640 px. Las
                variantes `sm:max-w-*` mas anchas no estan en el CSS compilado
                del repo, asi que el estilo inline es lo unico que gana. */}
            <DialogContent
                style={
                    revisandoRegiones
                        ? { maxWidth: "min(64rem, calc(100% - 2rem))" }
                        : undefined
                }
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        {revisandoRegiones
                            ? "Revisar las zonas detectadas"
                            : "Procesando con IA"}
                    </DialogTitle>
                    <DialogDescription>
                        {revisandoRegiones
                            ? "Solo las zonas activas se mandan al modelo. Descartar las que no aportan texto ahorra cuota y mejora la extraccion."
                            : "El servicio de agentes analiza la lamina y extrae los campos de las etiquetas. Se va a detener dos veces para que revises el resultado."}
                    </DialogDescription>
                </DialogHeader>

                {revisandoRegiones && isRegionReviewInterrupt(snapshot.interrupt) ? (
                    <RegionEditor
                        jobId={snapshot.job_id}
                        payload={snapshot.interrupt}
                        onConfirm={confirmarRegiones}
                        onCancel={handleCancel}
                        submitting={enviando}
                        error={errorEnvio}
                    />
                ) : (
                    <div className="space-y-4 py-2">
                        {imageFile && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="truncate flex-1">
                                    {imageFile.name}
                                </span>
                                <span className="whitespace-nowrap">
                                    {(imageFile.size / 1024 / 1024).toFixed(1)} MB
                                </span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium">
                                    {STATUS_LABEL[status]}
                                </span>
                                <span className="text-muted-foreground">
                                    {progressPct}%
                                </span>
                            </div>
                            <Progress value={progressPct} />
                        </div>

                        {numRegions > 0 && status !== "completed" && (
                            <div className="text-xs text-muted-foreground">
                                {numRegions} region{numRegions !== 1 ? "es" : ""}{" "}
                                detectada{numRegions !== 1 ? "s" : ""}.
                            </div>
                        )}

                        {confirmandoCampos && (
                            <div className="space-y-2 rounded-md border p-3 text-sm">
                                <p className="font-medium">
                                    Confirma los campos criticos
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    El servicio no aplica la extraccion hasta que
                                    alguien confirme estos campos. Podras editarlos
                                    en el formulario despues.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {(snapshot?.critical_fields ?? []).map((f) => (
                                        <Badge key={f} variant="outline">
                                            {f}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {errorEnvio && (
                            <div
                                className="flex items-start gap-2 rounded-md border p-3 text-sm"
                                style={ESTILO_ERROR}
                            >
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <p>{errorEnvio}</p>
                            </div>
                        )}

                        {error && (
                            <div
                                className="flex items-start gap-2 rounded-md border p-3 text-sm"
                                style={ESTILO_ERROR}
                            >
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <div className="space-y-2">
                                    <p className="font-medium">
                                        No se pudo procesar la imagen
                                    </p>
                                    <p className="text-xs">{error}</p>
                                </div>
                            </div>
                        )}

                        {extraction && status === "completed" && (
                            <div
                                className="flex items-start gap-2 rounded-md border p-3 text-sm"
                                style={ESTILO_OK}
                            >
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                                <div className="space-y-2 flex-1">
                                    <p className="font-medium">Extraccion completa.</p>
                                    <div className="flex flex-wrap gap-2">
                                        {extraction.usm_barcode && (
                                            <Badge variant="secondary">
                                                {extraction.usm_barcode}
                                            </Badge>
                                        )}
                                        {extraction.nombre_cientifico_verbatim && (
                                            <Badge variant="secondary">
                                                {extraction.nombre_cientifico_verbatim}
                                            </Badge>
                                        )}
                                        {extraction.type_status && (
                                            <Badge>{extraction.type_status}</Badge>
                                        )}
                                        <Badge variant="outline">
                                            {extraction.categoria_investigacion}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Los campos detectados se han prellenado en el
                                        formulario. Reviselos antes de guardar.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* El aviso de degradacion: el grafo puede llegar a
                            `completed` con campos vacios porque una region
                            fallo, y sin esto el curador lo leeria como que la
                            lamina no tenia esos datos. */}
                        {snapshot?.error && status === "completed" && (
                            <div
                                className="rounded-md border p-3 text-xs"
                                style={ESTILO_ERROR}
                            >
                                Algunas zonas no se pudieron procesar, asi que puede
                                faltar informacion: {snapshot.error}
                            </div>
                        )}
                    </div>
                )}

                {!revisandoRegiones && (
                    <DialogFooter>
                        {confirmandoCampos && (
                            <Button onClick={confirmarCampos} disabled={enviando}>
                                {enviando && (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Confirmar y finalizar
                            </Button>
                        )}
                        {running && !confirmandoCampos && (
                            <Button variant="outline" onClick={handleCancel}>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Cancelar
                            </Button>
                        )}
                        {!ocupado && !confirmandoCampos && (
                            <Button onClick={onClose}>
                                {error ? "Cerrar" : "Continuar"}
                            </Button>
                        )}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
