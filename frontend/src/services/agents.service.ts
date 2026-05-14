/**
 * Cliente del microservicio digital-herbarium-agents.
 *
 * Este servicio NO usa el JWT del backend principal porque corre como un
 * microservicio separado (ver patron en `digital-camera-integration`). Si en
 * el futuro se quiere proteger, se anade un header de API key configurado
 * con `VITE_AGENTS_API_KEY`.
 *
 * Repo del microservicio: https://github.com/Sleeperstar/digital-herbarium-agents
 */

import { env } from "@config/env";

/* =============================================================
 * Tipos publicos (deben matchear `schemas/jobs.py` y
 * `schemas/extraction.py` del repo de agentes).
 * ============================================================= */

export type AgentJobStatus =
    | "pending"
    | "detecting_regions"
    | "awaiting_region_review"
    | "extracting_fields"
    | "merging_results"
    | "validating_gbif"
    | "awaiting_field_review"
    | "completed"
    | "error";

export type AgentLabelType =
    | "etiqueta_principal"
    | "sello_tipo"
    | "sello_institucional"
    | "zona_barcode"
    | "determinacion"
    | "otro";

export type AgentConfidenceLevel = "high" | "medium" | "low";

export type CategoriaInvestigacion = "HISTORICO" | "RECIENTE" | "DESCONOCIDA";

export interface AgentRegion {
    label_type: AgentLabelType;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: AgentConfidenceLevel;
    notes?: string | null;
}

export interface AgentGbifMatch {
    matched: boolean;
    scientific_name?: string | null;
    canonical_name?: string | null;
    rank?: string | null;
    family?: string | null;
    genus?: string | null;
    species?: string | null;
    gbif_key?: number | null;
    match_type?: string | null;
    confidence_score?: number | null;
}

export interface AgentExtractionResult {
    usm_barcode?: string | null;
    numero_colector?: string | null;
    nombre_colector?: string | null;
    fecha_colecta?: string | null;
    pais?: string | null;
    departamento_estado?: string | null;
    provincia?: string | null;
    distrito?: string | null;
    localidad_verbatim?: string | null;
    coordenadas_lat?: number | null;
    coordenadas_lon?: number | null;
    altitud_verbatim?: string | null;
    habitat?: string | null;
    fenologia?: string | null;
    asociacion_ecologica?: string | null;
    nombre_cientifico_verbatim?: string | null;
    familia_taxonomica?: string | null;
    determinador?: string | null;
    fecha_determinacion?: string | null;
    type_status?: string | null;
    notas_etiqueta?: string | null;
    categoria_investigacion: CategoriaInvestigacion;
    field_confidence: Record<string, AgentConfidenceLevel>;
    gbif?: AgentGbifMatch | null;
}

export interface AgentJobStartResponse {
    job_id: string;
    status: AgentJobStatus;
    created_at: string;
    message: string;
}

export interface AgentJobStatusOut {
    job_id: string;
    status: AgentJobStatus;
    created_at: string;
    updated_at: string;
    progress: number; // 0..1
    current_step?: string | null;
    regions?: AgentRegion[] | null;
    extraction?: AgentExtractionResult | null;
    error?: string | null;
}

/* =============================================================
 * Errores tipados
 * ============================================================= */

export class AgentsServiceError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly detail?: string,
    ) {
        super(message);
        this.name = "AgentsServiceError";
    }
}

async function throwIfError(res: Response): Promise<void> {
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new AgentsServiceError(
            `Agentes IA: HTTP ${res.status}`,
            res.status,
            detail,
        );
    }
}

/* =============================================================
 * Cliente
 * ============================================================= */

const baseUrl = (): string => env.AGENTS_BASE_URL.replace(/\/+$/, "");

export const agentsService = {
    /** Verifica que el servicio este vivo. Util para mostrar disponibilidad en UI. */
    async health(): Promise<{ status: string; provider: string; model: string }> {
        const res = await fetch(`${baseUrl()}/health`);
        await throwIfError(res);
        return res.json();
    },

    /**
     * Sube una imagen al servicio de agentes y devuelve el job_id.
     * NO bloquea: la respuesta es inmediata, el procesamiento sigue en background.
     */
    async startJob(file: File): Promise<AgentJobStartResponse> {
        const form = new FormData();
        form.append("image", file);

        const res = await fetch(`${baseUrl()}/api/agents/jobs`, {
            method: "POST",
            body: form,
        });
        await throwIfError(res);
        return res.json();
    },

    /** Snapshot del estado actual de un job (polling). */
    async getJob(jobId: string): Promise<AgentJobStatusOut> {
        const res = await fetch(`${baseUrl()}/api/agents/jobs/${jobId}`);
        await throwIfError(res);
        return res.json();
    },

    /** Cancela un job en curso (mejor effort). */
    async cancelJob(jobId: string): Promise<{ cancelled: boolean; job_id: string }> {
        const res = await fetch(`${baseUrl()}/api/agents/jobs/${jobId}`, {
            method: "DELETE",
        });
        await throwIfError(res);
        return res.json();
    },

    /**
     * Helper: lanza el job y resuelve cuando termina (status=completed o error).
     * Hace polling cada `pollIntervalMs` (2s default) y notifica el progreso por callback.
     *
     * @param file Imagen a procesar
     * @param onProgress callback con cada cambio de estado
     * @param signal opcional AbortSignal para cancelar
     * @param pollIntervalMs intervalo de polling
     * @param timeoutMs timeout duro (default 5min)
     */
    async runToCompletion(
        file: File,
        onProgress?: (snapshot: AgentJobStatusOut) => void,
        signal?: AbortSignal,
        pollIntervalMs = 2000,
        timeoutMs = 300_000,
    ): Promise<AgentJobStatusOut> {
        const start = await this.startJob(file);
        const jobId = start.job_id;
        const startTime = Date.now();
        let lastSerialized = "";

        // Loop de polling
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (signal?.aborted) {
                await this.cancelJob(jobId).catch(() => undefined);
                throw new AgentsServiceError("Procesamiento cancelado por el usuario", 0);
            }
            if (Date.now() - startTime > timeoutMs) {
                await this.cancelJob(jobId).catch(() => undefined);
                throw new AgentsServiceError(
                    `Timeout despues de ${Math.round(timeoutMs / 1000)}s`,
                    408,
                );
            }

            await new Promise((r) => setTimeout(r, pollIntervalMs));

            const snap = await this.getJob(jobId);
            const serialized = `${snap.status}|${snap.progress}|${snap.current_step ?? ""}`;
            if (serialized !== lastSerialized) {
                lastSerialized = serialized;
                onProgress?.(snap);
            }

            if (snap.status === "completed") return snap;
            if (snap.status === "error") {
                throw new AgentsServiceError(
                    snap.error ?? "El servicio de agentes reporto un error",
                    500,
                    snap.error ?? undefined,
                );
            }
        }
    },
};
