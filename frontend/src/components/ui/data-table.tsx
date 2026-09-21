import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Button } from "./button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingOverlay, SkeletonBar, useSettled } from "./loading-overlay";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------
export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  cell: (row: T) => ReactNode;
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
}: DataTableProps<T>) {
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
                      {col.header}
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
