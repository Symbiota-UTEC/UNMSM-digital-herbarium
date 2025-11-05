import {useCallback, useEffect, useMemo, useState} from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "../ui/pagination";
import { ArrowLeft, UserPlus, Pencil, Trash2, Eye, RefreshCw, ChevronDown, ChevronRight, Upload, Info } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { Role } from "@constants/roles";
import { OccurrenceBriefItem } from "@interfaces/occurrence";
import { PaginatedResponse } from "@interfaces/utils/pagination";
import { CollectionUserAccessItem } from "@interfaces/collection";
import { ApiUserLookupResponse, mapApiLookupToResult, VISIBILITY } from "@interfaces/auth";

// ================== Props ==================
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

export function CollectionDetailPage({
                                       collectionId,
                                       collectionName,
                                       collectionInstitutionId,
                                       isOwner,
                                       onNavigate
                                     }: CollectionDetailPageProps) {
  const { token } = useAuth();

  console.log("Is Owner: ", isOwner);
  console.log("institution: ", collectionInstitutionId);

  // ================== Estado: usuarios con acceso ==================
  const [usersResp, setUsersResp] = useState<PaginatedResponse<CollectionUserAccessItem> | null>(null);
  const [usersLimit, setUsersLimit] = useState(6);
  const [usersOffset, setUsersOffset] = useState(0);

  // ================== Estado: ocurrencias ==================
  const [occResp, setOccResp] = useState<PaginatedResponse<OccurrenceBriefItem> | null>(null);
  const [occLimit, setOccLimit] = useState(10);
  const [occOffset, setOccOffset] = useState(0);

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

  // ================== Cargas ==================
  const fetchUsers = useCallback(async () => {
    try {
      const url = `${API.BASE_URL}${API.PATHS.COLLECTIONS_ACCESS_USERS(collectionId)}?limit=${usersLimit}&offset=${usersOffset}`;
      const res = await apiFetch(url, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
      if (!res.ok) throw new Error(await res.text());
      const data: PaginatedResponse<CollectionUserAccessItem> = await res.json();
      setUsersResp(data);
    } catch (err) {
      console.error("fetch access-users error:", err);
      toast.error("No se pudieron cargar los usuarios con acceso");
    }
  }, [collectionId, usersLimit, usersOffset, token]);

  const fetchOccurrences = useCallback(async () => {
    try {
      const url = `${API.BASE_URL}${API.PATHS.COLLECTIONS_OCCURRENCES_BRIEF(collectionId)}?limit=${occLimit}&offset=${occOffset}`;
      const res = await apiFetch(url, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
      if (!res.ok) throw new Error(await res.text());
      const data: PaginatedResponse<OccurrenceBriefItem> = await res.json();
      setOccResp(data);
    } catch (err) {
      console.error("fetch occurrences error:", err);
      toast.error("No se pudieron cargar las ocurrencias");
    }
  }, [collectionId, occLimit, occOffset, token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);

  // ================== Validación de email (debounce) ==================
  useEffect(() => {
    if (!showAddUserDialog) return;
    if (!emailInput.trim()) {
      setEmailStatus("idle");
      setEmailHelp("");
      return;
    }

    let cancelled = false;
    setEmailStatus("checking");
    setEmailHelp("Verificando usuario...");

    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ email: emailInput.trim() });

        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.USER_BY_EMAIL}?${params.toString()}`,
            { headers: { Authorization: token ? `Bearer ${token}` : "" } }
        );

        if (cancelled) return;

        if (res.status === 404) {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return;
        }
        if (!res.ok) {
          setEmailStatus("error");
          setEmailHelp("No se pudo verificar el usuario.");
          return;
        }

        const payload: ApiUserLookupResponse = await res.json();
        const r = mapApiLookupToResult(payload);

        if (!r.found) {
          setEmailStatus("error");
          setEmailHelp("No existe un usuario con ese correo.");
          return;
        }

        // --- Caso SUPERUSER ---
        // full: tenemos user mapeado → podemos revisar rol
        if (r.visibility === VISIBILITY.FULL && r.user?.role === Role.Admin) {
          setEmailStatus("warn");
          setEmailHelp("Este usuario es superadministrador: ya tiene acceso a todas las colecciones.");
          return;
        }
        // limited: sin user, pero el backend puede mandar un mensaje indicándolo
        if (
            r.visibility === VISIBILITY.LIMITED &&
            (r.message?.toLowerCase().includes("superadministrador") ||
                r.message?.toLowerCase().includes("superusuario"))
        ) {
          setEmailStatus("warn");
          setEmailHelp("Este usuario es superadministrador: ya tiene acceso a todas las colecciones.");
          return;
        }

        // --- Misma institución vs otra ---
        const sameInstitution =
            r.sameInstitution === true ||
            (r.visibility === VISIBILITY.FULL &&
                r.user?.institutionId === collectionInstitutionId);

        if (sameInstitution) {
          setEmailStatus("ok");
          setEmailHelp("Usuario encontrado en la misma institución.");
        } else {
          setEmailStatus("warn");
          setEmailHelp("El usuario existe pero pertenece a otra institución.");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setEmailStatus("error");
          setEmailHelp("No se pudo verificar el usuario.");
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [emailInput, showAddUserDialog, collectionInstitutionId, token]);

  // ================== Agregar usuario ==================
  const handleAddUser = useCallback(async (e: React.FormEvent) => {
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
            headers: { Authorization: token ? `Bearer ${token}` : "" },
            body: JSON.stringify({ email: emailInput.trim() }),
          }
      );

      if (res.status === 201) {
        toast.success("Usuario agregado como visualizador");
        setShowAddUserDialog(false);
        setEmailInput("");
        setEmailStatus("idle");
        setEmailHelp("");
        fetchUsers();
      } else if (res.status === 409) {
        const txt = await res.text();
        toast.warning(txt || "El usuario ya tiene algún rol en esta colección");
      } else if (res.status === 404) {
        toast.error("Colección o usuario no encontrado");
      } else if (res.status === 403) {
        toast.error("No tienes permisos para agregar usuarios a esta colección");
      } else {
        const txt = await res.text();
        toast.error(txt || "No se pudo agregar el usuario");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de red al agregar usuario");
    }
  }, [emailInput, emailStatus, collectionId, token, fetchUsers]);

  // ================== Helpers UI ==================
  const usersCount = usersResp?.total ?? 0;
  const occCount = occResp?.total ?? 0;

  const usersCurrentPage = useMemo(() => usersResp?.current_page ?? 1, [usersResp]);
  const occCurrentPage = useMemo(() => occResp?.current_page ?? 1, [occResp]);

  const gotoUsersPage = (page: number) => setUsersOffset((page - 1) * usersLimit);
  const gotoOccPage = (page: number) => setOccOffset((page - 1) * occLimit);

  // ================== Render ==================
  return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => onNavigate('collections')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Colecciones
          </Button>

          <div>
            <h1 className="text-3xl mb-2">{collectionName}</h1>
            <p className="text-muted-foreground">
              {occCount} ocurrencias en esta colección • {usersCount} usuarios con acceso
            </p>
          </div>
        </div>

        {/* Usuarios con Acceso */}
        {isOwner && (
            <Card className="mb-6">
              <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setIsUsersExpanded(!isUsersExpanded)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {isUsersExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <CardTitle className="mb-1">Usuarios con Acceso</CardTitle>
                      <CardDescription>
                        Usuarios que pueden acceder a esta colección ({usersCount} total)
                      </CardDescription>
                    </div>
                  </div>
                  {isUsersExpanded && (
                      <Dialog open={showAddUserDialog} onOpenChange={(open) => {
                        setShowAddUserDialog(open);
                        if (!open) {
                          setEmailInput("");
                          setEmailStatus("idle");
                          setEmailHelp("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button onClick={(e) => e.stopPropagation()} size="sm" className="flex-shrink-0">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Agregar Usuario
                          </Button>
                        </DialogTrigger>
                        <DialogContent onClick={(e) => e.stopPropagation()}>
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
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    placeholder="usuario@ejemplo.com"
                                    required
                                    className={
                                      emailStatus === "error"
                                          ? "border-red-500"
                                          : emailStatus === "warn"
                                              ? "border-amber-500"
                                              : emailStatus === "ok"
                                                  ? "border-emerald-500"
                                                  : ""
                                    }
                                />
                                {emailStatus !== "idle" && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                      {emailStatus === "checking" && <Info className="h-4 w-4 text-muted-foreground animate-pulse" />}
                                      {emailStatus === "ok" && <span className="text-emerald-600 text-sm font-medium">OK</span>}
                                      {emailStatus === "warn" && <span className="text-amber-600 text-sm font-medium">Warn</span>}
                                      {emailStatus === "error" && <span className="text-red-600 text-sm font-medium">Error</span>}
                                    </div>
                                )}
                              </div>
                              {emailHelp && (
                                  <p
                                      className={`text-sm ${
                                          emailStatus === "error"
                                              ? "text-red-600"
                                              : emailStatus === "warn"
                                                  ? "text-amber-600"
                                                  : emailStatus === "ok"
                                                      ? "text-emerald-600"
                                                      : "text-muted-foreground"
                                      }`}
                                  >
                                    {emailHelp}
                                  </p>
                              )}
                            </div>

                            {/* Rol fijo: viewer (disabled UI para que quede claro) */}
                            <div className="space-y-2">
                              <Label htmlFor="userRole">Rol</Label>
                              <Select value={"viewer"} onValueChange={() => {}} disabled>
                                <SelectTrigger id="userRole">
                                  <SelectValue placeholder="Visualizador" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Visualizador</SelectItem>
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
                  )}
                </div>
              </CardHeader>

              {isUsersExpanded && (
                  <CardContent>
                    <div className="space-y-2">
                      {(usersResp?.items ?? []).map((u, idx) => (
                          <div key={`${u.email}-${idx}`} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                {u.role === "viewer" ? <Eye className="h-5 w-5 text-primary" /> : <Pencil className="h-5 w-5 text-primary" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p>{u.full_name || u.email.split("@")[0]}</p>
                                  {u.role === "owner" && <Badge variant="default" className="text-xs">Owner</Badge>}
                                </div>
                                <p className="text-sm text-muted-foreground">{u.email}</p>
                                {u.institution && <p className="text-xs text-muted-foreground mt-0.5">{u.institution}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={u.role === "viewer" ? "secondary" : "default"}>
                                {u.role === "viewer" ? "Visualizador" : u.role === "editor" ? "Editor" : "Owner"}
                              </Badge>
                              {/* (Opciones de cambiar rol / eliminar acceso se implementarán luego) */}
                              <Button variant="outline" size="sm" disabled title="Próximamente">
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled title="Próximamente">
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                      ))}
                    </div>

                    {usersResp && usersResp.total_pages > 1 && (
                        <div className="mt-4">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => gotoUsersPage(Math.max(1, usersCurrentPage - 1))}
                                    className={usersCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                              {Array.from({ length: usersResp.total_pages }, (_, i) => i + 1).map((page) => (
                                  <PaginationItem key={page}>
                                    <PaginationLink
                                        onClick={() => gotoUsersPage(page)}
                                        isActive={usersCurrentPage === page}
                                        className="cursor-pointer"
                                    >
                                      {page}
                                    </PaginationLink>
                                  </PaginationItem>
                              ))}
                              <PaginationItem>
                                <PaginationNext
                                    onClick={() => gotoUsersPage(Math.min(usersResp.total_pages, usersCurrentPage + 1))}
                                    className={usersCurrentPage === usersResp.total_pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                    )}
                  </CardContent>
              )}
            </Card>
        )}

        {/* Ocurrencias */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ocurrencias</CardTitle>
                <CardDescription>Lista de especímenes en esta colección</CardDescription>
              </div>
              {isOwner && (
                  <div className="flex gap-2">
                    <Button onClick={() => onNavigate('csv-import', { collectionId, collectionName })}>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar CSV
                    </Button>
                  </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
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
                {(occResp?.items ?? []).map((occ) => (
                    <TableRow key={occ.id}>
                      <TableCell>{occ.code ?? "—"}</TableCell>
                      <TableCell className="italic">{occ.scientific_name ?? "—"}</TableCell>
                      <TableCell>{occ.family ?? "—"}</TableCell>
                      <TableCell>{occ.location ?? "—"}</TableCell>
                      <TableCell>{occ.collector ?? "—"}</TableCell>
                      <TableCell>{occ.date ? new Date(occ.date).toLocaleDateString("es-ES") : "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" disabled title="Próximamente">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isOwner && (
                              <>
                                <Button variant="ghost" size="sm" disabled title="Próximamente">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" disabled title="Próximamente">
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>

            {occResp && occResp.total_pages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                            onClick={() => gotoOccPage(Math.max(1, occCurrentPage - 1))}
                            className={occCurrentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: occResp.total_pages }, (_, i) => i + 1).map((page) => (
                          <PaginationItem key={page}>
                            <PaginationLink
                                onClick={() => gotoOccPage(page)}
                                isActive={occCurrentPage === page}
                                className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                            onClick={() => gotoOccPage(Math.min(occResp.total_pages, occCurrentPage + 1))}
                            className={occCurrentPage === occResp.total_pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
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

        {/* Confirm dialogs (placeholders) */}
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
              <AlertDialogDescription>
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
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
