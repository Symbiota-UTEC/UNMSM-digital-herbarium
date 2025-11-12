import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Microscope,
  ClipboardList,
  Check,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { DWC_FIELDS } from "@constants/dwc";
import { MapSearchDialog } from "../MapSearchDialog";

/* ----------------------------- UX helpers ----------------------------- */
const TEXTAREA_TERMS = new Set<string>([
  "occurrenceRemarks",
  "eventRemarks",
  "habitat",
  "verbatimEventDate",
  "verbatimLocality",
  "verbatimElevation",
  "dynamicProperties",
]);

const displayLabelEs = (termObj: { label: string; helpEs?: string }) => termObj.helpEs ?? termObj.label;
const isFullWidth = (term: string) => TEXTAREA_TERMS.has(term) || /remarks|verbatim|dynamicProperties/i.test(term);

const examplePlaceholder: Record<string, string> = {
  catalogNumber: "BOT-2024-001",
  recordNumber: "1234",
  recordedBy: "Agregar recolector(a)",
  eventDate: "",
  samplingProtocol: "Transecto 50×2 m",
  stateProvince: "Cusco",
  municipality: "Ollantaytambo",
  locality: "Descripción corta del sitio",
  decimalLatitude: "-12.046374",
  decimalLongitude: "-77.042793",
  coordinateUncertaintyInMeters: "100",
  scientificName: "Genus species Author",
  family: "Asteraceae",
  genus: "Baccharis",
  taxonRank: "species",
};

const getFieldInputProps = (term: string) => {
  const ph = examplePlaceholder[term];
  if (term === "eventDate") return { type: "date", placeholder: ph } as const;
  if (term === "year") return { type: "number", inputMode: "numeric", step: "1", min: 1500, max: 2100, placeholder: "YYYY" } as const;
  if (term === "month") return { type: "number", inputMode: "numeric", step: "1", min: 1, max: 12, placeholder: "MM" } as const;
  if (term === "day") return { type: "number", inputMode: "numeric", step: "1", min: 1, max: 31, placeholder: "DD" } as const;
  if (term === "decimalLatitude") return { type: "number", inputMode: "decimal", step: "0.000001", min: -90, max: 90, placeholder: ph } as const;
  if (term === "decimalLongitude") return { type: "number", inputMode: "decimal", step: "0.000001", min: -180, max: 180, placeholder: ph } as const;
  if (term === "coordinateUncertaintyInMeters") return { type: "number", inputMode: "decimal", step: "0.1", min: 0, placeholder: ph } as const;
  if (term === "coordinatePrecision") return { type: "number", inputMode: "decimal", step: "0.000001", min: 0 } as const;
  if (term === "individualCount") return { type: "number", inputMode: "numeric", step: "1", min: 0 } as const;
  if (term === "minimumElevationInMeters" || term === "maximumElevationInMeters")
    return { type: "number", inputMode: "decimal", step: "0.1" } as const;
  return { type: "text", placeholder: ph } as const;
};

/* --------------------------- Stepper (bolitas) --------------------------- */
function DotsStepper({
                       steps,
                       stepIndex,
                       onJump,
                       pctByStep,
                     }: {
  steps: Array<{ key: string; title: string; icon: any }>;
  stepIndex: number;
  onJump: (i: number) => void;
  pctByStep: (idx: number) => number;
}) {
  return (
      <ol className="flex items-center justify-between gap-2 sm:gap-3">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const status = idx < stepIndex ? "complete" : idx === stepIndex ? "active" : "upcoming";
          const circleClass =
              status === "complete"
                  ? "bg-background border-primary"
                  : status === "active"
                      ? "bg-primary border-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                      : "bg-muted border-border";

          return (
              <li key={s.key} className="flex-1 flex items-center">
                <button
                    type="button"
                    aria-current={status === "active" ? "step" : undefined}
                    onClick={() => onJump(idx)}
                    className="group relative flex flex-col items-center gap-2 w-20 sm:w-24 mx-auto"
                >
                  <div
                      className={[
                        "relative z-10 flex items-center justify-center rounded-full border transition-all duration-200",
                        "w-8 h-8 sm:w-9 sm:h-9",
                        circleClass,
                      ].join(" ")}
                  >
                    {status === "complete" ? <Check className="h-4 w-4 text-primary" /> : status === "active" ? <Icon className="h-4 w-4 text-primary-foreground" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <span className={["text-[10px] sm:text-xs text-center leading-tight", status === "upcoming" ? "text-muted-foreground" : "text-foreground"].join(" ")}>
                {s.title}
              </span>
                  {idx > 0 && <span className={["absolute left-[-50%] top-4 sm:top-[18px] h-0.5 sm:h-[3px] w-1/2", idx <= stepIndex ? "bg-primary" : "bg-muted"].join(" ")} />}
                  {idx < steps.length - 1 && <span className={["absolute right-[-50%] top-4 sm:top-[18px] h-0.5 sm:h-[3px] w-1/2", idx < stepIndex ? "bg-primary" : "bg-muted"].join(" ")} />}
                </button>
              </li>
          );
        })}
      </ol>
  );
}

