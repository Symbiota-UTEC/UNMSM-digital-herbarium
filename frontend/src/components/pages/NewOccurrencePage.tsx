import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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
import { ArrowLeft, Plus, X, AlertCircle, Loader2, CheckCircle2, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "../ui/alert";
import { useAuth } from "../../contexts/AuthContext";
import { autocompleteService, type ScientificNameSuggestion } from "@services/autocomplete.service";
import { AutocompleteDropdown, useSuggestions } from "../ui/autocomplete";
import { ImageManager, type PendingImage } from "../ImageManager";
import { cameraService } from "@services/camera.service";
import { taxonService } from "@services/taxon.service";
import { occurrencesService } from "@services/occurrences.service";
import { uploadService } from "@services/upload.service";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { OccurrenceIdentificationOut, OccurrenceImageOut } from "@interfaces/occurrence";
import { LocationPicker } from "../LocationPicker";
import { DwcTerm } from "../DwcTerm";
import { formatVerbatimDate } from "@utils/dates";

interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: "create" | "edit";
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection" | "taxon" | "map";
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
  taxonId?: string;
}

/* ─── Types ─────────────────────── */
interface TaxonDetail {
  taxonId: string | null;
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

/* ─── Country list ──────────────── */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "PE", name: "Perú" },
  { code: "AR", name: "Argentina" },
  { code: "BO", name: "Bolivia" },
  { code: "BR", name: "Brasil" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "CR", name: "Costa Rica" },
  { code: "CU", name: "Cuba" },
  { code: "DO", name: "República Dominicana" },
  { code: "EC", name: "Ecuador" },
  { code: "SV", name: "El Salvador" },
  { code: "GT", name: "Guatemala" },
  { code: "HN", name: "Honduras" },
  { code: "MX", name: "México" },
  { code: "NI", name: "Nicaragua" },
  { code: "PA", name: "Panamá" },
  { code: "PY", name: "Paraguay" },
  { code: "PR", name: "Puerto Rico" },
  { code: "UY", name: "Uruguay" },
  { code: "VE", name: "Venezuela" },
  { code: "DE", name: "Alemania" },
  { code: "AU", name: "Australia" },
  { code: "BE", name: "Bélgica" },
  { code: "CA", name: "Canadá" },
  { code: "CN", name: "China" },
  { code: "KR", name: "Corea del Sur" },
  { code: "DK", name: "Dinamarca" },
  { code: "ES", name: "España" },
  { code: "US", name: "Estados Unidos" },
  { code: "FR", name: "Francia" },
  { code: "GB", name: "Reino Unido" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italia" },
  { code: "JP", name: "Japón" },
  { code: "MY", name: "Malasia" },
  { code: "NL", name: "Países Bajos" },
  { code: "NO", name: "Noruega" },
  { code: "NZ", name: "Nueva Zelanda" },
  { code: "PL", name: "Polonia" },
  { code: "PT", name: "Portugal" },
  { code: "RU", name: "Rusia" },
  { code: "SE", name: "Suecia" },
  { code: "CH", name: "Suiza" },
];

/* ─── Tab definitions ───────────── */
type TabKey = "occurrence" | "event" | "location" | "taxon" | "images";

