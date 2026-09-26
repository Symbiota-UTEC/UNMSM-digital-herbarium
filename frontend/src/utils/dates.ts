const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2003-04-30" -> "30 de abril del 2003"; devuelve "" si no es una fecha ISO válida. */
export function formatVerbatimDate(iso: string): string {
  const match = /^(\d{1,6})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${day} de ${MONTHS[month - 1]} del ${year}`;
}

// Vacío/null siempre da "—"; una fecha que no parsea por defecto devuelve el valor tal cual en
// vez de ocultarlo — pasa `invalidFallback` para forzar un placeholder en su lugar. Solo para
// timestamps reales del backend (createdAt/updatedAt/startedAt/finishedAt): las fechas de
// evento/identificación Darwin Core (eventDate, verbatimEventDate, dateIdentified) son texto
// libre que puede ser parcial o un rango, y deben mostrarse tal cual, nunca pasar por esto —
// new Date("1998") sí "parsea" y fabricaría un 1 de enero que el dato original nunca tuvo.
function safeFormatDate(raw: string | null | undefined, format: (d: Date) => string, invalidFallback?: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return invalidFallback ?? raw;
  return format(d);
}

/** Fecha y hora corta local (p.ej. "18/9/26, 3:45 p.m."). */
export function formatDateTime(raw: string | null | undefined, invalidFallback?: string): string {
  return safeFormatDate(
    raw,
    (d) => d.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }),
    invalidFallback,
  );
}

/** Fecha larga (p.ej. "18 de septiembre de 2026"); a diferencia de las otras dos, una fecha
 * inválida cae a "—" por defecto (no tiene sentido mostrar un valor verbatim aquí). */
export function formatDateLong(raw: string | null | undefined, invalidFallback = "—"): string {
  return safeFormatDate(
    raw,
    (d) => d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }),
    invalidFallback,
  );
}
