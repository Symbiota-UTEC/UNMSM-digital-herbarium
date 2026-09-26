import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  ArrowLeft,
  UserPlus,
  Users,
  Pencil,
  Trash2,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Upload,
  Info,
} from "lucide-react";
import { DataTable, TablePagination, type ColumnDef } from "../ui/data-table";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { collectionsService } from "@services/collections.service";
import { usersService } from "@services/users.service";
import { ApiError } from "@services/api.error";
import { Role } from "@constants/roles";
import { CollectionRole } from "@constants/enums";
import { PAGE_SIZE } from "@constants/api";
import type { OccurrenceBriefItem } from "@interfaces/occurrence";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { CollectionOut, CollectionUserAccessItem } from "@interfaces/collection";
import { SkeletonBar } from "../ui/loading-overlay";
import { ApiUserLookupResponse, mapApiLookupToResult, VISIBILITY } from "@interfaces/auth";

interface CollectionDetailPageProps {
  collectionId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

// Formateo seguro de fecha del brief (puede no ser ISO perfecto)
function formatBriefDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("es-ES");
}

export function CollectionDetailPage({ collectionId, onNavigate }: CollectionDetailPageProps) {
  const { token, apiFetch } = useAuth();

  // ================== Estado: colección y permisos (los da el backend) ==================
  const [collection, setCollection] = useState<CollectionOut | null>(null);
  const [collectionError, setCollectionError] = useState<"not-found" | "forbidden" | "error" | null>(null);
  const collectionName = collection?.collectionName ?? "";
  const canEdit = collection?.canEdit ?? false; // crear/editar ocurrencias, importar CSV
  const canManage = collection?.canManage ?? false; // gestionar accesos y eliminar la colección

  useEffect(() => {
    let active = true;
    setCollection(null);
    setCollectionError(null);
    collectionsService
      .getById(apiFetch, collectionId)
      .then((c) => active && setCollection(c))
      .catch((err) => {
        if (!active) return;
        setCollectionError(
          err instanceof ApiError && err.status === 404
            ? "not-found"
            : err instanceof ApiError && err.status === 403
              ? "forbidden"
              : "error",
        );
      });
    return () => {
      active = false;
    };
  }, [apiFetch, collectionId]);

  // ================== Estado: usuarios ==================
  const [usersResp, setUsersResp] = useState<PaginatedResponse<CollectionUserAccessItem> | null>(null);
  const [usersLimit] = useState(PAGE_SIZE.COLLECTION_ACCESS_USERS);
  const [usersPage, setUsersPage] = useState(1);

  // ================== Estado: ocurrencias ==================
  const [occResp, setOccResp] = useState<PaginatedResponse<OccurrenceBriefItem> | null>(null);
  const [occLoading, setOccLoading] = useState(true);
  const [occLimit] = useState(PAGE_SIZE.COLLECTION_OCCURRENCES);
  const [occPage, setOccPage] = useState(1);

  // ================== Estado: Add user dialog ==================
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "ok" | "warn" | "error">("idle");
  const [emailHelp, setEmailHelp] = useState<string>("");

  // ================== Otros estados ==================
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteCollectionDialog, setShowDeleteCollectionDialog] = useState(false);
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
    async (opts?: { limit?: number; page?: number }) => {
      if (!token) return;
      try {
        const limit = opts?.limit ?? usersLimit;
        const page = opts?.page ?? usersPage;
        const data = await collectionsService.getAccessUsers(apiFetch, collectionId, page, limit);
        setUsersResp(data);
      } catch (err) {
        console.error("fetch access-users error:", err);
        toast.error("No se pudieron cargar los usuarios con acceso");
      }
    },
    [apiFetch, collectionId, usersLimit, usersPage, token],
  );

  const fetchOccurrences = useCallback(async () => {
    if (!token) return;
    try {
      setOccLoading(true);
      const data = await collectionsService.getOccurrencesBrief(apiFetch, collectionId, occPage, occLimit);
      setOccResp(data);
    } catch (err) {
      console.error("fetch occurrences error:", err);
      toast.error("No se pudieron cargar las ocurrencias");
    } finally {
      setOccLoading(false);
    }
  }, [apiFetch, collectionId, occLimit, occPage, token]);

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

        let payload: ApiUserLookupResponse;
        try {
          payload = await usersService.getByEmail(apiFetch, email);
        } catch {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return null;
        }
        const r = mapApiLookupToResult(payload);

        if (!r.found) {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return null;
        }

        // SUPERADMIN
        if (r.visibility === VISIBILITY.FULL && r.user?.role === Role.Admin) {
          setEmailStatus("warn");
          setEmailHelp("Este usuario es superadministrador: ya tiene acceso a todas las colecciones.");
          return r;
        }
        if (
          r.visibility === VISIBILITY.LIMITED &&
          (r.message?.toLowerCase().includes("superadministrador") || r.message?.toLowerCase().includes("superusuario"))
        ) {
          setEmailStatus("warn");
          setEmailHelp("Este usuario es superadministrador: ya tiene acceso a todas las colecciones.");
          return r;
        }

        if (r.sameInstitution) {
          setEmailStatus("ok");
          setEmailHelp("Usuario encontrado en la misma institución.");
        } else {
          setEmailStatus("warn");
          setEmailHelp("Este usuario pertenece a una institución diferente a la institución de esta colección.");
        }

        return r;
      } catch (e) {
        console.error(e);
        setEmailStatus("error");
        setEmailHelp("No se pudo verificar el usuario.");
        return null;
      }
    },
    [token, apiFetch],
  );

  // ================== Agregar usuario ==================
  const handleAddUser = useCallback(
    async (e: FormEvent) => {
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
        await collectionsService.addUser(apiFetch, collectionId, emailInput.trim());
        toast.success("Usuario agregado como visualizador");
        setShowAddUserDialog(false);
        setEmailInput("");
        setEmailStatus("idle");
        setEmailHelp("");
        setUsersPage(1);
        await fetchUsers({ page: 1, limit: usersLimit });
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409) toast.warning(err.detail || "El usuario ya tiene algún rol en esta colección");
          else if (err.status === 404) toast.error("Colección o usuario no encontrado");
          else if (err.status === 403) toast.error("No tienes permisos para agregar usuarios a esta colección");
          else toast.error(err.detail || "No se pudo agregar el usuario");
        } else {
          toast.error("Error de red al agregar usuario");
        }
      }
    },
    [emailInput, emailStatus, collectionId, token, fetchUsers, usersLimit, validateAddUserEmail],
  );

  // ================== Paginación derivada ==================
  // Usuarios
  const usersTotal = usersResp?.total ?? 0;
  const usersTotalPages = usersTotal === 0 ? 1 : Math.ceil(usersTotal / usersLimit);
  const usersCurrentPage = Math.min(usersTotalPages, usersPage);

  const gotoUsersPage = (page: number) => {
    setUsersPage(Math.max(1, Math.min(usersTotalPages, page)));
  };

  // Ocurrencias
  const occTotal = occResp?.total ?? 0;
  const occTotalPages = occTotal === 0 ? 1 : Math.ceil(occTotal / occLimit);
  const occCurrentPage = Math.min(occTotalPages, occPage);
  const gotoOccPage = (page: number) => {
    setOccPage(Math.max(1, Math.min(occTotalPages, page)));
  };

  // ================== Helpers UI ==================
  const usersCount = usersTotal;
  const occCount = occTotal;

  const goToOccurrenceDetail = (occId: string) => {
    onNavigate("occurrence-detail", {
      occurrenceId: occId,
      collectionId,
    });
  };

  const occColumns: ColumnDef<OccurrenceBriefItem>[] = [
    { key: "code", header: "Código", cell: (occ) => occ.code ?? "—" },
    {
      key: "scientific-name",
      header: "Nombre Científico",
      cell: (occ) => <span className="italic">{occ.scientificName ?? "—"}</span>,
    },
    { key: "family", header: "Familia", cell: (occ) => occ.family ?? "—" },
    { key: "location", header: "Ubicación", cell: (occ) => occ.location ?? "—" },
    { key: "collector", header: "Recolector", cell: (occ) => occ.collector ?? "—" },
    { key: "date", header: "Fecha", cell: (occ) => formatBriefDate(occ.date) },
    {
      key: "actions",
      header: "Acciones",
      cell: (occ) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => goToOccurrenceDetail(occ.occurrenceId)}
            title="Ver detalle"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                title="Editar ocurrencia"
                onClick={() =>
                  onNavigate("edit-occurrence", {
                    occurrenceId: occ.occurrenceId,
                    collectionId,
                    returnTo: "collection",
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled title="Próximamente" className="h-8 w-8 p-0">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (collectionError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => onNavigate("collections")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Colecciones
        </Button>
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {collectionError === "not-found"
            ? "La colección no existe."
            : collectionError === "forbidden"
              ? "No tienes acceso a esta colección."
              : "No se pudo cargar la colección."}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => onNavigate("collections")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Colecciones
        </Button>

        <div>
          {collection ? (
            <h1 className="text-3xl mb-2">{collectionName}</h1>
          ) : (
            <SkeletonBar width="16rem" style={{ height: "2rem", marginBottom: "0.75rem" }} />
          )}
          <p className="text-muted-foreground">
            {occCount} ocurrencias en esta colección • {usersCount} usuarios con acceso a esta colección
          </p>
        </div>
      </div>

      {/* Usuarios con Acceso */}
      {canManage && (
        <div className="flex flex-col gap-3 mb-6">
          {/* Botón encima de la card */}
          <div className="flex justify-end">
            <Dialog
              open={showAddUserDialog}
              onOpenChange={(open: boolean) => {
                setShowAddUserDialog(open);
                if (!open) {
                  setEmailInput("");
                  setEmailStatus("idle");
                  setEmailHelp("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Agregar Usuario
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Usuario a la Colección</DialogTitle>
                  <DialogDescription>Invita a otros usuarios como visualizadores</DialogDescription>
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
                        aria-invalid={emailStatus === "error" ? true : undefined}
                        style={statusStyle}
                        className="focus-visible:outline-none"
                      />
                      {emailStatus !== "idle" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          {emailStatus === "checking" && (
                            <Info className="h-4 w-4 text-muted-foreground animate-pulse" />
                          )}
                          {emailStatus === "ok" && (
                            <span style={{ color: STATUS_HEX.ok }} className="text-sm font-medium">
                              OK
                            </span>
                          )}
                          {emailStatus === "warn" && (
                            <span style={{ color: STATUS_HEX.warn }} className="text-sm font-medium">
                              Warn
                            </span>
                          )}
                          {emailStatus === "error" && (
                            <span style={{ color: STATUS_HEX.error }} className="text-sm font-medium">
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
                  <div className="space-y-2">
                    <Label htmlFor="userRole">Rol</Label>
                    <Select value={CollectionRole.Viewer} onValueChange={() => {}} disabled>
                      <SelectTrigger id="userRole">
                        <SelectValue placeholder="Visualizador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CollectionRole.Viewer}>Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Se agregará como <strong>Visualizador</strong>.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={emailStatus === "error" || emailStatus === "checking" || !emailInput.trim()}
                  >
                    Agregar Usuario
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Card de usuarios — misma estructura que FiltersCard */}
          <Card className="border border-primary/30 shadow-sm">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-full bg-primary/10"
                    style={{ width: "2rem", height: "2rem", flexShrink: 0 }}
                  >
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold tracking-tight">Usuarios con Acceso</CardTitle>
                    <CardDescription className="text-xs">
                      Usuarios que pueden acceder a esta colección ({usersCount} total)
                    </CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsUsersExpanded((v) => !v)}
                  aria-label={isUsersExpanded ? "Ocultar usuarios" : "Mostrar usuarios"}
                >
                  {isUsersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>

            {isUsersExpanded && (
              <CardContent>
                {!usersResp ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Cargando usuarios…
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead className="whitespace-nowrap" style={{ width: "1px", textAlign: "right" }}>
                            Acciones
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersResp.items.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              No hay usuarios aún.
                            </TableCell>
                          </TableRow>
                        ) : (
                          usersResp.items.map((u) => (
                            <TableRow key={u.email}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    {u.role === CollectionRole.Viewer ? (
                                      <Eye className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Pencil className="h-4 w-4 text-primary" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">{u.full_name || u.email.split("@")[0]}</p>
                                    <p className="text-sm text-muted-foreground">{u.email}</p>
                                    {u.institution && <p className="text-xs text-muted-foreground">{u.institution}</p>}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap align-middle">
                                <div>
                                  {u.role === CollectionRole.Owner && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                      Propietario
                                    </span>
                                  )}
                                  {u.role === CollectionRole.Editor && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                                      Editor
                                    </span>
                                  )}
                                  {u.role === CollectionRole.Viewer && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-800">
                                      Lector
                                    </span>
                                  )}
                                  {!Object.values(CollectionRole).includes(u.role) && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-800">
                                      {u.role}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap align-middle" style={{ width: "1px" }}>
                                <div className="flex justify-end gap-2">
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

                    <TablePagination
                      page={usersCurrentPage}
                      totalPages={usersTotalPages}
                      onPrevPage={() => gotoUsersPage(usersCurrentPage - 1)}
                      onNextPage={() => gotoUsersPage(usersCurrentPage + 1)}
                    />
                  </>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Ocurrencias */}
      <DataTable<OccurrenceBriefItem>
        title="Ocurrencias"
        description="Lista de especímenes en esta colección"
        columns={occColumns}
        data={occResp?.items ?? []}
        keyExtractor={(row) => row.occurrenceId}
        loading={occLoading}
        emptyMessage="No hay ocurrencias en esta colección todavía."
        page={occCurrentPage}
        totalPages={occTotalPages}
        onPrevPage={() => gotoOccPage(occCurrentPage - 1)}
        onNextPage={() => gotoOccPage(occCurrentPage + 1)}
        toolbar={
          canEdit ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate("new-occurrence", { collectionId, returnTo: "collection" })}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Nueva Ocurrencia
              </Button>
              <Button size="sm" onClick={() => onNavigate("csv-import", { collectionId })}>
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Eliminar colección (placeholder visual) */}
      {canManage && (
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
              Esta acción no se puede deshacer. La ocurrencia será eliminada permanentemente de la colección.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteCollectionDialog} onOpenChange={setShowDeleteCollectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de eliminar esta colección?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="confirmDelete">
              Escribe <span className="font-mono bg-muted px-1">CONFIRMAR</span> para proceder
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
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled>
              Eliminar Colección
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
