import { useEffect, useMemo, useRef } from "react";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { circular } from "ol/geom/Polygon";
import { createEmpty, extend } from "ol/extent";
import { fromLonLat } from "ol/proj";

import { formatMeters, representativePoint, wktToPolygon } from "@utils/geo";
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

type Props = {
    lat: number | null;
    lon: number | null;
    footprintWKT: string | null;
    uncertaintyMeters: number | null;
};

/**
 * Ubicación de una ocurrencia en un mapa de solo lectura: su polígono si lo tiene;
 * si no, el círculo de incertidumbre alrededor del punto; si no, solo el punto.
 */
export function OccurrenceLocationMap({ lat, lon, footprintWKT, uncertaintyMeters }: Props) {
    const polygon = useMemo(() => wktToPolygon(footprintWKT), [footprintWKT]);
    const point: [number, number] | null =
        lat != null && lon != null ? [lon, lat] : representativePoint(polygon);
    const circleMeters = !polygon && uncertaintyMeters != null && uncertaintyMeters > 0 ? uncertaintyMeters : null;

    if (!point) {
        return <p className="text-sm text-muted-foreground">Esta ocurrencia no tiene coordenadas ni polígono registrados.</p>;
    }

    const caption =
        polygon
            ? "Polígono de colecta; el marcador es su punto representativo"
            : circleMeters
              ? `Ubicación aproximada: radio de ± ${formatMeters(circleMeters)} alrededor del punto`
              : "Punto exacto";

    return (
        <div className="space-y-2">
            <LocationCanvas point={point} polygon={polygon} circleMeters={circleMeters} />
            <p className="text-xs text-muted-foreground">{caption}</p>
        </div>
    );
}

function LocationCanvas({
    point,
    polygon,
    circleMeters,
}: {
    point: [number, number];
    polygon: ReturnType<typeof wktToPolygon>;
    circleMeters: number | null;
}) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const baseLayerRef = useRef<TileLayer<ReturnType<typeof createBasemapSource>> | null>(null);
    const [basemap, setBasemap] = useBasemap();

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const marker = new Feature(new Point(fromLonLat(point)));
        marker.setStyle(markerStyle);

        const shapeSource = new VectorSource();
        const shapeStyle = polygon ? polygonStyle : uncertaintyStyle;
        if (polygon) {
            shapeSource.addFeature(new Feature(polygon.clone()));
        } else if (circleMeters) {
            shapeSource.addFeature(new Feature(circular(point, circleMeters, 64).transform("EPSG:4326", "EPSG:3857")));
        }

        const baseLayer = new TileLayer({ source: createBasemapSource(basemap) });
        baseLayer.set("basemapId", basemap);
        baseLayerRef.current = baseLayer;

        const map = new Map({
            target: host,
            layers: [
                baseLayer,
                new VectorLayer({ source: shapeSource, style: shapeStyle }),
                new VectorLayer({ source: new VectorSource({ features: [marker] }) }),
            ],
            view: new View({ center: fromLonLat(point), zoom: 15, minZoom: MAP_MIN_ZOOM, maxZoom: MAP_MAX_ZOOM }),
            controls: createMapControls(),
            interactions: createMapInteractions(),
        });
        mapRef.current = map;

        const extent = createEmpty();
        extend(extent, shapeSource.getExtent());
        extend(extent, marker.getGeometry()!.getExtent());
        map.updateSize();
        map.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 16 });

        const resizeObserver = new ResizeObserver(() => map.updateSize());
        resizeObserver.observe(host);

        return () => {
            resizeObserver.disconnect();
            map.setTarget(undefined);
            mapRef.current = null;
            baseLayerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [point[0], point[1], polygon, circleMeters]);

    // Cambio de mapa base.
    useEffect(() => {
        const layer = baseLayerRef.current;
        if (!layer || layer.get("basemapId") === basemap) return;
        layer.setSource(createBasemapSource(basemap));
        layer.set("basemapId", basemap);
    }, [basemap]);

    return (
        <div className="relative">
            <div ref={hostRef} className="w-full overflow-hidden rounded-lg border bg-muted/20" style={{ height: "360px" }} />
            <BasemapSwitcher value={basemap} onChange={setBasemap} />
        </div>
    );
}
