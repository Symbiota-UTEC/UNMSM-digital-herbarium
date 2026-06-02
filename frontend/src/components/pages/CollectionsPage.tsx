import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Plus, Folder, Users, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { toast } from "sonner";
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

type AccessFilter = "owner" | "allowed";

type CollectionsPageProps = {
  onNavigate: (page: string, params?: any) => void;
};

export function CollectionsPage({ onNavigate }: CollectionsPageProps) {
  const { user, apiFetch, token } = useAuth() as any;

  const isSuper = user?.role === Role.Admin;
  const isRestrictedInstitutionPick = !isSuper;
  const userInstitutionId = user?.institutionId != null ? Number(user.institutionId) : null;
  const userInstitutionName = user?.institution || "";
  const creatorDisplayName = user?.username || user?.email || "Desconocido";
  const userId = user?.userId ?? null;

  const collectionsPerPage = PAGE_SIZE.COLLECTIONS;

  // ------- Estado unificado -------
  const [access, setAccess] = useState<AccessFilter>("owner");
  const [items, setItems] = useState<CollectionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ------- Diálogo de creación -------
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [instSearchText, setInstSearchText] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [form, setForm] = useState<CollectionCreate>({ collectionName: "", description: "" });
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // ------- Fetch único -------
  const fetchCollections = useCallback(
    async (currentAccess: AccessFilter, currentPage: number) => {
      try {
        setLoading(true);
        const data = await collectionsService.getCollections(apiFetch, currentAccess, currentPage, collectionsPerPage);
        setItems(data.items.map(toCollectionListItem));
        setTotalPages(data.totalPages ?? 1);
      } catch (e) {
        console.error(e);
        toast.error("No se pudieron cargar las colecciones");
        setItems([]);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, collectionsPerPage]
  );

  // Reiniciar página al cambiar filtro
  const handleAccessChange = (value: AccessFilter) => {
    setAccess(value);
    setPage(1);
  };

  useEffect(() => {
    fetchCollections(access, page);
  }, [access, page, fetchCollections]);

  // ------- Helpers UI -------
  const roleBadge = (role?: string | null) => {
    if (!role) return null;
    const map: Record<string, string> = {
      superuser: "bg-purple-100 text-purple-800",
      institution_admin: "bg-orange-100 text-orange-800",
      owner: "bg-blue-100 text-blue-800",
      editor: "bg-emerald-100 text-emerald-800",
      viewer: "bg-gray-100 text-gray-800",
    };
    const label: Record<string, string> = {
      superuser: "Superuser",
      institution_admin: "Admin institución",
      owner: "Propietario",
      editor: "Editor",
      viewer: "Lector",
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${map[role] ?? "bg-gray-100 text-gray-800"}`}>
        {label[role] ?? role}
      </span>
    );
  };

  const canManageCollection = (c: CollectionListItem) => {
    const isInstAdminSameInst =
      user?.role === Role.InstitutionAdmin &&
      Number(user?.institutionId) === Number(c.institutionId);
    return isSuper || isInstAdminSameInst || c.my_role === "owner";
  };

  // ------- Form -------
  const resetForm = () => {
    setForm({ collectionName: "", description: "" });
    setCsvFile(null);
    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId != null ? String(userInstitutionId) : null);
      setInstSearchText(userInstitutionName || (userInstitutionId ? `Institución #${userInstitutionId}` : ""));
    } else {
      setSelectedInstitutionId(null);
      setInstSearchText("");
    }
  };

  useEffect(() => {
    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId != null ? String(userInstitutionId) : null);
      setInstSearchText(userInstitutionName || (userInstitutionId ? `Institución #${userInstitutionId}` : ""));
    }
  }, [isRestrictedInstitutionPick, userInstitutionId, userInstitutionName, open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!form.collectionName?.trim()) { toast.error("Ingresa un nombre de colección"); return; }
    if (!selectedInstitutionId) { toast.error("Selecciona una institución"); return; }
    if (!userId) { toast.error("No se encontró tu ID de usuario"); return; }

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
      setPage(1);
      fetchCollections(access, 1);
    } catch (e) {
      console.error(e);
      toast.error("Error creando la colección");
    } finally {
      setCreating(false);
    }
  };

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
          <h1 className="text-3xl font-semibold tracking-tight mb-2">Colecciones</h1>
          <p className="text-sm text-muted-foreground">
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

            <div className="rounded-lg bg-blue-50 p-4 my-4">
              <div className="flex items-start gap-3">
                <Folder className="h-5 w-5 text-blue-600 mt-0.5" />
                <h4 className="text-sm text-blue-900">Metadatos</h4>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
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

              <div className="space-y-2">
                <Label htmlFor="institution">Institución</Label>
                <AutocompleteInstitution
                  token={token}
                  apiFetch={apiFetch}
                  placeholder={isRestrictedInstitutionPick ? userInstitutionName || "Tu institución" : "Buscar institución..."}
                  disabled={isRestrictedInstitutionPick}
                  value={instSearchText}
                  onChange={(t) => { if (isRestrictedInstitutionPick) return; setInstSearchText(t); setSelectedInstitutionId(null); }}
                  onSelect={(item) => { if (isRestrictedInstitutionPick) return; setInstSearchText(item.institutionName ?? ""); setSelectedInstitutionId(item.institutionId ?? null); }}
                  minChars={1}
                />
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
          </DialogContent>
        </Dialog>
      </div>

      {/* Selector de tipo de acceso + paginación */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Tipo de Acceso
          </Label>
          <Select value={access} onValueChange={(v) => handleAccessChange(v as AccessFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Propietario</SelectItem>
              <SelectItem value="allowed">Permitido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-9 w-9 rounded-full"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-9 w-9 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {access === "owner" ? "No tienes colecciones creadas." : "No hay colecciones para mostrar."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <Card
              key={c.collectionId}
              className="hover:shadow-lg transition-all cursor-pointer h-full border-2 hover:border-primary/50"
              onClick={() => goToCollectionDetail(c)}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <Folder className="h-8 w-8 text-primary shrink-0" />
                  <span
                    className="inline-flex items-center justify-center rounded-full bg-red-50 text-primary tabular-nums px-2 py-0.5 leading-none text-xs max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap font-normal"
                    title={`${c.occurrencesCount} ocurrencias`}
                  >
                    {c.occurrencesCount} ocurrencias
                  </span>
                </div>

                <CardTitle className="truncate">{c.name ?? "(sin nombre)"}</CardTitle>

                <CardDescription className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.institutionName ?? "Sin institución"}</span>
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                {access === "allowed" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="truncate">Creador: {c.creatorName ?? "Desconocido"}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>Tu rol:</span>
                  {c.my_role ? roleBadge(c.my_role) : <span className="italic">Sin rol específico</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
