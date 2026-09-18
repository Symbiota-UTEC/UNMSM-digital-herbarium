import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Circle as CircleIcon,
  Eraser,
  Hexagon,
  MapPin,
  Undo2,
} from "lucide-react";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon, { circular } from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import { createEmpty, extend, isEmpty } from "ol/extent";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { FiltersCard, filterInputClass, filterLabelClass } from "../ui/filters";
import {
  OccurrenceFilterFields,
  EMPTY_OCCURRENCE_FILTERS,
  hasActiveOccurrenceFilters,
  type OccurrenceFilterValues,
} from "../OccurrenceFilterFields";
import { useAuth } from "../../contexts/AuthContext";
import {
  occurrencesService,
  type OccurrenceMapFilters,
  type OccurrenceMapPoint,
  type OccurrenceMapResponse,
  type OccurrenceMatchType,
} from "@services/occurrences.service";
import { polygonsToWkt } from "@utils/geo";
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  createBasemapSource,
  createMapControls,
  createMapInteractions,
  useBasemap,
} from "@utils/basemaps";
import { BasemapSwitcher } from "../BasemapSwitcher";

interface MapPageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

type AreaMode = "none" | "radius" | "polygon";

const MATCH_STYLE: Record<OccurrenceMatchType, { color: string; label: string }> = {
  exact: { color: "#dc2626", label: "Punto exacto" },
  representative: { color: "#2563eb", label: "Polígono, con su punto representativo dentro del área" },
  intersects: { color: "#16a34a", label: "Polígono que solo interseca el área" },
};

const matchLabel = (type: OccurrenceMatchType, withArea: boolean) =>
  type === "representative" && !withArea
    ? "Polígono (punto representativo)"
    : MATCH_STYLE[type].label;

const pointStyles = Object.fromEntries(
  (Object.keys(MATCH_STYLE) as OccurrenceMatchType[]).map((type) => [
    type,
    new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: MATCH_STYLE[type].color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    }),
  ]),
) as Record<OccurrenceMatchType, Style>;

const areaStyle = new Style({
  fill: new Fill({ color: "rgba(37, 99, 235, 0.12)" }),
  stroke: new Stroke({ color: "#2563eb", width: 2, lineDash: [6, 4] }),
});

const centerStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "#2563eb" }),
    stroke: new Stroke({ color: "#ffffff", width: 2 }),
  }),
});

const LIMA: [number, number] = [-77.0428, -12.0464]; // [lon, lat]

const errorMessage = (err: any): string => {
  try {
    const detail = JSON.parse(err.detail)?.detail;
    if (typeof detail === "string") return detail;
  } catch {
    // el cuerpo no era JSON
  }
  return err?.message ?? "Error desconocido";
};