const TABS: { key: TabKey; label: string }[] = [
  { key: "occurrence", label: "Ocurrencia" },
  { key: "event", label: "Evento" },
  { key: "location", label: "Localización" },
  { key: "taxon", label: "Taxonomía" },
  { key: "images", label: "Imágenes" },
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
  taxonId,
}: NewOccurrencePageProps) {
  const { apiFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("occurrence");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);

  /* ── OCCURRENCE ── */
  const [catalogNumber, setCatalogNumber] = useState("");
  const [recordNumber, setRecordNumber] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [organismQuantity, setOrganismQuantity] = useState("");
  const [organismQuantityType, setOrganismQuantityType] = useState("");
  const [occurrenceStatus, setOccurrenceStatus] = useState("");
  const [occurrenceRemarks, setOccurrenceRemarks] = useState("");
  const [lifeStage, setLifeStage] = useState("");
  const [establishmentMeans, setEstablishmentMeans] = useState("");
  const [associatedReferences, setAssociatedReferences] = useState("");
  const [associatedTaxa, setAssociatedTaxa] = useState("");
  const [dpKey, setDpKey] = useState("");
  const [dpValue, setDpValue] = useState("");
  const [dynamicProps, setDynamicProps] = useState<Array<{ key: string; value: string }>>([]);

  /* ── EVENT ── */
  const [eventDate, setEventDate] = useState("");
  const [verbatimEventDate, setVerbatimEventDate] = useState("");
  // Mientras la fecha original no la escriba el usuario, se deriva de la fecha del evento.
  const [verbatimEdited, setVerbatimEdited] = useState(false);
  const [habitat, setHabitat] = useState("");
  const [eventRemarks, setEventRemarks] = useState("");
  const [fieldNotes, setFieldNotes] = useState("");

  /* ── LOCATION ── */
  const [countryCode, setCountryCode] = useState("");
  const [stateProvince, setStateProvince] = useState("");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [locality, setLocality] = useState("");
  const [verbatimLocality, setVerbatimLocality] = useState("");
  const [decimalLatitude, setDecimalLatitude] = useState("");
  const [decimalLongitude, setDecimalLongitude] = useState("");
  const [coordinateUncertainty, setCoordinateUncertainty] = useState("");
  const [footprintWKT, setFootprintWKT] = useState("");
  const [verbatimElevation, setVerbatimElevation] = useState("");
  const [hydrographicContext, setHydrographicContext] = useState("");
  const [georeferenceVerificationStatus, setGeoreferenceVerificationStatus] = useState("");
  const [locationRemarks, setLocationRemarks] = useState("");

  /* ── TAXON / NEW IDENTIFICATION ── */
  const [scientificNameInput, setScientificNameInput] = useState("");
  const [selectedTaxonID, setSelectedTaxonID] = useState<string | null>(null);
  const [taxonDetail, setTaxonDetail] = useState<TaxonDetail | null>(null);
  const [taxonLoading, setTaxonLoading] = useState(false);
  const [dateIdentified, setDateIdentified] = useState("");
  const [typeStatus, setTypeStatus] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [identifiers, setIdentifiers] = useState<{ name: string; orcid: string }[]>([]);
  const [identifierNameInput, setIdentifierNameInput] = useState("");
  const [identifierOrcidInput, setIdentifierOrcidInput] = useState("");

  // Autocomplete
  const [acOpen, setAcOpen] = useState(false);
  const { items: acSuggestions, loading: acLoading } = useSuggestions<ScientificNameSuggestion>(
    (q) => autocompleteService.scientificNames(apiFetch, q, 10),
    scientificNameInput,
    { enabled: acOpen },
  );
  const acRef = useRef<HTMLDivElement>(null);

  /* ── IMAGES ── */
  const [newImages, setNewImages] = useState<PendingImage[]>([]);
  const [existingImages, setExistingImages] = useState<OccurrenceImageOut[]>([]);
  // Fotógrafo editado de las imágenes ya guardadas; se persiste al pulsar "Actualizar ocurrencia".
  const [existingPhotographers, setExistingPhotographers] = useState<Record<string, string>>({});
  const [pendingDeleteImageId, setPendingDeleteImageId] = useState<string | null>(null);

  /* ── EDIT MODE ── */
  const [existingIdentifications, setExistingIdentifications] = useState<OccurrenceIdentificationOut[]>([]);

  /* ── CAMERA ── */
  const [captureLoading, setCaptureLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /* ── Cleanup blobs on unmount ── */
  useEffect(() => {
    return () => {
      newImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load edit mode from API ── */
  useEffect(() => {
    if (mode !== "edit" || !occurrenceId) return;
    occurrencesService
      .getById(apiFetch, occurrenceId)
      .then((occ) => {
        setCatalogNumber(occ.catalogNumber ?? "");
        setRecordNumber(occ.recordNumber ?? "");
        setRecordedBy(occ.recordedBy ?? "");
        setOrganismQuantity(occ.organismQuantity ?? "");
        setOrganismQuantityType(occ.organismQuantityType ?? "");
        setOccurrenceStatus(occ.occurrenceStatus ?? "");
        setOccurrenceRemarks(occ.occurrenceRemarks ?? "");
        setLifeStage(occ.lifeStage ?? "");
        setEstablishmentMeans(occ.establishmentMeans ?? "");
        setAssociatedReferences(occ.associatedReferences ?? "");
        setAssociatedTaxa(occ.associatedTaxa ?? "");
        setFieldNotes(occ.fieldNotes ?? "");
        setEventDate(occ.eventDate ?? "");
        setVerbatimEventDate(occ.verbatimEventDate ?? "");
        setVerbatimEdited(!!occ.verbatimEventDate);
        setHabitat(occ.habitat ?? "");
        setEventRemarks(occ.eventRemarks ?? "");
        setCountryCode(occ.countryCode ?? "");
        setStateProvince(occ.stateProvince ?? "");
        setCounty(occ.county ?? "");
        setMunicipality(occ.municipality ?? "");
        setLocality(occ.locality ?? "");
        setVerbatimLocality(occ.verbatimLocality ?? "");
        setDecimalLatitude(occ.decimalLatitude != null ? String(occ.decimalLatitude) : "");
        setDecimalLongitude(occ.decimalLongitude != null ? String(occ.decimalLongitude) : "");
        setCoordinateUncertainty(
          occ.coordinateUncertaintyInMeters != null ? String(occ.coordinateUncertaintyInMeters) : "",
        );
        setFootprintWKT(occ.footprintWKT ?? "");
        setVerbatimElevation(occ.verbatimElevation ?? "");
        setHydrographicContext(occ.hydrographicContext ?? "");
        setGeoreferenceVerificationStatus(occ.georeferenceVerificationStatus ?? "");
        setLocationRemarks(occ.locationRemarks ?? "");
        const dp = occ.dynamicProperties;
        if (dp && typeof dp === "object") {
          setDynamicProps(
            Object.entries(dp).map(([k, v]) => ({
              key: String(k),
              value: typeof v === "string" ? v : JSON.stringify(v),
            })),
          );
        }
        setExistingImages(occ.images ?? []);
        setExistingIdentifications(occ.identifications ?? []);
      })
      .catch(() => {
        toast.error("No se pudo cargar la ocurrencia");
      });
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
    if (selectedTaxonID) {
      setSelectedTaxonID(null);
      setTaxonDetail(null);
    }
    setAcOpen(true);
  };

  const handleSelectSuggestion = async (suggestion: ScientificNameSuggestion) => {
    setScientificNameInput(suggestion.scientificName);
    setAcOpen(false);
    if (!suggestion.taxonId) return;
    setSelectedTaxonID(suggestion.taxonId);
    setTaxonLoading(true);
    try {
      const detail = await taxonService.getById(apiFetch, suggestion.taxonId);
      setTaxonDetail(detail as unknown as TaxonDetail);
    } catch {
      toast.error("No se pudo cargar el detalle del taxón");
      setTaxonDetail(null);
    } finally {
      setTaxonLoading(false);
    }
  };

  /* ── Image helpers ── */
  const addNewImages = (files: File[]) => {
    setNewImages((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        photographer: "", // lo escribe la persona; vacío = sin dato
      })),
    ]);
  };

  const removeNewImage = (id: string) => {
    setNewImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  };

  const setNewImagePhotographer = (id: string, photographer: string) =>
    setNewImages((prev) => prev.map((img) => (img.id === id ? { ...img, photographer } : img)));

  const copyPhotographerToAll = (photographer: string) =>
    setNewImages((prev) => prev.map((img) => ({ ...img, photographer })));

  const setExistingPhotographer = (imageId: string, photographer: string) =>
    setExistingPhotographers((prev) => ({ ...prev, [imageId]: photographer }));

  /* ── Camera ── */
  const handleCapture = async () => {
    setCaptureLoading(true);
    setCameraError(null);
    try {
      addNewImages([await cameraService.captureImage()]);
      toast.success("Foto capturada y añadida");
    } catch (err: any) {
      setCameraError(err?.message ?? "Error al capturar la imagen");
      toast.error("No se pudo capturar");
    } finally {
      setCaptureLoading(false);
    }
  };

  /* ── Inline actions (edit mode) ── */
  const handleDeleteIdentification = async (identificationId: string) => {
    if (!occurrenceId) return;
    setInlineSaving(true);
    try {
      const updated = await occurrencesService.deleteIdentification(apiFetch, occurrenceId, identificationId);
      setExistingIdentifications(updated.identifications);
      toast.success("Identificación eliminada");
    } catch (err: any) {
      toast.error("Error al eliminar identificación", { description: err.message });
    } finally {
      setInlineSaving(false);
    }
  };

  const handleSetCurrentIdentification = async (identificationId: string) => {
    if (!occurrenceId) return;
    setInlineSaving(true);
    try {
      const updated = await occurrencesService.setCurrentIdentification(apiFetch, occurrenceId, identificationId);
      setExistingIdentifications(updated.identifications);
      toast.success("Identificación vigente actualizada");
    } catch (err: any) {
      toast.error("Error al actualizar identificación vigente", { description: err.message });
    } finally {
      setInlineSaving(false);
    }
  };

  const handleDeleteExistingImage = async () => {
    if (!pendingDeleteImageId) return;
    const imageId = pendingDeleteImageId;
    setPendingDeleteImageId(null);
    setInlineSaving(true);
    try {
      await uploadService.deleteImage(apiFetch, imageId);
      setExistingImages((prev) => prev.filter((img) => img.occurrenceImageId !== imageId));
      toast.success("Imagen eliminada");
    } catch (err: any) {
      toast.error("Error al eliminar imagen", { description: err.message });
    } finally {
      setInlineSaving(false);
    }
  };

  /* ── Other handlers ── */
  const handleAddIdentifier = () => {
    if (identifierNameInput.trim()) {
      setIdentifiers([...identifiers, { name: identifierNameInput.trim(), orcid: identifierOrcidInput.trim() }]);
      setIdentifierNameInput("");
      setIdentifierOrcidInput("");
    }
  };
  const handleRemoveIdentifier = (index: number) => setIdentifiers(identifiers.filter((_, i) => i !== index));

  const handleAddDynamicProp = () => {
    if (!dpKey.trim()) {
      toast.error("Ingresa una clave para el registro adicional");
      return;
    }
    setDynamicProps((prev) => [...prev, { key: dpKey.trim(), value: dpValue }]);
    setDpKey("");
    setDpValue("");
  };
  const handleRemoveDynamicProp = (idx: number) => setDynamicProps((prev) => prev.filter((_, i) => i !== idx));

  const handleCancel = () => {
    if (returnTo === "taxon" && taxonId) {
      onNavigate("taxon-detail", { taxonId });
    } else if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", {
        collectionId,
        collectionName: collectionNameProp || "",
        isOwner: isOwner ?? false,
      });
    } else if (returnTo === "map") {
      onNavigate("map", { restoreSearch: true });
    } else {
      onNavigate("occurrences");
    }
  };

  const buildBasicPayload = () => {
    const dynamicProperties: Record<string, any> = {};
    dynamicProps.forEach((p) => {
      dynamicProperties[p.key] = p.value;
    });

    return {
      catalogNumber,
      occurrenceStatus: occurrenceStatus || null,
      recordNumber: recordNumber || null,
      recordedBy: recordedBy || null,
      eventDate: eventDate || null,
      verbatimEventDate: verbatimEventDate || null,
      habitat: habitat || null,
      eventRemarks: eventRemarks || null,
      country: countryCode ? (COUNTRIES.find((c) => c.code === countryCode)?.name ?? null) : null,
      countryCode: countryCode || null,
      stateProvince: stateProvince || null,
      county: county || null,
      municipality: municipality || null,
      locality: locality || null,
      verbatimLocality: verbatimLocality || null,
      decimalLatitude: decimalLatitude ? parseFloat(decimalLatitude) : null,
      decimalLongitude: decimalLongitude ? parseFloat(decimalLongitude) : null,
      coordinateUncertaintyInMeters: parseFloat(coordinateUncertainty) > 0 ? parseFloat(coordinateUncertainty) : null,
      footprintWKT: footprintWKT || null,
      verbatimElevation: verbatimElevation || null,
      hydrographicContext: hydrographicContext || null,
      occurrenceRemarks: occurrenceRemarks || null,
      lifeStage: lifeStage || null,
      establishmentMeans: establishmentMeans || null,
      associatedReferences: associatedReferences || null,
      associatedTaxa: associatedTaxa || null,
      fieldNotes: fieldNotes || null,
      organismQuantity: organismQuantity || null,
      organismQuantityType: organismQuantityType || null,
      georeferenceVerificationStatus: georeferenceVerificationStatus || null,
      locationRemarks: locationRemarks || null,
      dynamicProperties: Object.keys(dynamicProperties).length > 0 ? dynamicProperties : null,
    };
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();

    if (coordinateUncertainty.trim() && !(parseFloat(coordinateUncertainty) > 0)) {
      toast.error("La incertidumbre de la coordenada debe ser mayor que 0", {
        description: "Déjala vacía si no la conoces.",
      });
      setActiveTab("location");
      return;
    }

    const canSave = mode === "edit" ? !!catalogNumber : !!catalogNumber && !!selectedTaxonID;
    if (!canSave) {
      toast.error("Faltan campos obligatorios", {
        description:
          mode === "create"
            ? "Por favor, completa el número de catálogo y asocia un taxón antes de guardar."
            : "Por favor, completa el número de catálogo antes de guardar.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "edit" && occurrenceId) {
        // 1. PUT basic fields
        await occurrencesService.update(apiFetch, occurrenceId, buildBasicPayload());

        // 2. POST new identification if form has data
        const hasNewIdent = !!(selectedTaxonID || scientificNameInput.trim());
        if (hasNewIdent) {
          await occurrencesService.addIdentification(apiFetch, occurrenceId, {
            taxonId: selectedTaxonID || null,
            scientificName: scientificNameInput || null,
            dateIdentified: dateIdentified || null,
            typeStatus: typeStatus || null,
            isVerified,
            identifiers:
              identifiers.length > 0 ? identifiers.map((i) => ({ name: i.name, orcid: i.orcid || null })) : undefined,
            setAsCurrent: existingIdentifications.length === 0,
          });
        }

        // 3. Persist edited photographers of saved images
        for (const img of existingImages) {
          const edited = existingPhotographers[img.occurrenceImageId];
          if (edited !== undefined && edited.trim() !== (img.photographer ?? "")) {
            await uploadService.updateImagePhotographer(apiFetch, img.occurrenceImageId, edited);
          }
        }

        // 4. Upload new images
        for (const img of newImages) {
          await uploadService.uploadImage(apiFetch, occurrenceId, img.file, img.photographer);
        }

        toast.success("Ocurrencia actualizada correctamente");
        handleCancel();
      } else {
        // Create mode
        const payload = {
          collectionId,
          ...buildBasicPayload(),
          taxonId: taxonDetail?.taxonId || null,
          scientificName: scientificNameInput || null,
          dateIdentified: dateIdentified || null,
          typeStatus: typeStatus || null,
          isVerified,
          identifiers:
            identifiers.length > 0 ? identifiers.map((i) => ({ name: i.name, orcid: i.orcid || null })) : null,
        };

        const data = await occurrencesService.create(apiFetch, payload);
        toast.success("Ocurrencia creada correctamente");

        for (const img of newImages) {
          try {
            await uploadService.uploadImage(apiFetch, data.occurrenceId, img.file, img.photographer);
          } catch (err: any) {
            toast.error("Error al subir imagen", { description: err.message });
          }
        }

        handleCancel();
      }
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
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Label htmlFor="catalogNumber" className="flex items-center gap-2">
            Número de catálogo <span className="text-destructive">*</span>
            <Badge variant="secondary" className="text-xs">
              Requerido
            </Badge>
            <DwcTerm term="catalogNumber" />
          </Label>
          <Input
            id="catalogNumber"
            value={catalogNumber}
            onChange={(e) => setCatalogNumber(e.target.value)}
            placeholder="BOT-2024-001"
            required
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="recordNumber" className="flex items-center gap-2">
            Número de registro
            <DwcTerm term="recordNumber" />
          </Label>
          <Input
            id="recordNumber"
            value={recordNumber}
            onChange={(e) => setRecordNumber(e.target.value)}
            placeholder="Número de colecta"
          />
        </div>
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            Recolectado por{" "}
            <Badge variant="outline" className="text-xs">
              Recomendado
            </Badge>{" "}
            <DwcTerm term="recordedBy" />
          </Label>
          <Input
            value={recordedBy}
            onChange={(e) => setRecordedBy(e.target.value)}
            placeholder="Nombre del recolector"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Label htmlFor="organismQuantity" className="flex items-center gap-2">
            Cantidad <DwcTerm term="organismQuantity" />
          </Label>
          <Input
            id="organismQuantity"
            type="number"
            min={0}
            value={organismQuantity}
            onChange={(e) => setOrganismQuantity(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="organismQuantityType" className="flex items-center gap-2">
            Tipo de cantidad <DwcTerm term="organismQuantityType" />
          </Label>
          <Select value={organismQuantityType} onValueChange={setOrganismQuantityType}>
            <SelectTrigger id="organismQuantityType">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Individuos">Individuos</SelectItem>
              <SelectItem value="Especímenes">Especímenes</SelectItem>
              <SelectItem value="Ramas">Ramas</SelectItem>
              <SelectItem value="Matas">Matas</SelectItem>
              <SelectItem value="Colonias">Colonias</SelectItem>
              <SelectItem value="Poblaciones">Poblaciones</SelectItem>
              <SelectItem value="Porcentaje de cobertura">Porcentaje de cobertura</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label htmlFor="occurrenceStatus" className="flex items-center gap-2">
            Estado <DwcTerm term="occurrenceStatus" />
          </Label>
          <Select value={occurrenceStatus} onValueChange={setOccurrenceStatus}>
            <SelectTrigger id="occurrenceStatus">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Presente">Presente</SelectItem>
              <SelectItem value="Ausente">Ausente</SelectItem>
              <SelectItem value="En préstamo">En préstamo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Label htmlFor="lifeStage" className="flex items-center gap-2">
            Etapa de vida <DwcTerm term="lifeStage" />
          </Label>
          <Select value={lifeStage} onValueChange={setLifeStage}>
            <SelectTrigger id="lifeStage">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Plántula">Plántula</SelectItem>
              <SelectItem value="Juvenil">Juvenil</SelectItem>
              <SelectItem value="Adulto">Adulto</SelectItem>
              <SelectItem value="Con flor">Con flor</SelectItem>
              <SelectItem value="Con fruto">Con fruto</SelectItem>
              <SelectItem value="Con semilla">Con semilla</SelectItem>
              <SelectItem value="Estéril">Estéril</SelectItem>
              <SelectItem value="Vegetativo">Vegetativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label htmlFor="establishmentMeans" className="flex items-center gap-2">
            Medio de establecimiento <DwcTerm term="establishmentMeans" />
          </Label>
          <Select value={establishmentMeans} onValueChange={setEstablishmentMeans}>
            <SelectTrigger id="establishmentMeans">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Nativo">Nativo</SelectItem>
              <SelectItem value="Endémico">Endémico</SelectItem>
              <SelectItem value="Introducido">Introducido</SelectItem>
              <SelectItem value="Naturalizado">Naturalizado</SelectItem>
              <SelectItem value="Invasor">Invasor</SelectItem>
              <SelectItem value="Cultivado">Cultivado</SelectItem>
              <SelectItem value="Asistido">Asistido por humanos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-3">
          <Label htmlFor="associatedTaxa" className="flex items-center gap-2">
            Taxa asociados <DwcTerm term="associatedTaxa" />
          </Label>
          <Input
            id="associatedTaxa"
            value={associatedTaxa}
            onChange={(e) => setAssociatedTaxa(e.target.value)}
            placeholder="Ej: huésped: Quercus robur"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-3">
          <Label htmlFor="associatedReferences" className="flex items-center gap-2">
            Referencias asociadas <DwcTerm term="associatedReferences" />
          </Label>
          <Textarea
            id="associatedReferences"
            value={associatedReferences}
            onChange={(e) => setAssociatedReferences(e.target.value)}
            placeholder="Referencias bibliográficas ligadas a esta ocurrencia"
            rows={3}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="fieldNotes" className="flex items-center gap-2">
            Notas de campo <DwcTerm term="fieldNotes" />
          </Label>
          <Textarea
            id="fieldNotes"
            value={fieldNotes}
            onChange={(e) => setFieldNotes(e.target.value)}
            placeholder="Notas tal como aparecen en la libreta de campo"
            rows={3}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="occurrenceRemarks" className="flex items-center gap-2">
            Observaciones <DwcTerm term="occurrenceRemarks" />
          </Label>
          <Textarea
            id="occurrenceRemarks"
            value={occurrenceRemarks}
            onChange={(e) => setOccurrenceRemarks(e.target.value)}
            placeholder="Observaciones adicionales sobre la ocurrencia"
            rows={3}
          />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Propiedades adicionales <DwcTerm term="dynamicProperties" />
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Atributo"
            value={dpKey}
            onChange={(e) => setDpKey(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddDynamicProp();
              }
            }}
          />
          <Input
            placeholder="Valor"
            value={dpValue}
            onChange={(e) => setDpValue(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddDynamicProp();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddDynamicProp}
            className="h-8 px-2 flex-shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {dynamicProps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dynamicProps.map((kv, idx) => (
              <Badge key={`${kv.key}-${idx}`} variant="secondary" className="gap-1 text-xs font-normal">
                <span className="font-mono font-medium">{kv.key}</span>: {kv.value}
                <button
                  type="button"
                  onClick={() => handleRemoveDynamicProp(idx)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderEventTab = () => (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="eventDate" className="flex items-center gap-2">
          Fecha del evento{" "}
          <Badge variant="outline" className="text-xs">
            Recomendado
          </Badge>
          <DwcTerm term="eventDate" />
        </Label>
        <Input
          id="eventDate"
          type="date"
          value={eventDate}
          onChange={(e) => {
            setEventDate(e.target.value);
            if (!verbatimEdited) setVerbatimEventDate(formatVerbatimDate(e.target.value));
          }}
        />

        <Label htmlFor="verbatimEventDate" className="flex items-center gap-2">
          Fecha original <DwcTerm term="verbatimEventDate" />
        </Label>
        <Input
          id="verbatimEventDate"
          value={verbatimEventDate}
          onChange={(e) => {
            setVerbatimEventDate(e.target.value);
            // Vaciar el campo devuelve la derivación automática.
            setVerbatimEdited(e.target.value.trim() !== "");
          }}
          placeholder="Ej: Primavera 2024"
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="habitat" className="flex items-center gap-2">
          Hábitat <DwcTerm term="habitat" />
        </Label>
        <Textarea
          id="habitat"
          value={habitat}
          onChange={(e) => setHabitat(e.target.value)}
          placeholder="Descripción del hábitat"
          rows={3}
        />
      </div>
      <div className="space-y-3">
        <Label htmlFor="eventRemarks" className="flex items-center gap-2">
          Observaciones del evento <DwcTerm term="eventRemarks" />
        </Label>
        <Textarea
          id="eventRemarks"
          value={eventRemarks}
          onChange={(e) => setEventRemarks(e.target.value)}
          placeholder="Observaciones o notas sobre el evento"
          rows={3}
        />
      </div>
    </div>
  );

  const renderLocationTab = () => (
    <div className="space-y-6">
      <LocationPicker
        lat={decimalLatitude}
        lon={decimalLongitude}
        footprintWKT={footprintWKT}
        uncertainty={coordinateUncertainty}
        onLocationChange={({ lat, lon, footprintWKT: wkt, uncertaintyM }) => {
          setDecimalLatitude(lat != null ? String(lat) : "");
          setDecimalLongitude(lon != null ? String(lon) : "");
          setFootprintWKT(wkt ?? "");
          if (uncertaintyM !== undefined) setCoordinateUncertainty(uncertaintyM != null ? String(uncertaintyM) : "");
        }}
        onAdminUnits={(admin) => {
          // Se reemplaza siempre (también si no se pudo deducir) para que estos campos
          // correspondan al punto actual y no a uno anterior.
          setCountryCode(admin && COUNTRIES.some((c) => c.code === admin.countryCode) ? admin.countryCode! : "");
          setStateProvince(admin?.stateProvince ?? "");
          setCounty(admin?.county ?? "");
          setMunicipality(admin?.municipality ?? "");
          setLocality(admin?.locality ?? "");
          if (!admin) {
            toast.warning("No se pudo deducir la unidad administrativa", {
              description: "Completa país, departamento, provincia, distrito y localidad manualmente.",
            });
          }
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="decimalLatitude" className="flex flex-wrap items-center gap-2">
            Latitud
            <DwcTerm term="decimalLatitude" />
          </Label>
          <Input
            id="decimalLatitude"
            type="number"
            step="0.000001"
            value={decimalLatitude}
            onChange={(e) => setDecimalLatitude(e.target.value)}
            placeholder="-12.046373"
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="decimalLongitude" className="flex flex-wrap items-center gap-2">
            Longitud
            <DwcTerm term="decimalLongitude" />
          </Label>
          <Input
            id="decimalLongitude"
            type="number"
            step="0.000001"
            value={decimalLongitude}
            onChange={(e) => setDecimalLongitude(e.target.value)}
            placeholder="-77.042755"
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="coordinateUncertaintyInMeters" className="flex flex-wrap items-center gap-2">
            Incertidumbre (m)
            <DwcTerm term="coordinateUncertaintyInMeters" />
          </Label>
          <Input
            id="coordinateUncertaintyInMeters"
            type="number"
            min={0}
            step="any"
            value={coordinateUncertainty}
            onChange={(e) => setCoordinateUncertainty(e.target.value)}
            placeholder="Ej: 100"
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <span className="text-xs text-muted-foreground">Incertidumbre rápida:</span>
        {[
          { label: "30 m", value: 30 },
          { label: "100 m", value: 100 },
          { label: "500 m", value: 500 },
          { label: "1 km", value: 1000 },
          { label: "5 km", value: 5000 },
        ].map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setCoordinateUncertainty(String(preset.value))}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 9999,
              padding: "2px 10px",
              fontSize: 12,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          Radio del círculo, centrado en el punto, que contiene el lugar de colecta. Vacío si se desconoce.
        </span>
      </div>

      {footprintWKT && (
        <Badge variant="secondary" className="whitespace-normal text-xs font-normal">
          Polígono dibujado: latitud y longitud son su punto representativo y la incertidumbre es el radio que lo
          encierra
        </Badge>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="countryCode" className="flex flex-wrap items-center gap-2">
            País{" "}
            <Badge variant="outline" className="text-xs">
              Recomendado
            </Badge>
            <DwcTerm term="countryCode" />
          </Label>
          <Select value={countryCode} onValueChange={setCountryCode}>
            <SelectTrigger id="countryCode">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} <span className="text-muted-foreground ml-1">({c.code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="stateProvince" className="flex flex-wrap items-center gap-2">
            Departamento
            <DwcTerm term="stateProvince" />
          </Label>
          <Input
            id="stateProvince"
            value={stateProvince}
            onChange={(e) => setStateProvince(e.target.value)}
            placeholder="Ej: Cusco"
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="county" className="flex flex-wrap items-center gap-2">
            Provincia
            <DwcTerm term="county" />
          </Label>
          <Input id="county" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Ej: Urubamba" />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="municipality" className="flex flex-wrap items-center gap-2">
            Distrito
            <DwcTerm term="municipality" />
          </Label>
          <Input
            id="municipality"
            value={municipality}
            onChange={(e) => setMunicipality(e.target.value)}
            placeholder="Ej: Ollantaytambo"
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="locality" className="flex flex-wrap items-center gap-2">
            Localidad{" "}
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              Recomendado
            </Badge>
            <DwcTerm term="locality" />
          </Label>
          <Input
            id="locality"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            placeholder="Descripción sitio"
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="verbatimLocality" className="flex flex-wrap items-center gap-2">
            Localidad original
            <DwcTerm term="verbatimLocality" />
          </Label>
          <Input
            id="verbatimLocality"
            value={verbatimLocality}
            onChange={(e) => setVerbatimLocality(e.target.value)}
            placeholder="Tal como etiqueta"
          />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="hydrographicContext" className="flex items-center gap-2">
            Contexto hidrográfico
            <DwcTerm term="hydrographicContext" />
          </Label>
          <Select value={hydrographicContext} onValueChange={setHydrographicContext}>
            <SelectTrigger id="hydrographicContext">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="No aplica">No aplica</SelectItem>
              <SelectItem value="Río">Río</SelectItem>
              <SelectItem value="Lago">Lago</SelectItem>
              <SelectItem value="Laguna">Laguna</SelectItem>
              <SelectItem value="Pantano">Pantano</SelectItem>
              <SelectItem value="Quebrada">Quebrada</SelectItem>
              <SelectItem value="Océano">Océano</SelectItem>
              <SelectItem value="Mar">Mar</SelectItem>
              <SelectItem value="Bahía">Bahía</SelectItem>
              <SelectItem value="Estuario">Estuario</SelectItem>
              <SelectItem value="Archipiélago">Archipiélago</SelectItem>
              <SelectItem value="Isla">Isla</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="georeferenceVerificationStatus" className="flex flex-wrap items-center gap-2">
            Estado de Verificación
            <DwcTerm term="georeferenceVerificationStatus" />
          </Label>
          <Select value={georeferenceVerificationStatus} onValueChange={setGeoreferenceVerificationStatus}>
            <SelectTrigger id="georeferenceVerificationStatus">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Requiere verificación">Requiere verificación</SelectItem>
              <SelectItem value="Verificado por colector">Verificado por colector</SelectItem>
              <SelectItem value="Verificado por curador">Verificado por curador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="verbatimElevation" className="flex items-center gap-2">
            Elevación estimada <DwcTerm term="verbatimElevation" />
          </Label>
          <Input
            id="verbatimElevation"
            value={verbatimElevation}
            onChange={(e) => setVerbatimElevation(e.target.value)}
            placeholder="Ej: 1200-1500m"
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="locationRemarks" className="flex items-center gap-2">
            Observaciones <DwcTerm term="locationRemarks" />
          </Label>
          <Textarea
            id="locationRemarks"
            value={locationRemarks}
            onChange={(e) => setLocationRemarks(e.target.value)}
            placeholder="Comentarios adicionales sobre la ubicación"
            rows={2}
          />
        </div>
      </div>
    </div>
  );

  const renderTaxonTab = () => (
    <div className="space-y-6">
      {/* Existing identifications list (edit mode only) */}
      {mode === "edit" && existingIdentifications.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Identificaciones existentes</p>
          <div className="space-y-2">
            {existingIdentifications.map((ident) => (
              <div key={ident.identificationId} className="rounded-lg border bg-muted/20 p-4 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="font-medium italic text-sm">
                    {ident.taxon?.scientificName ?? ident.scientificName ?? "Sin taxón"}
                  </span>
                  {ident.taxon?.scientificNameAuthorship && (
                    <span className="text-xs text-muted-foreground">{ident.taxon.scientificNameAuthorship}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    {ident.isCurrent && (
                      <Badge variant="default" className="text-xs">
                        Vigente
                      </Badge>
                    )}
                    {ident.isVerified && (
                      <Badge variant="outline" className="text-xs">
                        Verificada
                      </Badge>
                    )}
                  </div>
                </div>
                {ident.identifiers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ident.identifiers.map((id) => (
                      <Badge key={id.identifierId} variant="secondary" className="text-xs">
                        {id.fullName ?? id.orcID}
                      </Badge>
                    ))}
                  </div>
                )}
                {(ident.dateIdentified || ident.typeStatus) && (
                  <p className="text-xs text-muted-foreground">
                    {ident.dateIdentified && <span>Fecha: {ident.dateIdentified}</span>}
                    {ident.dateIdentified && ident.typeStatus && " · "}
                    {ident.typeStatus && <span>Tipo: {ident.typeStatus}</span>}
                  </p>
                )}
                <div className="flex gap-2 justify-end pt-1">
                  {!ident.isCurrent && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={inlineSaving}
                      onClick={() => handleSetCurrentIdentification(ident.identificationId)}
                      className="gap-1 text-xs h-7"
                    >
                      <Star className="h-3 w-3" />
                      Marcar vigente
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={inlineSaving}
                    onClick={() => handleDeleteIdentification(ident.identificationId)}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider for edit mode */}
      {mode === "edit" && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground font-medium">
            {existingIdentifications.length > 0 ? "Agregar nueva identificación" : "Nueva identificación"}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {/* Scientific name search */}
      <div className="space-y-3">
        <Label htmlFor="scientificName" className="flex items-center gap-2">
          Nombre científico {mode === "create" && <span className="text-destructive">*</span>}
          {mode === "create" && (
            <Badge variant="secondary" className="text-xs">
              Requerido
            </Badge>
          )}
          <DwcTerm term="scientificName" />
        </Label>
        <div className="relative" ref={acRef}>
          <div className="relative">
            <Input
              id="scientificName"
              value={scientificNameInput}
              onChange={(e) => handleScientificNameChange(e.target.value)}
              onFocus={() => {
                if (!selectedTaxonID) setAcOpen(true);
              }}
              placeholder="Escribe para buscar un nombre científico…"
              autoComplete="off"
              className={selectedTaxonID ? "pr-12 border-green-500 focus-visible:ring-green-500/30" : "pr-12"}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {acLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : selectedTaxonID ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : null}
            </div>
          </div>
          {acOpen && scientificNameInput.trim().length >= 2 && (
            <AutocompleteDropdown
              items={acSuggestions}
              loading={acLoading}
              keyOf={(s) => s.taxonId ?? s.scientificName}
              onSelect={handleSelectSuggestion}
              renderItem={(s) => (
                <>
                  <span className="italic truncate">{s.scientificName}</span>
                  {s.scientificNameAuthorship && (
                    <span className="text-xs text-muted-foreground italic truncate">{s.scientificNameAuthorship}</span>
                  )}
                  {s.wfoTaxonId && (
                    <span className="ml-auto pl-2 text-xs text-muted-foreground font-mono">{s.wfoTaxonId}</span>
                  )}
                </>
              )}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Escribe al menos 2 caracteres para buscar en el backbone taxonómico.
        </p>
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
            <Badge variant="outline" className="text-xs ml-auto">
              Solo lectura
            </Badge>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Taxon ID</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm font-mono">
                {taxonDetail.taxonId ?? "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nombre científico</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">
                {taxonDetail.scientificName ?? "—"}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Autoría</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">
                {taxonDetail.scientificNameAuthorship ?? "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Rango taxonómico</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm capitalize">
                {taxonDetail.taxonRank ?? "—"}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Familia</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm">
                {taxonDetail.family ?? "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Género</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">
                {taxonDetail.genus ?? "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Epíteto específico</Label>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/40 text-sm italic">
                {taxonDetail.specificEpithet ?? "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {!taxonDetail && !taxonLoading && scientificNameInput.trim().length >= 2 && !acOpen && !selectedTaxonID && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Selecciona un nombre científico de la lista para vincular al taxón.</AlertDescription>
        </Alert>
      )}

      {/* Identification form */}
      <div className="rounded-lg border bg-muted/20 p-5 space-y-4">
        <p className="text-sm font-semibold">
          {mode === "edit" ? "Datos de la nueva identificación" : "Identificación"}
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dateIdentified" className="flex items-center gap-2">
              Fecha de identificación
              <DwcTerm term="dateIdentified" />
            </Label>
            <Input
              id="dateIdentified"
              type="date"
              value={dateIdentified}
              onChange={(e) => setDateIdentified(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="typeStatus" className="flex items-center gap-2">
              Estado de tipo
              <DwcTerm term="typeStatus" />
            </Label>
            <Select value={typeStatus} onValueChange={setTypeStatus}>
              <SelectTrigger id="typeStatus">
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Holotipo">Holotipo</SelectItem>
                <SelectItem value="Isotipo">Isotipo</SelectItem>
                <SelectItem value="Paratipo">Paratipo</SelectItem>
                <SelectItem value="Lectotipo">Lectotipo</SelectItem>
                <SelectItem value="Neotipo">Neotipo</SelectItem>
                <SelectItem value="Sintipo">Sintipo</SelectItem>
                <SelectItem value="No es tipo">No es tipo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Identificadores <DwcTerm term="identifiedBy" />
          </Label>
          <div className="flex gap-2">
            <Input
              value={identifierNameInput}
              onChange={(e) => setIdentifierNameInput(e.target.value)}
              placeholder="Nombre del identificador"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddIdentifier();
                }
              }}
            />
            <Input
              value={identifierOrcidInput}
              onChange={(e) => setIdentifierOrcidInput(e.target.value)}
              placeholder="ORCID (opcional)"
              className="max-w-[180px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddIdentifier();
                }
              }}
            />
            <Button type="button" onClick={handleAddIdentifier} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {identifiers.map((idn, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {idn.name}
                {idn.orcid && <span className="text-muted-foreground font-mono text-[10px]"> · {idn.orcid}</span>}
                <button
                  type="button"
                  onClick={() => handleRemoveIdentifier(index)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isVerified"
            type="checkbox"
            checked={isVerified}
            onChange={(e) => setIsVerified(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-[rgb(117,26,29)]"
          />
          <Label htmlFor="isVerified" className="cursor-pointer">
            Identificación verificada por especialista
          </Label>
        </div>
      </div>
    </div>
  );

  const renderImagesTab = () => (
    <ImageManager
      pending={newImages}
      existing={mode === "edit" ? existingImages : []}
      onAddFiles={addNewImages}
      onRemovePending={removeNewImage}
      onPendingPhotographerChange={setNewImagePhotographer}
      onCopyPhotographerToAll={copyPhotographerToAll}
      onDeleteExisting={setPendingDeleteImageId}
      existingPhotographers={existingPhotographers}
      onExistingPhotographerChange={setExistingPhotographer}
      onCapture={handleCapture}
      capturing={captureLoading}
      cameraError={cameraError}
      disabled={inlineSaving || isSubmitting}
    />
  );

  /* ══════════════════════════════════════════════════
     RENDER PRINCIPAL
  ══════════════════════════════════════════════════ */
  const canSubmit = mode === "edit" ? !!catalogNumber : !!catalogNumber && !!selectedTaxonID;

  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={handleCancel} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {returnTo === "collection"
              ? "Volver a Colección"
              : returnTo === "map"
                ? "Volver al Mapa"
                : "Volver a Ocurrencias"}
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl mb-2">{mode === "edit" ? "Actualizar ocurrencia" : "Nueva ocurrencia"}</h1>
              <p className="text-muted-foreground">
                {mode === "edit"
                  ? "Modifica la información del espécimen según estándar Darwin Core"
                  : "Completa la información del espécimen recolectado según estándar Darwin Core"}
              </p>
            </div>

            <div className="flex-shrink-0 pt-1">
              {!canSubmit ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-block cursor-not-allowed">
                        <Button
                          type="button"
                          disabled
                          className="bg-[rgb(117,26,29)]/40 text-foreground/40 pointer-events-none"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover text-popover-foreground border shadow-md z-[100]">
                      <p>
                        {mode === "create"
                          ? "Completa el número de catálogo y selecciona un taxón para guardar"
                          : "Completa el número de catálogo para guardar"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button
                  type="button"
                  style={{ backgroundColor: "rgb(117,26,29)", color: "white" }}
                  className="hover:opacity-90 transition-opacity"
                  onClick={(e) => handleSubmit(e)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
                </Button>
              )}
            </div>
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
                  "flex-1 min-w-fit px-5 py-2.5 text-sm whitespace-nowrap rounded-lg transition-all duration-200 relative",
                  activeTab === tab.key
                    ? "bg-white text-[rgb(117,26,29)] font-semibold shadow-sm"
                    : "font-medium text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
                {tab.key === "taxon" && selectedTaxonID && (
                  <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
                {tab.key === "images" && (newImages.length > 0 || existingImages.length > 0) && (
                  <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-green-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <form id="occ-form" onSubmit={handleSubmit}>
          <div className="rounded-lg border bg-card mb-8" style={{ padding: "2rem 3rem" }}>
            {activeTab === "occurrence" && renderOccurrenceTab()}
            {activeTab === "event" && renderEventTab()}
            {activeTab === "location" && renderLocationTab()}
            {activeTab === "taxon" && renderTaxonTab()}
            {activeTab === "images" && renderImagesTab()}
          </div>
        </form>
      </div>

      <AlertDialog
        open={!!pendingDeleteImageId}
        onOpenChange={(open: boolean) => {
          if (!open) setPendingDeleteImageId(null);
        }}
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
              onClick={handleDeleteExistingImage}
              style={{ backgroundColor: "rgb(117,26,29)", color: "white" }}
              className="hover:opacity-90 transition-opacity"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
