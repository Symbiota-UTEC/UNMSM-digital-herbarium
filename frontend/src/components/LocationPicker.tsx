// src/components/LocationPicker.tsx
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Crosshair, Eraser, Hexagon, Loader2, MapPin, Undo2 } from "lucide-react";
import { Button } from "./ui/button";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import XYZ from "ol/source/XYZ";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import Modify from "ol/interaction/Modify";
import Draw from "ol/interaction/Draw";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

import { polygonsToWkt, representativePoint, wktToPolygons } from "@utils/geo";
import { reverseGeocodeAdminUnits, type AdminUnits } from "@utils/geocoding";
import {
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    createBasemapSource,
    createMapControls,
    createMapInteractions,
    useBasemap,
} from "@utils/basemaps";
import { BasemapSwitcher } from "./BasemapSwitcher";

type Mode = "point" | "polygon";

export interface LocationChange {
    lat: number | null;
    lon: number | null;
    footprintWKT: string | null;
}

type Props = {
    lat: string;
    lon: string;
    footprintWKT: string;
    onLocationChange: (change: LocationChange) => void;
    // null: no se pudo deducir la unidad administrativa
    onAdminUnits: (admin: AdminUnits | null) => void;
};

const LIMA: [number, number] = [-77.0428, -12.0464]; // [lon, lat]
const GEOCODE_DEBOUNCE_MS = 700;
const SAME_COORD_EPSILON = 1e-7;

