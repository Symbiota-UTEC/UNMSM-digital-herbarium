import { useCallback, useEffect, useState, type BaseSyntheticEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Plus, Folder, Users, Shield, Eye } from "lucide-react";
import { FiltersCard } from "../ui/filters";
import { DataTable, type ColumnDef } from "../ui/data-table";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import { AutocompleteInstitution } from "../AutocompleteInstitution";
import { Role } from "@constants/roles";
import { CollectionAccess, EffectiveRole } from "@constants/enums";
import { collectionsService } from "@services/collections.service";
import { CollectionCreate, CollectionListItem, toCollectionListItem } from "@interfaces/collection";

type CollectionsPageProps = {
  onNavigate: (page: string, params?: any) => void;
};

const ROLE_BADGE: Record<EffectiveRole, { label: string; className: string }> = {
  [EffectiveRole.Superuser]: { label: "Superuser", className: "bg-purple-100 text-purple-800" },
  [EffectiveRole.InstitutionAdmin]: { label: "Admin institución", className: "bg-orange-100 text-orange-800" },
  [EffectiveRole.Owner]: { label: "Propietario", className: "bg-blue-100 text-blue-800" },
  [EffectiveRole.Editor]: { label: "Editor", className: "bg-green-50 text-green-700" },
  [EffectiveRole.Viewer]: { label: "Lector", className: "bg-gray-100 text-gray-800" },
};

export function CollectionsPage({ onNavigate }: CollectionsPageProps) {
  const { user, apiFetch, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSuper = user?.role === Role.Admin;
  const isRestrictedInstitutionPick = !isSuper;
  const userInstitutionId = user?.institutionId ?? null;
  const userInstitutionName = user?.institution || "";
  const creatorDisplayName = user?.username || user?.email || "Desconocido";
  const userId = user?.userId ?? null;

  const collectionsPerPage = PAGE_SIZE.COLLECTIONS;

  const [filterAccess, setFilterAccess] = useState<CollectionAccess>(
    () => (searchParams.get("access") as CollectionAccess) ?? CollectionAccess.Owner,
  );
  const [access, setAccess] = useState<CollectionAccess>(
    () => (searchParams.get("access") as CollectionAccess) ?? CollectionAccess.Owner,
  );
  const [items, setItems] = useState<CollectionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [totalPages, setTotalPages] = useState(1);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [instSearchText, setInstSearchText] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const [form, setForm] = useState<CollectionCreate>({ collectionName: "", description: "" });

  const fetchCollections = useCallback(
    async (currentAccess: CollectionAccess, currentPage: number) => {
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
    [apiFetch, collectionsPerPage],
  );

  const syncURL = (currentAccess: CollectionAccess, pageNum: number) => {
    const p = new URLSearchParams();
    if (currentAccess !== CollectionAccess.Owner) p.set("access", currentAccess);
    if (pageNum > 1) p.set("page", String(pageNum));
    setSearchParams(p, { replace: true });
  };

  const handleApplyFilters = () => {
    setAccess(filterAccess);
    setPage(1);
    syncURL(filterAccess, 1);
  };
  const handleClearFilters = () => {
    setFilterAccess(CollectionAccess.Owner);
    setAccess(CollectionAccess.Owner);
    setPage(1);
    setSearchParams({}, { replace: true });
  };
  const filtersActive = true; // access filter always has an active value

  useEffect(() => {
    fetchCollections(access, page);
  }, [access, page, fetchCollections]);

  const resetForm = () => {
    setForm({ collectionName: "", description: "" });
    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId ?? null);
      setInstSearchText(userInstitutionName);
    } else {
      setSelectedInstitutionId(null);
      setInstSearchText("");
    }
  };

  useEffect(() => {
    if (isRestrictedInstitutionPick) {
      setSelectedInstitutionId(userInstitutionId ?? null);
      setInstSearchText(userInstitutionName);
    }
  }, [isRestrictedInstitutionPick, userInstitutionId, userInstitutionName, open]);

  const handleCreate = async (e: BaseSyntheticEvent) => {
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
    });
  };

  const extraColumns: ColumnDef<CollectionListItem>[] =
    access === CollectionAccess.Allowed
      ? [
          {
            key: "creator",
            header: "Creador",
            cell: (c) => <span className="text-sm text-muted-foreground">{c.creatorName ?? "—"}</span>,
          },
        ]
      : [];

  const columns: ColumnDef<CollectionListItem>[] = [
    {
      key: "name",
      header: "Colección",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate max-w-[200px]">{c.name ?? "(sin nombre)"}</span>
        </div>
      ),
    },
    {
      key: "institution",
      header: "Institución",
      cell: (c) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[180px]">{c.institutionName ?? "—"}</span>
        </div>
      ),
    },
    ...extraColumns,
    {
      key: "count",
      header: "Ocurrencias",
      cell: (c) => (
        <Badge variant="outline" className="text-xs tabular-nums">
          {c.occurrencesCount}
        </Badge>
      ),
    },
    {
      key: "role",
      header: "Rol",
      cell: (c) => {
        const badge = c.my_role ? ROLE_BADGE[c.my_role] : null;
        return badge ? (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
        ) : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span className="italic">Sin rol</span>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Acciones",
      cell: (c) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e: ReactMouseEvent) => {
            e.stopPropagation();
            goToCollectionDetail(c);
          }}
          title="Ver colección"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center">
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
                  apiFetch={apiFetch}
                  placeholder={
                    isRestrictedInstitutionPick ? userInstitutionName || "Tu institución" : "Buscar institución..."
                  }
                  disabled={isRestrictedInstitutionPick}
                  value={instSearchText}
                  onChange={(t) => {
                    if (isRestrictedInstitutionPick) return;
                    setInstSearchText(t);
                    setSelectedInstitutionId(null);
                  }}
                  onSelect={(item) => {
                    if (isRestrictedInstitutionPick) return;
                    setInstSearchText(item.institutionName ?? "");
                    setSelectedInstitutionId(item.institutionId ?? null);
                  }}
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

      <FiltersCard
        title="Filtrar colecciones"
        description="Selecciona el tipo de acceso para ver las colecciones correspondientes."
        filtersActive={filtersActive}
        onClear={handleClearFilters}
        onApply={handleApplyFilters}
        loading={loading}
      >
        <div className="flex items-center gap-3">
          <Label className="text-xs font-semibold text-foreground whitespace-nowrap">Tipo de Acceso</Label>
          <Select value={filterAccess} onValueChange={(v: string) => setFilterAccess(v as CollectionAccess)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CollectionAccess.Owner}>Propietario</SelectItem>
              <SelectItem value={CollectionAccess.Allowed}>Permitido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FiltersCard>

      <DataTable<CollectionListItem>
        title="Listado de colecciones"
        description="Colecciones visibles para tu usuario según el tipo de acceso."
        columns={columns}
        data={items}
        keyExtractor={(row) => row.collectionId}
        loading={loading}
        emptyMessage={
          access === CollectionAccess.Owner ? "No tienes colecciones creadas." : "No hay colecciones para mostrar."
        }
        page={page}
        totalPages={totalPages}
        onPrevPage={() => {
          setPage((p) => {
            syncURL(access, p - 1);
            return p - 1;
          });
        }}
        onNextPage={() => {
          setPage((p) => {
            syncURL(access, p + 1);
            return p + 1;
          });
        }}
        onRowClick={goToCollectionDetail}
      />
    </div>
  );
}
