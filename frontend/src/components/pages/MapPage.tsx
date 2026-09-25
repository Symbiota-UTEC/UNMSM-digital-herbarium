import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Circle as CircleIcon, Eraser, Hexagon, MapPin } from "lucide-react";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon, { circular } from "ol/geom/Polygon";
import type Draw from "ol/interaction/Draw";
import { createEmpty, extend, isEmpty } from "ol/extent";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
} from "@services/occurrences.service";
import { formatMeters, polygonToWkt, wktToPolygon } from "@utils/geo";
import { createSimplePolygonDraw } from "@utils/polygonDraw";
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

// Sin área de búsqueda, todo resultado se pinta "confirmed" (no hay nada de qué diferenciarlo).
// Con área, distingue lo que el área contiene por completo de lo que solo toca: por su
// incertidumbre (círculo o polígono), esto último podría en realidad quedar fuera.
type Certainty = "confirmed" | "uncertain";

const CERTAINTY_STYLE: Record<Certainty, { color: string; label: string }> = {
  confirmed: { color: "#2e7d32", label: "Dentro del área buscada" },
  uncertain: { color: "#81c784", label: "Podría quedar fuera (por su incertidumbre)" },
};

const certaintyOf = (p: OccurrenceMapPoint): Certainty => (p.fullyContained === false ? "uncertain" : "confirmed");

const locationText = (p: OccurrenceMapPoint) => {
  if (p.locationType === "point") return "Punto exacto";
  if (p.locationType === "circle" && p.uncertaintyMeters) return `Aproximada (± ${formatMeters(p.uncertaintyMeters)})`;
  return p.locationType === "polygon" ? "Aproximada (polígono)" : "Aproximada";
};

const pointStyles = Object.fromEntries(
  (Object.keys(CERTAINTY_STYLE) as Certainty[]).map((certainty) => [
    certainty,
    new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: CERTAINTY_STYLE[certainty].color }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    }),
  ]),
) as Record<Certainty, Style>;

// Rojo del sistema (el mismo de utils/mapStyles.ts): igual que en el resto de la app,
// para el punto y el área de búsqueda — distinto de los verdes de resultado.
const QUERY_COLOR = "#b91c1c";

const areaStyle = new Style({
  fill: new Fill({ color: "rgba(185, 28, 28, 0.12)" }),
  stroke: new Stroke({ color: QUERY_COLOR, width: 2, lineDash: [6, 4] }),
});

const centerStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: QUERY_COLOR }),
    stroke: new Stroke({ color: "#ffffff", width: 2 }),
  }),
});

// Resalte de la geometría propia de la ocurrencia seleccionada (su polígono o círculo de
// incertidumbre): un verde distinto de los dos de CERTAINTY_STYLE (más intenso, con un
// matiz esmeralda) para que se note como un resalte y no como un tercer nivel de certeza.
const SELECTED_COLOR = "#059669";

const selectedPolygonStyle = new Style({
  fill: new Fill({ color: "rgba(5, 150, 105, 0.15)" }),
  stroke: new Stroke({ color: SELECTED_COLOR, width: 2 }),
});

const selectedCircleStyle = new Style({
  fill: new Fill({ color: "rgba(5, 150, 105, 0.08)" }),
  stroke: new Stroke({ color: SELECTED_COLOR, width: 2, lineDash: [4, 3] }),
});

const LIMA: [number, number] = [-77.0428, -12.0464]; // [lon, lat]

// Última búsqueda aplicada: se guarda en la sesión para restaurarla al volver desde el detalle de una ocurrencia.
const SEARCH_STORAGE_KEY = "herbarium.mapSearch";

type SearchInput = {
  filters: OccurrenceFilterValues;
  areaMode: AreaMode;
  radiusM: string;
  center: [number, number] | null;
  polygonWkt: string | null;
};
type SavedSearch = SearchInput & { selectedId: string | null };

const loadSavedSearch = (): SavedSearch | null => {
  try {
    const raw = sessionStorage.getItem(SEARCH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSearch) : null;
  } catch {
    return null;
  }
};

const storeSearch = (search: SavedSearch | null) => {
  try {
    if (search) sessionStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(search));
    else sessionStorage.removeItem(SEARCH_STORAGE_KEY);
  } catch {
    // sessionStorage no disponible: la búsqueda simplemente no se restaura
  }
};

