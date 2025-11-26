import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  ArrowLeft,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Upload,
  Info,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { Role } from "@constants/roles";
import { OccurrenceBriefItem } from "@interfaces/occurrence";
import { PaginatedResponse } from "@interfaces/utils/pagination";
import { CollectionUserAccessItem } from "@interfaces/collection";
import {
  ApiUserLookupResponse,
  mapApiLookupToResult,
  VISIBILITY,
} from "@interfaces/auth";

interface CollectionDetailPageProps {
  collectionId: string;
  collectionName: string;
  collectionInstitutionId: number;
  isOwner: boolean;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

// ================== API helper ==================
async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  return res;
}

// Formateo seguro de fecha del brief (puede no ser ISO perfecto)
function formatBriefDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("es-ES");
}

export function CollectionDetailPage({
  collectionId,
  collectionName,
  collectionInstitutionId,
  isOwner,
  onNavigate,
}: CollectionDetailPageProps) {
  const { token } = useAuth();

  // ================== Estado: usuarios ==================
  const [usersResp, setUsersResp] =
    useState<PaginatedResponse<CollectionUserAccessItem> | null>(null);
  const [usersLimit] = useState(3);
  const [usersOffset, setUsersOffset] = useState(0);

  // ================== Estado: ocurrencias ==================
  const [occResp, setOccResp] =
    useState<PaginatedResponse<OccurrenceBriefItem> | null>(null);
  const [occLimit] = useState(5);
  const [occOffset, setOccOffset] = useState(0);

  // ================== Estado: Add user dialog ==================
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "checking" | "ok" | "warn" | "error"
  >("idle");
  const [emailHelp, setEmailHelp] = useState<string>("");

  // ================== Otros estados ==================
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteCollectionDialog, setShowDeleteCollectionDialog] =
    useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isUsersExpanded, setIsUsersExpanded] = useState(true);

  const STATUS_HEX = {
    ok: "#22c55e",
    warn: "#eab308",
    error: "#ef4444",
  } as const;

  const statusColor =
    emailStatus === "ok"
      ? STATUS_HEX.ok
      : emailStatus === "warn"
      ? STATUS_HEX.warn
      : emailStatus === "error"
      ? STATUS_HEX.error
      : null;

  const statusStyle: CSSProperties | undefined = statusColor
    ? {
        borderColor: statusColor,
        boxShadow: `0 0 0 2px ${statusColor}55`,
      }
    : undefined;

  // ================== Cargas ==================
  const fetchUsers = useCallback(
    async (opts?: { limit?: number; offset?: number }) => {
      if (!token) return;

      try {
        const limit = opts?.limit ?? usersLimit;
        const offset = opts?.offset ?? usersOffset;
        const url = `${API.BASE_URL}${API.PATHS.COLLECTIONS_ACCESS_USERS(
          collectionId,
        )}?limit=${limit}&offset=${offset}`;

        const res = await apiFetch(url, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error(await res.text());
        const data: PaginatedResponse<CollectionUserAccessItem> =
          await res.json();
        setUsersResp(data);
      } catch (err) {
        console.error("fetch access-users error:", err);
        toast.error("No se pudieron cargar los usuarios con acceso");
      }
    },
    [collectionId, usersLimit, usersOffset, token],
  );

  const fetchOccurrences = useCallback(async () => {
    if (!token) return;

    try {
      const url = `${API.BASE_URL}${API.PATHS.COLLECTIONS_OCCURRENCES_BRIEF(
        collectionId,
      )}?limit=${occLimit}&offset=${occOffset}`;
      const res = await apiFetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PaginatedResponse<OccurrenceBriefItem> = await res.json();
      setOccResp(data);
    } catch (err) {
      console.error("fetch occurrences error:", err);
      toast.error("No se pudieron cargar las ocurrencias");
    }
  }, [collectionId, occLimit, occOffset, token]);

  useEffect(() => {
    if (!token) return;
    fetchUsers();
  }, [fetchUsers, token]);

  useEffect(() => {
    if (!token) return;
    fetchOccurrences();
  }, [fetchOccurrences, token]);

  // ================== Validación de email ==================
  const validateAddUserEmail = useCallback(
    async (rawEmail: string) => {
      const email = rawEmail.trim();
      if (!email) {
        setEmailStatus("idle");
        setEmailHelp("");
        return null;
      }

      try {
        setEmailStatus("checking");
        setEmailHelp("Verificando usuario...");

        const params = new URLSearchParams({ email });
        const res = await apiFetch(
          `${API.BASE_URL}${API.PATHS.USER_BY_EMAIL}?${params.toString()}`,
          {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );

        if (res.status === 404) {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return null;
        }
        if (!res.ok) {
          setEmailStatus("error");
          setEmailHelp("No se pudo verificar el usuario.");
          return null;
        }

        const payload: ApiUserLookupResponse = await res.json();
        const r = mapApiLookupToResult(payload);

        if (!r.found) {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return null;
        }

        // SUPERADMIN
        if (r.visibility === VISIBILITY.FULL && r.user?.role === Role.Admin) {
          setEmailStatus("warn");
          setEmailHelp(
            "Este usuario es superadministrador: ya tiene acceso a todas las colecciones.",
          );
          return r;
        }
        if (
          r.visibility === VISIBILITY.LIMITED &&
          (r.message?.toLowerCase().includes("superadministrador") ||
            r.message?.toLowerCase().includes("superusuario"))
        ) {
          setEmailStatus("warn");
          setEmailHelp(
            "Este usuario es superadministrador: ya tiene acceso a todas las colecciones.",
          );
          return r;
        }

        const sameInstitution =
          r.user?.institutionId === collectionInstitutionId;
        if (sameInstitution) {
          setEmailStatus("ok");
          setEmailHelp("Usuario encontrado en la misma institución.");
        } else {
          setEmailStatus("warn");
          setEmailHelp(
            "Este usuario pertenece a una institución diferente a la institución de esta colección.",
          );
        }

        return r;
      } catch (e) {
        console.error(e);
        setEmailStatus("error");
        setEmailHelp("No se pudo verificar el usuario.");
        return null;
      }
    },
    [token, collectionInstitutionId],
  );

  // ================== Agregar usuario ==================
  const handleAddUser = useCallback(
    async (e: React.FormEvent) => {
      if (emailStatus === "idle") {
        const r = await validateAddUserEmail(emailInput);
        if (!r) {
          toast.error("El correo no es válido");
          return;
        }
      }

      e.preventDefault();
      if (!emailInput.trim()) {
        toast.error("Ingresa un correo válido");
        return;
      }
      if (emailStatus === "error" || emailStatus === "checking") {
        toast.error("El correo no es válido o aún se está verificando");
        return;
      }
      try {
        const res = await apiFetch(
          `${API.BASE_URL}${API.PATHS.COLLECTIONS_ADD_USER(collectionId)}`,
          {
            method: "POST",
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ email: emailInput.trim() }),
          },
        );

        if (res.status === 201) {
          toast.success("Usuario agregado como visualizador");
          setShowAddUserDialog(false);
          setEmailInput("");
          setEmailStatus("idle");
          setEmailHelp("");
          setUsersOffset(0);
          await fetchUsers({ offset: 0, limit: usersLimit });
        } else if (res.status === 409) {
          const txt = await res.text();
          toast.warning(
            txt || "El usuario ya tiene algún rol en esta colección",
          );
        } else if (res.status === 404) {
          toast.error("Colección o usuario no encontrado");
        } else if (res.status === 403) {
          toast.error(
            "No tienes permisos para agregar usuarios a esta colección",
          );
        } else {
          const txt = await res.text();
          toast.error(txt || "No se pudo agregar el usuario");
        }
      } catch (err) {
        console.error(err);
        toast.error("Error de red al agregar usuario");
      }
    },
    [
      emailInput,
      emailStatus,
      collectionId,
      token,
      fetchUsers,
      usersLimit,
      validateAddUserEmail,
    ],
  );

  // ================== Paginación derivada ==================
  // Usuarios
  const usersTotal = usersResp?.total ?? 0;
  const usersTotalPages =
    usersTotal === 0 ? 1 : Math.ceil(usersTotal / usersLimit);
  const usersCurrentPage = Math.min(
    usersTotalPages,
    Math.floor(usersOffset / usersLimit) + 1,
  );
  const usersHasPrev = usersOffset > 0;
  const usersHasNext = usersOffset + usersLimit < usersTotal;

  const usersRange = {
    start: usersTotal === 0 ? 0 : usersOffset + 1,
    end: Math.min(usersOffset + usersLimit, usersTotal),
    total: usersTotal,
    page: usersCurrentPage,
  };

  const gotoUsersPage = (page: number) => {
    const clamped = Math.max(1, Math.min(usersTotalPages, page));
    setUsersOffset((clamped - 1) * usersLimit);
  };

  // Ocurrencias
  const occTotal = occResp?.total ?? 0;
  const occTotalPages =
    occTotal === 0 ? 1 : Math.ceil(occTotal / occLimit);
  const occCurrentPage = Math.min(
    occTotalPages,
    Math.floor(occOffset / occLimit) + 1,
  );
  const occHasPrev = occOffset > 0;
  const occHasNext = occOffset + occLimit < occTotal;

  const gotoOccPage = (page: number) => {
    const clamped = Math.max(1, Math.min(occTotalPages, page));
    setOccOffset((clamped - 1) * occLimit);
  };

  // ================== Helpers UI ==================
  const usersCount = usersTotal;
  const occCount = occTotal;

  const goToOccurrenceDetail = (occId: number) => {
    onNavigate("occurrence-detail", {
      occurrenceId: String(occId),
      collectionId,
      collectionName,
      isOwner,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => onNavigate("collections")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Colecciones
        </Button>

        <div>
          <h1 className="text-3xl mb-2">{collectionName}</h1>
          <p className="text-muted-foreground">
            {occCount} ocurrencias en esta colección • {usersCount} usuarios
            con acceso a esta colección
          </p>
        </div>
      </div>

      {/* Usuarios con Acceso */}
      {isOwner && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* Zona título + chevron (colapsable) */}
              <button
                type="button"
                onClick={() => setIsUsersExpanded(!isUsersExpanded)}
                className="flex items-center gap-3 flex-1 text-left cursor-pointer hover:bg-muted/50 transition-colors rounded-md -mx-2 px-2 py-1"
              >
                {isUsersExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1">
                  <CardTitle className="mb-1">Usuarios con Acceso</CardTitle>
                  <CardDescription>
                    Usuarios que pueden acceder a esta colección (
                    {usersCount} total)
                  </CardDescription>
                </div>
              </button>

              {/* Controles de paginación + botón */}
              {isUsersExpanded && (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  {/* Prev/Next */}
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => gotoUsersPage(usersCurrentPage - 1)}
                      disabled={!usersHasPrev}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>

                    <span className="text-sm text-muted-foreground min-w-[170px] text-center">
                      Página {usersCurrentPage} de {usersTotalPages}
                      {usersResp && usersTotalPages > 1 && (
                        <>
                          <span className="mx-1">•</span>
                          {usersRange.start}–{usersRange.end}
                        </>
                      )}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => gotoUsersPage(usersCurrentPage + 1)}
                      disabled={!usersHasNext}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>

                  {/* Dialog Agregar Usuario */}
                  <Dialog
                    open={showAddUserDialog}
                    onOpenChange={(open) => {
                      setShowAddUserDialog(open);
                      if (!open) {
                        setEmailInput("");
                        setEmailStatus("idle");
                        setEmailHelp("");
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm" className="flex-shrink-0">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Agregar Usuario
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Agregar Usuario a la Colección</DialogTitle>
                        <DialogDescription>
                          Invita a otros usuarios como visualizadores
                        </DialogDescription>
                      </DialogHeader>

                      <form onSubmit={handleAddUser} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="userEmail">Correo Electrónico</Label>
                          <div className="relative">
                            <Input
                              id="userEmail"
                              type="email"
                              value={emailInput}
                              onChange={(e) => {
                                setEmailInput(e.target.value);
                                setEmailStatus("idle");
                                setEmailHelp("");
                              }}
                              onBlur={(e) => {
                                void validateAddUserEmail(e.target.value);
                              }}
                              placeholder="usuario@ejemplo.com"
                              required
                              aria-invalid={
                                emailStatus === "error" ? true : undefined
                              }
                              style={statusStyle}
                              className="focus-visible:outline-none"
                            />

                            {emailStatus !== "idle" && (
                              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                {emailStatus === "checking" && (
                                  <Info className="h-4 w-4 text-muted-foreground animate-pulse" />
                                )}
                                {emailStatus === "ok" && (
                                  <span
                                    style={{ color: STATUS_HEX.ok }}
                                    className="text-sm font-medium"
                                  >
                                    OK
                                  </span>
                                )}
                                {emailStatus === "warn" && (
                                  <span
                                    style={{ color: STATUS_HEX.warn }}
                                    className="text-sm font-medium"
                                  >
                                    Warn
                                  </span>
                                )}
                                {emailStatus === "error" && (
                                  <span
                                    style={{ color: STATUS_HEX.error }}
                                    className="text-sm font-medium"
                                  >
                                    Error
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {emailHelp && (
                            <p
                              className="text-sm"
                              style={{
                                color:
                                  emailStatus === "error"
                                    ? STATUS_HEX.error
                                    : emailStatus === "warn"
                                    ? STATUS_HEX.warn
                                    : emailStatus === "ok"
                                    ? STATUS_HEX.ok
                                    : undefined,
                              }}
                            >
                              {emailHelp}
                            </p>
                          )}
                        </div>

                        {/* Rol fijo: viewer */}
                        <div className="space-y-2">
                          <Label htmlFor="userRole">Rol</Label>
                          <Select
                            value={"viewer"}
                            onValueChange={() => {}}
                            disabled
                          >
                            <SelectTrigger id="userRole">
                              <SelectValue placeholder="Visualizador" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">
                                Visualizador
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            Se agregará como <strong>Visualizador</strong>.
                          </p>
                        </div>

                        <Button
                          type="submit"
                          className="w-full"
                          disabled={
                            emailStatus === "error" ||
                            emailStatus === "checking" ||
                            !emailInput.trim()
                          }
                        >
                          Agregar Usuario
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
          </CardHeader>

          {isUsersExpanded && (
            <CardContent>
              {!usersResp ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Cargando
                  usuarios…
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-center">Rol</TableHead>
                      <TableHead className="text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersResp.items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-sm text-muted-foreground"
                        >
                          No hay usuarios aún.
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersResp.items.map((u) => (
                        <TableRow key={u.email}>
                          {/* Columna usuario */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                {u.role === "viewer" ? (
                                  <Eye className="h-5 w-5 text-primary" />
                                ) : (
                                  <Pencil className="h-5 w-5 text-primary" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">
                                  {u.fullName || u.email.split("@")[0]}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {u.email}
                                </p>
                                {u.institution && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {u.institution}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Columna rol */}
                          <TableCell className="whitespace-nowrap align-middle text-center">
                            <Badge
                              variant={
                                u.role === "viewer" ? "secondary" : "default"
                              }
                              className="mx-auto"
                            >
                              {u.role === "viewer"
                                ? "Visualizador"
                                : u.role === "editor"
                                ? "Editor"
                                : "Owner"}
                            </Badge>
                          </TableCell>

                          {/* Columna acciones */}
                          <TableCell className="whitespace-nowrap align-middle">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                title="Próximamente"
                                className="h-9 w-9 p-0"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                title="Próximamente"
                                className="h-9 w-9 p-0"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Ocurrencias */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Ocurrencias</CardTitle>
              <CardDescription>
                Lista de especímenes en esta colección
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {/* Prev/Next */}
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gotoOccPage(occCurrentPage - 1)}
                  disabled={!occHasPrev}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground min-w-[140px] text-center">
                  Página {occCurrentPage} de {occTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gotoOccPage(occCurrentPage + 1)}
                  disabled={!occHasNext}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              {isOwner && (
                <Button
                  onClick={() =>
                    onNavigate("new-occurrence", {
                      collectionId,
                      collectionName,
                      isOwner,
                    })
                  }
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Nueva Ocurrencia
                </Button>
              )}

              {isOwner && (
                <Button
                  onClick={() =>
                    onNavigate("csv-import", { collectionId, collectionName })
                  }
                  size="sm"
                  className="flex-shrink-0"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!occResp ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" /> Cargando
              ocurrencias…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre Científico</TableHead>
                  <TableHead>Familia</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Recolector</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occResp.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No hay ocurrencias en esta colección todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  occResp.items.map((occ) => (
                    <TableRow key={occ.id}>
                      <TableCell>{occ.code ?? "—"}</TableCell>
                      <TableCell className="italic">
                        {occ.scientificName ?? "—"}
                      </TableCell>
                      <TableCell>{occ.family ?? "—"}</TableCell>
                      <TableCell>{occ.location ?? "—"}</TableCell>
                      <TableCell>{occ.collector ?? "—"}</TableCell>
                      <TableCell>{formatBriefDate(occ.date)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-0"
                            onClick={() => goToOccurrenceDetail(occ.id)}
                            title="Ver detalle"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isOwner && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                title="Próximamente"
                                className="h-9 w-9 p-0"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                title="Próximamente"
                                className="h-9 w-9 p-0"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Eliminar colección (placeholder visual) */}
      {isOwner && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setShowDeleteCollectionDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar Colección
          </Button>
        </div>
      )}

      {/* Confirm dialogs */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La ocurrencia será eliminada
              permanentemente de la colección.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showDeleteCollectionDialog}
        onOpenChange={setShowDeleteCollectionDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Estás seguro de eliminar esta colección?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="confirmDelete">
              Escribe{" "}
              <span className="font-mono bg-muted px-1">CONFIRMAR</span> para
              proceder
            </Label>
            <Input
              id="confirmDelete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRMAR"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled
            >
              Eliminar Colección
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
