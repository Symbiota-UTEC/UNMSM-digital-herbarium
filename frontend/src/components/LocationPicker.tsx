// src/components/LocationPicker.tsx
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Crosshair, Eraser, Hexagon, Loader2, MapPin } from "lucide-react";
import { Button } from "./ui/button";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import XYZ from "ol/source/XYZ";
import Point from "ol/geom/Point";
import Polygon, { circular } from "ol/geom/Polygon";
import Modify from "ol/interaction/Modify";
import type Draw from "ol/interaction/Draw";
import { fromLonLat, toLonLat } from "ol/proj";

import { enclosingRadiusMeters, polygonToWkt, representativePoint, wktToPolygon } from "@utils/geo";
import { createSimplePolygonDraw } from "@utils/polygonDraw";
import type { AdminUnits } from "@services/geocoding.service";
import { markerStyle, polygonStyle, uncertaintyStyle } from "@utils/mapStyles";
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
  // Radio (m) que encierra el polígono. null: borrar la incertidumbre calculada; undefined: no tocarla.
  uncertaintyM?: number | null;
}

type Props = {
  lat: string;
  lon: string;
  footprintWKT: string;
  uncertainty: string;
  resolveAdminUnits: (lat: number, lon: number) => Promise<AdminUnits | null>;
  cancelGeocodeKey: number;
  onLocationChange: (change: LocationChange) => void;
  // null: no se pudo deducir la unidad administrativa
  onAdminUnits: (admin: AdminUnits | null) => void;
};

const LIMA: [number, number] = [-77.0428, -12.0464]; // [lon, lat]
const GEOCODE_DEBOUNCE_MS = 700;
const SAME_COORD_EPSILON = 1e-7;

// 7 decimales (~1 cm) bastan y evitan ruido como -12.046400000000006 en el formulario.
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

const parseCoord = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Mapa de captura de la ubicación. Aplica al formulario el punto o el polígono
 * apenas el usuario los marca, y deduce la unidad administrativa (con debounce).
 * Punto y polígono son excluyentes: marcar uno reemplaza al otro.
 */
