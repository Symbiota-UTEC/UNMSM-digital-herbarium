import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Circle as CircleIcon,
  Eraser,
  Hexagon,
  MapPin,
  Search,
  Undo2,
  X,
} from "lucide-react";

import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon, { circular } from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import { createEmpty, extend, isEmpty } from "ol/extent";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";
import {
  occurrencesService,
  type OccurrenceMapFilters,
  type OccurrenceMapPoint,
  type OccurrenceMapResponse,
  type OccurrenceMatchType,
} from "@services/occurrences.service";
import { polygonsToWkt } from "@utils/geo";

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

  const [filters, setFilters] = useState({ scientificName: "", family: "", collector: "" });
  const [areaMode, setAreaMode] = useState<AreaMode>("none");
  const [radiusKm, setRadiusKm] = useState("10");
  const [center, setCenter] = useState<[number, number] | null>(null); // [lon, lat]
  const [polygonCount, setPolygonCount] = useState(0);
  const [includeIntersecting, setIncludeIntersecting] = useState(false);

  const [result, setResult] = useState<OccurrenceMapResponse | null>(null);
  const [selected, setSelected] = useState<OccurrenceMapPoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchedWithArea, setSearchedWithArea] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const pointsSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonSourceRef = useRef<VectorSource>(new VectorSource());
  const radiusSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const radiusLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawRef = useRef<Draw | null>(null);
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

    const map = new Map({
      target: host,
      layers: [new TileLayer({ source: new OSM() }), polygonLayer, radiusLayer, pointsLayer],
      view: new View({ center: fromLonLat(LIMA), zoom: 11 }),
      controls: [],
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
    };
  }, []);

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
    setFilters({ scientificName: "", family: "", collector: "" });
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Mapa de Ocurrencias</h1>
        <p className="text-sm text-muted-foreground">
          Busca ocurrencias dentro de un radio o de un polígono y visualízalas en el mapa
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Búsqueda</CardTitle>
              <CardDescription>Área geográfica y filtros</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Área de búsqueda</Label>
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={areaMode === "none" ? "default" : "outline"}
                    onClick={() => setAreaMode("none")}
                  >
                    Sin área
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={areaMode === "radius" ? "default" : "outline"}
                    onClick={() => setAreaMode("radius")}
                    className="gap-1"
                  >
                    <CircleIcon className="h-3.5 w-3.5" />
                    Radio
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={areaMode === "polygon" ? "default" : "outline"}
                    onClick={() => setAreaMode("polygon")}
                    className="gap-1"
                  >
                    <Hexagon className="h-3.5 w-3.5" />
                    Polígono
                  </Button>
                </div>

                {areaMode === "radius" && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-muted-foreground">
                      {center
                        ? `Centro: ${center[1].toFixed(5)}, ${center[0].toFixed(5)}`
                        : "Haz clic en el mapa para fijar el centro."}
                    </p>
                    <Label htmlFor="radiusKm" className="text-xs">Radio (km)</Label>
                    <Input
                      id="radiusKm"
                      type="number"
                      min={0}
                      step="any"
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(e.target.value)}
                    />
                  </div>
                )}

                {areaMode === "polygon" && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Clic para agregar vértices, doble clic para cerrar. Puedes dibujar varios
                      polígonos ({polygonCount} dibujado{polygonCount === 1 ? "" : "s"}).
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={polygonCount === 0}
                        onClick={handleUndoPolygon}
                        className="gap-1"
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
                        className="gap-1"
                      >
                        <Eraser className="h-3.5 w-3.5" />
                        Borrar
                      </Button>
                    </div>
                  </div>
                )}

                {areaMode !== "none" && (
                  <div className="flex items-start gap-2 pt-1">
                    <input
                      id="includeIntersecting"
                      type="checkbox"
                      checked={includeIntersecting}
                      onChange={(e) => setIncludeIntersecting(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-input accent-[rgb(117,26,29)]"
                    />
                    <Label htmlFor="includeIntersecting" className="cursor-pointer text-xs font-normal leading-snug">
                      Incluir también las ocurrencias cuyo polígono interseca el área, aunque su punto
                      representativo quede fuera
                    </Label>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="scientificName">Nombre científico</Label>
                <Input
                  id="scientificName"
                  placeholder="Ej: Heliconia bihai"
                  value={filters.scientificName}
                  onChange={(e) => setFilters({ ...filters, scientificName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="family">Familia</Label>
                <Input
                  id="family"
                  placeholder="Ej: Heliconiaceae"
                  value={filters.family}
                  onChange={(e) => setFilters({ ...filters, family: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collector">Colector</Label>
                <Input
                  id="collector"
                  placeholder="Nombre del colector"
                  value={filters.collector}
                  onChange={(e) => setFilters({ ...filters, collector: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSearch} disabled={loading} className="flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  {loading ? "Buscando..." : "Buscar"}
                </Button>
                <Button onClick={handleClear} variant="outline" title="Limpiar">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {result
                      ? `${result.total} ocurrencia${result.total === 1 ? "" : "s"}`
                      : "Sin búsqueda realizada"}
                  </span>
                </div>
                {result?.truncated && (
                  <p className="text-xs text-amber-600">
                    Se muestran solo {result.items.length} de {result.total}. Acota la búsqueda para ver el resto.
                  </p>
                )}
                {(Object.keys(MATCH_STYLE) as OccurrenceMatchType[]).map((type) => (
                  <div key={type} className="flex items-start gap-2 text-xs">
                    <span
                      className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border border-white shadow"
                      style={{ backgroundColor: MATCH_STYLE[type].color }}
                    />
                    <span className="text-muted-foreground">
                      {matchLabel(type, searchedWithArea)}
                      {result && <strong className="ml-1 text-foreground">({countByType(type)})</strong>}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Distribución Geográfica</CardTitle>
              <CardDescription>Haz clic en un punto para ver sus detalles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                ref={hostRef}
                style={{ height: "600px", width: "100%", borderRadius: "0.5rem" }}
                className="border"
              />
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
      </div>
    </div>
  );
}
