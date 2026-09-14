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

/** Quien puso la region: el modelo o el curador desde el editor. */
export type AgentRegionSource = "model" | "curator";

/**
 * Cual de los dos puntos de control humano esta pidiendo intervencion.
 *
 * Los dos viven en el mismo grafo, asi que el cliente no puede deducirlo del
 * estado: tiene que leer este campo para saber si abrir el editor de regiones
 * o el panel de campos.
 */
export type AgentReviewAction = "review_regions" | "confirm_fields";

export interface AgentRegion {
    /**
     * Identificador asignado por el servidor.
     *
     * Hay que devolverlo TAL CUAL en el POST de regiones: es como el servidor
     * correlaciona las ediciones del curador con lo que habia detectado. Una
     * region sin `id` se registra como aporte nuevo del curador, asi que
     * perderlo por el camino falsea las metricas de correccion.
     */
    id?: string | null;
    label_type: AgentLabelType;
    /** Fraccion 0..1 del ancho de la lamina, NO porcentaje 0..100. */
    x: number;
    /** Fraccion 0..1 del alto de la lamina, NO porcentaje 0..100. */
    y: number;
    width: number;
    height: number;
    confidence: AgentConfidenceLevel;
    /**
     * Si es `false` la region queda en el registro pero no se manda al modelo.
     * Es la forma de excluir una deteccion incorrecta sin perder el rastro, y
     * cada region desactivada es una llamada al LLM que no se gasta.
     */
    enabled?: boolean;
    source?: AgentRegionSource;
    notes?: string | null;
}

/**
 * Payload que el nodo del HITL1 expone al pausar el grafo.
 *
 * Llega en `AgentJobStatusOut.interrupt` cuando `awaiting_action` es
 * `review_regions`.
 */
export interface AgentRegionReviewInterrupt {
    action: "review_regions";
    /** Cuantas veces se pidio la revision; sube si el POST fue rechazado. */
    attempt: number;
    message: string;
    regions: AgentRegion[];
    enabled_count: number;
    /**
     * Ruta RELATIVA de la lamina reducida (`/api/agents/jobs/{id}/image`).
     * Hay que prefijarla con la base del microservicio; usa `absoluteUrl()`.
     *
     * Es la MISMA imagen que vio el modelo, por lo que las coordenadas de las
     * regiones coinciden sin conversion alguna.
     */
    image_url: string;
    image_mime: string;
    /**
     * Valores validos para el dropdown de tipo. Los dicta el servidor a
     * proposito, para que el enum no se desincronice entre las dos puntas.
     */
    label_types: AgentLabelType[];
    max_regions: number;
    /** True si todas las regiones ACTIVAS tienen confianza `high`. */
    autoskip_eligible: boolean;
    autoskip_seconds: number;
    /** Motivo del rechazo del intento anterior, si hubo uno. */
    error?: string | null;
}

/** Payload del HITL2. Se conserva laxo: el panel de campos es otra tarea. */
export interface AgentFieldReviewInterrupt {
    action: "confirm_fields";
    message?: string;
    missing_critical_fields?: string[];
    [key: string]: unknown;
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

/** Respuesta del POST de regiones. No trae el snapshot: el fan-out recien arranca. */
export interface AgentRegionsAcceptedOut {
    job_id: string;
    status: AgentJobStatus;
    /** Cuantas regiones activas se van a mandar al modelo. */
    enabled_regions: number;
    /** Cuantas quedaron desactivadas y por tanto no gastan cuota. */
    discarded_regions: number;
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

    /* --- Puntos de control humano (HITL1 y HITL2) --- */

