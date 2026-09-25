import Draw from "ol/interaction/Draw";
import { noModifierKeys } from "ol/events/condition";
import type Feature from "ol/Feature";
import type Polygon from "ol/geom/Polygon";
import type VectorSource from "ol/source/Vector";

type XY = number[];

const SNAP_PIXELS = 12; // igual que el snapTolerance por defecto de Draw

const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

const inBox = (a: XY, b: XY, p: XY) =>
  Math.min(a[0], b[0]) <= p[0] &&
  p[0] <= Math.max(a[0], b[0]) &&
  Math.min(a[1], b[1]) <= p[1] &&
  p[1] <= Math.max(a[1], b[1]);

/** Los segmentos ab y cd se cruzan o se tocan (incluye colineales que se solapan). */
export function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && inBox(c, d, a)) ||
    (d2 === 0 && inBox(c, d, b)) ||
    (d3 === 0 && inBox(a, b, c)) ||
    (d4 === 0 && inBox(a, b, d))
  );
}

// Dos tramos consecutivos p-q, q-r que vuelven sobre sí mismos (una "púa").
const isSpike = (p: XY, q: XY, r: XY) =>
  cross(p, q, r) === 0 && (p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1]) > 0;

/** El anillo cerrado por `vertices` (sin repetir el primero) no se cruza ni se toca a sí mismo. */
export function isSimpleRing(vertices: XY[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (isSpike(vertices[i], vertices[(i + 1) % n], vertices[(i + 2) % n])) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // tramos contiguos por el cierre
      if (segmentsIntersect(vertices[i], vertices[i + 1], vertices[j], vertices[(j + 1) % n])) return false;
    }
  }
  return true;
}

// ¿El tramo nuevo vertices.at(-1) -> next cruza o toca alguno de los anteriores?
function newEdgeCrosses(vertices: XY[], next: XY): boolean {
  const k = vertices.length - 1;
  if (k >= 1 && isSpike(vertices[k - 1], vertices[k], next)) return true;
  for (let i = 0; i < k - 1; i++) {
    if (segmentsIntersect(vertices[k], next, vertices[i], vertices[i + 1])) return true;
  }
  return false;
}

const INVALID_MESSAGE = "El polígono no puede cruzarse consigo mismo";
const NOT_ENOUGH_POINTS_MESSAGE = "El polígono necesita al menos 3 puntos distintos";
const DOUBLE_CLICK_MS = 400;

/**
 * Herramienta para dibujar UN polígono simple (puede ser cóncavo, pero no se cruza a
 * sí mismo): el vértice o el cierre que lo cruzaría se ignora y se avisa con `onInvalid`.
 * Al terminar, el polígono nuevo reemplaza al anterior en `source`. `vertexCount`
 * indica cuántos vértices lleva el trazo en curso (0 si no hay ninguno).
 */
export function createSimplePolygonDraw(
  source: VectorSource,
  onInvalid: (message: string) => void,
): { draw: Draw; vertexCount: () => number } {
  let sketch: Feature | null = null;

  // El borrador es [v0..vk, cursor, v0] (con un solo vértice, [v0, cursor]): se descartan el cursor y el cierre.
  const vertices = (): XY[] => {
    const ring = (sketch?.getGeometry() as Polygon | undefined)?.getCoordinates()[0] ?? [];
    return ring.length <= 2 ? ring.slice(0, 1) : ring.slice(0, -2);
  };

  const draw = new Draw({
    source,
    type: "Polygon",
    condition: (event) => {
      if (!noModifierKeys(event)) return false;
      const v = vertices();
      if (v.length < 2) return true;
      const near = (c: XY) => {
        const p = event.map.getPixelFromCoordinate(c);
        return Math.hypot(p[0] - event.pixel[0], p[1] - event.pixel[1]) <= SNAP_PIXELS;
      };
      // Un clic sobre el primer o el último vértice cierra el polígono: lo decide finishCondition.
      if (v.length >= 3 && (near(v[0]) || near(v[v.length - 1]))) return true;
      // Con menos de 3 vértices, un clic sobre el último (p.ej. el doble clic con el que se
      // intenta cerrar) no debe colarse como un vértice duplicado: eso deja un punto repetido
      // que arruina toda validación posterior. Se rechaza con un mensaje claro en su lugar.
      if (v.length < 3 && near(v[v.length - 1])) {
        onInvalid(NOT_ENOUGH_POINTS_MESSAGE);
        return false;
      }
      if (newEdgeCrosses(v, event.coordinate)) {
        onInvalid(INVALID_MESSAGE);
        return false;
      }
      return true;
    },
    finishCondition: () => {
      const v = vertices();
      if (v.length < 3) {
        onInvalid(NOT_ENOUGH_POINTS_MESSAGE);
        return false;
      }
      if (isSimpleRing(v)) return true;
      onInvalid(INVALID_MESSAGE);
      return false;
    },
  });

  let lastEnd = 0;
  draw.on("drawstart", (event) => {
    sketch = event.feature;
    // El segundo clic de un doble clic que ya cerró el polígono inicia un borrador de un vértice: se descarta.
    if (Date.now() - lastEnd < DOUBLE_CLICK_MS) setTimeout(() => draw.abortDrawing(), 0);
  });
  draw.on("drawabort", () => {
    sketch = null;
  });
  draw.on("drawend", () => {
    sketch = null;
    lastEnd = Date.now();
    source.clear(); // el polígono nuevo reemplaza al anterior
  });
  return { draw, vertexCount: () => vertices().length };
}