/* --------------------------- Main component --------------------------- */
interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: "create" | "edit";
  occurrenceId?: string;
  returnTo?: "occurrences" | "collection";
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

export function NewOccurrencePage({
                                    onNavigate,
                                    mode = "create",
                                    occurrenceId,
                                    returnTo = "occurrences",
                                    collectionId,
                                    collectionName: collectionNameProp,
                                    isOwner,
                                  }: NewOccurrencePageProps) {
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const base: Record<string, any> = {};
    [...DWC_FIELDS.Occurrence, ...DWC_FIELDS.Event, ...DWC_FIELDS.Location, ...DWC_FIELDS.Taxon].forEach((f) => {
      base[f.term] = "";
    });
    return base;
  });

  const [recordedByList, setRecordedByList] = useState<string[]>([]);
  const [recordedByInput, setRecordedByInput] = useState("");
  const handleChange = (field: string, value: string) => setFormValues((prev) => ({ ...prev, [field]: value }));

  const handleCancel = () => {
    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", { collectionId, collectionName: collectionNameProp || "", isOwner: isOwner ?? false });
    } else {
      onNavigate("occurrences");
    }
  };

  /* ---------- MAP INLINE (OpenLayers) ---------- */
  const [mapOpen, setMapOpen] = useState(false);

  const initialCenter = useMemo<[number, number]>(() => {
    const lat = parseFloat(formValues.decimalLatitude);
    const lon = parseFloat(formValues.decimalLongitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lon, lat];
    return [-77.042793, -12.046374]; // Lima
  }, [formValues.decimalLatitude, formValues.decimalLongitude]);

  const handleMapConfirm = (payload: {
    lat: number;
    lon: number;
    country?: string;
    state?: string;
    county?: string;
    municipality?: string;
    localityLabel?: string;
  }) => {
    const { lat, lon, state, county, municipality, localityLabel } = payload;
    setFormValues((prev) => ({
      ...prev,
      decimalLatitude: String(lat ?? prev.decimalLatitude),
      decimalLongitude: String(lon ?? prev.decimalLongitude),
      geodeticDatum: prev.geodeticDatum || "WGS84",
      stateProvince: state ?? prev.stateProvince,
      county: county ?? prev.county,
      municipality: municipality ?? prev.municipality,
      locality: localityLabel ?? prev.locality,
      verbatimLocality: localityLabel ?? prev.verbatimLocality ?? `${lat?.toFixed?.(5) ?? ""}, ${lon?.toFixed?.(5) ?? ""}`,
      coordinateUncertaintyInMeters: prev.coordinateUncertaintyInMeters || "100",
    }));
    toast.success("Ubicación inferida desde el mapa");
  };

  /* ---------- chips RecordedBy ---------- */
  const syncRecordedByToForm = (list: string[]) => {
    setRecordedByList(list);
    setFormValues((prev) => ({ ...prev, recordedBy: list.join("; ") }));
  };
  const addRecordedBy = () => {
    const v = recordedByInput.trim();
    if (!v) return;
    syncRecordedByToForm([...recordedByList, v]);
    setRecordedByInput("");
  };
  const removeRecordedBy = (i: number) => {
    syncRecordedByToForm(recordedByList.filter((_, idx) => idx !== i));
  };

  /* ------------------------------ Steps data ------------------------------ */
  const steps = useMemo(() => {
    return [
      {
        key: "occurrence",
        title: "Registro",
        icon: ClipboardList,
        subtitle: "Identificadores y responsables.",
        fields: DWC_FIELDS.Occurrence.filter((f) =>
            ["occurrenceID", "catalogNumber", "recordNumber", "recordedBy", "preparations", "disposition", "occurrenceRemarks", "license"].includes(f.term)
        ),
      },
      {
        key: "event",
        title: "Evento",
        icon: CalendarDays,
        subtitle: "Cuándo y cómo se registró.",
        fields: DWC_FIELDS.Event.filter((f) => ["eventDate", "year", "month", "day", "samplingProtocol", "eventRemarks"].includes(f.term)),
      },
      {
        key: "location",
        title: "Ubicación",
        icon: MapPin,
        subtitle: "Lugar y coordenadas.",
        fields: DWC_FIELDS.Location.filter((f) =>
            ["stateProvince", "municipality", "locality", "decimalLatitude", "decimalLongitude", "coordinateUncertaintyInMeters", "verbatimLocality"].includes(f.term)
        ),
      },
      {
        key: "taxon",
        title: "Taxón",
        icon: Microscope,
        subtitle: "Identificación principal.",
        fields: DWC_FIELDS.Taxon.filter((f) => ["scientificName", "family", "genus", "taxonRank", "scientificNameAuthorship"].includes(f.term)),
      },
    ] as const;
  }, []);

  const [stepIndex, setStepIndex] = useState(0);
  const current = steps[stepIndex];

  const stepCompletion = (fields: typeof steps[number]["fields"]) => {
    const total = fields.length;
    const filled = fields.filter((f) => formValues[f.term] && String(formValues[f.term]).trim() !== "").length;
    return { total, filled, pct: total ? Math.round((filled / total) * 100) : 0 };
  };
  const pctByStep = (idx: number) => stepCompletion(steps[idx].fields).pct;

  const validateStep = (s = current) => {
    const requiredInStep = s.fields.filter((f) => f.required);
    for (const f of requiredInStep) {
      const v = formValues[f.term];
      if (!v || String(v).trim() === "") {
        toast.error(`${displayLabelEs(f)} es requerido`);
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  };
  const goPrev = () => setStepIndex((i) => Math.max(0, i - 1));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    const allRequired = [...DWC_FIELDS.Occurrence, ...DWC_FIELDS.Event, ...DWC_FIELDS.Location, ...DWC_FIELDS.Taxon].filter((f) => f.required);
    for (const f of allRequired) {
      if (!formValues[f.term] || String(formValues[f.term]).trim() === "") {
        toast.error(`${displayLabelEs(f)} es requerido`);
        return;
      }
    }

    toast.success(mode === "create" ? "Ocurrencia registrada exitosamente" : "Ocurrencia actualizada exitosamente");

    if (returnTo === "collection" && collectionId) {
      onNavigate("collection-detail", { collectionId, collectionName: collectionNameProp || "", isOwner: isOwner ?? false });
    } else {
      onNavigate("occurrences");
    }
  };

  /* ------------------------------ Field renderer ------------------------------ */
  const RenderField = ({ field }: { field: (typeof DWC_FIELDS.Occurrence)[number] }) => {
    const id = field.term;
    const labelEs = displayLabelEs(field);
    const useTextArea = TEXTAREA_TERMS.has(field.term);
    const inputProps = getFieldInputProps(field.term);

    if (field.term === "recordedBy") {
      return (
          <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">
              {labelEs}
              {field.required ? " *" : ""}
            </Label>
            <div className="flex gap-2">
              <Input
                  id={id}
                  value={recordedByInput}
                  onChange={(e) => setRecordedByInput(e.target.value)}
                  placeholder={examplePlaceholder.recordedBy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRecordedBy();
                    }
                  }}
              />
              <Button type="button" variant="outline" onClick={addRecordedBy}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {!!recordedByList.length && (
                <div className="flex flex-wrap gap-1.5">
                  {recordedByList.map((name, i) => (
                      <Badge key={`${name}-${i}`} variant="secondary" className="gap-1">
                        {name}
                        <button type="button" onClick={() => removeRecordedBy(i)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                  ))}
                </div>
            )}
          </div>
      );
    }

    if (field.term === "license") {
      return (
          <div className="space-y-1.5">
            <Label htmlFor={id} className="text-sm font-medium">
              {labelEs}
              {field.required ? " *" : ""}
            </Label>
            <Select value={formValues[field.term] ?? ""} onValueChange={(v) => handleChange(field.term, v)}>
              <SelectTrigger id={id}>
                <SelectValue placeholder="Selecciona una licencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CC0">CC0 (Dominio público)</SelectItem>
                <SelectItem value="CC-BY-4.0">CC BY 4.0</SelectItem>
                <SelectItem value="CC-BY-NC-4.0">CC BY-NC 4.0</SelectItem>
                <SelectItem value="CC-BY-SA-4.0">CC BY-SA 4.0</SelectItem>
              </SelectContent>
            </Select>
          </div>
      );
    }

    return (
        <div className="space-y-1.5">
          <Label htmlFor={id} className="text-sm font-medium">
            {labelEs}
            {field.required ? " *" : ""}
          </Label>

          {useTextArea ? (
              <Textarea
                  id={id}
                  value={formValues[field.term] ?? ""}
                  onChange={(e) => handleChange(field.term, e.target.value)}
                  required={!!field.required}
                  placeholder={getFieldInputProps(field.term).placeholder ?? ""}
                  className="resize-y min-h-[90px]"
              />
          ) : (
              <Input
                  id={id}
                  value={formValues[field.term] ?? ""}
                  onChange={(e) => handleChange(field.term, e.target.value)}
                  required={!!field.required}
                  placeholder={inputProps.placeholder ?? ""}
                  type={inputProps.type as any}
                  inputMode={inputProps.inputMode as any}
                  step={(inputProps as any).step}
                  min={(inputProps as any).min}
                  max={(inputProps as any).max}
              />
          )}
        </div>
    );
  };

  /* ------------------------------ UI ------------------------------ */
  const stepFields = steps[stepIndex].fields;

  return (
      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex h-10 items-center justify-between gap-3">
            <div className="min-w-0">
              <Button variant="ghost" onClick={handleCancel} className="inline-flex h-10 items-center gap-2 px-2 sm:px-3 shrink-0">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden xs:inline">{returnTo === "collection" ? "Volver a la colección" : "Volver a Ocurrencias"}</span>
              </Button>
            </div>

            {collectionNameProp && (
                <span title={collectionNameProp} className="max-w-[60%] sm:max-w-none truncate text-xs rounded-full bg-muted px-3 py-1 inline-flex items-center h-7 shrink-0">
              {collectionNameProp}
            </span>
            )}
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6">
          <DotsStepper steps={steps.map((s) => ({ key: s.key, title: s.title, icon: s.icon }))} stepIndex={stepIndex} onJump={setStepIndex} pctByStep={pctByStep} />
        </div>

        {/* Card Paso Actual */}
        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border bg-card/50 backdrop-blur p-4 sm:p-6">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <current.icon className="h-4 w-4" />
                <h2 className="text-base sm:text-lg font-semibold">{current.title}</h2>
              </div>
              <span className="text-[11px] text-muted-foreground">
              {stepCompletion(stepFields).filled}/{stepCompletion(stepFields).total} campos
            </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">{current.subtitle}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stepFields.map((f) => (
                  <div key={f.term} className={isFullWidth(f.term) ? "md:col-span-2" : ""}>
                    <RenderField field={f} />
                  </div>
              ))}

              {current.key === "location" && (
                  <>
                    <div className="md:col-span-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setMapOpen((v) => !v)}>
                        <MapPin className="h-4 w-4 mr-2" />
                        {mapOpen ? "Ocultar mapa" : "Tomar del mapa"}
                      </Button>
                    </div>

                    {/* Panel del mapa inline (OpenLayers) */}
                    <div className="md:col-span-2">
                      <MapSearchDialog
                          open={mapOpen}
                          onOpenChange={setMapOpen}
                          initialCenter={initialCenter}
                          onConfirm={handleMapConfirm}
                      />
                    </div>
                  </>
              )}
            </div>
          </div>

          {/* Barra acciones paso */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">Paso {stepIndex + 1} de {steps.length}</div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleCancel}>Cancelar</Button>
              {stepIndex > 0 && (
                  <Button type="button" variant="secondary" onClick={goPrev}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
              )}
              {stepIndex < steps.length - 1 ? (
                  <Button type="button" onClick={goNext}>
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
              ) : (
                  <Button type="submit">{mode === "edit" ? "Guardar cambios" : "Guardar ocurrencia"}</Button>
              )}
            </div>
          </div>
        </form>
      </div>
  );
}