const markerStyle = new Style({
    image: new CircleStyle({
        radius: 8,
        fill: new Fill({ color: "#b91c1c" }),
        stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
});

const polygonStyle = new Style({
    fill: new Fill({ color: "rgba(185, 28, 28, 0.15)" }),
    stroke: new Stroke({ color: "#b91c1c", width: 2 }),
});

const parseCoord = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Mapa de captura de la ubicación. Aplica al formulario el punto o el polígono
 * apenas el usuario los marca, y deduce la unidad administrativa (con debounce).
 * Punto y polígono son excluyentes: marcar uno reemplaza al otro.
 */
export function LocationPicker({ lat, lon, footprintWKT, onLocationChange, onAdminUnits }: Props) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const markerRef = useRef<Feature<Point> | null>(null);
    const markerSourceRef = useRef<VectorSource | null>(null);
    const polygonSourceRef = useRef<VectorSource | null>(null);
    const modifyRef = useRef<Modify | null>(null);
    const drawRef = useRef<Draw | null>(null);
    const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const geocodeSeqRef = useRef(0);
    const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);

    const [mode, setMode] = useState<Mode>(() => (wktToPolygons(footprintWKT).length > 0 ? "polygon" : "point"));
    const [polygonCount, setPolygonCount] = useState(0);
    const [locating, setLocating] = useState(false);
    const [geocoding, setGeocoding] = useState(false);
    const [basemap, setBasemap] = useBasemap();

    // Últimos valores para los handlers del mapa, que se registran una sola vez.
    const callbacksRef = useRef({ onLocationChange, onAdminUnits });
    callbacksRef.current = { onLocationChange, onAdminUnits };
    const modeRef = useRef(mode);
    modeRef.current = mode;

    const cancelGeocode = () => {
        geocodeSeqRef.current++;
        if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
        setGeocoding(false);
    };

    const scheduleGeocode = (lonValue: number, latValue: number) => {
        if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
        const seq = ++geocodeSeqRef.current;
        setGeocoding(true);
        geocodeTimerRef.current = setTimeout(async () => {
            const admin = await reverseGeocodeAdminUnits(latValue, lonValue);
            if (seq !== geocodeSeqRef.current) return; // llegó otro punto, o se desmontó
            setGeocoding(false);
            callbacksRef.current.onAdminUnits(admin);
        }, GEOCODE_DEBOUNCE_MS);
    };

    const showMarker = (coordinate: number[] | null) => {
        const marker = markerRef.current;
        const source = markerSourceRef.current;
        if (!marker || !source) return;
        if (!coordinate) {
            if (source.hasFeature(marker)) source.removeFeature(marker);
            return;
        }
        marker.setGeometry(new Point(coordinate));
        if (!source.hasFeature(marker)) source.addFeature(marker);
    };

    // Clic, arrastre o geolocalización: un punto exacto reemplaza a cualquier polígono.
    const placePoint = (coordinate: number[]) => {
        polygonSourceRef.current?.clear();
        showMarker(coordinate);
        const [lonValue, latValue] = toLonLat(coordinate);
        callbacksRef.current.onLocationChange({ lat: latValue, lon: lonValue, footprintWKT: null });
        scheduleGeocode(lonValue, latValue);
    };

    // El punto de un polígono es su punto representativo.
    const commitPolygons = () => {
        const drawn = (polygonSourceRef.current?.getFeatures() ?? [])
            .map((f) => f.getGeometry() as Polygon | undefined)
            .filter((g): g is Polygon => !!g);

        if (drawn.length === 0) {
            showMarker(null);
            cancelGeocode();
            callbacksRef.current.onLocationChange({ lat: null, lon: null, footprintWKT: null });
            return;
        }
        const [lonValue, latValue] = representativePoint(drawn)!;
        showMarker(fromLonLat([lonValue, latValue]));
        callbacksRef.current.onLocationChange({
            lat: latValue,
            lon: lonValue,
            footprintWKT: polygonsToWkt(drawn),
        });
        scheduleGeocode(lonValue, latValue);
    };

    // Mapa: se crea una vez con los valores iniciales del formulario.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const initialLat = parseCoord(lat);
        const initialLon = parseCoord(lon);
        const hasPoint = initialLat != null && initialLon != null;
        const initialPolygons = wktToPolygons(footprintWKT);

        const marker = new Feature<Point>();
        marker.setStyle(markerStyle);
        const markerSource = new VectorSource();
        const polygonSource = new VectorSource();
        polygonSource.addFeatures(initialPolygons.map((p) => new Feature(p)));
        setPolygonCount(initialPolygons.length);
        polygonSource.on(["addfeature", "removefeature", "clear"], () =>
            setPolygonCount(polygonSource.getFeatures().length),
        );
        polygonSource.on("addfeature", commitPolygons);

        const baseLayer = new TileLayer({ source: createBasemapSource(basemap) });
        baseLayer.set("basemapId", basemap);
        baseLayerRef.current = baseLayer;

        const map = new Map({
            target: host,
            layers: [
                baseLayer,
                new VectorLayer({ source: polygonSource, style: polygonStyle }),
                new VectorLayer({ source: markerSource }),
            ],
            view: new View({
                center: fromLonLat(hasPoint ? [initialLon, initialLat] : LIMA),
                zoom: hasPoint ? 15 : 11,
                minZoom: MAP_MIN_ZOOM,
                maxZoom: MAP_MAX_ZOOM,
            }),
            controls: createMapControls(),
            interactions: createMapInteractions(),
        });

        mapRef.current = map;
        markerRef.current = marker;
        markerSourceRef.current = markerSource;
        polygonSourceRef.current = polygonSource;

        if (hasPoint) showMarker(fromLonLat([initialLon, initialLat]));
        if (initialPolygons.length > 0) {
            map.updateSize();
            map.getView().fit(polygonSource.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 16 });
        }

        map.on("singleclick", (evt) => {
            if (modeRef.current === "point") placePoint(evt.coordinate);
        });

        const resizeObserver = new ResizeObserver(() => map.updateSize());
        resizeObserver.observe(host);

        return () => {
            geocodeSeqRef.current++;
            if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
            resizeObserver.disconnect();
            map.setTarget(undefined);
            mapRef.current = null;
            baseLayerRef.current = null;
            markerRef.current = null;
            markerSourceRef.current = null;
            polygonSourceRef.current = null;
            modifyRef.current = null;
            drawRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cambio de mapa base.
    useEffect(() => {
        const layer = baseLayerRef.current;
        if (!layer || layer.get("basemapId") === basemap) return;
        layer.setSource(createBasemapSource(basemap));
        layer.set("basemapId", basemap);
    }, [basemap]);

    // Herramienta activa: arrastrar el punto o dibujar polígonos.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (modifyRef.current) map.removeInteraction(modifyRef.current);
        if (drawRef.current) map.removeInteraction(drawRef.current);
        modifyRef.current = null;
        drawRef.current = null;

        if (mode === "point") {
            const modify = new Modify({ source: markerSourceRef.current! });
            modify.on("modifyend", () => {
                const geometry = markerRef.current?.getGeometry();
                if (geometry) placePoint(geometry.getCoordinates());
            });
            map.addInteraction(modify);
            modifyRef.current = modify;
        } else {
            const draw = new Draw({ source: polygonSourceRef.current!, type: "Polygon" });
            map.addInteraction(draw);
            drawRef.current = draw;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Si lat/lon se editan a mano en el formulario, el marcador los sigue y se recalcula la unidad administrativa.
    useEffect(() => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) return;

        const latValue = parseCoord(lat);
        const lonValue = parseCoord(lon);
        if (latValue == null || lonValue == null) {
            showMarker(null);
            return;
        }
        const current = marker.getGeometry() ? toLonLat(marker.getGeometry()!.getCoordinates()) : null;
        if (
            current &&
            Math.abs(current[0] - lonValue) < SAME_COORD_EPSILON &&
            Math.abs(current[1] - latValue) < SAME_COORD_EPSILON
        ) {
            return;
        }
        const coordinate = fromLonLat([lonValue, latValue]);
        showMarker(coordinate);
        map.getView().animate({ center: coordinate, duration: 250 });
        scheduleGeocode(lonValue, latValue);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lon]);

    const handleUndoPolygon = () => {
        const source = polygonSourceRef.current;
        const last = source?.getFeatures().at(-1);
        if (source && last) {
            source.removeFeature(last);
            commitPolygons();
        }
    };

    const handleClearPolygons = () => {
        polygonSourceRef.current?.clear();
        commitPolygons();
    };

    const handleLocateMe = () => {
        if (!navigator.geolocation) {
            toast.error("Tu navegador no soporta geolocalización");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocating(false);
                const coordinate = fromLonLat([pos.coords.longitude, pos.coords.latitude]);
                placePoint(coordinate);
                mapRef.current?.getView().animate({ center: coordinate, zoom: 15, duration: 300 });
            },
            () => {
                setLocating(false);
                toast.error("No se pudo obtener la ubicación", {
                    description: "Verifica los permisos de ubicación del navegador.",
                });
            },
            { enableHighAccuracy: true, timeout: 8000 },
        );
    };

    return (
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
                Marca en el mapa el punto de colecta. Si no puedes estimarlo con exactitud, dibuja un polígono.
                El país, departamento, provincia y distrito se completan automáticamente.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-lg border p-0.5">
                    <Button
                        type="button"
                        size="sm"
                        variant={mode === "point" ? "default" : "ghost"}
                        onClick={() => setMode("point")}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <MapPin className="h-3.5 w-3.5" />
                        Punto
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={mode === "polygon" ? "default" : "ghost"}
                        onClick={() => setMode("polygon")}
                        className="h-7 gap-1.5 text-xs"
                    >
                        <Hexagon className="h-3.5 w-3.5" />
                        Polígono
                    </Button>
                </div>

                {mode === "point" ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleLocateMe}
                        disabled={locating}
                        className="gap-2"
                    >
                        <Crosshair className="h-4 w-4" />
                        {locating ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={handleUndoPolygon}
                            disabled={polygonCount === 0}
                            className="gap-2"
                        >
                            <Undo2 className="h-4 w-4" />
                            Deshacer último
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={handleClearPolygons}
                            disabled={polygonCount === 0}
                            className="gap-2"
                        >
                            <Eraser className="h-4 w-4" />
                            Borrar todo
                        </Button>
                    </div>
                )}
            </div>

            <div className="relative">
                <div
                    ref={hostRef}
                    className="w-full overflow-hidden rounded-lg border bg-muted/20"
                    style={{ height: "440px" }}
                />
                <BasemapSwitcher value={basemap} onChange={setBasemap} />
                <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-background/80 px-2 py-1 text-xs shadow">
                    {mode === "point"
                        ? "Haz clic o arrastra el punto de colecta"
                        : `Clic para agregar vértices, doble clic para cerrar · Polígonos: ${polygonCount}`}
                </div>
            </div>

            <p className="flex min-h-[1rem] items-center gap-1.5 text-xs text-muted-foreground">
                {geocoding && (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Deduciendo la unidad administrativa…
                    </>
                )}
            </p>
        </div>
    );
}
