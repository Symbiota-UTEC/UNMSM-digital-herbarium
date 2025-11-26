import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { ArrowLeft } from "lucide-react";

import { API } from "@constants/api";
import { useAuth } from "@contexts/AuthContext";
import type { OccurrenceItem } from "@interfaces/occurrence";

interface OccurrenceDetailPageProps {
  occurrenceId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
  returnTo?: "occurrences" | "collection";
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

export function OccurrenceDetailPage({
  occurrenceId,
  onNavigate,
  returnTo = "occurrences",
  collectionId,
  collectionName,
  isOwner,
}: OccurrenceDetailPageProps) {
  const { token } = useAuth();
  const [data, setData] = useState<OccurrenceItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const RenderDynValue = ({ value }: { value: any }) => {
    if (value === null || value === undefined) return <span>—</span>;

    switch (typeof value) {
      case "boolean":
        return (
          <Badge
            variant="secondary"
            className="text-[11px] px-2 py-0.5 rounded-full"
          >
            {value ? "Sí" : "No"}
          </Badge>
        );
      case "number":
        return <span className="font-mono">{value}</span>;
      case "string":
        return <span className="break-words">{value}</span>;
      default: {
        return (
          <details className="rounded-md bg-muted/40 p-3">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none">
              Ver detalle
            </summary>
            <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-auto max-h-64">
              {JSON.stringify(value, null, 2)}
            </pre>
          </details>
        );
      }
    }
  };

  const show = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-PE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  useEffect(() => {
    let isMounted = true;

    const fetchOccurrence = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `${API.BASE_URL}${API.PATHS.OCCURRENCE_BY_ID(
          occurrenceId,
        )}`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, { headers, credentials: "include" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Error ${res.status}: ${txt || res.statusText}`);
        }
        const json = (await res.json()) as OccurrenceItem;

        if (isMounted) setData(json);
      } catch (e: any) {
        if (isMounted)
          setError(e?.message || "Error al cargar la ocurrencia");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOccurrence();
    return () => {
      isMounted = false;
    };
  }, [occurrenceId, token]);

  // Identificación vigente
  const currentIdentification = useMemo(() => {
    if (!data) return null;
    if (data.currentIdentification) return data.currentIdentification;
    if (data.identifications?.length) {
      const current = data.identifications.find((i: any) => i.isCurrent);
      return current ?? data.identifications[0];
    }
    return null;
  }, [data]);

  // Todas las identificaciones ordenadas
  const sortedIdentifications = useMemo(() => {
    if (!data?.identifications) return [];
    return [...data.identifications].sort((a: any, b: any) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (da !== db) return da - db;
      return (a.id ?? 0) - (b.id ?? 0);
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <p className="text-sm text-muted-foreground">
          Cargando ocurrencia...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <p className="text-sm text-red-600">
          No se pudo cargar la ocurrencia: {error || "Desconocido"}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Volver */}
      <div className="mb-6">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo === "collection"
            ? `Volver a ${collectionName}`
            : "Volver a ocurrencias"}
        </Button>

        {/* Encabezado */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 italic">
              {sciName}
            </h1>
            {sciAuth && (
              <p className="text-sm text-muted-foreground mb-1">
                {sciAuth}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Código de catálogo: {show(data.catalogNumber)} • Colección:{" "}
              {show(data.collection?.collectionName)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Colección y registro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Colección y registro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Colección
                  </p>
                  <p>{show(data.collection?.collectionName)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Código de colección
                  </p>
                  <p>{show(data.collection?.collectionCode)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Número de catálogo
                  </p>
                  <p>{show(data.catalogNumber)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Número de colecta (recordNumber)
                  </p>
                  <p>{show(data.recordNumber)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Registrado por (etiqueta)
                  </p>
                  <p>{show(data.recordedBy)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Otros números de catálogo
                  </p>
                  <p>{show(data.otherCatalogNumbers)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Cantidad de organismos
                  </p>
                  <p>
                    {show(data.organismQuantity)}{" "}
                    {data.organismQuantityType
                      ? `(${data.organismQuantityType})`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Estado de verificación de georreferenciación
                  </p>
                  <p>{show(data.georeferenceVerificationStatus)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Creado en</p>
                  <p>{formatDateTime(data.createdAt as any)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    Última actualización
                  </p>
                  <p>{formatDateTime(data.updatedAt as any)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2. Evento de colecta y proyecto */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Evento de colecta y proyecto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Fecha en la etiqueta (verbatim)
                  </p>
                  <p>{show(data.verbatimEventDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Fecha normalizada
                  </p>
                  <p>{show(data.eventDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Año / mes / día
                  </p>
                  <p>
                    {show(data.year)}/{show(data.month)}/{show(data.day)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Título del proyecto o campaña
                  </p>
                  <p>{show(data.projectTitle)}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Tamaño de muestra
                  </p>
                  <p>
                    {show(data.sampleSizeValue)}{" "}
                    {data.sampleSizeUnit ? `(${data.sampleSizeUnit})` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Identificador de proyecto
                  </p>
                  <p>{show(data.projectID)}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Atribución de financiamiento
                  </p>
                  <p>{show(data.fundingAttribution)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Identificador de financiamiento
                  </p>
                  <p>{show(data.fundingAttributionID)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Hábitat
                </p>
                <p>{show(data.habitat)}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Notas del evento de colecta
                </p>
                <p>{show(data.eventRemarks)}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Notas de campo
                </p>
                <p>{show(data.fieldNotes)}</p>
              </div>
            </CardContent>
          </Card>

          {/* 3. Localización */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Localización
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    País
                  </p>
                  <p>{show(data.country)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Código de país (ISO)
                  </p>
                  <p>{show(data.countryCode)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Departamento o región
                  </p>
                  <p>{show(data.stateProvince)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Provincia
                  </p>
                  <p>{show(data.county)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Distrito o municipio
                  </p>
                  <p>{show(data.municipality)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Localidad oficial
                  </p>
                  <p>{show(data.locality)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Localidad en la etiqueta (verbatimLocality)
                </p>
                <p>{show(data.verbatimLocality)}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Comentarios sobre la localización
                </p>
                <p>{show(data.locationRemarks)}</p>
              </div>

              <Separator />

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Latitud
                  </p>
                  <p className="font-mono text-sm">
                    {show(data.decimalLatitude)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Longitud
                  </p>
                  <p className="font-mono text-sm">
                    {show(data.decimalLongitude)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Sistema de coordenadas
                  </p>
                  <p>{show(data.verbatimCoordinateSystem)}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Elevación mínima (m)
                  </p>
                  <p>{show(data.minimumElevationInMeters)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Elevación máxima (m)
                  </p>
                  <p>{show(data.maximumElevationInMeters)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Elevación en la etiqueta
                  </p>
                  <p>{show(data.verbatimElevation)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Contexto hidrográfico (cuerpo de agua, isla, archipiélago)
                </p>
                <p>{show(data.hydrographicContext)}</p>
              </div>

              {data.footprintWKT && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Área de la ocurrencia (huella en WKT)
                  </p>
                  <p className="text-xs font-mono break-all">
                    {data.footprintWKT}
                  </p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Georreferenciado por
                  </p>
                  <p>{show(data.georeferencedBy)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Notas de georreferenciación
                  </p>
                  <p>{show(data.georeferenceRemarks)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Identificación actual */}
          {currentIdentification ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg font-semibold">
                  Identificación actual
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Nombre científico
                    </p>
                    <p className="italic">
                      {show(currentIdentification.scientificName)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Autoría
                    </p>
                    <p>{show(currentIdentification.scientificNameAuthorship)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Identificado por
                    </p>
                    <p>{show(currentIdentification.identifiedBy)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Fecha de identificación
                    </p>
                    <p>{show(currentIdentification.dateIdentified)}</p>
                  </div>

                  {/* Vigencia */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Vigencia
                    </p>
                    <Badge
                      variant={
                        currentIdentification.isCurrent
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[11px] font-medium rounded-full px-2 py-0.5"
                    >
                      {currentIdentification.isCurrent
                        ? "Actual (vigente)"
                        : "Histórica"}
                    </Badge>
                  </div>

                  {/* Verificación */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Estado de verificación
                    </p>
                    <Badge
                      variant={
                        currentIdentification.isVerified
                          ? "secondary"
                          : "outline"
                      }
                      className="text-[11px] font-medium rounded-full px-2 py-0.5"
                    >
                      {currentIdentification.isVerified
                        ? "Verificada"
                        : "No verificada"}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Estado de tipo (typeStatus)
                    </p>
                    <p>{show(currentIdentification.typeStatus)}</p>
                  </div>
                </div>

                {currentIdentification.identifiers &&
                  currentIdentification.identifiers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Personas asociadas a la identificación
                      </p>
                      <ul className="list-disc list-inside text-sm">
                        {currentIdentification.identifiers.map((idn: any) => (
                          <li key={idn.id}>{show(idn.fullName)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg font-semibold">
                  Identificación actual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Esta ocurrencia aún no tiene identificaciones registradas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* 5. Historial de identificaciones */}
          {sortedIdentifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg font-semibold">
                  Historial de identificaciones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedIdentifications.map((ident: any) => (
                  <div
                    key={ident.id}
                    className="rounded-lg border border-border bg-background/60 p-3 sm:p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold italic leading-tight">
                          {show(ident.scientificName)}
                        </p>
                        <p className="text-xs text-muted-foreground leading-tight">
                          {show(ident.scientificNameAuthorship)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {ident.isCurrent && (
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-medium rounded-full px-2 py-0.5"
                          >
                            Vigente
                          </Badge>
                        )}
                        <Badge
                          variant={ident.isVerified ? "secondary" : "outline"}
                          className="text-[11px] font-medium rounded-full px-2 py-0.5"
                        >
                          {ident.isVerified
                            ? "Verificada"
                            : "No verificada"}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Identificado por:{" "}
                      <span className="font-medium">
                        {show(ident.identifiedBy)}
                      </span>{" "}
                      • Fecha: {show(ident.dateIdentified)}
                    </p>

                    {ident.identifiers && ident.identifiers.length > 0 && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">
                          Personas asociadas:{" "}
                        </span>
                        {ident.identifiers
                          .map((idn: any) => idn.fullName)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}

                    <p className="text-[11px] text-muted-foreground/80">
                      Creado: {formatDateTime(ident.createdAt)} • Actualizado:{" "}
                      {formatDateTime(ident.updatedAt)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 6. Observaciones y datos biológicos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Observaciones y datos biológicos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Observaciones de la ocurrencia
                </p>
                <p>{show(data.occurrenceRemarks)}</p>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Etapa de vida
                  </p>
                  <p>{show(data.lifeStage)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Medio de establecimiento
                  </p>
                  <p>{show(data.establishmentMeans)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Taxones asociados (huésped, parásito, simbionte, etc.)
                  </p>
                  <p>{show(data.associatedTaxa)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Referencias bibliográficas asociadas
                </p>
                <p>{show(data.associatedReferences)}</p>
              </div>
            </CardContent>
          </Card>

          {/* 7. Datos dinámicos */}
          {data.dynamicProperties &&
            Object.keys(data.dynamicProperties).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg font-semibold">
                    Datos dinámicos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid md:grid-cols-2 gap-4">
                    {Object.entries(data.dynamicProperties)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => (
                        <div key={k}>
                          <p className="text-xs font-medium text-muted-foreground">
                            {k}
                          </p>
                          <RenderDynValue value={v} />
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>

        {/* Columna lateral */}
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">
                  ID interno:
                </span>{" "}
                <span className="font-mono text-sm">{data.id}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  ID de colección:
                </span>{" "}
                <span>{show(data.collectionId)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  ID de institución:
                </span>{" "}
                <span>{show(data.collection?.institutionId)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  Usuario digitalizador:
                </span>{" "}
                <span>{show(data.digitizerUserId)}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  Colectores (agentes):
                </span>
                {data.agents && data.agents.length > 0 ? (
                  <ul className="list-disc list-inside mt-1 text-sm">
                    {data.agents.map((ag: any) => (
                      <li key={ag.id}>{show(ag.fullName)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>—</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-semibold">
                Imágenes asociadas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.images && data.images.length > 0 ? (
                <ul className="space-y-2">
                  {data.images.map((img: any) => (
                    <li key={img.id} className="text-xs break-all">
                      {img.photographer && (
                        <span className="block text-muted-foreground">
                          Fotógrafo: {img.photographer}
                        </span>
                      )}
                      <span className="font-mono block">
                        {img.imagePath}
                      </span>
                      {img.fileSize && (
                        <span className="text-[11px] text-muted-foreground">
                          Tamaño del archivo: {img.fileSize} bytes
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esta ocurrencia no tiene imágenes asociadas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
