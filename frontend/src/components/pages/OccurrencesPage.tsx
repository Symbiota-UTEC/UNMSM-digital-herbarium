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

export interface InstitutionOut {
  id: number;
  institutionCode?: string | null;
  institutionName?: string | null;
}

export interface OccurrenceListItem {
  id: number;
  catalogNumber?: string | null;
  scientificName?: string | null;
  collectionName?: string | null;
  institution?: InstitutionOut | null;
  locality?: string | null;
  modified?: string | null; // ISO string
  recordedBy?: string | null;
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
    // Si aún no hay token, no dispares la llamada
    if (!token) return;

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
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    // Espera a que el token exista antes de hacer la primera llamada
    if (!token) return;
    fetchOccurrences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, token]);

  const handleViewClick = (occurrenceId: number) => {
    onNavigate("occurrence-detail", { occurrenceId });
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("es-ES");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl mb-2">Ocurrencias</h1>
          <p className="text-muted-foreground">
            Registro de ocurrencias a las que tienes acceso
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="border rounded-md px-3 py-2 text-sm"
            placeholder="Buscar por catálogo, científico, colección, universidad, localidad…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            onClick={() => {
              setPage(1);
              fetchOccurrences();
            }}
          >
            Buscar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Ocurrencias Compartidas</CardTitle>
              <CardDescription>
                {loading ? "Cargando…" : `${total} ocurrencias disponibles`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre Científico</TableHead>
                  <TableHead>Universidad</TableHead>
                  <TableHead>Colección</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Recolector</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      Sin resultados
                    </TableCell>
                  </TableRow>
                )}

                {items.map((occ) => (
                  <TableRow key={occ.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {occ.catalogNumber ?? "-"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Leaf className="h-4 w-4 text-primary" />
                        <span className="italic">
                          {occ.scientificName ?? "-"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <University className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {occ.institution?.institutionName ?? "-"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>{occ.collectionName ?? "-"}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{occ.locality ?? "-"}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">
                          {formatDate(occ.modified)}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-sm">
                      {occ.recordedBy ?? "-"}
                    </TableCell>

                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClick(occ.id)}
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Paginación simple */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="default"
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
