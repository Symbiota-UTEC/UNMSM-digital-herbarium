import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { MapPin, Calendar, Leaf, Eye, Users, University } from "lucide-react";
import { API } from "@constants/api";
import { useAuth } from "@contexts/AuthContext";

export interface OccurrenceListItem {
  id: number;
  code?: string | null;
  scientificName?: string | null;
  family?: string | null;
  institutionName?: string | null;
  location?: string | null;
  collector?: string | null;
  date?: string | null; // ISO string
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  currentPage: number;
  totalPages: number;
  remainingPages: number;
}

interface OccurrencesPageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

const PAGE_SIZE_DEFAULT = 20;

export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
  const { token } = useAuth();

  const [items, setItems] = useState<OccurrenceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(PAGE_SIZE_DEFAULT);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const totalPages = useMemo(
    () => Math.max(Math.ceil(total / pageSize), 1),
    [total, pageSize],
  );

  const fetchOccurrences = async () => {
    if (!token) return; // aún no hay sesión

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());

      const res = await fetch(
        `${API.BASE_URL}/occurrences?${params.toString()}`,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }

      const data: PaginatedResponse<OccurrenceListItem> = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchOccurrences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, token]);

  const handleViewClick = (occurrenceId: number) => {
    onNavigate("occurrence-detail", { occurrenceId });
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-PE", { dateStyle: "medium" });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Encabezado */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">
            Ocurrencias
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro de ocurrencias a las que tienes acceso.
          </p>
        </div>

        <div className="flex w-full md:w-auto items-center gap-2">
          <input
            className="flex-1 md:w-80 border border-input bg-background rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            placeholder="Buscar por código, nombre científico, familia, institución, localidad, colector…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            onClick={() => {
              setPage(1);
              fetchOccurrences();
            }}
            disabled={loading}
          >
            Buscar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base md:text-lg font-semibold">
                Ocurrencias compartidas
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {loading
                  ? "Cargando ocurrencias…"
                  : `${total} ocurrencias encontradas`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Código
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Nombre científico
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Familia
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Institución
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Localidad
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Colector
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Fecha
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-xs md:text-sm">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No se encontraron ocurrencias.
                    </TableCell>
                  </TableRow>
                )}

                {items.map((occ) => (
                  <TableRow key={occ.id}>
                    {/* Código */}
                    <TableCell className="align-middle">
                      <Badge
                        variant="outline"
                        className="text-xs font-mono px-2 py-0.5 rounded-full"
                      >
                        {occ.code ?? "—"}
                      </Badge>
                    </TableCell>

                    {/* Nombre científico */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <Leaf className="h-4 w-4 text-primary" />
                        <span className="italic text-sm">
                          {occ.scientificName ?? "—"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Familia */}
                    <TableCell className="align-middle text-sm">
                      {occ.family ?? "—"}
                    </TableCell>

                    {/* Institución */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <University className="h-3 w-3 text-muted-foreground" />
                        <span>{occ.institutionName ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Localidad */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span>{occ.location ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Colector */}
                    <TableCell className="align-middle text-sm">
                      {occ.collector ?? "—"}
                    </TableCell>

                    {/* Fecha */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{formatDate(occ.date)}</span>
                      </div>
                    </TableCell>

                    {/* Acciones */}
                    <TableCell className="align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClick(occ.id)}
                        title="Ver detalles de la ocurrencia"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {loading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      Cargando…
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mt-4">
            <span className="text-xs md:text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