// Filtros de la API a partir de los criterios; null (con aviso) si falta algo del área.
const buildQuery = ({ filters, areaMode, radiusM, center, polygonWkt }: SearchInput): OccurrenceMapFilters | null => {
  const query: OccurrenceMapFilters = { ...filters };
  if (areaMode === "radius") {
    const meters = parseFloat(radiusM);
    if (!center) {
      toast.error("Haz clic en el mapa para fijar el centro del radio");
      return null;
    }
    if (!(meters > 0)) {
      toast.error("El radio debe ser mayor que 0");
      return null;
    }
    query.nearLat = center[1];
    query.nearLon = center[0];
    query.radiusKm = meters / 1000; // la API sigue esperando kilómetros
  } else if (areaMode === "polygon") {
    if (!polygonWkt) {
      toast.error("Dibuja un polígono en el mapa");
      return null;
    }
    query.withinPolygon = polygonWkt;
  }
  return query;
};

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
  const location = useLocation();

  const [filters, setFilters] = useState<OccurrenceFilterValues>(EMPTY_OCCURRENCE_FILTERS);
  const [areaMode, setAreaMode] = useState<AreaMode>("none");
  const [radiusM, setRadiusM] = useState("1000");
  const [center, setCenter] = useState<[number, number] | null>(null); // [lon, lat]
  const [polygonCount, setPolygonCount] = useState(0);

  const [result, setResult] = useState<OccurrenceMapResponse | null>(null);
  const [selected, setSelected] = useState<OccurrenceMapPoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [basemap, setBasemap] = useBasemap();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const pointsSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonSourceRef = useRef<VectorSource>(new VectorSource());
  const radiusSourceRef = useRef<VectorSource>(new VectorSource());
  const selectedGeomSourceRef = useRef<VectorSource>(new VectorSource());
  const polygonLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const radiusLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const drawingRef = useRef(false);
  const vertexCountRef = useRef<() => number>(() => 0);
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
    const selectedGeomSource = selectedGeomSourceRef.current;

    const polygonLayer = new VectorLayer({ source: polygonSource, style: areaStyle });
    const radiusLayer = new VectorLayer({ source: radiusSource, style: areaStyle });
    const selectedGeomLayer = new VectorLayer({ source: selectedGeomSource });
    const pointsLayer = new VectorLayer({ source: pointsSource });
    polygonLayerRef.current = polygonLayer;
    radiusLayerRef.current = radiusLayer;

    const baseLayer = new TileLayer({ source: createBasemapSource(basemap) });
    baseLayer.set("basemapId", basemap);
    baseLayerRef.current = baseLayer;

    const map = new Map({
      target: host,
      layers: [baseLayer, polygonLayer, radiusLayer, selectedGeomLayer, pointsLayer],
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
      if (hit) {
        // Con un trazo en curso (más de un vértice) el clic sigue siendo un vértice.
        if (!drawingRef.current || vertexCountRef.current() <= 1) {
          drawRef.current?.abortDrawing();
          drawingRef.current = false;
          setSelected(hit.get("point") as OccurrenceMapPoint);
          return;
        }
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
      const { draw, vertexCount } = createSimplePolygonDraw(polygonSourceRef.current, (message) =>
        toast.error(message, { id: "polygon-self-intersection" }),
      );
      vertexCountRef.current = vertexCount;
      draw.on("drawstart", () => {
        drawingRef.current = true;
      });
      const stopDrawing = () => {
        drawingRef.current = false;
      };
      draw.on("drawend", stopDrawing);
      draw.on("drawabort", stopDrawing);
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

    const meters = parseFloat(radiusM);
    if (meters > 0) {
      const circle = circular(center, meters, 64).transform("EPSG:4326", "EPSG:3857");
      source.addFeature(new Feature(circle));
    }
  }, [center, radiusM]);

  // Geometría propia de la ocurrencia seleccionada: su polígono, su círculo de incertidumbre
  // o nada si es un punto exacto. El /map no trae footprintWKT (pesaría con miles de puntos),
  // así que se pide la ocurrencia completa recién al seleccionarla.
  useEffect(() => {
    const source = selectedGeomSourceRef.current;
    source.clear();
    if (!selected) return;

    let cancelled = false;
    occurrencesService
      .getById(apiFetch, selected.occurrenceId)
      .then((occ) => {
        if (cancelled) return;
        const polygon = wktToPolygon(occ.footprintWKT);
        if (polygon) {
          const feature = new Feature(polygon.clone());
          feature.setStyle(selectedPolygonStyle);
          source.addFeature(feature);
        } else if (
          occ.decimalLatitude != null &&
          occ.decimalLongitude != null &&
          occ.coordinateUncertaintyInMeters != null &&
          occ.coordinateUncertaintyInMeters > 0
        ) {
          const circle = circular(
            [occ.decimalLongitude, occ.decimalLatitude],
            occ.coordinateUncertaintyInMeters,
            64,
          ).transform("EPSG:4326", "EPSG:3857");
          const feature = new Feature(circle);
          feature.setStyle(selectedCircleStyle);
          source.addFeature(feature);
        }
      })
      .catch(() => {
        // silencioso: si falla la consulta, simplemente no se resalta la geometría
      });

    return () => {
      cancelled = true;
    };
  }, [selected, apiFetch]);

  const drawnPolygon = () => polygonSourceRef.current.getFeatures().at(-1)?.getGeometry() as Polygon | undefined;

  const fitToContent = (searchedArea: AreaMode) => {
    const map = mapRef.current;
    if (!map) return;
    const extent = createEmpty();
    extend(extent, pointsSourceRef.current.getExtent());
    if (searchedArea === "radius") extend(extent, radiusSourceRef.current.getExtent());
    if (searchedArea === "polygon") extend(extent, polygonSourceRef.current.getExtent());
    if (!isEmpty(extent)) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 14, duration: 300 });
    }
  };

  const runSearch = async (query: OccurrenceMapFilters, searchedArea: AreaMode, selectId: string | null) => {
    setLoading(true);
    try {
      const data = await occurrencesService.mapPoints(apiFetch, query);
      const pointsSource = pointsSourceRef.current;
      pointsSource.clear();
      pointsSource.addFeatures(
        data.items.map((p) => {
          const feature = new Feature(new Point(fromLonLat([p.lon, p.lat])));
          feature.set("point", p);
          feature.setStyle(pointStyles[certaintyOf(p)]);
          return feature;
        }),
      );
      setResult(data);
      setSelected(data.items.find((p) => p.occurrenceId === selectId) ?? null);
      if (data.items.length === 0) toast.info("No se encontraron ocurrencias con esos criterios");
      fitToContent(searchedArea);
      return true;
    } catch (err: any) {
      toast.error("No se pudo realizar la búsqueda", { description: errorMessage(err) });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const input: SearchInput = {
      filters,
      areaMode,
      radiusM,
      center,
      polygonWkt: areaMode === "polygon" ? polygonToWkt(drawnPolygon() ?? null) : null,
    };
    const query = buildQuery(input);
    if (query && (await runSearch(query, areaMode, null))) storeSearch({ ...input, selectedId: null });
  };

  // Al volver desde el detalle de una ocurrencia se recupera la última búsqueda con su selección.
  useEffect(() => {
    if (!(location.state as { restoreSearch?: boolean } | null)?.restoreSearch) return;
    const saved = loadSavedSearch();
    if (!saved) return;
    setFilters(saved.filters);
    setAreaMode(saved.areaMode);
    setRadiusM(saved.radiusM);
    setCenter(saved.center);
    const polygon = wktToPolygon(saved.polygonWkt);
    if (polygon) polygonSourceRef.current.addFeature(new Feature(polygon));
    const query = buildQuery(saved);
    if (query) runSearch(query, saved.areaMode, saved.selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const saved = loadSavedSearch();
    if (saved) storeSearch({ ...saved, selectedId: selected?.occurrenceId ?? null });
  }, [selected]);

  const handleClear = () => {
    storeSearch(null);
    setFilters(EMPTY_OCCURRENCE_FILTERS);
    setAreaMode("none");
    setCenter(null);
    polygonSourceRef.current.clear();
    pointsSourceRef.current.clear();
    setResult(null);
    setSelected(null);
  };

  const countByCertainty = (certainty: Certainty) =>
    result?.items.filter((p) => certaintyOf(p) === certainty).length ?? 0;
  // Sin área de búsqueda, fullyContained viene null en todos los puntos: no hay nada que distinguir.
  const hasAreaSearch = result?.items.some((p) => p.fullyContained != null) ?? false;

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
        description="Los filtros por atributos y el área geográfica se aplican todos a la vez: deja vacío lo que no necesites. Con un área, trae toda muestra cuya ubicación la toque."
        filtersActive={filtersActive}
        onClear={handleClear}
        onApply={handleSearch}
        loading={loading}
      >
        <OccurrenceFilterFields values={filters} onChange={setFilters} />

        <div className="space-y-3" style={{ borderTop: "1px dashed var(--border)", paddingTop: "1rem" }}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={filterLabelClass}>Área geográfica (opcional)</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={areaMode === "radius" ? "default" : "outline"}
                onClick={() => setAreaMode(areaMode === "radius" ? "none" : "radius")}
                className="h-8 gap-1 text-xs"
              >
                <CircleIcon className="h-3.5 w-3.5" />
                Radio
              </Button>
              <Button
                type="button"
                size="sm"
                variant={areaMode === "polygon" ? "default" : "outline"}
                onClick={() => setAreaMode(areaMode === "polygon" ? "none" : "polygon")}
                className="h-8 gap-1 text-xs"
              >
                <Hexagon className="h-3.5 w-3.5" />
                Polígono
              </Button>
            </div>
          </div>

          {areaMode === "radius" && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="radiusM" className={filterLabelClass}>
                  Radio (m)
                </label>
                <input
                  id="radiusM"
                  type="number"
                  min={0}
                  step="any"
                  className={filterInputClass}
                  value={radiusM}
                  onChange={(e) => setRadiusM(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-3 flex flex-col gap-1 justify-end">
                <p className="text-xs text-muted-foreground">
                  {center
                    ? `Centro: ${center[1].toFixed(5)}, ${center[0].toFixed(5)} (haz clic en el mapa para moverlo)`
                    : "Haz clic en el mapa para fijar el centro."}
                </p>
              </div>
            </div>
          )}

          {areaMode === "polygon" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Dibuja un polígono en el mapa: clic para agregar vértices, doble clic para cerrar. Puede ser cóncavo,
                pero no debe cruzarse consigo mismo{polygonCount > 0 ? " (dibujar otro reemplaza al actual)" : ""}.
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={polygonCount === 0}
                onClick={() => polygonSourceRef.current.clear()}
                className="h-8 gap-1 text-xs"
              >
                <Eraser className="h-3.5 w-3.5" />
                Borrar polígono
              </Button>
            </div>
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
            <div ref={hostRef} style={{ height: "600px", width: "100%", borderRadius: "0.5rem" }} className="border" />
            <BasemapSwitcher value={basemap} onChange={setBasemap} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {result ? (
                <>
                  <strong className="text-foreground">{result.total}</strong>{" "}
                  {result.total === 1 ? "ocurrencia" : "ocurrencias"}
                </>
              ) : (
                "Sin búsqueda realizada"
              )}
            </span>
            {(hasAreaSearch ? (Object.keys(CERTAINTY_STYLE) as Certainty[]) : (["confirmed"] as Certainty[])).map(
              (certainty) => (
                <Badge
                  key={certainty}
                  variant="outline"
                  className="gap-1.5 py-1 font-normal text-foreground"
                  style={{
                    backgroundColor: `${CERTAINTY_STYLE[certainty].color}1a`,
                    borderColor: `${CERTAINTY_STYLE[certainty].color}4d`,
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: CERTAINTY_STYLE[certainty].color }}
                  />
                  {hasAreaSearch ? CERTAINTY_STYLE[certainty].label : "Ocurrencias"}
                  {hasAreaSearch && result && <strong>{countByCertainty(certainty)}</strong>}
                </Badge>
              ),
            )}
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
                    style={{ backgroundColor: CERTAINTY_STYLE[certaintyOf(selected)].color }}
                  />
                  <span className="font-medium">{selected.code ?? "Sin código"}</span>
                  {selected.scientificName && (
                    <span className="italic text-muted-foreground">{selected.scientificName}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {locationText(selected)} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}
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
                  onClick={() =>
                    onNavigate("occurrence-detail", { occurrenceId: selected.occurrenceId, returnTo: "map" })
                  }
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
