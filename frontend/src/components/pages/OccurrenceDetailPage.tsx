import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { FieldSectionHeader, ReadOnlyField } from "../ui/field-section";
import { ArrowLeft, Eye, Leaf, CheckCircle, XCircle, AlertCircle, Pencil } from "lucide-react";

import { useAuth } from "@contexts/AuthContext";
import { occurrencesService } from "@services/occurrences.service";
import { uploadService } from "@services/upload.service";
import type { OccurrenceItem } from "@interfaces/occurrence";
import { OccurrenceLocationMap } from "../OccurrenceLocationMap";
import { ImageLightbox } from "../ImageLightbox";
import { OccurrenceTabsNav } from "../OccurrenceTabsNav";
import { DwcGlossaryDialog } from "../DwcGlossaryDialog";
import {
  tabCompletionStatus,
  type OccurrenceTabKey as TabKey,
  type TabCompletionStatus,
} from "@constants/occurrenceTabs";
import { IDENTIFICATION_STATUS_COLORS } from "@constants/identificationStatus";
import { formatDateTime } from "@utils/dates";
import "../image-manager.css";

interface OccurrenceDetailPageProps {
  occurrenceId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
  returnTo?: "occurrences" | "collection" | "taxon" | "map";
  /** Solo para volver a la colección de origen; el nombre y los permisos vienen de la API. */
  collectionId?: string;
  taxonId?: string;
}

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function OccurrenceDetailPage({
  occurrenceId,
  onNavigate,
  returnTo = "occurrences",
  collectionId: collectionIdProp,
  taxonId,
}: OccurrenceDetailPageProps) {
  const { apiFetch } = useAuth();
  const [data, setData] = useState<OccurrenceItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("occurrence");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const collectionId = collectionIdProp ?? data?.collection?.collectionId;
  const canEdit = data?.collection?.canEdit ?? false;

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
    return () => {
      isMounted = false;
    };
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

  const sciAuth = useMemo(() => currentIdentification?.scientificNameAuthorship || "", [currentIdentification]);

  const handleBack = () => {
    if (returnTo === "taxon" && taxonId) {
      onNavigate("taxon-detail", { taxonId });
    } else if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", { collectionId });
    } else if (returnTo === "map") {
      onNavigate("map", { restoreSearch: true });
    } else {
      onNavigate("occurrences");
    }
  };

  const handleEdit = () => {
    onNavigate("edit-occurrence", { occurrenceId, collectionId, returnTo, taxonId });
  };

  const goToTaxon = (taxonId?: string | null) => {
    if (!taxonId) return;
    onNavigate("taxon-detail", {
      taxonId,
      returnTo: "occurrence-detail",
      originReturnTo: returnTo,
      returnOccurrenceId: occurrenceId,
      collectionId,
    });
  };

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
          <p className="text-center text-red-600">No se pudo cargar la ocurrencia: {error || "Desconocido"}</p>
        </div>
      </div>
    );
  }

  const catalogLabel = [data.collection?.institution?.institutionCode, data.catalogNumber]
    .filter(Boolean)
    .join(" ");

  // Mismo criterio que NewOccurrencePage.tsx (misma función compartida), pero contra lo ya
  // guardado en vez del estado editado: para que ambas vistas de una ocurrencia coincidan.
  const TAB_STATUSES: Record<TabKey, TabCompletionStatus> = {
    occurrence: tabCompletionStatus(!!data.catalogNumber, !!data.recordedBy && !!data.occurrenceStatus),
    event: tabCompletionStatus(true, !!data.eventDate),
    location: tabCompletionStatus(true, !!data.locality),
    taxon: tabCompletionStatus(sortedIdentifications.length > 0, true),
    images: tabCompletionStatus(true, !!data.images && data.images.length > 0),
  };

  /* ══ TAB RENDERERS ══ */

  const renderOccurrenceTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Identificación del Ejemplar" subtitle="Campos clave para trazabilidad" />
          <div className="grid md:grid-cols-3 gap-4">
            <ReadOnlyField label="Número de catálogo" value={catalogLabel} />
            <ReadOnlyField label="Número de registro" value={data.recordNumber} />
            <ReadOnlyField label="Registrado por" value={data.recordedBy} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Estado y Cuantificación" subtitle="Atributos biológicos y preservación" />
          <div className="grid md:grid-cols-3 gap-4">
            <ReadOnlyField
              label="Cantidad de organismos"
              value={`${show(data.organismQuantity)}${data.organismQuantityType ? ` (${data.organismQuantityType})` : ""}`}
            />
            <ReadOnlyField label="Estado de la ocurrencia" value={data.occurrenceStatus} />
            <ReadOnlyField label="Etapa de vida" value={data.lifeStage} />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <ReadOnlyField label="Medio de establecimiento" value={data.establishmentMeans} />
            <ReadOnlyField label="Taxa asociados" value={data.associatedTaxa} />
            <ReadOnlyField label="Colección" value={data.collection?.collectionName} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Notas y Observaciones" subtitle="Documentación de libreta" />
          <div className="grid md:grid-cols-3 gap-4">
            <ReadOnlyField label="Referencias asociadas" value={data.associatedReferences} />
            <ReadOnlyField label="Notas de campo" value={data.fieldNotes} />
            <ReadOnlyField label="Observaciones de la ocurrencia" value={data.occurrenceRemarks} />
          </div>
        </CardContent>
      </Card>

      {data.dynamicProperties && Object.keys(data.dynamicProperties).length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <FieldSectionHeader
              title="Propiedades Adicionales"
              subtitle="Atributos libres sin un campo Darwin Core dedicado"
            />
            <div className="space-y-2">
              {Object.entries(data.dynamicProperties)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold flex-shrink-0">{k}</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border bg-muted/20 px-4 py-3 flex flex-wrap gap-6 text-xs text-muted-foreground">
        <span>Creado: {formatDateTime(data.createdAt as any)}</span>
        <span>Actualizado: {formatDateTime(data.updatedAt as any)}</span>
      </div>
    </div>
  );

  const renderEventTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Fecha del Evento" subtitle="Cuándo se recolectó el ejemplar" />
          <div className="grid md:grid-cols-2 gap-4">
            <ReadOnlyField label="Fecha del evento (normalizada)" value={data.eventDate} />
            <ReadOnlyField label="Fecha original en etiqueta" value={data.verbatimEventDate} />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <ReadOnlyField label="Año" value={data.year} />
            <ReadOnlyField label="Mes" value={data.month} />
            <ReadOnlyField label="Día" value={data.day} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Hábitat y Observaciones" subtitle="Contexto ecológico del hallazgo" />
          <div className="grid md:grid-cols-2 gap-4">
            <ReadOnlyField label="Hábitat" value={data.habitat} />
            <ReadOnlyField label="Observaciones del evento" value={data.eventRemarks} />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderLocationTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Ubicación en el Mapa" subtitle="Punto o área registrada" />
          <OccurrenceLocationMap
            lat={data.decimalLatitude}
            lon={data.decimalLongitude}
            footprintWKT={data.footprintWKT}
            uncertaintyMeters={data.coordinateUncertaintyInMeters}
          />
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <ReadOnlyField label="Latitud decimal" value={data.decimalLatitude} />
            <ReadOnlyField label="Longitud decimal" value={data.decimalLongitude} />
            <ReadOnlyField
              label="Incertidumbre de la coordenada"
              value={data.coordinateUncertaintyInMeters != null ? `${data.coordinateUncertaintyInMeters} m` : null}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="División Administrativa" subtitle="País, departamento, provincia y distrito" />
          <div className="grid md:grid-cols-4 gap-4">
            <ReadOnlyField
              label="País"
              value={`${show(data.country)}${data.countryCode ? ` (${data.countryCode})` : ""}`}
            />
            <ReadOnlyField label="Departamento / Región" value={data.stateProvince} />
            <ReadOnlyField label="Provincia" value={data.county} />
            <ReadOnlyField label="Distrito / Municipio" value={data.municipality} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Localidad y Contexto" subtitle="Descripción del sitio y su verificación" />
          <div className="grid md:grid-cols-3 gap-4">
            <ReadOnlyField label="Localidad" value={data.locality} />
            <ReadOnlyField label="Localidad en etiqueta" value={data.verbatimLocality} />
            <ReadOnlyField label="Estado de verificación" value={data.georeferenceVerificationStatus} />
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <ReadOnlyField label="Elevación en etiqueta" value={data.verbatimElevation} />
            <ReadOnlyField label="Observaciones sobre la localización" value={data.locationRemarks} />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTaxonTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Identificaciones" subtitle="Historial de identificaciones de este ejemplar" />
          {sortedIdentifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta ocurrencia aún no tiene identificaciones registradas.</p>
          ) : (
            <div className="space-y-3">
              {sortedIdentifications.map((ident) => (
                <div key={ident.identificationId} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold italic leading-tight">{show(ident.scientificName)}</p>
                      {ident.scientificNameAuthorship && (
                        <p className="text-xs text-muted-foreground">{ident.scientificNameAuthorship}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ident.isCurrent ? (
                        <Badge
                          className="font-medium rounded-full px-2 py-0.5"
                          style={{ ...IDENTIFICATION_STATUS_COLORS.current, fontSize: "11px" }}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Vigente
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="font-medium rounded-full px-2 py-0.5"
                          style={{ fontSize: "11px" }}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          No vigente
                        </Badge>
                      )}
                      {ident.identificationVerificationStatus && (
                        <Badge
                          className="font-medium rounded-full px-2 py-0.5"
                          style={{ ...IDENTIFICATION_STATUS_COLORS.verification, fontSize: "11px" }}
                        >
                          {ident.identificationVerificationStatus}
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
        </CardContent>
      </Card>
    </div>
  );

  /* Solo lectura: las imágenes se eliminan o corrigen desde "Editar". */
  const renderImagesTab = () => {
    const images = (data.images ?? []).map((img) => ({
      id: img.occurrenceImageId,
      src: uploadService.imageUrl(img.occurrenceImageId),
      name: (img.imagePath.split("/").pop() ?? "").replace(/^[0-9a-f-]{36}_/, ""),
      photographer: img.photographer,
    }));

    return (
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title={`Imágenes (${images.length})`} subtitle="Fotografías del ejemplar" />
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta ocurrencia no tiene imágenes asociadas.</p>
          ) : (
            <>
              <div className="hb-image-grid">
                {images.map((img, i) => (
                  <div key={img.id} className="hb-image-card">
                    <div className="hb-image-thumb">
                      <img src={img.src} alt={img.name || "Imagen de la ocurrencia"} loading="lazy" />
                      <button
                        type="button"
                        className="hb-image-view"
                        onClick={() => setViewerIndex(i)}
                        title="Ver en pantalla completa"
                        aria-label="Ver en pantalla completa"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="hb-image-body">
                      <div className="hb-image-meta">
                        <span className="hb-image-name" title={img.name}>
                          {img.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fotógrafo/a:{" "}
                        {img.photographer ? (
                          <span className="text-foreground">{img.photographer}</span>
                        ) : (
                          <span className="italic">no indicado</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <ImageLightbox
                images={images.map((img) => ({
                  src: img.src,
                  title: img.name || "Imagen de la ocurrencia",
                  caption: img.photographer ? `Fotógrafo/a: ${img.photographer}` : undefined,
                }))}
                index={viewerIndex}
                onIndexChange={setViewerIndex}
                onClose={() => setViewerIndex(null)}
              />
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  /* ══ MAIN RENDER ══ */
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo === "collection"
            ? "Volver a Colección"
            : returnTo === "map"
              ? "Volver al Mapa"
              : "Volver a Ocurrencias"}
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Leaf className="h-8 w-8 text-primary mt-1 flex-shrink-0" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight mb-1 italic">{sciName}</h1>
              {sciAuth && <p className="text-sm text-muted-foreground">{sciAuth}</p>}
              <div className="flex gap-2 mt-2 flex-wrap text-sm text-muted-foreground">
                <span>Catálogo: {show(catalogLabel)}</span>
                {data.collection?.collectionName && (
                  <>
                    <span>•</span>
                    <span>Colección: {data.collection.collectionName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <DwcGlossaryDialog />
            {canEdit && (
              <Button
                type="button"
                style={{ backgroundColor: "rgb(117,26,29)", color: "white" }}
                className="hover:opacity-90 transition-opacity"
                onClick={handleEdit}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <OccurrenceTabsNav activeTab={activeTab} onTabChange={setActiveTab} statuses={TAB_STATUSES} />

      {/* Tab content */}
      <div className="rounded-lg border bg-card mb-8" style={{ padding: "2rem 3rem" }}>
        {activeTab === "occurrence" && renderOccurrenceTab()}
        {activeTab === "event" && renderEventTab()}
        {activeTab === "location" && renderLocationTab()}
        {activeTab === "taxon" && renderTaxonTab()}
        {activeTab === "images" && renderImagesTab()}
      </div>
    </div>
  );
}
