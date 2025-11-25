import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { ArrowLeft, Plus, X, MapPin, AlertCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Alert, AlertDescription } from "../ui/alert";

interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: "create" | "edit";
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection";
  collectionId?: string; // viene desde la página contenedora
  collectionName?: string;
  isOwner?: boolean;
}

type Occurrence = Record<string, any>;

/* ------------------------- Helpers de almacenamiento ------------------------- */
const LS_KEY = "occurrences";

function readAll(): Occurrence[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(list: Occurrence[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

function getOccurrenceById(id: string): Occurrence | undefined {
  const all = readAll();
  return all.find((o) => o.id === id || o.occurrenceID === id);
}

function addOccurrenceLS(data: Occurrence): string {
  const all = readAll();
  const id = generateUUID();
  all.push({
    ...data,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  writeAll(all);
  return id;
}

function updateOccurrenceLS(id: string, patch: Occurrence) {
  const all = readAll();
  const idx = all.findIndex((o) => o.id === id || o.occurrenceID === id);
  if (idx === -1) {
    toast.error("No se encontró la ocurrencia a actualizar");
    return;
  }
  const prev = all[idx];
  all[idx] = {
    ...prev,
    ...patch,
    id: prev.id ?? id,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
}

/* ------------------------------ Utils generales ----------------------------- */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const getCurrentDate = () => new Date().toISOString().split("T")[0];

/* --------------------------------- Componente -------------------------------- */
export function NewOccurrencePage({
                                    onNavigate,
                                    mode = "create",
                                    occurrenceId,
                                    returnTo = "occurrences",
                                    collectionId,
                                    collectionName: collectionNameProp,
                                    isOwner,
                                  }: NewOccurrencePageProps) {
  // OCCURRENCE
  const [occurrenceID, setOccurrenceID] = useState(generateUUID());
  const [catalogNumber, setCatalogNumber] = useState("");
  const [recordNumber, setRecordNumber] = useState("");
  const [recordedBy, setRecordedBy] = useState<string[]>([]);
  const [recordedByInput, setRecordedByInput] = useState("");
  const [recordEnteredBy, setRecordEnteredBy] = useState("");
  const [individualCount, setIndividualCount] = useState("");
  const [occurrenceStatus, setOccurrenceStatus] = useState("present");
  const [preparations, setPreparations] = useState("");
  const [disposition, setDisposition] = useState("in_collection");
  const [occurrenceRemarks, setOccurrenceRemarks] = useState("");
  const [license, setLicense] = useState("CC-BY-4.0");
  const [rightsHolder, setRightsHolder] = useState("");
  const [accessRights, setAccessRights] = useState("");
  const [occurrenceIDEdited, setOccurrenceIDEdited] = useState(false);

  // Dynamic Properties
  const [dpKey, setDpKey] = useState("");
  const [dpValue, setDpValue] = useState("");
  const [dynamicProps, setDynamicProps] = useState<Array<{ key: string; value: string }>>([]);

  // EVENT
  const [eventDate, setEventDate] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [verbatimEventDate, setVerbatimEventDate] = useState("");
  const [fieldNumber, setFieldNumber] = useState("");
  const [samplingProtocol, setSamplingProtocol] = useState("");
  const [samplingEffort, setSamplingEffort] = useState("");
  const [habitat, setHabitat] = useState("");
  const [eventRemarks, setEventRemarks] = useState("");

  // LOCATION
  const [stateProvince, setStateProvince] = useState("");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [locality, setLocality] = useState("");
  const [verbatimLocality, setVerbatimLocality] = useState("");
  const [decimalLatitude, setDecimalLatitude] = useState("");
  const [decimalLongitude, setDecimalLongitude] = useState("");
  const [geodeticDatum, setGeodeticDatum] = useState("WGS84");
  const [coordinateUncertaintyInMeters, setCoordinateUncertaintyInMeters] = useState("");
  const [coordinatePrecision, setCoordinatePrecision] = useState("");
  const [minimumElevationInMeters, setMinimumElevationInMeters] = useState("");
  const [maximumElevationInMeters, setMaximumElevationInMeters] = useState("");
  const [verbatimElevation, setVerbatimElevation] = useState("");

  // TAXON
  const [scientificName, setScientificName] = useState("");
  const [scientificNameAuthorship, setScientificNameAuthorship] = useState("");
  const [family, setFamily] = useState("");
  const [genus, setGenus] = useState("");
  const [specificEpithet, setSpecificEpithet] = useState("");
  const [infraspecificEpithet, setInfraspecificEpithet] = useState("");
  const [taxonRank, setTaxonRank] = useState("");
  const [acceptedNameUsage, setAcceptedNameUsage] = useState("");

  // Derivar año/mes/día desde eventDate
  useEffect(() => {
    if (!eventDate) {
      setYear("");
      setMonth("");
      setDay("");
      return;
    }
    const d = new Date(eventDate);
    if (!isNaN(d.getTime())) {
      setYear(String(d.getUTCFullYear()));
      setMonth(String(d.getUTCMonth() + 1).padStart(2, "0"));
      setDay(String(d.getUTCDate()).padStart(2, "0"));
    }
  }, [eventDate]);

  // Cargar datos en modo edición
  useEffect(() => {
    if (mode === "edit" && occurrenceId) {
      const occurrence = getOccurrenceById(occurrenceId);
      if (!occurrence) {
        toast.error("No se encontró la ocurrencia");
        return;
      }
      setOccurrenceID(occurrence.occurrenceID ?? occurrenceID);
      setCatalogNumber(occurrence.catalogNumber ?? "");
      setRecordNumber(occurrence.recordNumber ?? "");
      setRecordedBy(occurrence.recordedBy ?? []);
      setRecordEnteredBy(occurrence.recordEnteredBy ?? "");
      setIndividualCount(occurrence.individualCount ?? "");
      setOccurrenceStatus(occurrence.occurrenceStatus ?? "present");
      setPreparations(occurrence.preparations ?? "");
      setDisposition(occurrence.disposition ?? "in_collection");
      setOccurrenceRemarks(occurrence.occurrenceRemarks ?? "");
      setLicense(occurrence.license ?? "CC-BY-4.0");
      setRightsHolder(occurrence.rightsHolder ?? "");
      setAccessRights(occurrence.accessRights ?? "");

      setEventDate(occurrence.eventDate ?? "");
      setYear(occurrence.year ?? "");
      setMonth(occurrence.month ?? "");
      setDay(occurrence.day ?? "");
      setVerbatimEventDate(occurrence.verbatimEventDate ?? "");
      setFieldNumber(occurrence.fieldNumber ?? "");
      setSamplingProtocol(occurrence.samplingProtocol ?? "");
      setSamplingEffort(occurrence.samplingEffort ?? "");
      setHabitat(occurrence.habitat ?? "");
      setEventRemarks(occurrence.eventRemarks ?? "");

      setStateProvince(occurrence.stateProvince ?? "");
      setCounty(occurrence.county ?? "");
      setMunicipality(occurrence.municipality ?? "");
      setLocality(occurrence.locality ?? "");
      setVerbatimLocality(occurrence.verbatimLocality ?? "");
      setDecimalLatitude(occurrence.decimalLatitude ?? "");
      setDecimalLongitude(occurrence.decimalLongitude ?? "");
      setGeodeticDatum(occurrence.geodeticDatum ?? "WGS84");
      setCoordinateUncertaintyInMeters(occurrence.coordinateUncertaintyInMeters ?? "");
      setCoordinatePrecision(occurrence.coordinatePrecision ?? "");
      setMinimumElevationInMeters(occurrence.minimumElevationInMeters ?? "");
      setMaximumElevationInMeters(occurrence.maximumElevationInMeters ?? "");
      setVerbatimElevation(occurrence.verbatimElevation ?? "");

      setScientificName(occurrence.scientificName ?? "");
      setScientificNameAuthorship(occurrence.scientificNameAuthorship ?? "");
      setFamily(occurrence.family ?? "");
      setGenus(occurrence.genus ?? "");
      setSpecificEpithet(occurrence.specificEpithet ?? "");
      setInfraspecificEpithet(occurrence.infraspecificEpithet ?? "");
      setTaxonRank(occurrence.taxonRank ?? "");
      setAcceptedNameUsage(occurrence.acceptedNameUsage ?? "");

      // dynamicProperties
      const dp = occurrence.dynamicProperties;
      if (dp) {
        try {
          const obj = typeof dp === "string" ? JSON.parse(dp) : dp;
          if (obj && typeof obj === "object") {
            const list = Object.entries(obj).map(([k, v]) => ({
              key: String(k),
              value: typeof v === "string" ? v : JSON.stringify(v),
            }));
            setDynamicProps(list);
          }
        } catch {
          const list = String(dp)
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((pair) => {
                const [k, ...rest] = pair.split("=");
                return { key: k?.trim() ?? "", value: rest.join("=").trim() };
              })
              .filter((kv) => kv.key);
          setDynamicProps(list);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, occurrenceId]);

  /* ------------------------------- Manejadores ------------------------------- */
  const handleAddRecordedBy = () => {
    if (recordedByInput.trim()) {
      setRecordedBy([...recordedBy, recordedByInput.trim()]);
      setRecordedByInput("");
    }
  };

  const handleRemoveRecordedBy = (index: number) => {
    setRecordedBy(recordedBy.filter((_, i) => i !== index));
  };

  const handleTakeFromMap = () => {
    setDecimalLatitude("-12.0464");
    setDecimalLongitude("-77.0428");
    setCoordinateUncertaintyInMeters("100");
    setGeodeticDatum("WGS84");
    toast.success("Coordenadas tomadas del mapa");
  };

  const handleAddDynamicProp = () => {
    if (!dpKey.trim()) {
      toast.error("Ingresa una clave para el registro adicional");
      return;
    }
    setDynamicProps((prev) => [...prev, { key: dpKey.trim(), value: dpValue }]);
    setDpKey("");
    setDpValue("");
  };

  const handleRemoveDynamicProp = (idx: number) => {
    setDynamicProps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!collectionId) {
      toast.error("Falta collectionId (lo debe pasar la página contenedora).");
      return;
    }
    if (!catalogNumber.trim()) {
      toast.error("El número de catálogo es requerido");
      return;
    }
    if (!scientificName.trim()) {
      toast.error("El nombre científico es requerido");
      return;
    }

    const dynamicProperties =
        dynamicProps.length > 0
            ? JSON.stringify(Object.fromEntries(dynamicProps.map(({ key, value }) => [key, value])))
            : "";

    const occurrenceData: Occurrence = {
      collectionId,
      occurrenceID,
      catalogNumber,
      recordNumber,
      recordedBy,
      recordEnteredBy,
      individualCount,
      occurrenceStatus,
      preparations,
      disposition,
      occurrenceRemarks,
      license,
      rightsHolder,
      accessRights,
      eventDate,
      year,
      month,
      day,
      verbatimEventDate,
      fieldNumber,
      samplingProtocol,
      samplingEffort,
      habitat,
      eventRemarks,
      stateProvince,
      county,
      municipality,
      locality,
      verbatimLocality,
      decimalLatitude,
      decimalLongitude,
      geodeticDatum,
      coordinateUncertaintyInMeters,
      coordinatePrecision,
      minimumElevationInMeters,
      maximumElevationInMeters,
      verbatimElevation,
      scientificName,
      scientificNameAuthorship,
      family,
      genus,
      specificEpithet,
      infraspecificEpithet,
      taxonRank,
      acceptedNameUsage,
      dynamicProperties,
      recordedByID: [],
      identifiedBy: [],
      identifiedByID: [],
      dateIdentified: getCurrentDate(),
      identificationQualifier: "",
      identificationReferences: "",
      isCurrent: true,
      verificationStatus: "pending",
      identificationRemarks: "",
      typeStatus: "",
      organismOption: "none",
      organismID: "",
      organismScope: "",
      sex: "",
      lifeStage: "",
      reproductiveCondition: "",
      establishmentMeans: "",
      organismRemarks: "",
      measurements: [],
    };

    if (mode === "edit" && occurrenceId) {
      updateOccurrenceLS(occurrenceId, occurrenceData);
      toast.success("Ocurrencia actualizada exitosamente");
    } else {
      addOccurrenceLS(occurrenceData);
      toast.success("Ocurrencia registrada exitosamente");
    }

    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", {
        collectionId,
        collectionName: collectionNameProp || "",
        isOwner: isOwner ?? false,
      });
    } else {
      onNavigate("occurrences");
    }
  };

  const handleCancel = () => {
    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", {
        collectionId,
        collectionName: collectionNameProp || "",
        isOwner: isOwner ?? false,
      });
    } else {
      onNavigate("occurrences");
    }
  };

  const dynamicJSONPreview =
      dynamicProps.length > 0
          ? JSON.stringify(Object.fromEntries(dynamicProps.map(({ key, value }) => [key, value])), null, 2)
          : "{ }";

  return (
      <>
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-6">
            <Button variant="ghost" onClick={handleCancel} className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {returnTo === "collection" ? `Volver a ${collectionNameProp}` : "Volver a Ocurrencias"}
            </Button>

            <h1 className="text-3xl mb-2">{mode === "edit" ? "Actualizar ocurrencia" : "Nueva ocurrencia"}</h1>
            <p className="text-muted-foreground">
              {mode === "edit"
                  ? "Modifica la información del espécimen según estándar Darwin Core"
                  : "Completa la información del espécimen recolectado según estándar Darwin Core"}
            </p>
          </div>

          {/* Form con padding inferior para no tapar el botón fijo */}
          <form id="occ-form" onSubmit={handleSubmit} className="pb-28">
            <Accordion type="multiple" defaultValue={["occurrence", "event", "location", "taxon"]} className="space-y-4">
              {/* Ocurrencia */}
              <AccordionItem value="occurrence" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="text-left">
                    <h3 className="text-xl">Ocurrencia</h3>
                    <p className="text-sm text-muted-foreground">Información del registro y preparación del espécimen</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4 pb-6">
                  {/* Occurrence ID */}
                  <div className="space-y-2">
                    <Label htmlFor="occurrenceID" className="flex items-center gap-2">
                      Occurrence ID (UUID)
                      <span className="text-xs text-muted-foreground">dwc:occurrenceID</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                          id="occurrenceID"
                          value={occurrenceID}
                          onChange={(e) => {
                            setOccurrenceID(e.target.value);
                            setOccurrenceIDEdited(true);
                          }}
                          className="font-mono text-sm"
                      />
                      <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setOccurrenceID(generateUUID());
                            setOccurrenceIDEdited(false);
                          }}
                      >
                        Regenerar
                      </Button>
                    </div>
                    {occurrenceIDEdited && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>Has editado manualmente el UUID. Asegúrate de que sea único.</AlertDescription>
                        </Alert>
                    )}
                    <p className="text-xs text-muted-foreground">Identificador único del registro de ocurrencia.</p>
                  </div>

                  {/* Catalog Number */}
                  <div className="space-y-2">
                    <Label htmlFor="catalogNumber" className="flex items-center gap-2">
                      Número de catálogo <span className="text-destructive">*</span>
                      <Badge variant="secondary" className="text-xs">Requerido</Badge>
                      <span className="text-xs text-muted-foreground">dwc:catalogNumber</span>
                    </Label>
                    <Input
                        id="catalogNumber"
                        value={catalogNumber}
                        onChange={(e) => setCatalogNumber(e.target.value)}
                        placeholder="BOT-2024-001"
                        required
                    />
                    <p className="text-xs text-muted-foreground">Número o código de catálogo asignado al ejemplar.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Record Number */}
                    <div className="space-y-2">
                      <Label htmlFor="recordNumber" className="flex items-center gap-2">
                        Número de registro
                        <span className="text-xs text-muted-foreground">dwc:recordNumber</span>
                      </Label>
                      <Input
                          id="recordNumber"
                          value={recordNumber}
                          onChange={(e) => setRecordNumber(e.target.value)}
                          placeholder="Número de colecta"
                      />
                      <p className="text-xs text-muted-foreground">Número de campo asignado por el colector.</p>
                    </div>

                    {/* Individual Count */}
                    <div className="space-y-2">
                      <Label htmlFor="individualCount" className="flex items-center gap-2">
                        Número de individuos
                        <span className="text-xs text-muted-foreground">dwc:individualCount</span>
                      </Label>
                      <Input
                          id="individualCount"
                          type="number"
                          min={0}
                          value={individualCount}
                          onChange={(e) => setIndividualCount(e.target.value)}
                          placeholder="1"
                      />
                      <p className="text-xs text-muted-foreground">Número de individuos observados/recolectados.</p>
                    </div>
                  </div>

                  {/* Recorded By */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Registrado por
                      <Badge variant="outline" className="text-xs">Recomendado</Badge>
                      <span className="text-xs text-muted-foreground">dwc:recordedBy</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                          value={recordedByInput}
                          onChange={(e) => setRecordedByInput(e.target.value)}
                          placeholder="Nombre del recolector"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddRecordedBy();
                            }
                          }}
                      />
                      <Button type="button" onClick={handleAddRecordedBy} variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {recordedBy.map((person, index) => (
                          <Badge key={index} variant="secondary" className="gap-1">
                            {person}
                            <button
                                type="button"
                                onClick={() => handleRemoveRecordedBy(index)}
                                className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Nombre(s) de quien observó o recolectó.</p>
                  </div>

                  {/* Record Entered By */}
                  <div className="space-y-2">
                    <Label htmlFor="recordEnteredBy" className="flex items-center gap-2">
                      Digitado por
                      <span className="text-xs text-muted-foreground">dwc:recordEnteredBy</span>
                    </Label>
                    <Input
                        id="recordEnteredBy"
                        value={recordEnteredBy}
                        onChange={(e) => setRecordEnteredBy(e.target.value)}
                        placeholder="Nombre de quien digitó"
                    />
                    <p className="text-xs text-muted-foreground">Persona que ingresó el registro.</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Occurrence Status */}
                    <div className="space-y-2">
                      <Label htmlFor="occurrenceStatus" className="flex items-center gap-2">
                        Estado
                        <span className="text-xs text-muted-foreground">dwc:occurrenceStatus</span>
                      </Label>
                      <Select value={occurrenceStatus} onValueChange={setOccurrenceStatus}>
                        <SelectTrigger id="occurrenceStatus">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">Presente</SelectItem>
                          <SelectItem value="absent">Ausente</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Estado de la ocurrencia.</p>
                    </div>

                    {/* Preparations */}
                    <div className="space-y-2">
                      <Label htmlFor="preparations" className="flex items-center gap-2">
                        Preparación
                        <span className="text-xs text-muted-foreground">dwc:preparations</span>
                      </Label>
                      <Select value={preparations} onValueChange={setPreparations}>
                        <SelectTrigger id="preparations">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="herbarium_sheet">Herbarium sheet</SelectItem>
                          <SelectItem value="alcohol">Alcohol</SelectItem>
                          <SelectItem value="dried">Dried</SelectItem>
                          <SelectItem value="pressed">Pressed</SelectItem>
                          <SelectItem value="tissue">Tissue</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Tipo de preparación del material.</p>
                    </div>

                    {/* Disposition */}
                    <div className="space-y-2">
                      <Label htmlFor="disposition" className="flex items-center gap-2">
                        Disposición
                        <span className="text-xs text-muted-foreground">dwc:disposition</span>
                      </Label>
                      <Select value={disposition} onValueChange={setDisposition}>
                        <SelectTrigger id="disposition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in_collection">En colección</SelectItem>
                          <SelectItem value="on_loan">Prestado</SelectItem>
                          <SelectItem value="missing">Perdido</SelectItem>
                          <SelectItem value="destroyed">Destruido</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Situación del ejemplar.</p>
                    </div>
                  </div>

                  {/* Occurrence Remarks */}
                  <div className="space-y-2">
                    <Label htmlFor="occurrenceRemarks" className="flex items-center gap-2">
                      Observaciones
                      <span className="text-xs text-muted-foreground">dwc:occurrenceRemarks</span>
                    </Label>
                    <Textarea
                        id="occurrenceRemarks"
                        value={occurrenceRemarks}
                        onChange={(e) => setOccurrenceRemarks(e.target.value)}
                        placeholder="Observaciones adicionales sobre la ocurrencia"
                        rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Observaciones adicionales sobre la ocurrencia.</p>
                  </div>

                  {/* Dynamic Properties */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Registros adicionales (dynamicProperties)
                      <span className="text-xs text-muted-foreground">dwc:dynamicProperties</span>
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <Input
                          placeholder="clave (p.ej. microhabitat)"
                          value={dpKey}
                          onChange={(e) => setDpKey(e.target.value)}
                          className="md:col-span-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddDynamicProp();
                            }
                          }}
                      />
                      <Input
                          placeholder="valor (p.ej. 'bajo roca')"
                          value={dpValue}
                          onChange={(e) => setDpValue(e.target.value)}
                          className="md:col-span-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddDynamicProp();
                            }
                          }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddDynamicProp} className="md:col-span-1">
                        <Plus className="h-4 w-4 mr-2" /> Agregar
                      </Button>
                    </div>

                    {/* chips + preview */}
                    {dynamicProps.length > 0 && (
                        <>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {dynamicProps.map((kv, idx) => (
                                <Badge key={`${kv.key}-${idx}`} variant="secondary" className="gap-1">
                                  <span className="font-mono">{kv.key}</span>: {kv.value}
                                  <button
                                      type="button"
                                      onClick={() => handleRemoveDynamicProp(idx)}
                                      className="ml-1 hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                            ))}
                          </div>
                          <div className="rounded-md border bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground mb-1">Vista previa JSON:</p>
                            <pre className="text-xs overflow-auto max-h-40">
{JSON.stringify(Object.fromEntries(dynamicProps.map(({ key, value }) => [key, value])), null, 2)}
                      </pre>
                          </div>
                        </>
                    )}
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {/* License */}
                    <div className="space-y-2">
                      <Label htmlFor="license" className="flex items-center gap-2">
                        Licencia
                        <span className="text-xs text-muted-foreground">dwc:license</span>
                      </Label>
                      <Select value={license} onValueChange={setLicense}>
                        <SelectTrigger id="license">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CC-BY-4.0">CC BY 4.0</SelectItem>
                          <SelectItem value="CC-BY-NC-4.0">CC BY-NC 4.0</SelectItem>
                          <SelectItem value="CC0">CC0 (Dominio Público)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Licencia de uso de los datos.</p>
                    </div>

                    {/* Rights Holder */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="rightsHolder" className="flex items-center gap-2">
                        Titular de derechos
                        <span className="text-xs text-muted-foreground">dwc:rightsHolder</span>
                      </Label>
                      <Input
                          id="rightsHolder"
                          value={rightsHolder}
                          onChange={(e) => setRightsHolder(e.target.value)}
                          placeholder="Institución o persona titular"
                      />
                      <p className="text-xs text-muted-foreground">Titular de los derechos del registro.</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Evento */}
              <AccordionItem value="event" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="text-left">
                    <h3 className="text-xl">Evento</h3>
                    <p className="text-sm text-muted-foreground">Información sobre cuándo y cómo se colectó</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4 pb-6">
                  {/* Event Date */}
                  <div className="space-y-2">
                    <Label htmlFor="eventDate" className="flex items-center gap-2">
                      Fecha del evento
                      <Badge variant="outline" className="text-xs">Recomendado</Badge>
                      <span className="text-xs text-muted-foreground">dwc:eventDate</span>
                    </Label>
                    <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Fecha (o rango) del evento de colecta/observación.</p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="year" className="flex items-center gap-2">
                        Año <span className="text-xs text-muted-foreground">dwc:year</span>
                      </Label>
                      <Input id="year" value={year} readOnly />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="month" className="flex items-center gap-2">
                        Mes <span className="text-xs text-muted-foreground">dwc:month</span>
                      </Label>
                      <Input id="month" value={month} readOnly />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="day" className="flex items-center gap-2">
                        Día <span className="text-xs text-muted-foreground">dwc:day</span>
                      </Label>
                      <Input id="day" value={day} readOnly />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="verbatimEventDate" className="flex items-center gap-2">
                        Fecha original
                        <span className="text-xs text-muted-foreground">dwc:verbatimEventDate</span>
                      </Label>
                      <Input
                          id="verbatimEventDate"
                          value={verbatimEventDate}
                          onChange={(e) => setVerbatimEventDate(e.target.value)}
                          placeholder="Ej: Primavera 2024"
                      />
                      <p className="text-xs text-muted-foreground">Fecha tal como aparece en la fuente original.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fieldNumber" className="flex items-center gap-2">
                        Número de campo
                        <span className="text-xs text-muted-foreground">dwc:fieldNumber</span>
                      </Label>
                      <Input
                          id="fieldNumber"
                          value={fieldNumber}
                          onChange={(e) => setFieldNumber(e.target.value)}
                          placeholder="Código del evento"
                      />
                      <p className="text-xs text-muted-foreground">Código o número del evento de campo.</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="samplingProtocol" className="flex items-center gap-2">
                        Protocolo de muestreo
                        <span className="text-xs text-muted-foreground">dwc:samplingProtocol</span>
                      </Label>
                      <Input
                          id="samplingProtocol"
                          value={samplingProtocol}
                          onChange={(e) => setSamplingProtocol(e.target.value)}
                          placeholder="Ej: Transecto 50m x 2m"
                      />
                      <p className="text-xs text-muted-foreground">Protocolo o método de muestreo empleado.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="samplingEffort" className="flex items-center gap-2">
                        Esfuerzo de muestreo
                        <span className="text-xs text-muted-foreground">dwc:samplingEffort</span>
                      </Label>
                      <Input
                          id="samplingEffort"
                          value={samplingEffort}
                          onChange={(e) => setSamplingEffort(e.target.value)}
                          placeholder="Ej: 4 horas, 10 trampas"
                      />
                      <p className="text-xs text-muted-foreground">Esfuerzo de muestreo (horas, trampas, etc.).</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="habitat" className="flex items-center gap-2">
                      Hábitat
                      <span className="text-xs text-muted-foreground">dwc:habitat</span>
                    </Label>
                    <Textarea
                        id="habitat"
                        value={habitat}
                        onChange={(e) => setHabitat(e.target.value)}
                        placeholder="Descripción del hábitat"
                        rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Descripción del hábitat donde ocurrió el evento.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eventRemarks" className="flex items-center gap-2">
                      Observaciones del evento
                      <span className="text-xs text-muted-foreground">dwc:eventRemarks</span>
                    </Label>
                    <Textarea
                        id="eventRemarks"
                        value={eventRemarks}
                        onChange={(e) => setEventRemarks(e.target.value)}
                        placeholder="Observaciones o notas sobre el evento"
                        rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Observaciones o notas sobre el evento.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Localización */}
              <AccordionItem value="location" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="text-left">
                    <h3 className="text-xl">Localización</h3>
                    <p className="text-sm text-muted-foreground">Información geográfica del lugar de colecta</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4 pb-6">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stateProvince" className="flex items-center gap-2">
                        Departamento/Estado
                        <span className="text-xs text-muted-foreground">dwc:stateProvince</span>
                      </Label>
                      <Input id="stateProvince" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="Ej: Cusco" />
                      <p className="text-xs text-muted-foreground">Primera división política.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="county" className="flex items-center gap-2">
                        Provincia/Condado
                        <span className="text-xs text-muted-foreground">dwc:county</span>
                      </Label>
                      <Input id="county" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Ej: Urubamba" />
                      <p className="text-xs text-muted-foreground">Segunda división política.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="municipality" className="flex items-center gap-2">
                        Municipio/Distrito
                        <span className="text-xs text-muted-foreground">dwc:municipality</span>
                      </Label>
                      <Input id="municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Ej: Ollantaytambo" />
                      <p className="text-xs text-muted-foreground">División local.</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="locality" className="flex items-center gap-2">
                      Localidad
                      <Badge variant="outline" className="text-xs">Recomendado</Badge>
                      <span className="text-xs text-muted-foreground">dwc:locality</span>
                    </Label>
                    <Textarea id="locality" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Descripción específica del sitio de colecta" rows={2} />
                    <p className="text-xs text-muted-foreground">Descripción de la localidad (sitio) de la colecta/observación.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="verbatimLocality" className="flex items-center gap-2">
                      Localidad original
                      <span className="text-xs text-muted-foreground">dwc:verbatimLocality</span>
                    </Label>
                    <Input id="verbatimLocality" value={verbatimLocality} onChange={(e) => setVerbatimLocality(e.target.value)} placeholder="Localidad tal como aparece en la etiqueta" />
                    <p className="text-xs text-muted-foreground">Localidad tal como aparece en la fuente original.</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="decimalLatitude" className="flex items-center gap-2">
                        Latitud decimal
                        <span className="text-xs text-muted-foreground">dwc:decimalLatitude</span>
                      </Label>
                      <Input id="decimalLatitude" type="number" step="0.000001" value={decimalLatitude} onChange={(e) => setDecimalLatitude(e.target.value)} placeholder="-12.046373" />
                      <p className="text-xs text-muted-foreground">Latitud en grados decimales.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="decimalLongitude" className="flex items-center gap-2">
                        Longitud decimal
                        <span className="text-xs text-muted-foreground">dwc:decimalLongitude</span>
                      </Label>
                      <Input id="decimalLongitude" type="number" step="0.000001" value={decimalLongitude} onChange={(e) => setDecimalLongitude(e.target.value)} placeholder="-77.042755" />
                      <p className="text-xs text-muted-foreground">Longitud en grados decimales.</p>
                    </div>
                  </div>

                  <Button type="button" variant="outline" onClick={handleTakeFromMap} className="w-full">
                    <MapPin className="h-4 w-4 mr-2" />
                    Tomar coordenadas del mapa
                  </Button>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="geodeticDatum" className="flex items-center gap-2">
                        Datum geodésico
                        <span className="text-xs text-muted-foreground">dwc:geodeticDatum</span>
                      </Label>
                      <Select value={geodeticDatum} onValueChange={setGeodeticDatum}>
                        <SelectTrigger id="geodeticDatum">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WGS84">WGS84</SelectItem>
                          <SelectItem value="NAD27">NAD27</SelectItem>
                          <SelectItem value="NAD83">NAD83</SelectItem>
                          <SelectItem value="EPSG:4326">EPSG:4326</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Datum geodésico.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="coordinateUncertaintyInMeters" className="flex items-center gap-2">
                        Incertidumbre (m)
                        <span className="text-xs text-muted-foreground">dwc:coordinateUncertainty</span>
                      </Label>
                      <Input id="coordinateUncertaintyInMeters" type="number" min={0} value={coordinateUncertaintyInMeters} onChange={(e) => setCoordinateUncertaintyInMeters(e.target.value)} placeholder="100" />
                      <p className="text-xs text-muted-foreground">Incertidumbre en metros.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="coordinatePrecision" className="flex items-center gap-2">
                        Precisión
                        <span className="text-xs text-muted-foreground">dwc:coordinatePrecision</span>
                      </Label>
                      <Input id="coordinatePrecision" value={coordinatePrecision} onChange={(e) => setCoordinatePrecision(e.target.value)} placeholder="0.00001" />
                      <p className="text-xs text-muted-foreground">Precisión de coordenadas.</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minimumElevationInMeters" className="flex items-center gap-2">
                        Elevación mín. (m)
                        <span className="text-xs text-muted-foreground">dwc:minimumElevation</span>
                      </Label>
                      <Input id="minimumElevationInMeters" type="number" value={minimumElevationInMeters} onChange={(e) => setMinimumElevationInMeters(e.target.value)} placeholder="1200" />
                      <p className="text-xs text-muted-foreground">Elevación mínima en metros.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maximumElevationInMeters" className="flex items-center gap-2">
                        Elevación máx. (m)
                        <span className="text-xs text-muted-foreground">dwc:maximumElevation</span>
                      </Label>
                      <Input id="maximumElevationInMeters" type="number" value={maximumElevationInMeters} onChange={(e) => setMaximumElevationInMeters(e.target.value)} placeholder="1500" />
                      <p className="text-xs text-muted-foreground">Elevación máxima en metros.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="verbatimElevation" className="flex items-center gap-2">
                        Elevación original
                        <span className="text-xs text-muted-foreground">dwc:verbatimElevation</span>
                      </Label>
                      <Input id="verbatimElevation" value={verbatimElevation} onChange={(e) => setVerbatimElevation(e.target.value)} placeholder="Ej: 1200-1500m" />
                      <p className="text-xs text-muted-foreground">Elevación original.</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Taxonomía */}
              <AccordionItem value="taxon" className="border rounded-lg px-6 bg-card">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="text-left">
                    <h3 className="text-xl">Taxonomía</h3>
                    <p className="text-sm text-muted-foreground">Información taxonómica del espécimen</p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4 pb-6">
                  <div className="space-y-2">
                    <Label htmlFor="scientificName" className="flex items-center gap-2">
                      Nombre científico <span className="text-destructive">*</span>
                      <Badge variant="secondary" className="text-xs">Requerido</Badge>
                    </Label>
                    <Input id="scientificName" value={scientificName} onChange={(e) => setScientificName(e.target.value)} placeholder="Genus species Author, year" required />
                    <p className="text-xs text-muted-foreground">Nombre científico completo (Genus species Autor, año).</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scientificNameAuthorship" className="flex items-center gap-2">
                      Autoría del nombre
                    </Label>
                    <Input id="scientificNameAuthorship" value={scientificNameAuthorship} onChange={(e) => setScientificNameAuthorship(e.target.value)} placeholder="L., 1753" />
                    <p className="text-xs text-muted-foreground">Autoría del nombre científico (autor y año).</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="family" className="flex items-center gap-2">
                        Familia
                        <Badge variant="outline" className="text-xs">Recomendado</Badge>
                      </Label>
                      <Input id="family" value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Ej: Asteraceae" />
                      <p className="text-xs text-muted-foreground">Familia taxonómica.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="genus" className="flex items-center gap-2">
                        Género
                        <Badge variant="outline" className="text-xs">Recomendado</Badge>
                      </Label>
                      <Input id="genus" value={genus} onChange={(e) => setGenus(e.target.value)} placeholder="Ej: Helianthus" />
                      <p className="text-xs text-muted-foreground">Género taxonómico.</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="specificEpithet" className="flex items-center gap-2">Epíteto específico</Label>
                      <Input id="specificEpithet" value={specificEpithet} onChange={(e) => setSpecificEpithet(e.target.value)} placeholder="Ej: annuus" />
                      <p className="text-xs text-muted-foreground">Epíteto específico (parte de la especie).</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="infraspecificEpithet" className="flex items-center gap-2">Epíteto infraespecífico</Label>
                      <Input id="infraspecificEpithet" value={infraspecificEpithet} onChange={(e) => setInfraspecificEpithet(e.target.value)} placeholder="Ej: subsp. lenticularis" />
                      <p className="text-xs text-muted-foreground">Epíteto infraespecífico (subsp., var., etc.).</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="taxonRank" className="flex items-center gap-2">Rango taxonómico</Label>
                      <Select value={taxonRank} onValueChange={setTaxonRank}>
                        <SelectTrigger id="taxonRank">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="species">Especie</SelectItem>
                          <SelectItem value="subspecies">Subespecie</SelectItem>
                          <SelectItem value="variety">Variedad</SelectItem>
                          <SelectItem value="form">Forma</SelectItem>
                          <SelectItem value="genus">Género</SelectItem>
                          <SelectItem value="family">Familia</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Rango taxonómico del nombre.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="acceptedNameUsage" className="flex items-center gap-2">Nombre aceptado</Label>
                      <Input id="acceptedNameUsage" value={acceptedNameUsage} onChange={(e) => setAcceptedNameUsage(e.target.value)} placeholder="Si es sinónimo, nombre aceptado" />
                      <p className="text-xs text-muted-foreground">Nombre aceptado en caso de sinónimos.</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </form>
        </div>

        {/* Barra de acciones fija al fondo (fuera del form) */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 supports-[backdrop-filter]:bg-card/60 backdrop-blur border-t">
          <div className="container mx-auto max-w-5xl px-4 py-3 flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button type="submit" form="occ-form" className="bg-[rgb(117,26,29)] hover:bg-[rgb(97,16,19)]">
              {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
            </Button>
          </div>
        </div>
      </>
  );
}
