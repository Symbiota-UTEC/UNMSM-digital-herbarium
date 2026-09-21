import Polygon from "ol/geom/Polygon";
import WKT from "ol/format/WKT";
import { getDistance } from "ol/sphere";

const wktFormat = new WKT();

/** Polígono (EPSG:3857) -> WKT WGS84 (un solo POLYGON); null si no hay polígono. */
export function polygonToWkt(polygon: Polygon | null): string | null {
  if (!polygon) return null;
  const wgs84 = polygon.clone().transform("EPSG:3857", "EPSG:4326");
  return wktFormat.writeGeometry(wgs84, { decimals: 6 });
}

/** WKT WGS84 -> polígono (EPSG:3857). Solo POLYGON; si no, null. */
export function wktToPolygon(wkt: string | null | undefined): Polygon | null {
  if (!wkt) return null;
  try {
    const geometry = wktFormat.readGeometry(wkt, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    return geometry instanceof Polygon ? geometry : null;
  } catch {
    return null; // WKT inválido: sin geometría
  }
}

/** Punto interior [lon, lat] del polígono (a diferencia del centroide, siempre cae dentro, aunque sea cóncavo). */
export function representativePoint(polygon: Polygon | null): [number, number] | null {
  if (!polygon) return null;
  const inner = (polygon.clone().transform("EPSG:3857", "EPSG:4326") as Polygon).getInteriorPoint();
  const [lon, lat] = inner.getCoordinates();
  return [lon, lat];
}

/** Radio (m) del círculo centrado en `center` [lon, lat] que contiene al polígono (EPSG:3857). */
export function enclosingRadiusMeters(polygon: Polygon, center: [number, number]): number {
  let max = 0;
  const wgs84 = polygon.clone().transform("EPSG:3857", "EPSG:4326") as Polygon;
  for (const ring of wgs84.getCoordinates()) {
    for (const [lon, lat] of ring) max = Math.max(max, getDistance(center, [lon, lat]));
  }
  return Math.max(1, Math.ceil(max));
}

/** 500 -> "500 m", 5000 -> "5 km", 1500 -> "1.5 km". */
export function formatMeters(m: number): string {
  return m >= 1000 ? `${Number((m / 1000).toFixed(1))} km` : `${Math.round(m)} m`;
}
