import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Plus, Folder, Upload, Users, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { AutocompleteInstitution } from "../AutocompleteInstitution";
import { Role } from "@constants/roles";
import { collectionsService } from "@services/collections.service";

import {
  CollectionCreate,
  CollectionListItem,
  toCollectionListItem,
} from "@interfaces/collection";

type CollectionsPageProps = {
  onNavigate: (page: string, params?: any) => void;
};

export function CollectionsPage({ onNavigate }: CollectionsPageProps) {
  const { user, apiFetch, token } = useAuth() as any;
  console.log(user);

  const isSuper = user?.role === Role.Admin;
  const isInstAdmin = user?.role === Role.InstitutionAdmin;

  // Solo los super pueden elegir institución libremente
  const isRestrictedInstitutionPick = !isSuper; // true = user normal o InstitutionAdmin
  const userInstitutionId = user?.institutionId != null ? Number(user.institutionId) : null;
  const userInstitutionName = user?.institution || "";
  const creatorDisplayName = user?.username || user?.email || "Desconocido";

  const collectionsPerPage = PAGE_SIZE.COLLECTIONS;

  // Usamos siempre el id de usuario (agentId ya no viene del backend)
  const userId = user?.userId ?? null;

  // ------- Estado: colecciones por agente (mis colecciones) -------
  const [myItems, setMyItems] = useState<CollectionListItem[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myPage, setMyPage] = useState(1);
  const [myTotalPages, setMyTotalPages] = useState(1);

  // ------- Estado: colecciones permitidas -------
  const [allowedItems, setAllowedItems] = useState<CollectionListItem[]>([]);
  const [allowedLoading, setAllowedLoading] = useState(false);
  const [allowedPage, setAllowedPage] = useState(1);
  const [allowedTotalPages, setAllowedTotalPages] = useState(1);

  // ------- Diálogo de creación -------
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Selección de institución (usamos AutocompleteInstitution para obtener el id)
  const [instSearchText, setInstSearchText] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);

  // Form de creación (solo campos que POST acepta)
  // collectionID ya no se manda: lo genera el ORM
  const [form, setForm] = useState<CollectionCreate>({
    collectionName: "",
    description: "",
  });

  const canManageCollection = (c: CollectionListItem) => {
    const isSuper = user?.role === Role.Admin;
    const isInstAdminSameInst =
      user?.role === Role.InstitutionAdmin &&
      Number(user?.institutionId) === Number(c.institutionId);

    const isOwnerRole = c.my_role === "owner";
    return isSuper || isInstAdminSameInst || isOwnerRole;
  };

  // CSV (opcional: por ahora solo contamos filas; la carga real de ocurrencias no está en este endpoint)
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Helpers UI
  const roleBadge = (role?: string | null) => {
    if (!role) return null;
    const map: Record<string, string> = {
      superuser: "bg-purple-100 text-purple-800",
      institution_admin: "bg-orange-100 text-orange-800",
      owner: "bg-blue-100 text-blue-800",
      editor: "bg-emerald-100 text-emerald-800",
      viewer: "bg-gray-100 text-gray-800",
    };
    const cls = map[role] ?? "bg-gray-100 text-gray-800";
    const label: Record<string, string> = {
      superuser: "Superuser",
      institution_admin: "Admin institución",
      owner: "Propietario",
      editor: "Editor",
      viewer: "Lector",
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${cls}`} title="Tu rol en esta colección">
        {label[role] ?? role}
      </span>
    );
  };

  // ------- Fetchers -------
  const fetchMyCollections = useCallback(
    async (page: number) => {
      if (!userId) return;
      try {
        setMyLoading(true);
        const data = await collectionsService.getByUser(apiFetch, userId, page, collectionsPerPage);
        setMyItems(data.items.map(toCollectionListItem));
        setMyTotalPages(data.totalPages ?? 1);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar tus colecciones");
        setMyItems([]);
        setMyTotalPages(1);
      } finally {
        setMyLoading(false);
      }
    },
    [apiFetch, userId, collectionsPerPage]
  );

  const fetchAllowedCollections = useCallback(
    async (page: number) => {
      try {
        setAllowedLoading(true);
        const data = await collectionsService.getAllowed(apiFetch, page, collectionsPerPage);
        setAllowedItems(data.items.map(toCollectionListItem));
        setAllowedTotalPages(data.totalPages ?? 1);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar las colecciones permitidas");
        setAllowedItems([]);
        setAllowedTotalPages(1);
      } finally {
        setAllowedLoading(false);
      }
    },
    [apiFetch, collectionsPerPage]
  );

  // ------- Crear colección -------
  const resetForm = () => {
    setForm({
      collectionName: "",
      description: "",
    });
    setCsvFile(null);

    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId);
      setInstSearchText(
        userInstitutionName || (userInstitutionId ? `Institución #${userInstitutionId}` : "")
      );
    } else {
      setSelectedInstitutionId(null);
      setInstSearchText("");
    }
  };

  useEffect(() => {
    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId);
      setInstSearchText(
        userInstitutionName || (userInstitutionId ? `Institución #${userInstitutionId}` : "")
      );
    }
  }, [isRestrictedInstitutionPick, userInstitutionId, userInstitutionName, open]);

  // ------- Effects -------
  useEffect(() => {
    if (userId) fetchMyCollections(myPage);
  }, [userId, myPage, fetchMyCollections]);

  useEffect(() => {
    fetchAllowedCollections(allowedPage);
  }, [allowedPage, fetchAllowedCollections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!form.collectionName?.trim()) {
      toast.error("Ingresa un nombre de colección");
      return;
    }
    if (!selectedInstitutionId) {
      toast.error("Selecciona una institución");
      return;
    }
    if (!userId) {
      toast.error("No se encontró tu ID de usuario");
      return;
    }

    const payload: CollectionCreate = {
      collectionName: form.collectionName?.trim() || null,
      description: form.description?.trim() || null,
      institutionId: selectedInstitutionId,
      creatorUserId: userId,
    };

    try {
      setCreating(true);
      await collectionsService.create(apiFetch, payload);
      toast.success("Colección creada correctamente");
      setOpen(false);
      resetForm();

      // refrescar ambas listas
      if (userId) fetchMyCollections(1);
      fetchAllowedCollections(1);
      setMyPage(1);
      setAllowedPage(1);

      if (csvFile) {
        const content = await csvFile.text();
        const lines = content.split(/\r?\n/).filter((l) => l.trim());
        const approx = Math.max(0, lines.length - 1);
        toast.info(`CSV detectado (${approx} filas). Importación de ocurrencias se implementará aparte.`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error creando la colección");
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (f.type === "text/csv" || f.name.endsWith(".csv")) {
      setCsvFile(f);
      toast.success("Archivo CSV cargado (solo conteo por ahora)");
    } else {
      toast.error("Selecciona un archivo CSV válido");
    }
  };

  // ------- Navegación tarjetas -------
  const goToCollectionDetail = (c: CollectionListItem) => {
    onNavigate("collection-detail", {
      collectionId: c.collectionId,
      collectionName: c.name,
      collectionInstitutionId: Number(c.institutionId),
      isOwner: canManageCollection(c),
    });
  };

  // ------- Render -------
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl mb-2">Colecciones</h1>
          <p className="text-muted-foreground">
            Gestiona tus colecciones y las que tienes permiso a ver/editar
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Colección
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Crear Nueva Colección</DialogTitle>
              <DialogDescription>Completa los metadatos de tu nueva colección.</DialogDescription>
            </DialogHeader>

            {/* Form base compartido */}
            <div className="rounded-lg bg-blue-50 p-4 my-4">
              <div className="flex items-start gap-3">
                <Folder className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="text-sm text-blue-900 mb-1">Metadatos</h4>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Creator */}
              <div className="space-y-1">
                <Label>Creador</Label>
                <div className="text-sm">{creatorDisplayName}</div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="collectionName">Nombre de la colección</Label>
                <Input
                  id="collectionName"
                  value={form.collectionName ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, collectionName: e.target.value }))}
                  placeholder="Ej: Flora del Amazonas 2024"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe el propósito y contenido de esta colección"
                />
              </div>

              {/* Autocomplete de institución */}
              <div className="space-y-2">
                <Label htmlFor="institution">Institución</Label>

                <AutocompleteInstitution
                  token={token}
                  apiFetch={apiFetch}
                  placeholder={
                    isRestrictedInstitutionPick
                      ? userInstitutionName || "Tu institución"
                      : "Buscar institución..."
                  }
                  disabled={isRestrictedInstitutionPick}
                  value={instSearchText}
                  onChange={(t) => {
                    if (isRestrictedInstitutionPick) return; // bloquear edición
                    setInstSearchText(t);
                    setSelectedInstitutionId(null);
                  }}
                  onSelect={(item) => {
                    if (isRestrictedInstitutionPick) return; // bloquear selección
                    setInstSearchText(item.institutionName ?? "");
                    setSelectedInstitutionId(item.institutionId ?? null);
                  }}
                  minChars={1}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" disabled={creating}>
                  {creating ? "Creando..." : "Crear colección"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mis colecciones */}
      {userId && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl">Mis colecciones</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {myPage} / {myTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMyPage((p) => Math.max(1, p - 1))}
                  disabled={myPage <= 1 || myLoading}
                  className="h-9 w-9 rounded-full"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMyPage((p) => Math.min(myTotalPages, p + 1))}
                  disabled={myPage >= myTotalPages || myLoading}
                  className="h-9 w-9 rounded-full"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {myLoading ? (
            <p className="text-sm text-muted-foreground py-4">Cargando…</p>
          ) : myItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No tienes colecciones creadas.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myItems.map((c) => (
                <Card
                  key={c.collectionId}
                  className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-primary/50"
                  onClick={() => goToCollectionDetail(c)}
                >
                  <CardHeader>
                    {/* fila superior: icono izquierda, contador derecha */}
                    <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                      <Folder className="h-8 w-8 text-primary shrink-0" />

                      <span
                        className="
                                inline-flex items-center justify-center rounded-full
                                bg-red-50 text-primary tabular-nums
                                px-2 py-0.5 leading-none
                                text-[11px] sm:text-xs
                                max-w-[55%] sm:max-w-[60%]
                                overflow-hidden text-ellipsis whitespace-nowrap text-right
                                font-normal
                              "
                        title={`${c.occurrencesCount} ocurrencias`}
                      >
                        <span>{c.occurrencesCount}</span>
                        <span className="ml-1 hidden sm:inline">ocurrencias</span>
                        <span className="ml-1 sm:hidden">ocurrencias</span>
                      </span>
                    </div>

                    <CardTitle className="truncate">{c.name ?? "(sin nombre)"}</CardTitle>

                    <CardDescription className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {c.institutionName ?? "Sin institución"}
                      </span>
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      <span>Tu rol:</span>
                      {c.my_role ? (
                        roleBadge(c.my_role)
                      ) : (
                        <span className="italic">Sin rol específico</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Colecciones permitidas */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">Colecciones permitidas</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {allowedPage} / {allowedTotalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAllowedPage((p) => Math.max(1, p - 1))}
                disabled={allowedPage <= 1 || allowedLoading}
                className="h-9 w-9 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAllowedPage((p) => Math.min(allowedTotalPages, p + 1))}
                disabled={allowedPage >= allowedTotalPages || allowedLoading}
                className="h-9 w-9 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {allowedLoading ? (
          <p className="text-sm text-muted-foreground py-4">Cargando…</p>
        ) : allowedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No hay colecciones para mostrar.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allowedItems.map((c) => (
              <Card
                key={c.collectionId}
                className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-primary/50"
                onClick={() => goToCollectionDetail(c)}
              >
                <CardHeader>
                  {/* fila superior: icono izquierda, contador derecha */}
                  <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                    <Folder className="h-8 w-8 text-primary shrink-0" />

                    <span
                      className="
                                inline-flex items-center justify-center rounded-full
                                bg-red-50 text-primary tabular-nums
                                px-2 py-0.5 leading-none
                                text-[11px] sm:text-xs
                                max-w-[55%] sm:max-w-[60%]
                                overflow-hidden text-ellipsis whitespace-nowrap text-right
                                font-normal
                              "
                      title={`${c.occurrencesCount} ocurrencias`}
                    >
                      <span>{c.occurrencesCount}</span>
                      <span className="ml-1 hidden sm:inline">ocurrencias</span>
                      <span className="ml-1 sm:hidden">ocurrencias</span>
                    </span>
                  </div>

                  <CardTitle className="truncate">{c.name ?? "(sin nombre)"}</CardTitle>

                  <CardDescription className="flex items-center gap-2 min-w-0">
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {c.institutionName ?? "Sin institución"}
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="truncate">
                      Creador: {c.creatorName ?? "Desconocido"}
                    </span>
                  </div>

                  {/* Rol abajo con Shield al costado */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <Shield className="h-4 w-4" />
                    <span>Tu rol:</span>
                    {c.my_role ? roleBadge(c.my_role) : <span>Sin rol específico</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
