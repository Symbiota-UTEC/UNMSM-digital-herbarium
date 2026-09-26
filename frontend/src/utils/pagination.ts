/** Total de páginas para `total` registros de a `pageSize`; nunca menos de 1 (una página vacía
 * sigue siendo "página 1 de 1"), y nunca divide por 0/negativo. */
export function totalPagesFor(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Ajusta `page` al rango [1, totalPages] — útil cuando totalPages puede reducirse (menos
 * resultados tras un filtro) y la página actual quedó fuera de rango. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), totalPages);
}
