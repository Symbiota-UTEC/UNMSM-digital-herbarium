/**
 * Editor visual de las regiones detectadas sobre una lamina de herbario.
 *
 * Es la interfaz del HITL1: el microservicio de agentes detecta las zonas con
 * texto, pausa el grafo y espera a que un curador las corrija antes de gastar
 * una llamada al modelo por cada una. Cada region que el curador desactiva es
 * una llamada que no se hace, lo que importa porque el free tier de Gemini
 * admite 20 requests al dia.
 *
 * Tres cosas del contrato con el servidor que conviene tener presentes:
 *
 * 1. Las coordenadas son FRACCIONES 0..1 del ancho y alto de la lamina, no
 *    porcentajes 0..100. Se dibujan sobre la misma imagen reducida que vio el
 *    modelo, asi que no hay ninguna conversion de por medio.
 * 2. El `id` de cada region se devuelve TAL CUAL. Es como el servidor
 *    correlaciona las ediciones con lo que habia detectado; una region sin `id`
 *    se registra como aporte nuevo del curador.
 * 3. Se manda la lista COMPLETA, no un diff, y las descartadas viajan con
 *    `enabled: false` en lugar de desaparecer. Asi el registro conserva que se
 *    detecto, que se descarto y que se agrego a mano.
 *
 * Sobre los estilos: el repo versiona el CSS de Tailwind ya compilado y no
 * tiene paso de build, asi que una clase que no este en `index.css` no aplica
 * nada. Las propiedades que hacen falta aca y no estan compiladas
 * (`object-contain`, los cursores de resize, `touch-none`) van en `style`
 * inline. No es preferencia de estilo, es lo unico que funciona.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
    AlertCircle,
    Eye,
    EyeOff,
    Loader2,
    Plus,
    Trash2,
} from "lucide-react";
import {
    absoluteUrl,
    type AgentConfidenceLevel,
    type AgentLabelType,
    type AgentRegion,
    type AgentRegionReviewInterrupt,
} from "@services/agents.service";

/* =============================================================
 * Constantes de interaccion
 * ============================================================= */

/**
 * Lado minimo de una caja, en fraccion de la lamina.
 *
 * Existe para que un click torpe sobre un handle no colapse la region a cero:
 * una caja de area nula se recorta a una imagen vacia y el modelo devuelve
 * campos en blanco sin ninguna senal de que el problema fue geometrico.
 */
const MIN_LADO = 0.02;

/** Radio de los handles en px. 6 funciona con mouse y con dedo en tablet. */
const RADIO_HANDLE = 6;

type ModoArrastre =
    | "move"
    | "nw"
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w";

const HANDLES: readonly Exclude<ModoArrastre, "move">[] = [
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
];

const CURSOR: Record<ModoArrastre, string> = {
    move: "move",
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    e: "ew-resize",
    se: "nwse-resize",
    s: "ns-resize",
    sw: "nesw-resize",
    w: "ew-resize",
};

/** Un color por tipo para poder mirar la lamina y leer la escena de un golpe. */
const COLOR_POR_TIPO: Record<AgentLabelType, string> = {
    etiqueta_principal: "#059669",
    sello_tipo: "#dc2626",
    sello_institucional: "#8b5cf6",
    zona_barcode: "#2563eb",
    determinacion: "#d97706",
    otro: "#64748b",
};

const NOMBRE_TIPO: Record<AgentLabelType, string> = {
    etiqueta_principal: "Etiqueta principal",
    sello_tipo: "Sello de tipo",
    sello_institucional: "Sello institucional",
    zona_barcode: "Codigo de barras",
    determinacion: "Determinacion",
    otro: "Otro",
};

const NOMBRE_CONFIANZA: Record<AgentConfidenceLevel, string> = {
    high: "alta",
    medium: "media",
    low: "baja",
};

/**
 * Colores y opacidades que van en `style` y no en clases.
 *
 * El CSS compilado del repo no incluye las variantes con opacidad
 * (`bg-amber-500/10`), ni la paleta ambar, ni `border-primary`, ni
 * `opacity-60`. Se comprobo clase por clase contra `index.css`.
 */
