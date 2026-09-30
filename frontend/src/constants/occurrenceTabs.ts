import { ClipboardList, CalendarDays, MapPin, Leaf, Image, AlertCircle, Circle, CheckCircle2 } from "lucide-react";

// Compartido por OccurrenceDetailPage.tsx y NewOccurrencePage.tsx (mismas pestañas en modo
// lectura y edición de una ocurrencia).
export type OccurrenceTabKey = "occurrence" | "event" | "location" | "taxon" | "images";

export const OCCURRENCE_TABS: { key: OccurrenceTabKey; label: string }[] = [
  { key: "occurrence", label: "Ocurrencia" },
  { key: "event", label: "Evento" },
  { key: "location", label: "Localización" },
  { key: "taxon", label: "Taxonomía" },
  { key: "images", label: "Imágenes" },
];

// Mismo lenguaje visual que DwcGlossaryDialog: un ícono por clase Darwin Core (Occurrence,
// Event, Location, Taxon); "images" no tiene equivalente en el glosario.
export const OCCURRENCE_TAB_ICONS: Record<OccurrenceTabKey, typeof ClipboardList> = {
  occurrence: ClipboardList,
  event: CalendarDays,
  location: MapPin,
  taxon: Leaf,
  images: Image,
};

/** "missing": falta un campo obligatorio de esa pestaña. "incomplete": lo obligatorio está,
 * pero falta algún campo recomendado. "complete": obligatorios y recomendados están completos.
 * Compartido por el formulario (contra el estado editado) y el detalle (contra lo guardado). */
export type TabCompletionStatus = "missing" | "incomplete" | "complete";

export const tabCompletionStatus = (requiredOk: boolean, recommendedOk: boolean): TabCompletionStatus =>
  !requiredOk ? "missing" : recommendedOk ? "complete" : "incomplete";

export const TAB_STATUS_META: Record<TabCompletionStatus, { icon: typeof CheckCircle2; color: string; title: string }> =
  {
    missing: { icon: AlertCircle, color: "#ef4444", title: "Faltan campos obligatorios" },
    incomplete: { icon: Circle, color: "#f59e0b", title: "Obligatorios completos; faltan campos recomendados" },
    complete: { icon: CheckCircle2, color: "#22c55e", title: "Completo" },
  };
