import React, { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Badge } from "../ui/badge";
import {
  ArrowLeft,
  Plus,
  X,
  MapPin,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  Leaf,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "../ui/alert";
import { API } from "@constants/api";
import { useAuth } from "../../contexts/AuthContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { env } from "@config/env";

interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: "create" | "edit";
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection";
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

type Occurrence = Record<string, any>;

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
  return readAll().find((o) => o.id === id || o.occurrenceID === id);
}

function addOccurrenceLS(data: Occurrence): string {
  const all = readAll();
  const id = generateUUID();
  all.push({ ...data, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  writeAll(all);
  return id;
}

function updateOccurrenceLS(id: string, patch: Occurrence) {
  const all = readAll();
  const idx = all.findIndex((o) => o.id === id || o.occurrenceID === id);
  if (idx === -1) { toast.error("No se encontró la ocurrencia a actualizar"); return; }
  const prev = all[idx];
  all[idx] = { ...prev, ...patch, id: prev.id ?? id, updatedAt: new Date().toISOString() };
  writeAll(all);
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const getCurrentDate = () => new Date().toISOString().split("T")[0];

/* ─── Types ─────────────────────── */
interface ScientificNameSuggestion {
  scientificName: string;
  taxonID: string | null;
  scientificNameAuthorship?: string | null;
}

interface TaxonDetail {
  id: number | null;
  taxonID?: string | null;
  scientificName?: string | null;
  scientificNameAuthorship?: string | null;
  family?: string | null;
  genus?: string | null;
  specificEpithet?: string | null;
  infraspecificEpithet?: string | null;
  taxonRank?: string | null;
  acceptedNameUsageID?: string | null;
  taxonomicStatus?: string | null;
  majorGroup?: string | null;
  namePublishedIn?: string | null;
}

/* ─── Tab definitions ───────────── */
type TabKey = "occurrence" | "event" | "location" | "taxon" | "images";

const TABS: { key: TabKey; label: string }[] = [
  { key: "occurrence", label: "Ocurrencia" },
  { key: "event", label: "Evento" },
  { key: "location", label: "Localización" },
  { key: "taxon", label: "Taxonomía" },
  { key: "images", label: "Imagen" },
];

/* ────────────────────────────────────────────────────────────────── */
export function NewOccurrencePage({
  onNavigate,
  mode = "create",
  occurrenceId,
  returnTo = "occurrences",
  collectionId,
  collectionName: collectionNameProp,
  isOwner,
}: NewOccurrencePageProps) {
  const { apiFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("occurrence");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── OCCURRENCE ── */
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
  const [dpKey, setDpKey] = useState("");
  const [dpValue, setDpValue] = useState("");
  const [dynamicProps, setDynamicProps] = useState<Array<{ key: string; value: string }>>([]);

  /* ── EVENT ── */
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

  /* ── LOCATION ── */
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

  /* ── TAXON ── */
  const [scientificNameInput, setScientificNameInput] = useState("");
  const [selectedTaxonID, setSelectedTaxonID] = useState<string | null>(null);
  const [taxonDetail, setTaxonDetail] = useState<TaxonDetail | null>(null);
  const [taxonLoading, setTaxonLoading] = useState(false);

  // Autocomplete
  const [acSuggestions, setAcSuggestions] = useState<ScientificNameSuggestion[]>([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acOpen, setAcOpen] = useState(false);
  const acTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acRef = useRef<HTMLDivElement>(null);

  /* ── IMAGE (single) ── */
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedImageBlobUrl = useRef<string | null>(null);

  /* ── CAMERA ── */
  const [captureLoading, setCaptureLoading] = useState(false);  // POST capture
  const [cameraError, setCameraError] = useState<string | null>(null);

  /* ── Derive year/month/day ── */
  useEffect(() => {
    if (!eventDate) { setYear(""); setMonth(""); setDay(""); return; }
    const d = new Date(eventDate);
    if (!isNaN(d.getTime())) {
      setYear(String(d.getUTCFullYear()));
      setMonth(String(d.getUTCMonth() + 1).padStart(2, "0"));
      setDay(String(d.getUTCDate()).padStart(2, "0"));
    }
  }, [eventDate]);

  /* ── Cleanup blobs on unmount ── */
  useEffect(() => {
    return () => {
      if (selectedImageBlobUrl.current) URL.revokeObjectURL(selectedImageBlobUrl.current);
    };
  }, []);

  /* ── Load edit mode ── */
  useEffect(() => {
    if (mode === "edit" && occurrenceId) {
      const occurrence = getOccurrenceById(occurrenceId);
      if (!occurrence) { toast.error("No se encontró la ocurrencia"); return; }
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
      setScientificNameInput(occurrence.scientificName ?? "");
      const dp = occurrence.dynamicProperties;
      if (dp) {
        try {
          const obj = typeof dp === "string" ? JSON.parse(dp) : dp;
          if (obj && typeof obj === "object") {
            setDynamicProps(Object.entries(obj).map(([k, v]) => ({ key: String(k), value: typeof v === "string" ? v : JSON.stringify(v) })));
          }
        } catch {
          const list = String(dp).split(";").map((s) => s.trim()).filter(Boolean)
            .map((pair) => { const [k, ...rest] = pair.split("="); return { key: k?.trim() ?? "", value: rest.join("=").trim() }; })
            .filter((kv) => kv.key);
          setDynamicProps(list);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, occurrenceId]);

  /* ── Close autocomplete on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (acRef.current && !acRef.current.contains(e.target as Node)) setAcOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Autocomplete ── */
  const handleScientificNameChange = (value: string) => {
    setScientificNameInput(value);
    if (selectedTaxonID) { setSelectedTaxonID(null); setTaxonDetail(null); }
    if (acTimeout.current) clearTimeout(acTimeout.current);
    if (value.trim().length < 2) { setAcSuggestions([]); setAcOpen(false); return; }
    acTimeout.current = setTimeout(async () => {
      setAcLoading(true);
      try {
        const res = await fetch(`${API.BASE_URL}/autocomplete/scientific-name?q=${encodeURIComponent(value.trim())}&limit=10`);
        if (!res.ok) throw new Error("Error fetching suggestions");
        const data = await res.json();
        setAcSuggestions(data.items ?? []);
        setAcOpen((data.items ?? []).length > 0);
      } catch {
        setAcSuggestions([]); setAcOpen(false);
      } finally {
        setAcLoading(false);
      }
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: ScientificNameSuggestion) => {
    setScientificNameInput(suggestion.scientificName);
    setAcOpen(false); setAcSuggestions([]);
    if (!suggestion.taxonID) return;
    setSelectedTaxonID(suggestion.taxonID);
    setTaxonLoading(true);
    try {
      const res = await fetch(`${API.BASE_URL}/taxon/${encodeURIComponent(suggestion.taxonID)}`);
      if (!res.ok) throw new Error("Error fetching taxon detail");
      setTaxonDetail(await res.json());
    } catch {
      toast.error("No se pudo cargar el detalle del taxón"); setTaxonDetail(null);
    } finally {
      setTaxonLoading(false);
    }
  };

  /* helpers — revoke old selected preview and set new one */
  const setSelectedImageFromBlob = (blob: Blob, filename: string) => {
    if (selectedImageBlobUrl.current) URL.revokeObjectURL(selectedImageBlobUrl.current);
    const url = URL.createObjectURL(blob);
    selectedImageBlobUrl.current = url;
    setSelectedImagePreview(url);
    setSelectedImage(new File([blob], filename, { type: blob.type || "image/jpeg" }));
  };

  /* Tomar Foto — POST capture-image (sets as selected image) */
  const handleCapture = async () => {
    setCaptureLoading(true);
    setCameraError(null);
    try {
      const res = await fetch(`${env.CAMERA_BASE_URL}/api/camera/capture-image`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      const blob = await res.blob();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      setSelectedImageFromBlob(blob, `captura-${timestamp}.jpg`);
      toast.success("Foto capturada y seleccionada");
    } catch (err: any) {
      setCameraError(err?.message ?? "Error al capturar la imagen");
      toast.error("No se pudo capturar");
    } finally {
      setCaptureLoading(false);
    }
  };

  /* Subir Archivo — single file */
  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setSelectedImageFromBlob(file, file.name);
  };

  /* ── Other handlers ── */
  const handleAddRecordedBy = () => {
    if (recordedByInput.trim()) { setRecordedBy([...recordedBy, recordedByInput.trim()]); setRecordedByInput(""); }
  };
  const handleRemoveRecordedBy = (index: number) => setRecordedBy(recordedBy.filter((_, i) => i !== index));
  const handleTakeFromMap = () => { setDecimalLatitude("-12.0464"); setDecimalLongitude("-77.0428"); setCoordinateUncertaintyInMeters("100"); setGeodeticDatum("WGS84"); toast.success("Coordenadas tomadas del mapa"); };
  const handleAddDynamicProp = () => { if (!dpKey.trim()) { toast.error("Ingresa una clave para el registro adicional"); return; } setDynamicProps((prev) => [...prev, { key: dpKey.trim(), value: dpValue }]); setDpKey(""); setDpValue(""); };
  const handleRemoveDynamicProp = (idx: number) => setDynamicProps((prev) => prev.filter((_, i) => i !== idx));

  const handleCancel = () => {
    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", { collectionId, collectionName: collectionNameProp || "", isOwner: isOwner ?? false });
    } else {
      onNavigate("occurrences");
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    console.log(selectedTaxonID);
    if (!catalogNumber || !selectedTaxonID) {
      toast.error("Faltan campos obligatorios", { description: "Por favor, completa el número de catálogo y asocia un taxón antes de guardar." });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Crear Ocurrencia
      const dynamicProperties: Record<string, any> = {};
      dynamicProps.forEach((p) => { dynamicProperties[p.key] = p.value; });
      // Agregar campos propios que no coinciden con DwC exacto al dinámico
      if (recordEnteredBy) dynamicProperties.recordEnteredBy = recordEnteredBy;
      if (occurrenceStatus) dynamicProperties.occurrenceStatus = occurrenceStatus;
      if (preparations) dynamicProperties.preparations = preparations;
      if (disposition) dynamicProperties.disposition = disposition;
      if (license) dynamicProperties.license = license;
      if (rightsHolder) dynamicProperties.rightsHolder = rightsHolder;
      if (accessRights) dynamicProperties.accessRights = accessRights;
      if (individualCount) dynamicProperties.individualCount = individualCount;

      const payload = {
        collectionId: Number(collectionId),
        occurrenceID,
        catalogNumber,
        recordNumber: recordNumber || null,
        recordedBy: recordedBy.length > 0 ? recordedBy.join(", ") : null,
        
        eventDate: eventDate || null,
        verbatimEventDate: verbatimEventDate || null,
        year: year ? parseInt(year) : null,
        month: month ? parseInt(month) : null,
        day: day ? parseInt(day) : null,
        habitat: habitat || null,
        eventRemarks: eventRemarks || null,

        stateProvince: stateProvince || null,
        county: county || null,
        municipality: municipality || null,
        locality: locality || null,
        verbatimLocality: verbatimLocality || null,
        decimalLatitude: decimalLatitude ? parseFloat(decimalLatitude) : null,
        decimalLongitude: decimalLongitude ? parseFloat(decimalLongitude) : null,
        verbatimElevation: verbatimElevation || null,
        minimumElevationInMeters: minimumElevationInMeters ? parseFloat(minimumElevationInMeters) : null,
        maximumElevationInMeters: maximumElevationInMeters ? parseFloat(maximumElevationInMeters) : null,
        
        taxonId: taxonDetail?.id || null,
        scientificName: scientificNameInput || null,

        dynamicProperties: Object.keys(dynamicProperties).length > 0 ? dynamicProperties : null,
      };

      let createdOccId: string | number | null = null;

      if (mode === "create") {
         const res = await apiFetch(`${API.BASE_URL}${API.PATHS.CREATE_OCCURRENCE}`, {
             method: "POST",
             body: JSON.stringify(payload)
         });
         const data = await res.json();
         createdOccId = data.id;
         toast.success("Ocurrencia creada correctamente");
      } else {
         toast.info("Funcionalidad de actualización en Desarrollo");
         // placeholder if you want to implement PUT here...
         setIsSubmitting(false);
         return;
      }

      // 2. Subir imagen si existe
      if (selectedImage && createdOccId) {
          try {
            const formData = new FormData();
            formData.append("occurrence_id", createdOccId.toString());
            console.log("Occurrence id: ", createdOccId);
            formData.append("file", selectedImage);
            
            await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD_IMAGE}`, {
                method: "POST",
                body: formData
            });
            toast.success("Imagen asociada correctamente");
          } catch (err: any) {
            toast.error("Error al subir la imagen", { description: err.message });
            // remove headers override issue inside apiFetch:
            // if apiFetch forces json, we might have to use plain fetch for multipart
          }
      }

      // Navegar devuelta
      handleCancel();
    } catch (err: any) {
      toast.error("Error al guardar ocurrencia", { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ══════════════════════════════════════════════════
     TAB RENDERERS
  ══════════════════════════════════════════════════ */

  const renderOccurrenceTab = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="occurrenceID" className="flex items-center gap-2">
          Occurrence ID (UUID)
          <span className="text-xs text-muted-foreground">dwc:occurrenceID</span>
        </Label>
        <div className="flex gap-2">
          <Input id="occurrenceID" value={occurrenceID} onChange={(e) => { setOccurrenceID(e.target.value); setOccurrenceIDEdited(true); }} className="font-mono text-sm" />
          <Button type="button" variant="outline" onClick={() => { setOccurrenceID(generateUUID()); setOccurrenceIDEdited(false); }}>Regenerar</Button>
        </div>
        {occurrenceIDEdited && (
          <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Has editado manualmente el UUID. Asegúrate de que sea único.</AlertDescription></Alert>
        )}
        <p className="text-xs text-muted-foreground">Identificador único del registro de ocurrencia.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="catalogNumber" className="flex items-center gap-2">
          Número de catálogo <span className="text-destructive">*</span>
          <Badge variant="secondary" className="text-xs">Requerido</Badge>
          <span className="text-xs text-muted-foreground">dwc:catalogNumber</span>
        </Label>
        <Input id="catalogNumber" value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} placeholder="BOT-2024-001" required />
        <p className="text-xs text-muted-foreground">Número o código de catálogo asignado al ejemplar.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="recordNumber" className="flex items-center gap-2">Número de registro <span className="text-xs text-muted-foreground">dwc:recordNumber</span></Label>
          <Input id="recordNumber" value={recordNumber} onChange={(e) => setRecordNumber(e.target.value)} placeholder="Número de colecta" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="individualCount" className="flex items-center gap-2">Número de individuos <span className="text-xs text-muted-foreground">dwc:individualCount</span></Label>
          <Input id="individualCount" type="number" min={0} value={individualCount} onChange={(e) => setIndividualCount(e.target.value)} placeholder="1" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">Registrado por <Badge variant="outline" className="text-xs">Recomendado</Badge> <span className="text-xs text-muted-foreground">dwc:recordedBy</span></Label>
        <div className="flex gap-2">
          <Input value={recordedByInput} onChange={(e) => setRecordedByInput(e.target.value)} placeholder="Nombre del recolector" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRecordedBy(); } }} />
          <Button type="button" onClick={handleAddRecordedBy} variant="outline"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {recordedBy.map((person, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {person}
              <button type="button" onClick={() => handleRemoveRecordedBy(index)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recordEnteredBy" className="flex items-center gap-2">Digitado por <span className="text-xs text-muted-foreground">dwc:recordEnteredBy</span></Label>
        <Input id="recordEnteredBy" value={recordEnteredBy} onChange={(e) => setRecordEnteredBy(e.target.value)} placeholder="Nombre de quien digitó" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="occurrenceStatus" className="flex items-center gap-2">Estado <span className="text-xs text-muted-foreground">dwc:occurrenceStatus</span></Label>
          <Select value={occurrenceStatus} onValueChange={setOccurrenceStatus}>
            <SelectTrigger id="occurrenceStatus"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="present">Presente</SelectItem><SelectItem value="absent">Ausente</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="preparations" className="flex items-center gap-2">Preparación <span className="text-xs text-muted-foreground">dwc:preparations</span></Label>
          <Select value={preparations} onValueChange={setPreparations}>
            <SelectTrigger id="preparations"><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="herbarium_sheet">Herbarium sheet</SelectItem>
              <SelectItem value="alcohol">Alcohol</SelectItem>
              <SelectItem value="dried">Dried</SelectItem>
              <SelectItem value="pressed">Pressed</SelectItem>
              <SelectItem value="tissue">Tissue</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="disposition" className="flex items-center gap-2">Disposición <span className="text-xs text-muted-foreground">dwc:disposition</span></Label>
          <Select value={disposition} onValueChange={setDisposition}>
            <SelectTrigger id="disposition"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in_collection">En colección</SelectItem>
              <SelectItem value="on_loan">Prestado</SelectItem>
              <SelectItem value="missing">Perdido</SelectItem>
              <SelectItem value="destroyed">Destruido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="occurrenceRemarks" className="flex items-center gap-2">Observaciones <span className="text-xs text-muted-foreground">dwc:occurrenceRemarks</span></Label>
        <Textarea id="occurrenceRemarks" value={occurrenceRemarks} onChange={(e) => setOccurrenceRemarks(e.target.value)} placeholder="Observaciones adicionales sobre la ocurrencia" rows={3} />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">Registros adicionales (dynamicProperties) <span className="text-xs text-muted-foreground">dwc:dynamicProperties</span></Label>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input placeholder="clave" value={dpKey} onChange={(e) => setDpKey(e.target.value)} className="md:col-span-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDynamicProp(); } }} />
          <Input placeholder="valor" value={dpValue} onChange={(e) => setDpValue(e.target.value)} className="md:col-span-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDynamicProp(); } }} />
          <Button type="button" variant="outline" onClick={handleAddDynamicProp} className="md:col-span-1"><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
        </div>
        {dynamicProps.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {dynamicProps.map((kv, idx) => (
              <Badge key={`${kv.key}-${idx}`} variant="secondary" className="gap-1">
                <span className="font-mono">{kv.key}</span>: {kv.value}
                <button type="button" onClick={() => handleRemoveDynamicProp(idx)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="license" className="flex items-center gap-2">Licencia <span className="text-xs text-muted-foreground">dwc:license</span></Label>
          <Select value={license} onValueChange={setLicense}>
            <SelectTrigger id="license"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CC-BY-4.0">CC BY 4.0</SelectItem>
              <SelectItem value="CC-BY-NC-4.0">CC BY-NC 4.0</SelectItem>
              <SelectItem value="CC0">CC0 (Dominio Público)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="rightsHolder" className="flex items-center gap-2">Titular de derechos <span className="text-xs text-muted-foreground">dwc:rightsHolder</span></Label>
          <Input id="rightsHolder" value={rightsHolder} onChange={(e) => setRightsHolder(e.target.value)} placeholder="Institución o persona titular" />
        </div>
      </div>
    </div>
  );

  const renderEventTab = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="eventDate" className="flex items-center gap-2">
          Fecha del evento <Badge variant="outline" className="text-xs">Recomendado</Badge>
          <span className="text-xs text-muted-foreground">dwc:eventDate</span>
        </Label>
        <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2"><Label htmlFor="year" className="flex items-center gap-2">Año <span className="text-xs text-muted-foreground">dwc:year</span></Label><Input id="year" value={year} readOnly className="bg-muted/40" /></div>
        <div className="space-y-2"><Label htmlFor="month" className="flex items-center gap-2">Mes <span className="text-xs text-muted-foreground">dwc:month</span></Label><Input id="month" value={month} readOnly className="bg-muted/40" /></div>
        <div className="space-y-2"><Label htmlFor="day" className="flex items-center gap-2">Día <span className="text-xs text-muted-foreground">dwc:day</span></Label><Input id="day" value={day} readOnly className="bg-muted/40" /></div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="verbatimEventDate" className="flex items-center gap-2">Fecha original <span className="text-xs text-muted-foreground">dwc:verbatimEventDate</span></Label>
          <Input id="verbatimEventDate" value={verbatimEventDate} onChange={(e) => setVerbatimEventDate(e.target.value)} placeholder="Ej: Primavera 2024" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fieldNumber" className="flex items-center gap-2">Número de campo <span className="text-xs text-muted-foreground">dwc:fieldNumber</span></Label>
          <Input id="fieldNumber" value={fieldNumber} onChange={(e) => setFieldNumber(e.target.value)} placeholder="Código del evento" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="samplingProtocol" className="flex items-center gap-2">Protocolo de muestreo <span className="text-xs text-muted-foreground">dwc:samplingProtocol</span></Label>
          <Input id="samplingProtocol" value={samplingProtocol} onChange={(e) => setSamplingProtocol(e.target.value)} placeholder="Ej: Transecto 50m x 2m" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="samplingEffort" className="flex items-center gap-2">Esfuerzo de muestreo <span className="text-xs text-muted-foreground">dwc:samplingEffort</span></Label>
          <Input id="samplingEffort" value={samplingEffort} onChange={(e) => setSamplingEffort(e.target.value)} placeholder="Ej: 4 horas, 10 trampas" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="habitat" className="flex items-center gap-2">Hábitat <span className="text-xs text-muted-foreground">dwc:habitat</span></Label>
        <Textarea id="habitat" value={habitat} onChange={(e) => setHabitat(e.target.value)} placeholder="Descripción del hábitat" rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="eventRemarks" className="flex items-center gap-2">Observaciones del evento <span className="text-xs text-muted-foreground">dwc:eventRemarks</span></Label>
        <Textarea id="eventRemarks" value={eventRemarks} onChange={(e) => setEventRemarks(e.target.value)} placeholder="Observaciones o notas sobre el evento" rows={3} />
      </div>
    </div>
  );

  const renderLocationTab = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="stateProvince" className="flex items-center gap-2">Departamento/Estado <span className="text-xs text-muted-foreground">dwc:stateProvince</span></Label>
          <Input id="stateProvince" value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="Ej: Cusco" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="county" className="flex items-center gap-2">Provincia/Condado <span className="text-xs text-muted-foreground">dwc:county</span></Label>
          <Input id="county" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Ej: Urubamba" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="municipality" className="flex items-center gap-2">Municipio/Distrito <span className="text-xs text-muted-foreground">dwc:municipality</span></Label>
          <Input id="municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Ej: Ollantaytambo" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="locality" className="flex items-center gap-2">Localidad <Badge variant="outline" className="text-xs">Recomendado</Badge> <span className="text-xs text-muted-foreground">dwc:locality</span></Label>
        <Textarea id="locality" value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Descripción específica del sitio de colecta" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="verbatimLocality" className="flex items-center gap-2">Localidad original <span className="text-xs text-muted-foreground">dwc:verbatimLocality</span></Label>
        <Input id="verbatimLocality" value={verbatimLocality} onChange={(e) => setVerbatimLocality(e.target.value)} placeholder="Localidad tal como aparece en la etiqueta" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="decimalLatitude" className="flex items-center gap-2">Latitud decimal <span className="text-xs text-muted-foreground">dwc:decimalLatitude</span></Label>
          <Input id="decimalLatitude" type="number" step="0.000001" value={decimalLatitude} onChange={(e) => setDecimalLatitude(e.target.value)} placeholder="-12.046373" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="decimalLongitude" className="flex items-center gap-2">Longitud decimal <span className="text-xs text-muted-foreground">dwc:decimalLongitude</span></Label>
          <Input id="decimalLongitude" type="number" step="0.000001" value={decimalLongitude} onChange={(e) => setDecimalLongitude(e.target.value)} placeholder="-77.042755" />
        </div>
      </div>
      <Button type="button" variant="outline" onClick={handleTakeFromMap} className="w-full">
        <MapPin className="h-4 w-4 mr-2" /> Tomar coordenadas del mapa
      </Button>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="geodeticDatum" className="flex items-center gap-2">Datum geodésico <span className="text-xs text-muted-foreground">dwc:geodeticDatum</span></Label>
          <Select value={geodeticDatum} onValueChange={setGeodeticDatum}>
            <SelectTrigger id="geodeticDatum"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WGS84">WGS84</SelectItem>
              <SelectItem value="NAD27">NAD27</SelectItem>
              <SelectItem value="NAD83">NAD83</SelectItem>
              <SelectItem value="EPSG:4326">EPSG:4326</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="coordinateUncertaintyInMeters" className="flex items-center gap-2">Incertidumbre (m) <span className="text-xs text-muted-foreground">dwc:coordinateUncertainty</span></Label>
          <Input id="coordinateUncertaintyInMeters" type="number" min={0} value={coordinateUncertaintyInMeters} onChange={(e) => setCoordinateUncertaintyInMeters(e.target.value)} placeholder="100" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="coordinatePrecision" className="flex items-center gap-2">Precisión <span className="text-xs text-muted-foreground">dwc:coordinatePrecision</span></Label>
          <Input id="coordinatePrecision" value={coordinatePrecision} onChange={(e) => setCoordinatePrecision(e.target.value)} placeholder="0.00001" />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="minimumElevationInMeters">Elevación mín. (m)</Label>
          <Input id="minimumElevationInMeters" type="number" value={minimumElevationInMeters} onChange={(e) => setMinimumElevationInMeters(e.target.value)} placeholder="1200" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maximumElevationInMeters">Elevación máx. (m)</Label>
          <Input id="maximumElevationInMeters" type="number" value={maximumElevationInMeters} onChange={(e) => setMaximumElevationInMeters(e.target.value)} placeholder="1500" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="verbatimElevation">Elevación original</Label>
          <Input id="verbatimElevation" value={verbatimElevation} onChange={(e) => setVerbatimElevation(e.target.value)} placeholder="Ej: 1200-1500m" />
        </div>
      </div>
    </div>
  );

  const renderTaxonTab = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="scientificName" className="flex items-center gap-2">
          Nombre científico <span className="text-destructive">*</span>
          <Badge variant="secondary" className="text-xs">Requerido</Badge>
          <span className="text-xs text-muted-foreground">dwc:scientificName</span>
        </Label>
        <div className="relative" ref={acRef}>
          <div className="relative">
            <Input
              id="scientificName"
              value={scientificNameInput}
              onChange={(e) => handleScientificNameChange(e.target.value)}
              placeholder="Escribe para buscar un nombre científico…"
              autoComplete="off"
              className={selectedTaxonID ? "pr-10 border-green-500 focus-visible:ring-green-500/30" : "pr-10"}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              {acLoading
                ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                : selectedTaxonID
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : null}
            </div>
          </div>
          {acOpen && acSuggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
              <ul className="max-h-64 overflow-y-auto py-1">
                {acSuggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-center gap-3"
                      onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                    >
                      <Leaf className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                      <span className="italic text-sm">{s.scientificName}</span>
                      {s.scientificNameAuthorship && (
                        <span className="text-xs text-muted-foreground italic">{s.scientificNameAuthorship}</span>
                      )}
                      {s.taxonID && <span className="ml-auto text-xs text-muted-foreground/60 font-mono">{s.taxonID}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Escribe al menos 2 caracteres para buscar en el backbone taxonómico.</p>
      </div>

      {taxonLoading && (
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cargando información taxonómica…</span>
        </div>
      )}

      {taxonDetail && !taxonLoading && (
        <div className="rounded-lg border bg-muted/20 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <p className="text-sm font-medium">Información taxonómica verificada</p>
            <Badge variant="outline" className="text-xs ml-auto">Solo lectura</Badge>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">Datos del backbone taxonómico. Solo para corroboración.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Taxon ID</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm font-mono">{taxonDetail.taxonID ?? "—"}</div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Nombre científico</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">{taxonDetail.scientificName ?? "—"}</div></div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Autoría</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">{taxonDetail.scientificNameAuthorship ?? "—"}</div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Rango taxonómico</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm capitalize">{taxonDetail.taxonRank ?? "—"}</div></div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Familia</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">{taxonDetail.family ?? "—"}</div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Género</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">{taxonDetail.genus ?? "—"}</div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Epíteto específico</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">{taxonDetail.specificEpithet ?? "—"}</div></div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Estado taxonómico</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">{taxonDetail.taxonomicStatus ?? "—"}</div></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Grupo mayor</Label><div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm capitalize">{taxonDetail.majorGroup ?? "—"}</div></div>
          </div>
        </div>
      )}

      {!taxonDetail && !taxonLoading && scientificNameInput.trim().length >= 2 && !acOpen && !selectedTaxonID && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Selecciona un nombre científico de la lista para vincular al taxón.</AlertDescription>
        </Alert>
      )}
    </div>
  );

  const renderImagesTab = () => (
    <div className="space-y-6">
      {/* ─── Panel unificado ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">

        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b bg-muted/30">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium mr-2">Imagen del espécimen</p>
          {/* Tomar Foto */}
          <Button
            type="button" size="sm" variant="outline"
            onClick={handleCapture}
            disabled={captureLoading}
            className="gap-1.5"
          >
            {captureLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Camera className="h-3.5 w-3.5" />}
            {captureLoading ? "Capturando…" : "Tomar Foto"}
          </Button>
          {/* Subir Archivo */}
          <Button
            type="button" size="sm" variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Subir Archivo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/tiff,image/webp"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </div>

        {/* Error banner */}
        {cameraError && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 border-t border-destructive/20 text-destructive text-xs">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {cameraError}
          </div>
        )}
      </div>

      {/* ─── Imagen Seleccionada ─── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Imagen Seleccionada</p>
          {selectedImage && (
            <button
              type="button"
              onClick={() => { setSelectedImage(null); setSelectedImagePreview(null); }}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
        </div>
        {selectedImagePreview && selectedImage ? (
          <div className="p-6 flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="bg-muted/20 flex-shrink-0 flex items-center justify-center border rounded-lg p-2">
              <img
                src={selectedImagePreview}
                alt={selectedImage.name}
                className="max-w-full md:max-w-[300px] max-h-[300px] object-contain rounded-md shadow-sm"
              />
            </div>
            <div className="space-y-1.5 md:pt-4 text-center md:text-left">
              <p className="text-base font-medium break-all">{selectedImage.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedImage.size / 1024 / 1024).toFixed(2)} MB • {selectedImage.type || "image/jpeg"}
              </p>
              <div className="mt-4 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                Lista para subir (calidad original guardada)
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-6 text-muted-foreground">
            <ImageIcon className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">Ninguna imagen seleccionada. Usa Tomar Foto o Subir Archivo.</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════
     RENDER PRINCIPAL
  ══════════════════════════════════════════════════ */
  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
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

        {/* Tabs navigation */}
        <div className="mb-6">
          <div className="flex gap-1 border-b overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "px-5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative border-b-2 -mb-px",
                  activeTab === tab.key
                    ? "border-[rgb(117,26,29)] text-[rgb(117,26,29)]"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                ].join(" ")}
              >
                {tab.label}
                {tab.key === "taxon" && selectedTaxonID && (
                  <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
                {tab.key === "images" && selectedImage && (
                  <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <form id="occ-form" onSubmit={handleSubmit} className="pb-28">
          <div className="rounded-lg border bg-card px-6 py-6">
            {activeTab === "occurrence" && renderOccurrenceTab()}
            {activeTab === "event" && renderEventTab()}
            {activeTab === "location" && renderLocationTab()}
            {activeTab === "taxon" && renderTaxonTab()}
            {activeTab === "images" && renderImagesTab()}
          </div>
        </form>
      </div>

      {/* Fixed bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 supports-[backdrop-filter]:bg-card/60 backdrop-blur border-t">
        <div className="container mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="hidden sm:flex items-center gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "h-2 rounded-full transition-all",
                  activeTab === tab.key ? "bg-[rgb(117,26,29)] w-5" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                ].join(" ")}
                title={tab.label}
              />
            ))}
          </div>
          <div className="flex gap-3 ml-auto items-center">
            <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
            {!catalogNumber || !selectedTaxonID ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-block cursor-not-allowed">
                      <Button type="button" disabled className="bg-[rgb(117,26,29)]/50 text-white/70">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="bg-destructive text-destructive-foreground z-[100] mb-2 shadow-md">
                    <p>Falta completar campos requeridos (Número de catálogo o Taxón)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={(e) => handleSubmit(e)}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
