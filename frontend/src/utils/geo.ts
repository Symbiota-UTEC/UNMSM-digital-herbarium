import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import WKT from "ol/format/WKT";

const wktFormat = new WKT();

/** Polígonos (EPSG:3857) -> WKT WGS84: 0 -> null, 1 -> POLYGON, 2+ -> MULTIPOLYGON. */
export function polygonsToWkt(polygons: Polygon[]): string | null {
    if (polygons.length === 0) return null;
    const wgs84 = polygons.map((p) => p.clone().transform("EPSG:3857", "EPSG:4326") as Polygon);
    const geometry =
        wgs84.length === 1 ? wgs84[0] : new MultiPolygon(wgs84.map((p) => p.getCoordinates()));
    return wktFormat.writeGeometry(geometry, { decimals: 6 });
}

/** WKT WGS84 -> polígonos (EPSG:3857). Solo POLYGON/MULTIPOLYGON; si no, []. */
export function wktToPolygons(wkt: string | null | undefined): Polygon[] {
    if (!wkt) return [];
    try {
        const geometry = wktFormat.readGeometry(wkt, {
            dataProjection: "EPSG:4326",
            featureProjection: "EPSG:3857",
        });
        if (geometry instanceof MultiPolygon) return geometry.getPolygons();
        if (geometry instanceof Polygon) return [geometry];
    } catch {
        // WKT inválido: sin geometría
    }
    return [];
}

/** Punto interior [lon, lat] del polígono más grande (a diferencia del centroide, siempre cae dentro). */
export function representativePoint(polygons: Polygon[]): [number, number] | null {
    if (polygons.length === 0) return null;
    const largest = polygons.reduce((a, b) => (b.getArea() > a.getArea() ? b : a));
    const inner = (largest.clone().transform("EPSG:3857", "EPSG:4326") as Polygon).getInteriorPoint();
    const [lon, lat] = inner.getCoordinates();
    return [lon, lat];
}
