import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { DataTable, type ColumnDef } from "../ui/data-table";
import { ArrowLeft, Leaf, CheckCircle, XCircle, Eye } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PAGE_SIZE } from "@constants/api";
import {
  taxonService,
  type TaxonDetailOut,
  type TaxonIdentificationOut,
  type TaxonIdentifierOut,
} from "@services/taxon.service";

/* ------------------------ Props de la página ------------------------ */

interface TaxonDetailPageProps {
  taxonId: string;
  returnTo?: string;
  returnOccurrenceId?: string;
  originReturnTo?: string;
  collectionId?: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

export function TaxonDetailPage({
  taxonId,
  returnTo,
  returnOccurrenceId,
  originReturnTo,
  collectionId,
  onNavigate,
}: TaxonDetailPageProps) {
  const { apiFetch } = useAuth();
  const [taxon, setTaxon] = useState<TaxonDetailOut | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Identificaciones relacionadas: aparte del detalle del taxón y paginadas (pueden ser
  // muchísimas), no todas de una — ver GET /taxon/{id}/identifications.
  const [identifications, setIdentifications] = useState<TaxonIdentificationOut[]>([]);
  const [identLoading, setIdentLoading] = useState<boolean>(true);
  const [identPage, setIdentPage] = useState(1);
  const [identTotal, setIdentTotal] = useState(0);
  const [identTotalPages, setIdentTotalPages] = useState(1);
  const [identSort, setIdentSort] = useState<string | null>(null);
  const [identDir, setIdentDir] = useState<"asc" | "desc" | null>(null);

  const fetchTaxon = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await taxonService.getById(apiFetch, taxonId);
      setTaxon(data);
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

  const fetchIdentifications = async (page: number, sort: string | null, dir: "asc" | "desc" | null) => {
    try {
      setIdentLoading(true);
      const data = await taxonService.listIdentifications(
        apiFetch,
        taxonId,
        page,
        PAGE_SIZE.TAXON_IDENTIFICATIONS,
        sort,
        dir,
      );
      setIdentifications(data.items ?? []);
      setIdentTotal(data.total ?? 0);
      setIdentTotalPages(data.totalPages || 1);
      setIdentPage(page);
    } catch (err) {
      console.error("fetch taxon identifications error:", err);
    } finally {
      setIdentLoading(false);
    }
  };

  useEffect(() => {
    if (!taxonId) return;
    fetchTaxon();
    fetchIdentifications(1, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonId]);

  const handleIdentPrevPage = () => {
    if (identPage <= 1 || identLoading) return;
    fetchIdentifications(identPage - 1, identSort, identDir);
  };

  const handleIdentNextPage = () => {
    if (identPage >= identTotalPages || identLoading) return;
    fetchIdentifications(identPage + 1, identSort, identDir);
  };

  const handleIdentSortChange = (key: string | null, dir: "asc" | "desc" | null) => {
    setIdentSort(key);
    setIdentDir(dir);
    fetchIdentifications(1, key, dir);
  };

  const handleBack = () => {
    if (returnTo === "occurrence-detail" && returnOccurrenceId) {
      onNavigate("occurrence-detail", {
        occurrenceId: returnOccurrenceId,
        returnTo: originReturnTo,
        collectionId,
      });
    } else {
      onNavigate("taxon");
    }
  };

  const handleOpenOccurrence = (occurrenceId?: string) => {
    if (!occurrenceId) return;
    onNavigate("occurrence-detail", {
      occurrenceId,
      returnTo: "taxon",
      taxonId,
    });
  };

  // Formateo seguro de fecha (puede no ser ISO perfecto)
  const formatDate = (raw: string | null): string => {
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("es-ES");
  };

  const identColumns: ColumnDef<TaxonIdentificationOut>[] = [
    {
      key: "scientific-name",
      header: "Nombre científico",
      cell: (identification) => (
        <div>
          <p className="italic">{identification.scientificName || "Sin nombre"}</p>
          {identification.scientificNameAuthorship && (
            <p className="text-xs text-muted-foreground">{identification.scientificNameAuthorship}</p>
          )}
        </div>
      ),
    },
    {
      key: "institution",
      header: "Institución",
      sortKey: "institution",
      sortDir: "asc",
      cell: (identification) => identification.institution || "—",
    },
    {
      key: "identifiers",
      header: "Identificado por",
      cell: (identification) =>
        identification.identifiers.length > 0 ? (
          <ul className="space-y-0.5">
            {identification.identifiers.map((id: TaxonIdentifierOut) => (
              <li key={id.identifierId}>
                {id.fullName || "Sin nombre"}
                {id.orcID && <span className="text-muted-foreground ml-1">(ORCID: {id.orcID})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">No especificado</span>
        ),
    },
    {
      key: "date",
      header: "Fecha identificado",
      sortKey: "dateIdentified",
      sortDir: "desc",
      cell: (identification) => formatDate(identification.dateIdentified),
    },
    {
      key: "status",
      header: "Estado",
      sortKey: "isCurrent",
      sortDir: "desc",
      cell: (identification) => (
        <div className="flex gap-2 flex-wrap">
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
          {identification.identificationVerificationStatus && (
            <Badge className="bg-blue-100 text-blue-800">{identification.identificationVerificationStatus}</Badge>
          )}
          {identification.typeStatus && (
            <Badge className="bg-purple-100 text-purple-800">{identification.typeStatus}</Badge>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Acciones",
      cell: (identification) => (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title="Ver ocurrencia"
          onClick={() => handleOpenOccurrence(identification.occurrenceId)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  // Helper para mostrar valores opcionales
  const displayValue = (value: string | number | null | undefined): ReactNode => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground italic">No especificado</span>;
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
            Volver
          </Button>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Cargando información del taxón…</p>
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
            Volver
          </Button>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">{error || "Taxón no encontrado"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
      </div>

      {/* Nombre científico principal */}
      <div className="mb-6">
        <div className="flex items-start gap-4">
          <Leaf className="h-8 w-8 text-primary mt-1" />
          <div>
            <h1 className="text-4xl mb-2 italic">{taxon.scientificName || "Sin nombre científico"}</h1>
            {taxon.scientificNameAuthorship && (
              <p className="text-muted-foreground">{taxon.scientificNameAuthorship}</p>
            )}
            <div className="flex gap-2 mt-3 flex-wrap">
              {taxon.taxonRank && <Badge variant="outline">{taxon.taxonRank}</Badge>}
              {taxon.taxonomicStatus && (
                <Badge variant={taxon.taxonomicStatus.toLowerCase() === "accepted" ? "default" : "secondary"}>
                  {taxon.taxonomicStatus}
                </Badge>
              )}
              {taxon.isCurrent && <Badge className="bg-green-100 text-green-800">Actual</Badge>}
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
              <span className="break-all">{displayValue(taxon.scientificNameID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Local ID:</span>
              <span className="break-all">{displayValue(taxon.localID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Parent Name Usage ID:</span>
              <span className="break-all">{displayValue(taxon.parentNameUsageID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Accepted Name Usage ID:</span>
              <span className="break-all">{displayValue(taxon.acceptedNameUsageID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Original Name Usage ID:</span>
              <span className="break-all">{displayValue(taxon.originalNameUsageID)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Name According To ID:</span>
              <span className="break-all">{displayValue(taxon.nameAccordingToID)}</span>
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
              <span className="break-words">{displayValue(taxon.namePublishedIn)}</span>
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
                <span className="text-muted-foreground block mb-1">Referencias:</span>
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
        <DataTable<TaxonIdentificationOut>
          description={`Registros de especímenes identificados con este taxón (${identTotal})`}
          columns={identColumns}
          data={identifications}
          keyExtractor={(row) => row.identificationId}
          loading={identLoading}
          emptyMessage="No hay identificaciones registradas para este taxón."
          page={identPage}
          totalPages={identTotalPages}
          onPrevPage={handleIdentPrevPage}
          onNextPage={handleIdentNextPage}
          sortBy={identSort}
          sortDir={identDir}
          onSortChange={handleIdentSortChange}
        />
      </div>
    </div>
  );
}
