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
            <Badge variant="secondary" className="uppercase">
              {value ? "Sí" : "No"}
            </Badge>
        );
      case "number":
        return <span className="font-mono">{value}</span>;
      case "string":
        return <span className="break-words">{value}</span>;
      default: {
        // objetos / arrays: visor expandible
        return (
            <details className="rounded-md bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm text-muted-foreground select-none">
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

  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

  useEffect(() => {
    let isMounted = true;

    const fetchOccurrence = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `${API.BASE_URL}${API.PATHS.OCCURRENCE_BY_ID(occurrenceId)}`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, { headers, credentials: "include" });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Error ${res.status}: ${txt || res.statusText}`);
        }
        const json = (await res.json()) as OccurrenceItem;

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
  }, [occurrenceId, token]);

  const sciName = useMemo(() => {
    return data?.taxon?.scientificName || "Sin nombre científico";
  }, [data]);

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
          <p className="text-sm text-muted-foreground">Cargando ocurrencia...</p>
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
          <p className="text-sm text-red-600">No se pudo cargar la ocurrencia: {error || "Desconocido"}</p>
        </div>
    );
  }

  return (
      <div className="container mx-auto px-4 py-8">
        {/* Back */}
        <div className="mb-6">
          <Button variant="ghost" onClick={handleBack} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {returnTo === "collection" ? `Volver a ${collectionName}` : "Volver a Ocurrencias"}
          </Button>

          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl mb-2 italic">{sciName}</h1>
              <p className="text-muted-foreground">
                Código: {show(data.catalogNumber)} | Colección: {show(data.collection?.collectionName)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Colección & Registro */}
            <Card>
              <CardHeader>
                <CardTitle>Colección & Registro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Colección</p>
                    <p>{show(data.collection?.collectionName)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Código de Colección</p>
                    <p>{show(data.collection?.collectionCode)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Número de Catálogo</p>
                    <p>{show(data.catalogNumber)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Número de Registro</p>
                    <p>{show(data.recordNumber)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Registrado por</p>
                    <p>{show(data.recordedBy)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Individuos</p>
                    <p>{show(data.individualCount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Preparación</p>
                    <p>{show(data.preparations)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Disposición</p>
                    {data.disposition ? <Badge variant="secondary">{data.disposition}</Badge> : <p>—</p>}
                  </div>
                </div>

                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Occurrence ID</p>
                  <p className="font-mono text-xs break-all">{show(data.occurrenceID)}</p>
                </div>
              </CardContent>
            </Card>

            {/* 2. Evento */}
            <Card>
              <CardHeader>
                <CardTitle>Evento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha (texto)</p>
                    <p>{show(data.event?.eventDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha (año/mes/día)</p>
                    <p>
                      {show(data.event?.year)}/{show(data.event?.month)}/{show(data.event?.day)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Verbatim Event Date</p>
                    <p>{show(data.event?.verbatimEventDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Field Number</p>
                    <p>{show(data.event?.fieldNumber)}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Protocolo de Muestreo</p>
                    <p>{show(data.event?.samplingProtocol)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Esfuerzo de Muestreo</p>
                    <p>{show(data.event?.samplingEffort)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Hábitat</p>
                  <p>{show(data.event?.habitat)}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Notas del Evento</p>
                  <p>{show(data.event?.eventRemarks)}</p>
                </div>
              </CardContent>
            </Card>

            {/* 3. Localización */}
            <Card>
              <CardHeader>
                <CardTitle>Localización</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Departamento/Provincia</p>
                    <p>{show(data.location?.stateProvince)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Provincia / Condado</p>
                    <p>{show(data.location?.county)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Municipio / Distrito</p>
                    <p>{show(data.location?.municipality)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Localidad</p>
                    <p>{show(data.location?.locality)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Localidad (verbatim)</p>
                  <p>{show(data.location?.verbatimLocality)}</p>
                </div>

                <Separator />

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Latitud</p>
                    <p className="font-mono">{show(data.location?.decimalLatitude)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Longitud</p>
                    <p className="font-mono">{show(data.location?.decimalLongitude)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Datum</p>
                    <p>{show(data.location?.geodeticDatum)}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Incertidumbre (m)</p>
                    <p>{show(data.location?.coordinateUncertaintyInMeters)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Precisión</p>
                    <p>{show(data.location?.coordinatePrecision)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Elevación (min/max)</p>
                    <p>
                      {show(data.location?.minimumElevationInMeters)} / {show(data.location?.maximumElevationInMeters)}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Elevación (verbatim)</p>
                  <p>{show(data.location?.verbatimElevation)}</p>
                </div>
              </CardContent>
            </Card>

            {/* 4. Taxón */}
            <Card>
              <CardHeader>
                <CardTitle>Identificación (Taxón)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre científico</p>
                    <p className="italic">{show(data.taxon?.scientificName)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Autoría</p>
                    <p>{show(data.taxon?.scientificNameAuthorship)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Familia</p>
                    <p>{show(data.taxon?.family)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Género</p>
                    <p>{show(data.taxon?.genus)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Epíteto específico</p>
                    <p>{show(data.taxon?.specificEpithet)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Infraespecífico</p>
                    <p>{show(data.taxon?.infraspecificEpithet)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rango</p>
                    <p>{show(data.taxon?.taxonRank)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre aceptado</p>
                    <p>{show(data.taxon?.acceptedNameUsage)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 5. Observaciones */}
            <Card>
              <CardHeader>
                <CardTitle>Observaciones</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{show(data.occurrenceRemarks)}</p>
              </CardContent>
            </Card>

            {/* 6. Datos dinámicos (si existen) */}
            {data.dynamicProperties && Object.keys(data.dynamicProperties).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Datos dinámicos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(data.dynamicProperties)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => (
                              <div key={k}>
                                <p className="text-sm text-muted-foreground">{k}</p>
                                <RenderDynValue value={v} />
                              </div>
                          ))}
                    </div>
                  </CardContent>
                </Card>
            )}

            {/* 6. Derechos */}
            <Card>
              <CardHeader>
                <CardTitle>Derechos & Publicación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Licencia</p>
                    {data.license ? <Badge>{data.license}</Badge> : <p>—</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Titular de Derechos</p>
                    <p>{show(data.rightsHolder)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Derechos de Acceso</p>
                  <p>{show(data.accessRights)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Última Modificación</p>
                  {/* backend ya envía dd/mm/aaaa (string) */}
                  <p className="text-sm">{show(data.modified)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Citación</p>
                  <p className="text-sm">{show(data.bibliographicCitation)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna lateral vacía por ahora (sin multimedia ni organism/measurements) */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Resumen (proximamente multimedia)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">ID:</span>{" "}
                  <span className="font-mono">{data.id}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Colección ID:</span>{" "}
                  <span>{show(data.collection?.id)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Institución ID:</span>{" "}
                  <span>{show(data.collection?.institution_id)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
  );
}
