import type { CSSProperties } from "react";

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

// w-1.5/h-1.5/ml-1.5 y bg-green-400 no están compiladas en index.css (ver frontend/CLAUDE.md
// > CSS / Theming): sin esto el punto queda invisible (0x0, sin color).
export const OCCURRENCE_TAB_DOT_STYLE: CSSProperties = {
  marginLeft: "0.375rem",
  width: "0.375rem",
  height: "0.375rem",
  backgroundColor: "#22c55e",
};
