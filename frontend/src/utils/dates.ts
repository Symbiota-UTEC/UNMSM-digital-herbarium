const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2003-04-30" -> "30 de abril del 2003"; devuelve "" si no es una fecha ISO válida. */
export function formatVerbatimDate(iso: string): string {
    const match = /^(\d{1,6})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return "";
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    return `${day} de ${MONTHS[month - 1]} del ${year}`;
}