    awaiting_review?: boolean;
    /** Que intervencion se pide. `null` si el grafo no esta pausado. */
    awaiting_action?: AgentReviewAction | null;
    /** Resumen de lo que el curador corrigio en las regiones. */
    region_review?: Record<string, unknown> | null;
    critical_fields?: string[];
    confirmed_fields?: string[];
    missing_critical_fields?: string[];
    interrupt?:
        | AgentRegionReviewInterrupt
        | AgentFieldReviewInterrupt
        | Record<string, unknown>
        | null;
}

/**
 * Estrecha el `interrupt` al payload del HITL1.
 *
 * El campo es un diccionario abierto porque el servidor sirve los dos payloads
 * por el mismo camino; `action` es lo unico que los distingue.
 */
export function isRegionReviewInterrupt(
    payload: AgentJobStatusOut["interrupt"],
): payload is AgentRegionReviewInterrupt {
    return (
        !!payload &&
        typeof payload === "object" &&
        (payload as { action?: unknown }).action === "review_regions" &&
        Array.isArray((payload as { regions?: unknown }).regions)
    );
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

/**
 * Convierte una ruta relativa del microservicio en URL absoluta.
 *
 * El payload del HITL1 trae `image_url` relativo (`/api/agents/jobs/{id}/image`)
 * porque el servidor no conoce el host desde el que se lo consume. Sin este
 * prefijo el `<img>` la resolveria contra el origen del frontend, que en
 * desarrollo es otro puerto y en produccion otro dominio.
 */
export function absoluteUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Estados en los que el grafo avanza solo y conviene seguir el polling. */
const ESTADOS_EN_CURSO: ReadonlySet<AgentJobStatus> = new Set<AgentJobStatus>([
    "pending",
    "detecting_regions",
    "extracting_fields",
    "merging_results",
    "validating_gbif",
]);

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
     * URL de la lamina reducida del job, para usar como `src` de un `<img>`.
     *
     * Es la misma imagen que se le mando al modelo, asi que las coordenadas de
     * las regiones se dibujan encima sin ninguna conversion.
     */
    jobImageUrl(jobId: string): string {
        return `${baseUrl()}/api/agents/jobs/${jobId}/image`;
    },

    /**
     * Reanuda el HITL1 con las regiones que dejo el curador.
     *
     * Manda la lista COMPLETA, no un diff: reenviar el mismo cuerpo produce el
     * mismo resultado, asi que un reintento del navegador no aplica la
     * correccion dos veces.
     *
     * No espera el fan-out. El servidor acepta con 202, agenda la reanudacion
     * en background y el cliente vuelve al polling; esperar aqui las N llamadas
     * al LLM reintroduciria el riesgo de timeout que toda la arquitectura
     * asincrona existe para evitar.
     *
     * Al menos una region tiene que quedar con `enabled: true` o el servidor
     * responde 422.
     */
    async reviewRegions(
        jobId: string,
        regions: AgentRegion[],
        reviewNotes?: string,
    ): Promise<AgentRegionsAcceptedOut> {
        const res = await fetch(
            `${baseUrl()}/api/agents/jobs/${jobId}/regions`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    regions,
                    review_notes: reviewNotes ?? null,
                }),
            },
        );
        await throwIfError(res);
        return res.json();
    },

    /**
     * Reanuda el HITL2 confirmando campos. Devuelve el snapshot final.
     *
     * Tiene que incluir los tres criticos que el servidor exige
     * (`critical_fields` del snapshot) o responde 422 sin consumir la pausa.
     */
    async confirmFields(
        jobId: string,
        confirmedFields: string[],
        reviewNotes?: string,
    ): Promise<AgentJobStatusOut> {
        const res = await fetch(
            `${baseUrl()}/api/agents/jobs/${jobId}/confirm`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    confirmed_fields: confirmedFields,
                    review_notes: reviewNotes ?? null,
                }),
            },
        );
        await throwIfError(res);
        return res.json();
    },

    /**
     * Hace polling hasta que el job deje de avanzar por su cuenta.
     *
     * Resuelve en tres situaciones, no solo al terminar: `completed`, o cuando
     * el grafo se pausa esperando a una persona (`awaiting_region_review` /
     * `awaiting_field_review`). Los `error` se lanzan como excepcion.
     *
     * La distincion importa porque una pausa no se resuelve esperando. El
     * polling anterior seguia dando vueltas sobre `awaiting_region_review`
     * hasta agotar su propio timeout, asi que con el HITL1 activo **ningun job
     * podia completarse**: el grafo esperaba unas regiones que nadie iba a
     * mandar. Quien llame tiene que mirar `awaiting_action` y abrir el panel
     * que corresponda.
     *
     * @param jobId job ya creado con `startJob`
     * @param onProgress callback en cada cambio de estado
     * @param signal AbortSignal para cancelar (cancela el job en el servidor)
     * @param pollIntervalMs intervalo de polling
     * @param timeoutMs tope para los tramos AUTONOMOS, no para la espera humana
     */
    async pollUntilSettled(
        jobId: string,
        onProgress?: (snapshot: AgentJobStatusOut) => void,
        signal?: AbortSignal,
        pollIntervalMs = 2000,
        // Ocho minutos y no cinco: el microservicio limita las llamadas al LLM
        // a 5 por minuto para no chocar con el free tier de Gemini, asi que el
        // fan-out tarda ~12 s por region activa. Con el tope de 12 regiones son
        // casi dos minutos y medio solo de espaciado, mas la deteccion inicial
        // (~30 s en una lamina de 20 MB) y la validacion contra GBIF.
        timeoutMs = 480_000,
    ): Promise<AgentJobStatusOut> {
        const startTime = Date.now();
        let lastSerialized = "";

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

            if (snap.status === "error") {
                throw new AgentsServiceError(
                    snap.error ?? "El servicio de agentes reporto un error",
                    500,
                    snap.error ?? undefined,
                );
            }
            // Cualquier cosa que no sea un tramo autonomo es un punto de parada:
            // `completed` o una de las dos pausas. Se compara contra la lista de
            // estados en curso y no contra la de pausas para que, si el servidor
            // agrega un estado de espera nuevo, el cliente pare en lugar de
            // girar en falso hasta el timeout.
            if (!ESTADOS_EN_CURSO.has(snap.status)) return snap;
        }
    },

    /**
     * Lanza el job y hace polling hasta el primer punto de parada.
     *
     * Con el HITL1 activo lo habitual es que resuelva en
     * `awaiting_region_review`, no en `completed`.
     */
    async startAndPoll(
        file: File,
        onProgress?: (snapshot: AgentJobStatusOut) => void,
        signal?: AbortSignal,
        pollIntervalMs = 2000,
    ): Promise<AgentJobStatusOut> {
        const start = await this.startJob(file);
        return this.pollUntilSettled(start.job_id, onProgress, signal, pollIntervalMs);
    },
};
