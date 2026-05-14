/**
 * Modal de procesamiento con IA de una imagen de lamina de herbario.
 *
 * Flujo:
 *   1) Recibe un `File` de imagen via prop `imageFile`.
 *   2) Cuando se abre, lanza el job en `digital-herbarium-agents` (POST async).
 *   3) Hace polling cada 2s y muestra una barra de progreso por fase.
 *   4) Al completar, llama `onComplete(extraction)` y deja que el componente
 *      padre prellene el formulario.
 *
 * Mantiene un boton "Cancelar" que aborta el polling y llama DELETE /jobs/{id}.
 */

import { useEffect, useRef, useState } from "react";
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
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
    agentsService,
    type AgentExtractionResult,
    type AgentJobStatus,
    type AgentJobStatusOut,
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
    awaiting_region_review: "Esperando revision de regiones...",
    extracting_fields: "Extrayendo campos de las etiquetas...",
    merging_results: "Consolidando resultados...",
    validating_gbif: "Validando con GBIF...",
    awaiting_field_review: "Esperando revision de campos...",
    completed: "Completado",
    error: "Error",
};

export function AgentsProcessingModal({
    open,
    imageFile,
    onClose,
    onComplete,
}: AgentsProcessingModalProps) {
    const [snapshot, setSnapshot] = useState<AgentJobStatusOut | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const lastFileRef = useRef<File | null>(null);

    useEffect(() => {
        if (!open || !imageFile) return;

        // Evita re-disparar si re-render con la misma imagen
        if (lastFileRef.current === imageFile && (snapshot || error)) return;
        lastFileRef.current = imageFile;

        setSnapshot(null);
        setError(null);
        setRunning(true);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        agentsService
            .runToCompletion(
                imageFile,
                (snap) => setSnapshot(snap),
                ctrl.signal,
            )
            .then((finalSnap) => {
                setSnapshot(finalSnap);
                setRunning(false);
                if (finalSnap.extraction) {
                    onComplete(finalSnap.extraction);
                }
            })
            .catch((err) => {
                setRunning(false);
                if (err instanceof AgentsServiceError) {
                    setError(`${err.message}${err.detail ? `: ${err.detail}` : ""}`);
                } else if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError("Error desconocido procesando la imagen");
                }
            });

        return () => {
            ctrl.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, imageFile]);

    const handleCancel = () => {
        abortRef.current?.abort();
        onClose();
    };

    const status = snapshot?.status ?? "pending";
    const progressPct = Math.round((snapshot?.progress ?? 0) * 100);
    const numRegions = snapshot?.regions?.length ?? 0;

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o && !running) onClose();
            }}
        >
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Procesando con IA
                    </DialogTitle>
                    <DialogDescription>
                        El servicio de agentes esta analizando la lamina y extrayendo
                        los campos de las etiquetas. Esto puede tardar entre 30 y 90
                        segundos. Puedes cancelar en cualquier momento.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {imageFile && (
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="truncate flex-1">{imageFile.name}</span>
                            <span className="whitespace-nowrap">
                                {(imageFile.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{STATUS_LABEL[status]}</span>
                            <span className="text-muted-foreground">{progressPct}%</span>
                        </div>
                        <Progress value={progressPct} />
                    </div>

                    {numRegions > 0 && status !== "completed" && (
                        <div className="text-xs text-muted-foreground">
                            {numRegions} region{numRegions !== 1 ? "es" : ""} detectada
                            {numRegions !== 1 ? "s" : ""}.
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="font-medium">No se pudo procesar la imagen</p>
                                <p className="text-xs opacity-90">{error}</p>
                            </div>
                        </div>
                    )}

                    {snapshot?.extraction && status === "completed" && (
                        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                            <div className="space-y-2 flex-1">
                                <p className="font-medium text-emerald-700">
                                    Extraccion completa.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {snapshot.extraction.usm_barcode && (
                                        <Badge variant="secondary">
                                            {snapshot.extraction.usm_barcode}
                                        </Badge>
                                    )}
                                    {snapshot.extraction.nombre_cientifico_verbatim && (
                                        <Badge variant="secondary" className="italic">
                                            {snapshot.extraction.nombre_cientifico_verbatim}
                                        </Badge>
                                    )}
                                    {snapshot.extraction.type_status && (
                                        <Badge>{snapshot.extraction.type_status}</Badge>
                                    )}
                                    <Badge variant="outline">
                                        {snapshot.extraction.categoria_investigacion}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Los campos detectados se han prellenado en el
                                    formulario. Reviselos antes de guardar.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {running && (
                        <Button variant="outline" onClick={handleCancel}>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Cancelar
                        </Button>
                    )}
                    {!running && (
                        <Button onClick={onClose}>
                            {error ? "Cerrar" : "Continuar"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