export function LocationPicker({
  lat,
  lon,
  footprintWKT,
  uncertainty,
  resolveAdminUnits,
  cancelGeocodeKey,
  onLocationChange,
  onAdminUnits,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Feature<Point> | null>(null);
  const markerSourceRef = useRef<VectorSource | null>(null);
  const polygonSourceRef = useRef<VectorSource | null>(null);
  const uncertaintySourceRef = useRef<VectorSource | null>(null);
  // true mientras la incertidumbre del formulario sea la calculada a partir del polígono.
  const derivedUncertaintyRef = useRef(false);
  const modifyRef = useRef<Modify | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geocodeSeqRef = useRef(0);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);

  const [mode, setMode] = useState<Mode>(() => (wktToPolygon(footprintWKT) ? "polygon" : "point"));
  const [polygonCount, setPolygonCount] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [basemap, setBasemap] = useBasemap();

  // Últimos valores para los handlers del mapa, que se registran una sola vez.
  const callbacksRef = useRef({ onLocationChange, onAdminUnits, resolveAdminUnits });
  callbacksRef.current = { onLocationChange, onAdminUnits, resolveAdminUnits };
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const cancelGeocode = () => {
    geocodeSeqRef.current++;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeocoding(false);
  };

  useEffect(() => {
    geocodeSeqRef.current++;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeocoding(false);
  }, [cancelGeocodeKey]);

  const scheduleGeocode = (lonValue: number, latValue: number) => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    const seq = ++geocodeSeqRef.current;
    setGeocoding(true);
    geocodeTimerRef.current = setTimeout(async () => {
      const admin = await callbacksRef.current.resolveAdminUnits(latValue, lonValue);
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
    callbacksRef.current.onLocationChange({
      lat: round7(latValue),
      lon: round7(lonValue),
      footprintWKT: null,
      uncertaintyM: derivedUncertaintyRef.current ? null : undefined,
    });
    derivedUncertaintyRef.current = false;
    scheduleGeocode(lonValue, latValue);
  };

  // El punto de un polígono es su punto representativo.
  const commitPolygon = () => {
    const drawn = polygonSourceRef.current?.getFeatures().at(-1)?.getGeometry() as Polygon | undefined;

    if (!drawn) {
      showMarker(null);
      cancelGeocode();
      callbacksRef.current.onLocationChange({
        lat: null,
        lon: null,
        footprintWKT: null,
        uncertaintyM: derivedUncertaintyRef.current ? null : undefined,
      });
      derivedUncertaintyRef.current = false;
      return;
    }
    const [lonValue, latValue] = representativePoint(drawn)!;
    showMarker(fromLonLat([lonValue, latValue]));
    derivedUncertaintyRef.current = true;
    callbacksRef.current.onLocationChange({
      lat: round7(latValue),
      lon: round7(lonValue),
      footprintWKT: polygonToWkt(drawn),
      uncertaintyM: enclosingRadiusMeters(drawn, [lonValue, latValue]),
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
    const initialPolygon = wktToPolygon(footprintWKT);

    const marker = new Feature<Point>();
    marker.setStyle(markerStyle);
    const markerSource = new VectorSource();
    const polygonSource = new VectorSource();
    const uncertaintySource = new VectorSource();
    derivedUncertaintyRef.current = !!initialPolygon;
    if (initialPolygon) polygonSource.addFeature(new Feature(initialPolygon));
    setPolygonCount(polygonSource.getFeatures().length);
    polygonSource.on(["addfeature", "removefeature", "clear"], () =>
      setPolygonCount(polygonSource.getFeatures().length),
    );
    polygonSource.on("addfeature", commitPolygon);

    const baseLayer = new TileLayer({ source: createBasemapSource(basemap) });
    baseLayer.set("basemapId", basemap);
    baseLayerRef.current = baseLayer;

    const map = new Map({
      target: host,
      layers: [
        baseLayer,
        new VectorLayer({ source: uncertaintySource, style: uncertaintyStyle }),
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
    uncertaintySourceRef.current = uncertaintySource;

    if (hasPoint) showMarker(fromLonLat([initialLon, initialLat]));
    if (initialPolygon) {
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
      uncertaintySourceRef.current = null;
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

  // Círculo de incertidumbre alrededor del punto; con polígono no se dibuja (manda el polígono).
  useEffect(() => {
    const source = uncertaintySourceRef.current;
    if (!source) return;
    source.clear();
    const latValue = parseCoord(lat);
    const lonValue = parseCoord(lon);
    const meters = parseCoord(uncertainty);
    if (polygonCount > 0 || latValue == null || lonValue == null || meters == null || meters <= 0) return;
    source.addFeature(new Feature(circular([lonValue, latValue], meters, 64).transform("EPSG:4326", "EPSG:3857")));
  }, [lat, lon, uncertainty, polygonCount]);

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
      const { draw } = createSimplePolygonDraw(polygonSourceRef.current!, (message) =>
        toast.error(message, { id: "polygon-self-intersection" }),
      );
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
  }, [lat, lon]);

  const handleClearPolygon = () => {
    polygonSourceRef.current?.clear();
    commitPolygon();
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
        Marca en el mapa el punto de colecta. Si no puedes estimarlo con exactitud, dibuja un polígono. El país,
        departamento, provincia y distrito se completan automáticamente.
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleClearPolygon}
            disabled={polygonCount === 0}
            className="gap-2"
          >
            <Eraser className="h-4 w-4" />
            Borrar polígono
          </Button>
        )}
      </div>

      <div className="relative">
        <div
          ref={hostRef}
          className="w-full overflow-hidden rounded-lg border bg-muted/20"
          style={{ height: "440px" }}
        />
        <BasemapSwitcher value={basemap} onChange={setBasemap} />
        <div
          className="pointer-events-none rounded px-2 py-1 text-xs shadow"
          style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(255, 255, 255, 0.85)" }}
        >
          {mode === "point"
            ? "Haz clic o arrastra el punto de colecta"
            : "Clic para agregar vértices, doble clic para cerrar; no debe cruzarse consigo mismo"}
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
