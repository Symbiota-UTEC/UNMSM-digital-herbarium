import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Button } from "./button";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from "lucide-react";
import { LoadingOverlay, SkeletonBar, useSettled } from "./loading-overlay";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------
export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
  // Clave que se envía al ordenar por esta columna (p.ej. al backend); sin ella, no es
  // clicable. sortDir es la dirección del primer clic; un segundo clic en la misma
  // columna invierte la dirección, y un tercero la desactiva (ver DataTable).
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// TablePagination — reusable prev/next strip
// ---------------------------------------------------------------------------
export interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  loading?: boolean;
}

export function TablePagination({ page, totalPages, onPrevPage, onNextPage, loading = false }: TablePaginationProps) {
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t">
      <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={onPrevPage}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Anterior
      </Button>
      <span className="text-xs md:text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={onNextPage}>
        Siguiente
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable — card + table + pagination, last column auto-right-aligned
// ---------------------------------------------------------------------------
export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  title?: string;
  description?: string;
  loading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  // Orden por columnas (ColumnDef.sortKey/sortDir): sortBy/sortDir son la clave y dirección
  // activas (o null si ninguna). DataTable decide el ciclo de 3 clics (activar en su
  // dirección por defecto -> invertirla -> desactivar) y llama a onSortChange ya resuelto.
  sortBy?: string | null;
  sortDir?: "asc" | "desc" | null;
  onSortChange?: (key: string | null, dir: "asc" | "desc" | null) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  title,
  description,
  loading = false,
  skeletonRows = 5,
  emptyMessage = "No hay datos disponibles.",
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  toolbar,
  onRowClick,
  sortBy,
  sortDir,
  onSortChange,
}: DataTableProps<T>) {
  const handleHeaderClick = (col: ColumnDef<T>) => {
    if (!col.sortKey || !onSortChange) return;
    const defaultDir = col.sortDir ?? "asc";
    if (sortBy !== col.sortKey) {
      onSortChange(col.sortKey, defaultDir);
    } else if (sortDir === defaultDir) {
      onSortChange(col.sortKey, defaultDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(null, null);
    }
  };
  const lastColIdx = columns.length - 1;
  const hasHeader = !!(title || description);
  // Primera carga: skeleton. Refresco: se conservan las filas y solo se atenúan (sin saltos de altura).
  const settled = useSettled(loading);
  const showSkeleton = loading && data.length === 0 && !settled;

  return (
    <div className="space-y-3">
      {toolbar && <div className="flex justify-end gap-2">{toolbar}</div>}
      <Card>
        {hasHeader && (
          <CardHeader>
            {title && <CardTitle className="text-base md:text-lg font-semibold">{title}</CardTitle>}
            {description && <CardDescription className="text-xs md:text-sm">{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className={hasHeader ? "" : "pt-6"}>
          <LoadingOverlay active={loading && !showSkeleton} className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col, i) => (
                    <TableHead
                      key={col.key}
                      className={["whitespace-nowrap text-xs md:text-sm", col.className ?? ""]
                        .filter(Boolean)
                        .join(" ")}
                      style={i === lastColIdx ? { width: "1px", textAlign: "right" } : undefined}
                    >
                      {col.sortKey ? (
                        <button
                          type="button"
                          onClick={() => handleHeaderClick(col)}
                          className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <span className={sortBy === col.sortKey ? "text-foreground" : ""}>{col.header}</span>
                          {sortBy === col.sortKey ? (
                            sortDir === "desc" ? (
                              <ChevronDown className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ChevronUp className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSkeleton ? (
                  Array.from({ length: skeletonRows }, (_, r) => (
                    <TableRow key={`skeleton-${r}`} aria-hidden>
                      {columns.map((col, i) => (
                        <TableCell key={col.key} className="align-middle">
                          <SkeletonBar
                            width={i === lastColIdx ? "4.5rem" : `${55 + ((r * 7 + i * 13) % 35)}%`}
                            style={i === lastColIdx ? { marginLeft: "auto" } : undefined}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, idx) => (
                    <TableRow
                      key={keyExtractor(row, idx)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={onRowClick ? "cursor-pointer hover:bg-muted/60" : ""}
                    >
                      {columns.map((col, i) => (
                        <TableCell
                          key={col.key}
                          className={["align-middle", i === lastColIdx ? "whitespace-nowrap" : "", col.className ?? ""]
                            .filter(Boolean)
                            .join(" ")}
                          style={i === lastColIdx ? { width: "1px" } : undefined}
                        >
                          {i === lastColIdx ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                              {col.cell(row)}
                            </div>
                          ) : (
                            col.cell(row)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </LoadingOverlay>
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            loading={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