const ESTILO_AVISO = {
    borderColor: "rgba(245, 158, 11, 0.3)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    color: "#b45309",
} as const;

const ESTILO_ERROR = {
    borderColor: "rgba(220, 38, 38, 0.3)",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    color: "#b91c1c",
} as const;

/* =============================================================
 * Modelo local
 * ============================================================= */

/**
 * Region con una llave estable para React.
 *
 * No alcanza con el `id` del servidor: las regiones que agrega el curador no
 * tienen ninguno todavia, y usar el indice del array haria que al borrar una
 * se remonten las demas y se pierda la seleccion.
 */
interface RegionEditable extends AgentRegion {
    key: string;
    enabled: boolean;
}

let contadorLlaves = 0;
const nuevaLlave = (): string => `curator-${++contadorLlaves}`;

const recortar = (valor: number, min: number, max: number): number =>
    Math.min(Math.max(valor, min), max);

/**
 * Mueve o redimensiona una caja, en fracciones y sin salirse de la lamina.
 *
 * Los handles se resuelven por los bordes y no por origen mas tamanio, que es
 * lo que evita el ancho negativo cuando se arrastra un borde mas alla del
 * opuesto.
 */
function aplicarArrastre(
    caja: RegionEditable,
    modo: ModoArrastre,
    dx: number,
    dy: number,
): RegionEditable {
    if (modo === "move") {
        return {
            ...caja,
            x: recortar(caja.x + dx, 0, 1 - caja.width),
            y: recortar(caja.y + dy, 0, 1 - caja.height),
        };
    }

    let izq = caja.x;
    let arr = caja.y;
    let der = caja.x + caja.width;
    let aba = caja.y + caja.height;

    if (modo.includes("w")) izq = recortar(izq + dx, 0, der - MIN_LADO);
    if (modo.includes("e")) der = recortar(der + dx, izq + MIN_LADO, 1);
    if (modo.includes("n")) arr = recortar(arr + dy, 0, aba - MIN_LADO);
    if (modo.includes("s")) aba = recortar(aba + dy, arr + MIN_LADO, 1);

    return { ...caja, x: izq, y: arr, width: der - izq, height: aba - arr };
}

/** Quita la llave local: el servidor no la conoce ni la necesita. */
function paraElServidor(regiones: RegionEditable[]): AgentRegion[] {
    return regiones.map(({ key: _key, ...region }) => region);
}

/* =============================================================
 * Componente
 * ============================================================= */

export interface RegionEditorProps {
    jobId: string;
    /** Payload que el nodo del HITL1 expuso al pausar el grafo. */
    payload: AgentRegionReviewInterrupt;
    /** Recibe la lista completa de regiones, descartadas incluidas. */
    onConfirm: (regions: AgentRegion[], reviewNotes?: string) => void;
    onCancel: () => void;
    /** True mientras el POST esta en vuelo, para bloquear la doble confirmacion. */
    submitting?: boolean;
    /** Error del POST anterior, si hubo uno. */
    error?: string | null;
}

