import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { FieldSectionHeader, RequirementBadge, ReadOnlyField } from "../ui/field-section";
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
import { ArrowLeft, Plus, X, AlertCircle, Loader2, CheckCircle2, Trash2, Star, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "../ui/alert";
import { useAuth } from "../../contexts/AuthContext";
import { autocompleteService } from "@services/autocomplete.service";
import type { ScientificNameSuggestion } from "@interfaces/autocomplete";
import { AutocompleteDropdown, useSuggestions } from "../ui/autocomplete";
import { ImageManager, type PendingImage } from "../ImageManager";
import { DwcGlossaryDialog } from "../DwcGlossaryDialog";
import { OccurrenceTabsNav } from "../OccurrenceTabsNav";
import { cameraService } from "@services/camera.service";
import { collectionsService } from "@services/collections.service";
import { taxonService } from "@services/taxon.service";
import type { TaxonDetailOut } from "@interfaces/taxon";
import { occurrencesService } from "@services/occurrences.service";
import { uploadService } from "@services/upload.service";
import { adminDivisionsService } from "@services/adminDivisions.service";
import { GeographicHierarchy } from "../GeographicHierarchy";
import type { CatalogCountry } from "@interfaces/adminDivision";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { OccurrenceIdentificationOut, OccurrenceImageOut } from "@interfaces/occurrence";
import { LocationPicker } from "../LocationPicker";
import { resolveAdminUnits } from "@services/geocoding.service";
import { DwcTerm } from "../DwcTerm";
import { formatVerbatimDate } from "@utils/dates";
import {
  OCCURRENCE_TABS as TABS,
  tabCompletionStatus,
  type OccurrenceTabKey as TabKey,
  type TabCompletionStatus,
} from "@constants/occurrenceTabs";

interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: "create" | "edit";
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection" | "taxon" | "map";
  /** Crear: colección destino (viene en la URL). Editar: solo para volver a la colección de origen. */
  collectionId?: string;
  taxonId?: string;
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

/* ────────────────────────────────────────────────────────────────── */
export function NewOccurrencePage({
  onNavigate,
  mode = "create",
  occurrenceId,
  returnTo = "occurrences",
  collectionId,
  taxonId,
}: NewOccurrencePageProps) {
  const { apiFetch } = useAuth();
  // Colección a la que volver: la que trae la navegación o, si se entró por URL directa, la de la ocurrencia.
  const [loadedCollectionId, setLoadedCollectionId] = useState<string | undefined>();
  const returnCollectionId = collectionId ?? loadedCollectionId;
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
  const [countries, setCountries] = useState<CatalogCountry[]>([]);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [countryNameFallback, setCountryNameFallback] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [locationId, setLocationId] = useState("");
  const [geoSelectionRevision, setGeoSelectionRevision] = useState(0);
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
  const [georeferenceVerificationStatus, setGeoreferenceVerificationStatus] = useState("");
  const [locationRemarks, setLocationRemarks] = useState("");

  /* ── TAXON / NEW IDENTIFICATION ── */
  const [scientificNameInput, setScientificNameInput] = useState("");
  const [selectedTaxonID, setSelectedTaxonID] = useState<string | null>(null);
  const [taxonDetail, setTaxonDetail] = useState<TaxonDetailOut | null>(null);
  const [taxonLoading, setTaxonLoading] = useState(false);
  const [dateIdentified, setDateIdentified] = useState("");
  const [typeStatus, setTypeStatus] = useState("");
  const [identificationVerificationStatus, setIdentificationVerificationStatus] = useState("");
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
  // null mientras se consulta el healthcheck del servicio digital-camera-integration.
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);

  /* ── Cleanup blobs on unmount ── */
  useEffect(() => {
    return () => {
      newImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    adminDivisionsService
      .countries(apiFetch)
      .then(setCountries)
      .catch(() => setCatalogUnavailable(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cameraService.isAvailable().then(setCameraAvailable);
  }, []);

  const handleCountryChange = (code: string) => {
    if (code === countryCode) return;
    setCountryCode(code);
    setCountryNameFallback("");
    setStateProvince("");
    setCounty("");
    setMunicipality("");
    setLocationId("");
    setGeoSelectionRevision((revision) => revision + 1);
  };

  const handleGeoValuesChange = (
    patch: Partial<{ stateProvince: string; county: string; municipality: string; locationId: string }>,
  ) => {
    setGeoSelectionRevision((revision) => revision + 1);
    if (patch.stateProvince !== undefined) setStateProvince(patch.stateProvince);
    if (patch.county !== undefined) setCounty(patch.county);
    if (patch.municipality !== undefined) setMunicipality(patch.municipality);
    if (patch.locationId !== undefined) setLocationId(patch.locationId);
  };

  /* ── Load edit mode from API ── */
  useEffect(() => {
    if (mode !== "edit" || !occurrenceId) return;
    occurrencesService
      .getById(apiFetch, occurrenceId)
      .then((occ) => {
        setLoadedCollectionId(occ.collection?.collectionId);
        if (occ.collection && !occ.collection.canEdit) {
          toast.error("No tienes permiso para editar esta ocurrencia");
          onNavigate("occurrence-detail", { occurrenceId, collectionId: occ.collection.collectionId });
          return;
        }
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
        setCountryNameFallback(occ.country ?? "");
        setLocationId(occ.locationId ?? "");
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
        setIdentificationVerificationStatus(occ.currentIdentification?.identificationVerificationStatus ?? "");
      })
      .catch(() => {
        toast.error("No se pudo cargar la ocurrencia");
        onNavigate("occurrences");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, occurrenceId]);

  /* ── Create mode: la colección destino debe existir y permitir editar ── */
  useEffect(() => {
    if (mode !== "create" || !collectionId) return;
    collectionsService
      .getById(apiFetch, collectionId)
      .then((c) => {
        if (!c.canEdit) {
          toast.error("No tienes permiso para agregar ocurrencias en esta colección");
          onNavigate("collection-detail", { collectionId });
        }
      })
      .catch(() => {
        toast.error("No se pudo verificar la colección");
        onNavigate("collections");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, collectionId]);

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
      setTaxonDetail(detail);
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
    } else if (returnTo === "collection" && returnCollectionId) {
      onNavigate("collection-detail", { collectionId: returnCollectionId });
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
      country:
        countries.find((country) => country.code === countryCode)?.name ||
        COUNTRIES.find((country) => country.code === countryCode)?.name ||
        countryNameFallback ||
        null,
      countryCode: countryCode || null,
      locationId: locationId || null,
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
      occurrenceRemarks: occurrenceRemarks || null,
      lifeStage: lifeStage || null,
      establishmentMeans: establishmentMeans || null,
      associatedReferences: associatedReferences || null,
      associatedTaxa: associatedTaxa || null,
      fieldNotes: fieldNotes || null,
      organismQuantity: organismQuantity || null,
      organismQuantityType: organismQuantityType || null,
      georeferenceVerificationStatus: georeferenceVerificationStatus || null,
      identificationVerificationStatus: identificationVerificationStatus || null,
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
            identificationVerificationStatus: identificationVerificationStatus || null,
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
          identificationVerificationStatus: identificationVerificationStatus || null,
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
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Identificación del Ejemplar" subtitle="Campos clave para trazabilidad" />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="catalogNumber" className="flex items-center gap-2">
                Número de catálogo <span className="text-destructive">*</span>
                <RequirementBadge kind="required" />
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
            <div className="space-y-2">
              <Label htmlFor="recordNumber" className="flex items-center gap-2">
                Número de registro
                <RequirementBadge kind="optional" />
                <DwcTerm term="recordNumber" />
              </Label>
              <Input
                id="recordNumber"
                value={recordNumber}
                onChange={(e) => setRecordNumber(e.target.value)}
                placeholder="Número de colecta"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Recolectado por
                <RequirementBadge kind="recommended" />
                <DwcTerm term="recordedBy" />
              </Label>
              <Input
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
                placeholder="Nombre del recolector"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Estado y Cuantificación" subtitle="Atributos biológicos y preservación" />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="organismQuantity" className="flex items-center gap-2">
                Cantidad
                <RequirementBadge kind="optional" />
                <DwcTerm term="organismQuantity" />
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
            <div className="space-y-2">
              <Label htmlFor="organismQuantityType" className="flex items-center gap-2">
                Tipo de cantidad
                <RequirementBadge kind="optional" />
                <DwcTerm term="organismQuantityType" />
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
            <div className="space-y-2">
              <Label htmlFor="occurrenceStatus" className="flex items-center gap-2">
                Estado del ejemplar
                <RequirementBadge kind="recommended" />
                <DwcTerm term="occurrenceStatus" />
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

          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="lifeStage" className="flex items-center gap-2">
                Etapa de vida
                <RequirementBadge kind="optional" />
                <DwcTerm term="lifeStage" />
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
            <div className="space-y-2">
              <Label htmlFor="establishmentMeans" className="flex items-center gap-2">
                Medio de establecimiento
                <RequirementBadge kind="optional" />
                <DwcTerm term="establishmentMeans" />
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
            <div className="space-y-2">
              <Label htmlFor="associatedTaxa" className="flex items-center gap-2">
                Taxa asociados
                <RequirementBadge kind="optional" />
                <DwcTerm term="associatedTaxa" />
              </Label>
              <Input
                id="associatedTaxa"
                value={associatedTaxa}
                onChange={(e) => setAssociatedTaxa(e.target.value)}
                placeholder="Ej: huésped: Quercus robur"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Notas y Observaciones" subtitle="Documentación de libreta" />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="associatedReferences" className="flex items-center gap-2">
                Referencias asociadas
                <RequirementBadge kind="optional" />
                <DwcTerm term="associatedReferences" />
              </Label>
              <Textarea
                id="associatedReferences"
                value={associatedReferences}
                onChange={(e) => setAssociatedReferences(e.target.value)}
                placeholder="Referencias bibliográficas ligadas a esta ocurrencia"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fieldNotes" className="flex items-center gap-2">
                Notas de campo
                <RequirementBadge kind="optional" />
                <DwcTerm term="fieldNotes" />
              </Label>
              <Textarea
                id="fieldNotes"
                value={fieldNotes}
                onChange={(e) => setFieldNotes(e.target.value)}
                placeholder="Notas tal como aparecen en la libreta de campo"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occurrenceRemarks" className="flex items-center gap-2">
                Observaciones
                <RequirementBadge kind="optional" />
                <DwcTerm term="occurrenceRemarks" />
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader
            title="Propiedades Adicionales"
            subtitle="Atributos libres sin un campo Darwin Core dedicado"
          />
          <div className="space-y-2">
            <Label className="flex flex-wrap items-center gap-2">
              Nueva propiedad
              <RequirementBadge kind="optional" />
              <DwcTerm term="dynamicProperties" />
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Atributo"
                value={dpKey}
                onChange={(e) => setDpKey(e.target.value)}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddDynamicProp();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={handleAddDynamicProp} className="flex-shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Escribe un nombre y su valor para agregar cualquier otro dato que no tenga un campo propio.
            </p>
          </div>

          {dynamicProps.length > 0 && (
            <div className="space-y-2 mt-4">
              {dynamicProps.map((kv, idx) => (
                <div
                  key={`${kv.key}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold flex-shrink-0">{kv.key}</span>
                    <span className="text-sm text-muted-foreground truncate">{kv.value}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDynamicProp(idx)}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                    title="Quitar propiedad"
                    aria-label="Quitar propiedad"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderEventTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Fecha del Evento" subtitle="Cuándo se recolectó el ejemplar" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventDate" className="flex items-center gap-2">
                Fecha del evento
                <RequirementBadge kind="recommended" />
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="verbatimEventDate" className="flex items-center gap-2">
                Fecha original
                <RequirementBadge kind="optional" />
                <DwcTerm term="verbatimEventDate" />
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Hábitat y Observaciones" subtitle="Contexto ecológico del hallazgo" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="habitat" className="flex items-center gap-2">
                Hábitat
                <RequirementBadge kind="optional" />
                <DwcTerm term="habitat" />
              </Label>
              <Textarea
                id="habitat"
                value={habitat}
                onChange={(e) => setHabitat(e.target.value)}
                placeholder="Descripción del hábitat"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventRemarks" className="flex items-center gap-2">
                Observaciones del evento
                <RequirementBadge kind="optional" />
                <DwcTerm term="eventRemarks" />
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
        </CardContent>
      </Card>
    </div>
  );

  const renderLocationTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Ubicación en el Mapa" subtitle="Marca el punto o dibuja el área de colecta" />
          <LocationPicker
            lat={decimalLatitude}
            lon={decimalLongitude}
            footprintWKT={footprintWKT}
            uncertainty={coordinateUncertainty}
            resolveAdminUnits={(lat, lon) => resolveAdminUnits(apiFetch, lat, lon)}
            cancelGeocodeKey={geoSelectionRevision}
            onLocationChange={({ lat, lon, footprintWKT: wkt, uncertaintyM }) => {
              const nextLat = lat != null ? String(lat) : "";
              const nextLon = lon != null ? String(lon) : "";
              if (nextLat !== decimalLatitude || nextLon !== decimalLongitude) {
                setCountryCode("");
                setCountryNameFallback("");
                setStateProvince("");
                setCounty("");
                setMunicipality("");
                setLocationId("");
              }
              setDecimalLatitude(nextLat);
              setDecimalLongitude(nextLon);
              setFootprintWKT(wkt ?? "");
              if (uncertaintyM !== undefined)
                setCoordinateUncertainty(uncertaintyM != null ? String(uncertaintyM) : "");
            }}
            onAdminUnits={(admin) => {
              // Se reemplaza siempre (también si no se pudo deducir) para que estos campos
              // correspondan al punto actual y no a uno anterior.
              setCountryCode(admin?.countryCode ?? "");
              setCountryNameFallback(admin?.country ?? "");
              setStateProvince(admin?.stateProvince ?? "");
              setCounty(admin?.county ?? "");
              setMunicipality(admin?.municipality ?? "");
              setLocationId(admin?.locationId ?? "");
              if (!admin) {
                toast.warning("No se pudo deducir la unidad administrativa", {
                  description: "Completa país, departamento, provincia y distrito manualmente.",
                });
              }
            }}
          />

          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="decimalLatitude" className="flex flex-wrap items-center gap-2">
                Latitud
                <RequirementBadge kind="optional" />
                <DwcTerm term="decimalLatitude" />
              </Label>
              <Input
                id="decimalLatitude"
                type="number"
                step="0.000001"
                value={decimalLatitude}
                onChange={(e) => {
                  if (e.target.value !== decimalLatitude) {
                    setCountryCode("");
                    setCountryNameFallback("");
                    setStateProvince("");
                    setCounty("");
                    setMunicipality("");
                    setLocationId("");
                  }
                  setDecimalLatitude(e.target.value);
                }}
                placeholder="-12.046373"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decimalLongitude" className="flex flex-wrap items-center gap-2">
                Longitud
                <RequirementBadge kind="optional" />
                <DwcTerm term="decimalLongitude" />
              </Label>
              <Input
                id="decimalLongitude"
                type="number"
                step="0.000001"
                value={decimalLongitude}
                onChange={(e) => {
                  if (e.target.value !== decimalLongitude) {
                    setCountryCode("");
                    setCountryNameFallback("");
                    setStateProvince("");
                    setCounty("");
                    setMunicipality("");
                    setLocationId("");
                  }
                  setDecimalLongitude(e.target.value);
                }}
                placeholder="-77.042755"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coordinateUncertaintyInMeters" className="flex flex-wrap items-center gap-2">
                Incertidumbre (m)
                <RequirementBadge kind="optional" />
                <DwcTerm term="coordinateUncertaintyInMeters" />
              </Label>
              <div className="flex gap-2">
                <Input
                  id="coordinateUncertaintyInMeters"
                  type="number"
                  min={0}
                  step="any"
                  value={coordinateUncertainty}
                  onChange={(e) => setCoordinateUncertainty(e.target.value)}
                  placeholder="Ej: 100"
                  className="flex-1"
                />
                <Select value="" onValueChange={(v) => setCoordinateUncertainty(v)}>
                  <SelectTrigger
                    className="shrink-0"
                    style={{ width: "6.5rem" }}
                    aria-label="Valores rápidos de incertidumbre"
                  >
                    <SelectValue placeholder="Rápido" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 m</SelectItem>
                    <SelectItem value="100">100 m</SelectItem>
                    <SelectItem value="500">500 m</SelectItem>
                    <SelectItem value="1000">1 km</SelectItem>
                    <SelectItem value="5000">5 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {footprintWKT && (
            <Badge variant="secondary" className="text-xs font-normal mt-4" style={{ whiteSpace: "normal" }}>
              Polígono dibujado: latitud y longitud son su punto representativo y la incertidumbre es el radio que lo
              encierra
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="División Administrativa" subtitle="Se completa automáticamente desde el mapa" />
          <GeographicHierarchy
            apiFetch={apiFetch}
            countries={countries}
            catalogUnavailable={catalogUnavailable}
            countryCode={countryCode}
            countryNameFallback={countryNameFallback}
            values={{ stateProvince, county, municipality }}
            locationId={locationId}
            onCountryChange={handleCountryChange}
            onCountryNameFallbackChange={setCountryNameFallback}
            onValuesChange={handleGeoValuesChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Localidad y Contexto" subtitle="Descripción del sitio y su verificación" />
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="locality" className="flex flex-wrap items-center gap-2">
                Localidad
                <RequirementBadge kind="recommended" />
                <DwcTerm term="locality" />
              </Label>
              <Input
                id="locality"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="Descripción sitio"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verbatimLocality" className="flex flex-wrap items-center gap-2">
                Localidad original
                <RequirementBadge kind="optional" />
                <DwcTerm term="verbatimLocality" />
              </Label>
              <Input
                id="verbatimLocality"
                value={verbatimLocality}
                onChange={(e) => setVerbatimLocality(e.target.value)}
                placeholder="Tal como etiqueta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="georeferenceVerificationStatus" className="flex flex-wrap items-center gap-2">
                Estado de verificación
                <RequirementBadge kind="optional" />
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

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="verbatimElevation" className="flex items-center gap-2">
                Elevación estimada
                <RequirementBadge kind="optional" />
                <DwcTerm term="verbatimElevation" />
              </Label>
              <Input
                id="verbatimElevation"
                value={verbatimElevation}
                onChange={(e) => setVerbatimElevation(e.target.value)}
                placeholder="Ej: 1200-1500m"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationRemarks" className="flex items-center gap-2">
                Observaciones
                <RequirementBadge kind="optional" />
                <DwcTerm term="locationRemarks" />
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
        </CardContent>
      </Card>
    </div>
  );

  const renderTaxonTab = () => (
    <div className="space-y-6">
      {/* Existing identifications list (edit mode only) */}
      {mode === "edit" && existingIdentifications.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <FieldSectionHeader
              title="Identificaciones Existentes"
              subtitle="Historial de identificaciones de este ejemplar"
            />
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
                      {ident.identificationVerificationStatus && (
                        <Badge variant="outline" className="text-xs">
                          {ident.identificationVerificationStatus}
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader
            title={mode === "edit" ? "Nueva Identificación" : "Identificación Taxonómica"}
            subtitle="Busca el nombre científico en el backbone taxonómico"
          />

          <div className="space-y-2">
            <Label htmlFor="scientificName" className="flex flex-wrap items-center gap-2">
              Nombre científico
              <RequirementBadge kind={mode === "create" ? "required" : "optional"} />
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
                        <span className="text-xs text-muted-foreground italic truncate">
                          {s.scientificNameAuthorship}
                        </span>
                      )}
                      {s.wfoTaxonId && (
                        <span className="ml-auto pl-2 text-xs text-muted-foreground font-mono">{s.wfoTaxonId}</span>
                      )}
                    </>
                  )}
                />
              )}
            </div>
          </div>

          {taxonLoading && (
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30 mt-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Cargando información taxonómica…</span>
            </div>
          )}

          {taxonDetail && !taxonLoading && (
            <div className="rounded-lg border bg-muted/20 p-6 space-y-4 mt-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Información taxonómica verificada</p>
                <Badge variant="outline" className="text-xs ml-auto">
                  Solo lectura
                </Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ReadOnlyField label="WFO ID" value={taxonDetail.wfoTaxonId ?? "—"} className="font-mono" />
                <ReadOnlyField label="Nombre científico" value={taxonDetail.scientificName ?? "—"} className="italic" />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <ReadOnlyField label="Autoría" value={taxonDetail.scientificNameAuthorship ?? "—"} />
                <ReadOnlyField label="Rango taxonómico" value={taxonDetail.taxonRank ?? "—"} className="capitalize" />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <ReadOnlyField label="Familia" value={taxonDetail.family ?? "—"} />
                <ReadOnlyField label="Género" value={taxonDetail.genus ?? "—"} className="italic" />
                <ReadOnlyField
                  label="Epíteto específico"
                  value={taxonDetail.specificEpithet ?? "—"}
                  className="italic"
                />
              </div>
            </div>
          )}

          {!taxonDetail && !taxonLoading && scientificNameInput.trim().length >= 2 && !acOpen && !selectedTaxonID && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Selecciona un nombre científico de la lista para vincular al taxón.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <FieldSectionHeader title="Datos de la Identificación" subtitle="Fecha, tipo y quién identificó" />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateIdentified" className="flex flex-wrap items-center gap-2">
                Fecha de identificación
                <RequirementBadge kind="optional" />
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
              <Label htmlFor="typeStatus" className="flex flex-wrap items-center gap-2">
                Estado de tipo
                <RequirementBadge kind="optional" />
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

          <div className="space-y-2 mt-4">
            <Label className="flex flex-wrap items-center gap-2">
              Identificadores
              <RequirementBadge kind="optional" />
              <DwcTerm term="identifiedBy" />
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

          <div className="space-y-2 mt-4">
            <Label htmlFor="identificationVerificationStatus" className="flex flex-wrap items-center gap-2">
              Estado de verificación
              <RequirementBadge kind="optional" />
              <DwcTerm term="identificationVerificationStatus" />
            </Label>
            <Input
              id="identificationVerificationStatus"
              value={identificationVerificationStatus}
              onChange={(event) => setIdentificationVerificationStatus(event.target.value)}
              placeholder="Ej: Verificada por especialista"
            />
          </div>
        </CardContent>
      </Card>
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
      cameraAvailable={cameraAvailable}
      disabled={inlineSaving || isSubmitting}
    />
  );

  /* ══════════════════════════════════════════════════
     RENDER PRINCIPAL
  ══════════════════════════════════════════════════ */
  const canSubmit = mode === "edit" ? !!catalogNumber : !!catalogNumber && !!selectedTaxonID;

  // Refleja exactamente los badges "Obligatorio"/"Recomendado" que ya se ven en cada pestaña.
  const TAB_STATUSES: Record<TabKey, TabCompletionStatus> = {
    occurrence: tabCompletionStatus(!!catalogNumber.trim(), !!recordedBy.trim() && !!occurrenceStatus),
    event: tabCompletionStatus(true, !!eventDate),
    location: tabCompletionStatus(true, !!locality.trim()),
    taxon: tabCompletionStatus(mode === "edit" || !!selectedTaxonID, true),
    images: tabCompletionStatus(true, newImages.length + existingImages.length > 0),
  };

  // Mismo criterio que decide canSubmit: qué pestañas tienen el ícono rojo (falta lo
  // obligatorio) en este momento, para nombrarlas en el tooltip del botón de guardar.
  const missingTabLabels = TABS.filter((tab) => TAB_STATUSES[tab.key] === "missing").map((tab) => tab.label);

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
              <h1 className="text-3xl font-semibold tracking-tight mb-2">
                {mode === "edit" ? "Actualizar ocurrencia" : "Nueva ocurrencia"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "edit"
                  ? "Modifica la información del espécimen según estándar Darwin Core"
                  : "Completa la información del espécimen recolectado según estándar Darwin Core"}
              </p>
            </div>

            <div className="flex-shrink-0 pt-1 flex items-center gap-2">
              <DwcGlossaryDialog />
              {!canSubmit ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="inline-block cursor-not-allowed">
                        <Button
                          type="button"
                          disabled
                          style={{ backgroundColor: "rgb(117,26,29)", color: "white" }}
                          className="opacity-50 pointer-events-none"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {mode === "edit" ? "Actualizar ocurrencia" : "Guardar ocurrencia"}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover text-popover-foreground border shadow-md z-[100]">
                      <p>Completa los campos obligatorios de {missingTabLabels.join(" y ")} para guardar</p>
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
        <OccurrenceTabsNav activeTab={activeTab} onTabChange={setActiveTab} statuses={TAB_STATUSES} />

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
