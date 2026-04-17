import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { ArrowLeft, Leaf, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { taxonService } from "@services/taxon.service";

/* ---------------------- Tipos según el backend ---------------------- */

interface IdentifierOut {
  identifierId: string;
  fullName: string | null;
  orcID: string | null;
}

interface TaxonIdentificationOut {
  identificationId: string;
  scientificName: string | null;
  scientificNameAuthorship: string | null;
  dateIdentified: string | null;
  isCurrent: boolean;
  isVerified: boolean;
  typeStatus: string | null;
  identifiers: IdentifierOut[];
  createdAt: string;
  updatedAt: string;
}

interface TaxonDetailOut {
  taxonId: string;
  // Modelo Taxon
  scientificNameID: string | null;
  localID: string | null;
  scientificName: string | null;
  taxonRank: string | null;
  parentNameUsageID: string | null;

  scientificNameAuthorship: string | null;
  family: string | null;
  subfamily: string | null;
  tribe: string | null;
  subtribe: string | null;
  genus: string | null;
  subgenus: string | null;
  specificEpithet: string | null;
  infraspecificEpithet: string | null;
  verbatimTaxonRank: string | null;
  nomenclaturalStatus: string | null;

  namePublishedIn: string | null;
  taxonomicStatus: string | null;
  acceptedNameUsageID: string | null;
  originalNameUsageID: string | null;
  nameAccordingToID: string | null;
  taxonRemarks: string | null;

  created: string | null;   // Date en backend, llega como string
  modified: string | null;

  references: string | null;
  source: string | null;
  majorGroup: string | null;
  tplID: string | null;
  isCurrent: boolean;

  // Identificaciones asociadas
  identifications: TaxonIdentificationOut[];
}

/* ------------------------ Props de la página ------------------------ */

interface TaxonDetailPageProps {
  taxonId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

export function TaxonDetailPage({ taxonId, onNavigate }: TaxonDetailPageProps) {
  const { apiFetch } = useAuth();
  const [taxon, setTaxon] = useState<TaxonDetailOut | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTaxon = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await taxonService.getById(apiFetch, taxonId);
      setTaxon(data as unknown as TaxonDetailOut);
    } catch (err: any) {
      console.error(err);
      if (err?.status === 404) {
        setTaxon(null);
        setError("Taxón no encontrado");
        return;
      }
      setError(err?.message || "Ocurrió un error al cargar el taxón");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!taxonId) return;
    fetchTaxon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonId]);

  const handleBack = () => {
    onNavigate("taxon");
  };

  // Helper para mostrar valores opcionales
  const displayValue = (
    value: string | number | null | undefined
  ): ReactNode => {
    if (value === null || value === undefined || value === "") {
      return (
        <span className="text-muted-foreground italic">No especificado</span>
      );
    }
    return String(value);
  };

  // Estados de carga / error / no encontrado
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Taxones
          </Button>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Cargando información del taxón…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !taxon) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Taxones
          </Button>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {error || "Taxón no encontrado"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const identifications = taxon.identifications ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Taxones
        </Button>
      </div>

      {/* Nombre científico principal */}
      <div className="mb-6">
        <div className="flex items-start gap-4">
          <Leaf className="h-8 w-8 text-primary mt-1" />
          <div>
            <h1 className="text-4xl mb-2 italic">
              {taxon.scientificName || "Sin nombre científico"}
            </h1>
            {taxon.scientificNameAuthorship && (
              <p className="text-muted-foreground">
                {taxon.scientificNameAuthorship}
              </p>
            )}
            <div className="flex gap-2 mt-3 flex-wrap">
              {taxon.taxonRank && (
                <Badge variant="outline">{taxon.taxonRank}</Badge>
              )}
              {taxon.taxonomicStatus && (
                <Badge
                  variant={
                    taxon.taxonomicStatus.toLowerCase() === "accepted"
                      ? "default"
                      : "secondary"
                  }
                >
                  {taxon.taxonomicStatus}
                </Badge>
              )}
              {taxon.isCurrent && (
                <Badge className="bg-green-100 text-green-800">
                  Actual
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Información Taxonómica */}
        <Card>
          <CardHeader>
            <CardTitle>Información Taxonómica</CardTitle>
            <CardDescription>Clasificación y jerarquía taxonómica</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Familia:</span>
              <span>{displayValue(taxon.family)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Subfamilia:</span>
              <span>{displayValue(taxon.subfamily)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Tribu:</span>
              <span>{displayValue(taxon.tribe)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Subtribu:</span>
              <span>{displayValue(taxon.subtribe)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Género:</span>
              <span>{displayValue(taxon.genus)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Subgénero:</span>
              <span>{displayValue(taxon.subgenus)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Epíteto específico:</span>
              <span>{displayValue(taxon.specificEpithet)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Epíteto infraespecífico:</span>
              <span>{displayValue(taxon.infraspecificEpithet)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Identificadores */}
        <Card>
          <CardHeader>
            <CardTitle>Identificadores</CardTitle>
            <CardDescription>Referencias y códigos únicos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Taxon ID:</span>
              <span className="break-all">{displayValue(taxon.taxonId)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Scientific Name ID:</span>
              <span className="break-all">
                {displayValue(taxon.scientificNameID)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Local ID:</span>
              <span className="break-all">{displayValue(taxon.localID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Parent Name Usage ID:</span>
              <span className="break-all">
                {displayValue(taxon.parentNameUsageID)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">
                Accepted Name Usage ID:
              </span>
              <span className="break-all">
                {displayValue(taxon.acceptedNameUsageID)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">
                Original Name Usage ID:
              </span>
              <span className="break-all">
                {displayValue(taxon.originalNameUsageID)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Name According To ID:</span>
              <span className="break-all">
                {displayValue(taxon.nameAccordingToID)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">TPL ID:</span>
              <span className="break-all">{displayValue(taxon.tplID)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Nomenclatura */}
        <Card>
          <CardHeader>
            <CardTitle>Nomenclatura</CardTitle>
            <CardDescription>Estado nomenclatural y rangos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Rango taxonómico:</span>
              <span>{displayValue(taxon.taxonRank)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Rango verbal:</span>
              <span>{displayValue(taxon.verbatimTaxonRank)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Estado nomenclatural:</span>
              <span>{displayValue(taxon.nomenclaturalStatus)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Estado taxonómico:</span>
              <span>{displayValue(taxon.taxonomicStatus)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Publicado en:</span>
              <span className="break-words">
                {displayValue(taxon.namePublishedIn)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Flora e información adicional */}
        <Card>
          <CardHeader>
            <CardTitle>Información Adicional</CardTitle>
            <CardDescription>Datos de Flora y referencias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Grupo mayor:</span>
              <span>{displayValue(taxon.majorGroup)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Fuente:</span>
              <span>{displayValue(taxon.source)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Creado:</span>
              <span>{displayValue(taxon.created)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Modificado:</span>
              <span>{displayValue(taxon.modified)}</span>
            </div>
            {taxon.references && (
              <div className="col-span-2">
                <span className="text-muted-foreground block mb-1">
                  Referencias:
                </span>
                <p className="text-sm break-words">{taxon.references}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Observaciones */}
      {taxon.taxonRemarks && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Observaciones Taxonómicas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{taxon.taxonRemarks}</p>
          </CardContent>
        </Card>
      )}

      <Separator className="my-8" />

      {/* Identificaciones */}
      <div className="mt-8">
        <h2 className="text-2xl mb-4">Identificaciones Relacionadas</h2>
        <p className="text-muted-foreground mb-6">
          Registros de especímenes identificados con este taxón (
          {identifications.length})
        </p>

        {identifications.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No hay identificaciones registradas para este taxón
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {identifications.map((identification) => (
              <Card
                key={identification.identificationId}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="py-4">
                  <div className="grid md:grid-cols-6 gap-4 items-center">
                    <div className="md:col-span-2">
                      <p className="italic mb-1">
                        {identification.scientificName || "Sin nombre"}
                      </p>
                      {identification.scientificNameAuthorship && (
                        <p className="text-sm text-muted-foreground">
                          {identification.scientificNameAuthorship}
                        </p>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">
                        Identificado por:
                      </p>
                      {identification.identifiers.length > 0 ? (
                        <ul className="text-sm space-y-0.5">
                          {identification.identifiers.map((id: IdentifierOut) => (
                            <li key={id.identifierId}>
                              {id.fullName || "Sin nombre"}
                              {id.orcID && (
                                <span className="text-muted-foreground ml-1">
                                  (ORCID: {id.orcID})
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm">No especificado</p>
                      )}
                    </div>

                    <div className="flex gap-2 md:col-span-2 flex-wrap">
                      {identification.isCurrent ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Vigente
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          No vigente
                        </Badge>
                      )}

                      {identification.isVerified ? (
                        <Badge className="bg-blue-100 text-blue-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verificada
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Sin verificar
                        </Badge>
                      )}

                      {identification.typeStatus && (
                        <Badge className="bg-purple-100 text-purple-800">
                          {identification.typeStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
