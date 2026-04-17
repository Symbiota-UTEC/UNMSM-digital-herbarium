import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
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
import {
  ArrowLeft,
  Eye,
  Leaf,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner@2.0.3";

import { useAuth } from "@contexts/AuthContext";
import { occurrencesService } from "@services/occurrences.service";
import { uploadService } from "@services/upload.service";
import type { OccurrenceItem } from "@interfaces/occurrence";

interface OccurrenceDetailPageProps {
  occurrenceId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
  returnTo?: "occurrences" | "collection";
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

type TabKey = "occurrence" | "event" | "location" | "taxon" | "images";

const TABS: { key: TabKey; label: string }[] = [
  { key: "occurrence", label: "Ocurrencia" },
  { key: "event", label: "Evento" },
  { key: "location", label: "Localización" },
  { key: "taxon", label: "Taxonomía" },
  { key: "images", label: "Imágenes" },
];

export function OccurrenceDetailPage({
  occurrenceId,
  onNavigate,
  returnTo = "occurrences",
  collectionId,
  collectionName,
  isOwner,
}: OccurrenceDetailPageProps) {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<OccurrenceItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("occurrence");
  const [pendingDeleteImageId, setPendingDeleteImageId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);

  const show = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  };

  useEffect(() => {
    let isMounted = true;
    const fetchOccurrence = async () => {
      try {
        setLoading(true);
        setError(null);
        const json = await occurrencesService.getById(apiFetch, occurrenceId);
        if (isMounted) setData(json);
      } catch (e: any) {
        if (isMounted) setError(e?.message || "Error al cargar la ocurrencia");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchOccurrence();
    return () => { isMounted = false; };
  }, [occurrenceId]);

  const currentIdentification = useMemo(() => {
    if (!data) return null;
    if (data.currentIdentification) return data.currentIdentification;
    if (data.identifications?.length) {
      return data.identifications.find((i) => i.isCurrent) ?? data.identifications[0];
    }
    return null;
  }, [data]);

  const sortedIdentifications = useMemo(() => {
    if (!data?.identifications) return [];
    return [...data.identifications].sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return da - db;
    });
  }, [data]);

  const sciName = useMemo(
    () => currentIdentification?.scientificName || "Sin nombre científico",
    [currentIdentification],
  );

  const sciAuth = useMemo(
    () => currentIdentification?.scientificNameAuthorship || "",
    [currentIdentification],
  );

  const handleBack = () => {
    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", {
        collectionId,
        collectionName: collectionName || "",
        isOwner: isOwner || false,
      });
    } else {
      onNavigate("occurrences");
    }
  };

  const handleEdit = () => {
    onNavigate("edit-occurrence", {
      occurrenceId,
      collectionId,
      collectionName,
      isOwner,
      returnTo,
    });
  };

  const handleDeleteImage = async () => {
    if (!pendingDeleteImageId) return;
    const imageId = pendingDeleteImageId;
    setPendingDeleteImageId(null);
    setDeletingImageId(imageId);
    try {
      await uploadService.deleteImage(apiFetch, imageId);
      setData((prev) =>
        prev
          ? { ...prev, images: (prev.images ?? []).filter((img) => img.occurrenceImageId !== imageId) }
          : prev
      );
      toast.success("Imagen eliminada");
    } catch {
      toast.error("No se pudo eliminar la imagen");
    } finally {
      setDeletingImageId(null);
    }
  };

  const goToTaxon = (taxonId?: string | null) => {
    if (!taxonId) return;
    onNavigate("taxon-detail", { taxonId });
  };

  /* ── Field row helper ── */
  const Field = ({ label, value, mono = false, italic = false }: { label: string; value: unknown; mono?: boolean; italic?: boolean }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={[mono ? "font-mono" : "", italic ? "italic" : "", "text-sm"].join(" ")}>
        {show(value)}
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="rounded-lg border bg-card p-8">
          <p className="text-center text-muted-foreground">Cargando información de la ocurrencia…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="rounded-lg border bg-card p-8">
          <p className="text-center text-red-600">
            No se pudo cargar la ocurrencia: {error || "Desconocido"}
          </p>
        </div>
      </div>
    );
  }

  /* ══ TAB RENDERERS ══ */

  const renderOccurrenceTab = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Número de catálogo" value={data.catalogNumber} />
        <Field label="Número de registro" value={data.recordNumber} />
        <Field label="Registrado por" value={data.recordedBy} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Cantidad de organismos</p>
          <p className="text-sm">
            {show(data.organismQuantity)}
            {data.organismQuantityType ? ` (${data.organismQuantityType})` : ""}
          </p>
        </div>
        <Field label="Estado de la ocurrencia" value={data.occurrenceStatus} />
        <Field label="Etapa de vida" value={data.lifeStage} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Medio de establecimiento" value={data.establishmentMeans} />
        <Field label="Taxa asociados" value={data.associatedTaxa} />
        <Field label="Colección" value={data.collection?.collectionName} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-1 md:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">Referencias asociadas</p>
          <p className="text-sm whitespace-pre-wrap">{show(data.associatedReferences)}</p>
        </div>
        <div className="space-y-1 md:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">Notas de campo</p>
          <p className="text-sm whitespace-pre-wrap">{show(data.fieldNotes)}</p>
        </div>
        <div className="space-y-1 md:col-span-1">
          <p className="text-xs font-medium text-muted-foreground">Observaciones de la ocurrencia</p>
          <p className="text-sm whitespace-pre-wrap">{show(data.occurrenceRemarks)}</p>
        </div>
      </div>

      {data.dynamicProperties && Object.keys(data.dynamicProperties).length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Propiedades adicionales
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.dynamicProperties)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => (
                <Badge key={k} variant="secondary" className="gap-1 text-xs font-normal">
                  <span className="font-mono font-medium">{k}</span>:{" "}
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </Badge>
              ))}
          </div>
        </div>
      )}

      <div className="flex gap-6 text-xs text-muted-foreground border-t pt-3">
        <span>Creado: {formatDateTime(data.createdAt as any)}</span>
        <span>Actualizado: {formatDateTime(data.updatedAt as any)}</span>
      </div>
    </div>
  );

  const renderEventTab = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <Field label="Fecha del evento (normalizada)" value={data.eventDate} />
        <Field label="Fecha original en etiqueta (verbatimEventDate)" value={data.verbatimEventDate} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Año" value={data.year} />
        <Field label="Mes" value={data.month} />
        <Field label="Día" value={data.day} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Hábitat</p>
        <p className="text-sm whitespace-pre-wrap">{show(data.habitat)}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Observaciones del evento</p>
        <p className="text-sm whitespace-pre-wrap">{show(data.eventRemarks)}</p>
      </div>
    </div>
  );

  const renderLocationTab = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">País</p>
          <p className="text-sm">
            {show(data.country)}
            {data.countryCode ? ` (${data.countryCode})` : ""}
          </p>
        </div>
        <Field label="Departamento / Región" value={data.stateProvince} />
        <Field label="Provincia" value={data.county} />
        <Field label="Distrito / Municipio" value={data.municipality} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Localidad" value={data.locality} />
        <Field label="Localidad en etiqueta (verbatimLocality)" value={data.verbatimLocality} />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Observaciones sobre la localización</p>
        <p className="text-sm whitespace-pre-wrap">{show(data.locationRemarks)}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Latitud decimal" value={data.decimalLatitude} mono />
        <Field label="Longitud decimal" value={data.decimalLongitude} mono />
        <Field label="Elevación en etiqueta" value={data.verbatimElevation} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Contexto hidrográfico" value={data.hydrographicContext} />
        <Field label="Estado de verificación de georreferenciación" value={data.georeferenceVerificationStatus} />
      </div>

      {data.footprintWKT && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Área de la ocurrencia (huella WKT)</p>
          <p className="text-xs font-mono break-all bg-muted/40 rounded p-2">{data.footprintWKT}</p>
        </div>
      )}
    </div>
  );

  const renderTaxonTab = () => (
    <div className="space-y-6">
      {sortedIdentifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta ocurrencia aún no tiene identificaciones registradas.</p>
      ) : (
        <div className="space-y-3">
          {sortedIdentifications.map((ident) => (
            <div
              key={ident.identificationId}
              className="rounded-lg border bg-muted/20 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold italic leading-tight">
                    {show(ident.scientificName)}
                  </p>
                  {ident.scientificNameAuthorship && (
                    <p className="text-xs text-muted-foreground">{ident.scientificNameAuthorship}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {ident.isCurrent ? (
                    <Badge className="bg-green-100 text-green-800 text-[11px] font-medium rounded-full px-2 py-0.5">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Vigente
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-medium rounded-full px-2 py-0.5">
                      <XCircle className="h-3 w-3 mr-1" />
                      No vigente
                    </Badge>
                  )}
                  {ident.isVerified ? (
                    <Badge className="bg-blue-100 text-blue-800 text-[11px] font-medium rounded-full px-2 py-0.5">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Verificada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] font-medium rounded-full px-2 py-0.5">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      No verificada
                    </Badge>
                  )}
                  {ident.taxon?.taxonId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => goToTaxon(ident.taxon?.taxonId)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ver taxón
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-xs">
                {ident.typeStatus && (
                  <div>
                    <span className="text-muted-foreground">Estado de tipo: </span>
                    <span className="font-medium">{ident.typeStatus}</span>
                  </div>
                )}
                {ident.dateIdentified && (
                  <div>
                    <span className="text-muted-foreground">Fecha: </span>
                    <span className="font-medium">{ident.dateIdentified}</span>
                  </div>
                )}
              </div>

              {ident.identifiers && ident.identifiers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ident.identifiers.map((idn) => (
                    <Badge key={idn.identifierId} variant="secondary" className="text-xs">
                      {idn.fullName ?? idn.orcID ?? "—"}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground/80">
                Creado: {formatDateTime(ident.createdAt)} · Actualizado: {formatDateTime(ident.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderImagesTab = () => (
    <div className="space-y-4">
      {data.images && data.images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {data.images.map((img) => {
            const isDeleting = deletingImageId === img.occurrenceImageId;
            return (
              <div key={img.occurrenceImageId} className="relative group rounded-lg overflow-hidden border bg-muted/20">
                <img
                  src={uploadService.imageUrl(img.occurrenceImageId)}
                  alt="Imagen de ocurrencia"
                  className={`w-full h-48 object-contain bg-muted/30 transition-opacity ${isDeleting ? "opacity-40" : ""}`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
                  }}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />
                {isOwner && (
                  <button
                    type="button"
                    disabled={isDeleting || !!deletingImageId}
                    onClick={() => setPendingDeleteImageId(img.occurrenceImageId)}
                    className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Eliminar imagen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                )}
                {img.photographer && (
                  <div className="px-2 py-1 text-xs bg-background border-t truncate">
                    <span className="text-muted-foreground">Fotógrafo: </span>{img.photographer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Esta ocurrencia no tiene imágenes asociadas.</p>
      )}
    </div>
  );

  /* ══ MAIN RENDER ══ */
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo === "collection" ? `Volver a ${collectionName}` : "Volver a ocurrencias"}
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Leaf className="h-8 w-8 text-primary mt-1 flex-shrink-0" />
            <div>
              <h1 className="text-3xl mb-1 italic">{sciName}</h1>
              {sciAuth && <p className="text-muted-foreground text-sm">{sciAuth}</p>}
              <div className="flex gap-2 mt-2 flex-wrap text-sm text-muted-foreground">
                <span>Catálogo: {show(data.catalogNumber)}</span>
                {data.collection?.collectionName && (
                  <>
                    <span>•</span>
                    <span>Colección: {data.collection.collectionName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isOwner && (
            <Button
              type="button"
              style={{ backgroundColor: "rgb(117,26,29)", color: "white" }}
              className="flex-shrink-0 hover:opacity-90 transition-opacity"
              onClick={handleEdit}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="mb-6">
        <div className="flex gap-1.5 bg-muted rounded-xl p-1.5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex-1 min-w-fit px-5 py-2.5 text-sm whitespace-nowrap rounded-lg transition-all duration-200",
                activeTab === tab.key
                  ? "bg-white text-[rgb(117,26,29)] font-semibold shadow-sm"
                  : "font-medium text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
              {tab.key === "taxon" && sortedIdentifications.length > 0 && (
                <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
              {tab.key === "images" && data.images && data.images.length > 0 && (
                <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-400" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="rounded-lg border bg-card mb-8" style={{ padding: "2rem 3rem" }}>
        {activeTab === "occurrence" && renderOccurrenceTab()}
        {activeTab === "event" && renderEventTab()}
        {activeTab === "location" && renderLocationTab()}
        {activeTab === "taxon" && renderTaxonTab()}
        {activeTab === "images" && renderImagesTab()}
      </div>

      <AlertDialog
        open={!!pendingDeleteImageId}
        onOpenChange={(open: boolean) => { if (!open) setPendingDeleteImageId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar imagen?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La imagen será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteImage}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