export function RegionEditor({
    jobId,
    payload,
    onConfirm,
    onCancel,
    submitting = false,
    error = null,
}: RegionEditorProps) {
    const [regiones, setRegiones] = useState<RegionEditable[]>(() =>
        payload.regions.map((r, i) => ({
            ...r,
            key: r.id ?? `detectada-${i}`,
            enabled: r.enabled ?? true,
        })),
    );
    const [seleccionada, setSeleccionada] = useState<string | null>(null);
    const [notas, setNotas] = useState("");
    const [interactuo, setInteractuo] = useState(false);
    const [proporcion, setProporcion] = useState<number | null>(null);

    const marcoRef = useRef<HTMLDivElement | null>(null);
    const arrastreRef = useRef<{
        key: string;
        modo: ModoArrastre;
        clientX: number;
        clientY: number;
        original: RegionEditable;
    } | null>(null);

    const activas = useMemo(
        () => regiones.filter((r) => r.enabled).length,
        [regiones],
    );
    const topeAlcanzado = regiones.length >= payload.max_regions;

    /** Cualquier intervencion cancela el auto-skip: el curador esta mirando. */
    const marcarInteraccion = useCallback(() => setInteractuo(true), []);

    /* --- Auto-skip ------------------------------------------------------- */

    const autoskipActivo =
        payload.autoskip_eligible && !interactuo && !submitting && !error;
    const [restantes, setRestantes] = useState(payload.autoskip_seconds);

    useEffect(() => {
        if (!autoskipActivo) return;
        if (restantes <= 0) {
            onConfirm(paraElServidor(regiones), undefined);
            return;
        }
        const t = setTimeout(() => setRestantes((s) => s - 1), 1000);
        return () => clearTimeout(t);
        // `regiones` queda fuera a proposito: si entrara, cada edicion
        // reiniciaria el temporizador en lugar de cancelarlo. Editar ya pone
        // `interactuo` en true, que es lo que lo apaga.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoskipActivo, restantes]);

    /* --- Arrastre -------------------------------------------------------- */

    const alBajarPuntero = (
        e: React.PointerEvent<SVGElement>,
        region: RegionEditable,
        modo: ModoArrastre,
    ) => {
        if (submitting) return;
        e.stopPropagation();
        marcarInteraccion();
        setSeleccionada(region.key);
        arrastreRef.current = {
            key: region.key,
            modo,
            clientX: e.clientX,
            clientY: e.clientY,
            original: region,
        };
        // Sin capturar el puntero, un arrastre rapido que se sale del rect
        // deja de recibir eventos y la caja queda a medio mover.
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const alMoverPuntero = (e: React.PointerEvent<SVGElement>) => {
        const arrastre = arrastreRef.current;
        const marco = marcoRef.current;
        if (!arrastre || !marco) return;

        const rect = marco.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dx = (e.clientX - arrastre.clientX) / rect.width;
        const dy = (e.clientY - arrastre.clientY) / rect.height;

        setRegiones((prev) =>
            prev.map((r) =>
                r.key === arrastre.key
                    ? aplicarArrastre(arrastre.original, arrastre.modo, dx, dy)
                    : r,
            ),
        );
    };

    const alSoltarPuntero = () => {
        arrastreRef.current = null;
    };

    /* --- Mutaciones de la lista ------------------------------------------ */

    const alternarActiva = (key: string) => {
        marcarInteraccion();
        setRegiones((prev) =>
            prev.map((r) => (r.key === key ? { ...r, enabled: !r.enabled } : r)),
        );
    };

    const cambiarTipo = (key: string, tipo: AgentLabelType) => {
        marcarInteraccion();
        setRegiones((prev) =>
            prev.map((r) => (r.key === key ? { ...r, label_type: tipo } : r)),
        );
    };

    const eliminar = (key: string) => {
        marcarInteraccion();
        setRegiones((prev) => prev.filter((r) => r.key !== key));
        setSeleccionada((sel) => (sel === key ? null : sel));
    };

    const agregar = () => {
        if (topeAlcanzado) return;
        marcarInteraccion();
        const key = nuevaLlave();
        setRegiones((prev) => [
            ...prev,
            {
                key,
                // Sin `id`: es la senal de que la region la aporto el curador.
                label_type: "otro",
                x: 0.35,
                y: 0.4,
                width: 0.3,
                height: 0.2,
                confidence: "low",
                enabled: true,
                source: "curator",
            },
        ]);
        setSeleccionada(key);
    };

    /* --- Render ---------------------------------------------------------- */

    const urlImagen = payload.image_url
        ? absoluteUrl(payload.image_url)
        : `${absoluteUrl(`/api/agents/jobs/${jobId}/image`)}`;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <p className="flex-1">{payload.message}</p>
                {autoskipActivo && (
                    <Badge variant="outline" className="whitespace-nowrap">
                        Auto-confirmar en {restantes}s
                    </Badge>
                )}
            </div>

            {payload.error && (
                <div
                    className="flex items-start gap-2 rounded-md border p-3 text-sm"
                    style={ESTILO_AVISO}
                >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{payload.error}</p>
                </div>
            )}

            {error && (
                <div
                    className="flex items-start gap-2 rounded-md border p-3 text-sm"
                    style={ESTILO_ERROR}
                >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {/* --- La lamina con las cajas encima --- */}
                <div
                    ref={marcoRef}
                    className="relative w-full overflow-hidden rounded-md border bg-black/5"
                    // La proporcion se toma de la imagen real para que el SVG
                    // calce exacto sobre ella. Con el marco ya en la proporcion
                    // correcta no hace falta calcular el letterboxing.
                    style={{ aspectRatio: proporcion ? `${proporcion}` : "3 / 4" }}
                >
                    <img
                        src={urlImagen}
                        alt="Lamina de herbario con las regiones detectadas"
                        className="absolute inset-0 h-full w-full"
                        style={{ objectFit: "contain" }}
                        onLoad={(e) => {
                            const img = e.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) {
                                setProporcion(img.naturalWidth / img.naturalHeight);
                            }
                        }}
                    />

                    {proporcion !== null && (
                        <svg
                            className="absolute inset-0 h-full w-full"
                            style={{ touchAction: "none" }}
                            onPointerMove={alMoverPuntero}
                            onPointerUp={alSoltarPuntero}
                            onPointerCancel={alSoltarPuntero}
                            onPointerDown={() => setSeleccionada(null)}
                        >
                            {regiones.map((r) => {
                                const color = COLOR_POR_TIPO[r.label_type];
                                const activa = r.key === seleccionada;
                                return (
                                    <g key={r.key}>
                                        <rect
                                            x={`${r.x * 100}%`}
                                            y={`${r.y * 100}%`}
                                            width={`${r.width * 100}%`}
                                            height={`${r.height * 100}%`}
                                            fill={color}
                                            fillOpacity={r.enabled ? 0.12 : 0.04}
                                            stroke={color}
                                            strokeWidth={activa ? 3 : 2}
                                            // Descartada: contorno punteado, para
                                            // que se vea que sigue ahi pero no
                                            // se va a extraer.
                                            strokeDasharray={r.enabled ? undefined : "6 4"}
                                            strokeOpacity={r.enabled ? 1 : 0.6}
                                            style={{ cursor: CURSOR.move }}
                                            onPointerDown={(e) =>
                                                alBajarPuntero(e, r, "move")
                                            }
                                        />
                                        {activa &&
                                            HANDLES.map((h) => {
                                                const cx =
                                                    r.x +
                                                    r.width *
                                                        (h.includes("w")
                                                            ? 0
                                                            : h.includes("e")
                                                              ? 1
                                                              : 0.5);
                                                const cy =
                                                    r.y +
                                                    r.height *
                                                        (h.includes("n")
                                                            ? 0
                                                            : h.includes("s")
                                                              ? 1
                                                              : 0.5);
                                                return (
                                                    <circle
                                                        key={h}
                                                        cx={`${cx * 100}%`}
                                                        cy={`${cy * 100}%`}
                                                        r={RADIO_HANDLE}
                                                        fill="#ffffff"
                                                        stroke={color}
                                                        strokeWidth={2}
                                                        style={{ cursor: CURSOR[h] }}
                                                        onPointerDown={(e) =>
                                                            alBajarPuntero(e, r, h)
                                                        }
                                                    />
                                                );
                                            })}
                                    </g>
                                );
                            })}
                        </svg>
                    )}
                </div>

                {/* --- La lista editable --- */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                            {activas} de {regiones.length} se van a extraer
                        </span>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={agregar}
                            disabled={topeAlcanzado || submitting}
                            title={
                                topeAlcanzado
                                    ? `El maximo es ${payload.max_regions} regiones`
                                    : "Agregar una region que el modelo no detecto"
                            }
                        >
                            <Plus className="h-4 w-4" />
                            Agregar
                        </Button>
                    </div>

                    <div
                        className="flex flex-col gap-2 overflow-y-auto"
                        style={{ maxHeight: 420 }}
                    >
                        {regiones.map((r) => (
                            <RegionCard
                                key={r.key}
                                region={r}
                                seleccionada={r.key === seleccionada}
                                labelTypes={payload.label_types}
                                disabled={submitting}
                                onSelect={() => {
                                    marcarInteraccion();
                                    setSeleccionada(r.key);
                                }}
                                onToggle={() => alternarActiva(r.key)}
                                onChangeType={(t) => cambiarTipo(r.key, t)}
                                onDelete={() => eliminar(r.key)}
                            />
                        ))}
                    </div>

                    <Textarea
                        placeholder="Observaciones sobre la correccion (opcional)"
                        value={notas}
                        onChange={(e) => {
                            marcarInteraccion();
                            setNotas(e.target.value);
                        }}
                        rows={2}
                        disabled={submitting}
                    />
                </div>
            </div>

            <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={onCancel} disabled={submitting}>
                    Cancelar
                </Button>
                <Button
                    onClick={() =>
                        onConfirm(paraElServidor(regiones), notas.trim() || undefined)
                    }
                    // El servidor rechaza con 422 si no queda ninguna activa;
                    // se bloquea aca para no gastar el viaje.
                    disabled={activas === 0 || submitting}
                    title={
                        activas === 0
                            ? "Al menos una region tiene que quedar activa"
                            : undefined
                    }
                >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar y extraer {activas > 0 ? `(${activas})` : ""}
                </Button>
            </div>
        </div>
    );
}

/* =============================================================
 * Card de una region
 * ============================================================= */

interface RegionCardProps {
    region: RegionEditable;
    seleccionada: boolean;
    labelTypes: AgentLabelType[];
    disabled: boolean;
    onSelect: () => void;
    onToggle: () => void;
    onChangeType: (tipo: AgentLabelType) => void;
    onDelete: () => void;
}

function RegionCard({
    region,
    seleccionada,
    labelTypes,
    disabled,
    onSelect,
    onToggle,
    onChangeType,
    onDelete,
}: RegionCardProps) {
    const color = COLOR_POR_TIPO[region.label_type];
    // Solo se puede borrar lo que aporto el curador. Una deteccion del modelo
    // se desactiva, nunca se borra: si desapareciera de la lista se perderia su
    // `id` y con el la trazabilidad de que el modelo la habia propuesto.
    const puedeBorrarse = !region.id;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect();
                }
            }}
            className="rounded-md border p-2 text-left bg-card"
            style={{
                cursor: "pointer",
                borderLeft: `4px solid ${color}`,
                // `border-primary`, `bg-accent/40` y `opacity-60` no estan en el
                // CSS compilado del repo.
                ...(seleccionada
                    ? {
                          borderColor: color,
                          backgroundColor: "rgba(0, 0, 0, 0.04)",
                      }
                    : null),
                opacity: region.enabled ? 1 : 0.6,
            }}
        >
            <div className="flex items-center gap-2">
                <Select
                    value={region.label_type}
                    onValueChange={(v) => onChangeType(v as AgentLabelType)}
                    disabled={disabled}
                >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {labelTypes.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                                {NOMBRE_TIPO[t] ?? t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    type="button"
                    size="sm"
                    variant={region.enabled ? "secondary" : "outline"}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                    disabled={disabled}
                    title={
                        region.enabled
                            ? "Desactivar: no se manda al modelo y no gasta cuota"
                            : "Activar: se va a extraer"
                    }
                >
                    {region.enabled ? (
                        <Eye className="h-4 w-4" />
                    ) : (
                        <EyeOff className="h-4 w-4" />
                    )}
                </Button>

                {puedeBorrarse && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        disabled={disabled}
                        title="Quitar esta region"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                    conf. {NOMBRE_CONFIANZA[region.confidence] ?? region.confidence}
                </Badge>
                {region.source === "curator" && (
                    <Badge variant="secondary" className="text-xs">
                        agregada
                    </Badge>
                )}
                <span>
                    {Math.round(region.width * 100)}x{Math.round(region.height * 100)}%
                </span>
            </div>
        </div>
    );
}