export function MapPage({ onNavigate }: MapPageProps) {
  const { apiFetch } = useAuth();

  const [filters, setFilters] = useState<OccurrenceFilterValues>(EMPTY_OCCURRENCE_FILTERS);
  const [areaMode, setAreaMode] = useState<AreaMode>("none");
  const [radiusKm, setRadiusKm] = useState("10");
  const [center, setCenter] = useState<[number, number] | null>(null); // [lon, lat]
  const [polygonCount, setPolygonCount] = useState(0);
  const [includeIntersecting, setIncludeIntersecting] = useState(false);

  const [result, setResult] = useState<OccurrenceMapResponse | null>(null);
  const [selected, setSelected] = useState<OccurrenceMapPoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchedWithArea, setSearchedWithArea] = useState(false);
  const [basemap, setBasemap] = useBasemap();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const pointsSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonSourceRef = useRef<VectorSource>(new VectorSource());
  const radiusSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const radiusLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const drawingRef = useRef(false);
  const areaModeRef = useRef<AreaMode>(areaMode);

  useEffect(() => {
    areaModeRef.current = areaMode;
  }, [areaMode]);

  // Mapa: se crea una sola vez.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pointsSource = pointsSourceRef.current;
    const polygonSource = polygonSourceRef.current;
    const radiusSource = radiusSourceRef.current;

    const polygonLayer = new VectorLayer({ source: polygonSource, style: areaStyle });
    const radiusLayer = new VectorLayer({ source: radiusSource, style: areaStyle });
    const pointsLayer = new VectorLayer({ source: pointsSource });
    polygonLayerRef.current = polygonLayer;
    radiusLayerRef.current = radiusLayer;

    const baseLayer = new TileLayer({ source: createBasemapSource(basemap) });
    baseLayer.set("basemapId", basemap);
    baseLayerRef.current = baseLayer;

    const map = new Map({
      target: host,
      layers: [baseLayer, polygonLayer, radiusLayer, pointsLayer],
      view: new View({ center: fromLonLat(LIMA), zoom: 11, minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM }),
      controls: createMapControls(),
      interactions: createMapInteractions(),
    });
    mapRef.current = map;

    const syncPolygonCount = () => setPolygonCount(polygonSource.getFeatures().length);
    polygonSource.on(["addfeature", "removefeature", "clear"], syncPolygonCount);

    map.on("singleclick", (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (layer) => layer === pointsLayer,
      });
      if (hit && !drawingRef.current) {
        setSelected(hit.get("point") as OccurrenceMapPoint);
        return;
      }
      if (areaModeRef.current === "radius") {
        const [lon, lat] = toLonLat(evt.coordinate);
        setCenter([lon, lat]);
      }
    });

    return () => {
      polygonSource.un(["addfeature", "removefeature", "clear"], syncPolygonCount);
      map.setTarget(undefined);
      mapRef.current = null;
      baseLayerRef.current = null;
    };
  }, []);

  // Cambio de mapa base.
  useEffect(() => {
    const layer = baseLayerRef.current;
    if (!layer || layer.get("basemapId") === basemap) return;
    layer.setSource(createBasemapSource(basemap));
    layer.set("basemapId", basemap);
  }, [basemap]);

  // Herramienta activa según el modo de área.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawRef.current) {
      map.removeInteraction(drawRef.current);
      drawRef.current = null;
      drawingRef.current = false;
    }
    polygonLayerRef.current?.setVisible(areaMode === "polygon");
    radiusLayerRef.current?.setVisible(areaMode === "radius");

    if (areaMode === "polygon") {
      const draw = new Draw({ source: polygonSourceRef.current, type: "Polygon" });
      draw.on("drawstart", () => {
        drawingRef.current = true;
      });
      draw.on("drawend", () => {
        drawingRef.current = false;
      });
      map.addInteraction(draw);
      drawRef.current = draw;
    }
  }, [areaMode]);

  // Centro y círculo del radio.
  useEffect(() => {
    const source = radiusSourceRef.current;
    source.clear();
    if (!center) return;

    const marker = new Feature(new Point(fromLonLat(center)));
    marker.setStyle(centerStyle);
    source.addFeature(marker);

    const km = parseFloat(radiusKm);
    if (km > 0) {
      const circle = circular(center, km * 1000, 64).transform("EPSG:4326", "EPSG:3857");
      source.addFeature(new Feature(circle));
    }
  }, [center, radiusKm]);

  const drawnPolygons = () =>
    polygonSourceRef.current
      .getFeatures()
      .map((f) => f.getGeometry() as Polygon | undefined)
      .filter((g): g is Polygon => !!g);

  const fitToContent = () => {
    const map = mapRef.current;
    if (!map) return;
    const extent = createEmpty();
    extend(extent, pointsSourceRef.current.getExtent());
    if (areaMode === "radius") extend(extent, radiusSourceRef.current.getExtent());
    if (areaMode === "polygon") extend(extent, polygonSourceRef.current.getExtent());
    if (!isEmpty(extent)) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 14, duration: 300 });
    }
  };

  const handleSearch = async () => {
    const query: OccurrenceMapFilters = { ...filters };

    if (areaMode === "radius") {
      const km = parseFloat(radiusKm);
      if (!center) {
        toast.error("Haz clic en el mapa para fijar el centro del radio");
        return;
      }
      if (!(km > 0)) {
        toast.error("El radio debe ser mayor que 0");
        return;
      }
      query.nearLat = center[1];
      query.nearLon = center[0];
      query.radiusKm = km;
    } else if (areaMode === "polygon") {
      const wkt = polygonsToWkt(drawnPolygons());
      if (!wkt) {
        toast.error("Dibuja al menos un polígono en el mapa");
        return;
      }
      query.withinPolygon = wkt;
    }
    query.includeIntersecting = areaMode !== "none" && includeIntersecting;

    setLoading(true);
    try {
      const data = await occurrencesService.mapPoints(apiFetch, query);
      const pointsSource = pointsSourceRef.current;
      pointsSource.clear();
      pointsSource.addFeatures(
        data.items.map((p) => {
          const feature = new Feature(new Point(fromLonLat([p.lon, p.lat])));
          feature.set("point", p);
          feature.setStyle(pointStyles[p.matchType]);
          return feature;
        }),
      );
      setResult(data);
      setSearchedWithArea(areaMode !== "none");
      setSelected(null);
      if (data.items.length === 0) toast.info("No se encontraron ocurrencias con esos criterios");
      fitToContent();
    } catch (err: any) {
      toast.error("No se pudo realizar la búsqueda", { description: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilters(EMPTY_OCCURRENCE_FILTERS);
    setAreaMode("none");
    setCenter(null);
    setIncludeIntersecting(false);
    polygonSourceRef.current.clear();
    pointsSourceRef.current.clear();
    setResult(null);
    setSelected(null);
  };

  const handleUndoPolygon = () => {
    const last = polygonSourceRef.current.getFeatures().at(-1);
    if (last) polygonSourceRef.current.removeFeature(last);
  };

  const countByType = (type: OccurrenceMatchType) =>
    result?.items.filter((p) => p.matchType === type).length ?? 0;

  const filtersActive = hasActiveOccurrenceFilters(filters) || areaMode !== "none";

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Mapa de Ocurrencias</h1>
        <p className="text-sm text-muted-foreground">
          Visualiza en el mapa las ocurrencias que cumplen los filtros y el área geográfica elegidos
        </p>
      </div>

      <FiltersCard
        title="Filtrar ocurrencias"
        description="Los filtros por atributos y el área geográfica se aplican todos a la vez. Deja vacío lo que no necesites."
        filtersActive={filtersActive}
        onClear={handleClear}
        onApply={handleSearch}
        loading={loading}
      >
        <OccurrenceFilterFields values={filters} onChange={setFilters} />

        <div className="space-y-3" style={{ borderTop: "1px dashed var(--border)", paddingTop: "1rem" }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={filterLabelClass}>Área geográfica</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={areaMode === "none" ? "default" : "outline"}
                onClick={() => setAreaMode("none")}
                className="h-8 text-xs"
              >
                Sin área
              </Button>
              <Button
                type="button"
                size="sm"
                variant={areaMode === "radius" ? "default" : "outline"}
                onClick={() => setAreaMode("radius")}
                className="h-8 gap-1 text-xs"
              >
                <CircleIcon className="h-3.5 w-3.5" />
                Radio
              </Button>
              <Button
                type="button"
                size="sm"
                variant={areaMode === "polygon" ? "default" : "outline"}
                onClick={() => setAreaMode("polygon")}
                className="h-8 gap-1 text-xs"
              >
                <Hexagon className="h-3.5 w-3.5" />
                Polígono
              </Button>
            </div>
          </div>

          {areaMode === "radius" && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="radiusKm" className={filterLabelClass}>Radio (km)</label>
                <input
                  id="radiusKm"
                  type="number"
                  min={0}
                  step="any"
                  className={filterInputClass}
                  style={{ width: "7.5rem" }}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground" style={{ paddingBottom: "0.55rem" }}>
                {center
                  ? `Centro: ${center[1].toFixed(5)}, ${center[0].toFixed(5)} (haz clic en el mapa para moverlo)`
                  : "Haz clic en el mapa para fijar el centro."}
              </p>
            </div>
          )}

          {areaMode === "polygon" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Dibuja en el mapa: clic para agregar vértices, doble clic para cerrar. Puedes dibujar varios
                polígonos ({polygonCount} dibujado{polygonCount === 1 ? "" : "s"}).
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={polygonCount === 0}
                  onClick={handleUndoPolygon}
                  className="h-8 gap-1 text-xs"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Deshacer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={polygonCount === 0}
                  onClick={() => polygonSourceRef.current.clear()}
                  className="h-8 gap-1 text-xs"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Borrar
                </Button>
              </div>
            </div>
          )}

          {areaMode !== "none" && (
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeIntersecting}
                onChange={(e) => setIncludeIntersecting(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-[rgb(117,26,29)]"
              />
              <span className="text-muted-foreground">
                Incluir también las ocurrencias cuyo polígono interseca el área, aunque su punto representativo
                quede fuera
              </span>
            </label>
          )}
        </div>
      </FiltersCard>

      <Card>
        <CardHeader>
          <CardTitle>Distribución Geográfica</CardTitle>
          <CardDescription>Haz clic en un punto para ver sus detalles</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <div
              ref={hostRef}
              style={{ height: "600px", width: "100%", borderRadius: "0.5rem" }}
              className="border"
            />
            <BasemapSwitcher value={basemap} onChange={setBasemap} />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {result
                ? `${result.total} ocurrencia${result.total === 1 ? "" : "s"}`
                : "Sin búsqueda realizada"}
            </span>
            {(Object.keys(MATCH_STYLE) as OccurrenceMatchType[]).map((type) => (
              <span key={type} className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full border border-white shadow"
                  style={{ backgroundColor: MATCH_STYLE[type].color }}
                />
                {matchLabel(type, searchedWithArea)}
                {result && <strong className="text-foreground">({countByType(type)})</strong>}
              </span>
            ))}
          </div>
          {result?.truncated && (
            <p className="text-xs text-amber-600">
              Se muestran solo {result.items.length} de {result.total}. Acota la búsqueda para ver el resto.
            </p>
          )}

          {selected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: MATCH_STYLE[selected.matchType].color }}
                  />
                  <span className="font-medium">{selected.code ?? "Sin código"}</span>
                  {selected.scientificName && (
                    <span className="italic text-muted-foreground">{selected.scientificName}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {matchLabel(selected.matchType, searchedWithArea)} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAreaMode("radius");
                    setCenter([selected.lon, selected.lat]);
                  }}
                >
                  Buscar alrededor
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate("occurrence-detail", { occurrenceId: selected.occurrenceId })}
                >
                  Ver detalle
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
