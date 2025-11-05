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
import { API, PAGE_SIZE } from "@constants/api";
import { AutocompleteInstitution } from "../AutocompleteInstitution";
import { PaginatedResponse } from "@interfaces/utils/pagination";
import { Role } from "@constants/roles";

import {
  CollectionOut,
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
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | null>(null);

  // Form de creación (solo campos que POST acepta)
  const [form, setForm] = useState<CollectionCreate>({
    collectionID: "",
    collectionCode: "",
    collectionName: "",
    description: "",
    webSite: "",
    institution_id: null,
    creator_agent_id: null,
  });

  const canManageCollection = (c: CollectionListItem) => {
    // Si usas enum:
    const isSuper = user?.role === Role.Admin;
    const isInstAdminSameInst =
        user?.role === Role.InstitutionAdmin &&
        Number(user?.institutionId) === Number(c.institutionId); // <-- aquí el fix

    const isOwnerRole = c.my_role === "owner";
    return isSuper || isInstAdminSameInst || isOwnerRole;
  };

  // CSV (opcional: por ahora solo contamos filas; la carga real de ocurrencias no está en este endpoint)
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const agentId = user?.agentId ?? null; // <- crítico para /by-agent/{agent_id}

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
        if (!token || !agentId) return;
        try {
          setMyLoading(true);
          const limit = collectionsPerPage;
          const offset = (page - 1) * limit;
          const url = `${API.BASE_URL}/collections/by-agent/${agentId}?limit=${limit}&offset=${offset}`;

          const res = await apiFetch(url, {
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const txt = await res.text();
            console.error("by-agent error:", txt);
            throw new Error("No se pudieron cargar tus colecciones");
          }

          const data = (await res.json()) as PaginatedResponse<CollectionOut> | CollectionOut[];
          const items = Array.isArray(data) ? data : data.items ?? [];
          const list = items.map(toCollectionListItem);
          console.log("list, ", list);

          setMyItems(list);
          setMyTotalPages(Array.isArray(data) ? 1 : data.total_pages ?? 1);
        } catch (e) {
          console.error(e);
          toast.error("No se pudieron cargar tus colecciones");
          setMyItems([]);
          setMyTotalPages(1);
        } finally {
          setMyLoading(false);
        }
      },
      [apiFetch, token, agentId]
  );

  const fetchAllowedCollections = useCallback(
      async (page: number) => {
        if (!token) return;
        try {
          setAllowedLoading(true);
          const limit = collectionsPerPage;
          const offset = (page - 1) * limit;
          const url = `${API.BASE_URL}/collections/allowed?limit=${limit}&offset=${offset}`;

          const res = await apiFetch(url, {
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            const txt = await res.text();
            console.error("allowed error:", txt);
            throw new Error("No se pudieron cargar las colecciones permitidas");
          }

          const data = (await res.json()) as PaginatedResponse<CollectionOut> | CollectionOut[];
          const items = Array.isArray(data) ? data : data.items ?? [];
          const list = items.map(toCollectionListItem);
          console.log("list, ", list);

          setAllowedItems(list);
          setAllowedTotalPages(Array.isArray(data) ? 1 : data.total_pages ?? 1);
        } catch (e) {
          console.error(e);
          toast.error("No se pudieron cargar las colecciones permitidas");
          setAllowedItems([]);
          setAllowedTotalPages(1);
        } finally {
          setAllowedLoading(false);
        }
      },
      [apiFetch, token]
  );

  // ------- Effects -------
  useEffect(() => {
    if (agentId) fetchMyCollections(myPage);
  }, [agentId, myPage, fetchMyCollections]);

  useEffect(() => {
    fetchAllowedCollections(allowedPage);
  }, [allowedPage, fetchAllowedCollections]);

  // ------- Crear colección -------
    const resetForm = () => {
      setForm({
        collectionID: "",
        collectionCode: "",
        collectionName: "",
        description: "",
        webSite: "",
        institution_id: null,
        creator_agent_id: agentId ?? null,
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
    // set default creator from user
    setForm((f) => ({ ...f, creator_agent_id: agentId ?? null }));
  }, [agentId]);

    useEffect(() => {
      if (isRestrictedInstitutionPick) {
        setSelectedInstitutionId(userInstitutionId);
        setInstSearchText(
            userInstitutionName || (userInstitutionId ? `Institución #${userInstitutionId}` : "")
        );
      }
    }, [isRestrictedInstitutionPick, userInstitutionId, userInstitutionName, open]);

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
    if (!agentId) {
      toast.error("No se encontró tu Agent ID");
      return;
    }

    const payload: CollectionCreate = {
      collectionID: form.collectionID?.trim() || null,
      collectionCode: form.collectionCode?.trim() || null,
      collectionName: form.collectionName?.trim() || null,
      description: form.description?.trim() || null,
      webSite: form.webSite?.trim() || null,
      institution_id: selectedInstitutionId,
      creator_agent_id: agentId,
    };

    try {
      setCreating(true);
      const res = await apiFetch(`${API.BASE_URL}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("POST /api/collections error:", txt);
        toast.error("No se pudo crear la colección");
        return;
      }

      toast.success("Colección creada correctamente");
      setOpen(false);
      resetForm();

      // refrescar ambas listas (por si te aparece en allowed y en mis colecciones)
      if (agentId) fetchMyCollections(1);
      fetchAllowedCollections(1);
      setMyPage(1);
      setAllowedPage(1);

      // Si subieron CSV, por ahora solo contamos filas; la carga de ocurrencias no está en este endpoint
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
        collectionId: c.id,
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
            <p className="text-muted-foreground">Gestiona tus colecciones y las que tienes permiso a ver/editar</p>
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

              {/*<Tabs defaultValue="empty" className="w-full">*/}
              {/*  <TabsList className="grid w-full grid-cols-2">*/}
              {/*    <TabsTrigger value="empty">Colección Vacía</TabsTrigger>*/}
              {/*    /!*<TabsTrigger value="csv">Importar CSV (metadata + conteo)</TabsTrigger>*!/*/}
              {/*  </TabsList>*/}

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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="collectionID">collectionID</Label>
                      <Input
                          id="collectionID"
                          value={form.collectionID ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, collectionID: e.target.value }))}
                          placeholder="Opcional, p.ej. UNMSM-BOT-001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="collectionCode">collectionCode</Label>
                      <Input
                          id="collectionCode"
                          value={form.collectionCode ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, collectionCode: e.target.value }))}
                          placeholder="Opcional, p.ej. UNMSM-BOT"
                      />
                    </div>
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

                  <div className="space-y-2">
                    <Label htmlFor="webSite">Sitio web</Label>
                    <Input
                        id="webSite"
                        value={form.webSite ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, webSite: e.target.value }))}
                        placeholder="https://..."
                    />
                  </div>

                  {/* Autocomplete de institución */}
                  <div className="space-y-2">
                    <Label htmlFor="webSite">Institución</Label>

                    <AutocompleteInstitution
                        token={token}
                        apiFetch={apiFetch}
                        placeholder={isRestrictedInstitutionPick ? (userInstitutionName || "Tu institución") : "Buscar institución..."}
                        disabled={isRestrictedInstitutionPick}
                        value={instSearchText}
                        onChange={(t) => {
                          if (isRestrictedInstitutionPick) return; // bloquear edición
                          setInstSearchText(t);
                          setSelectedInstitutionId(null);
                        }}
                        onSelect={(item) => {
                          if (isRestrictedInstitutionPick) return; // bloquear selección
                          setInstSearchText(item.institutionName);
                          setSelectedInstitutionId(Number(item.id));
                        }}
                        minChars={1}
                    />

                  </div>

                  {/* Creator */}
                  <div className="space-y-1">
                    <Label>Creador</Label>
                    <div className="text-sm">{creatorDisplayName}</div>
                  </div>


                  <div className="flex gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={creating}>
                      {creating ? "Creando..." : "Crear colección"}
                    </Button>
                  </div>
                </form>
              {/*</Tabs>*/}
            </DialogContent>
          </Dialog>
        </div>

        {/* Mis colecciones */}
        {agentId && (
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl">Mis colecciones</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{myPage} / {myTotalPages}</span>
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
                  <p className="text-sm text-muted-foreground py-4">No tienes colecciones creadas.</p>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myItems.map((c) => (
                        <Card
                            key={c.id}
                            className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-primary/50"
                            onClick={() => goToCollectionDetail(c)}
                        >
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <Folder className="h-8 w-8 text-primary" />
                              <span className="text-sm bg-red-50 text-primary px-2 py-1 rounded">
                                {c.occurrencesCount} ocurrencias
                              </span>
                            </div>
                            <CardTitle className="truncate">{c.name ?? "(sin nombre)"}</CardTitle>
                            <CardDescription className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span className="truncate">{c.institutionName ?? "Sin institución"}</span>
                              {/* badge removido de aquí */}
                            </CardDescription>
                          </CardHeader>

                          <CardContent>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Shield className="h-4 w-4" />
                              <span>Tu rol:</span>
                              {c.my_role ? roleBadge(c.my_role) : (
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
              <span className="text-sm text-muted-foreground">{allowedPage} / {allowedTotalPages}</span>
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
                        key={c.id}
                        className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-primary/50"
                        onClick={() => goToCollectionDetail(c)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <Folder className="h-8 w-8 text-primary" />
                          <span className="text-sm bg-red-50 text-primary px-2 py-1 rounded">
                            {c.occurrencesCount} ocurrencias
                          </span>
                        </div>
                        <CardTitle className="truncate">{c.name ?? "(sin nombre)"}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span className="truncate">{c.institutionName ?? "Sin institución"}</span>
                          {/* badge quitado de aquí */}
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
