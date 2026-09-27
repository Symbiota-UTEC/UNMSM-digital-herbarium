import type { CSSProperties } from "react";

// Colores del estado de una identificación (vigente, verificación, tipo) y del taxón mismo
// (accepted/actual), compartidos entre TaxonDetailPage.tsx y OccurrenceDetailPage.tsx para que
// no se desalineen. Deliberadamente NO comparte paleta con ROLE_BADGE (constants/roleBadge.ts):
// son conceptos distintos — el estado de una identificación no es un permiso de usuario —
// aunque algún tono coincida.
//
// Estilo inline en vez de clases Tailwind: bg-green-100/text-green-800 (el verde de "vigente")
// no están compiladas en index.css y quedaban invisibles (ver frontend/CLAUDE.md > CSS /
// Theming) — bg-green-50/text-green-700 sí existen, pero esas ya las usa el badge de rol
// "Editor" (roleBadge.ts), así que reusarlas aquí volvería a mezclar los dos conceptos.
export const IDENTIFICATION_STATUS_COLORS = {
  current: { backgroundColor: "#dcfce7", color: "#166534" },
  verification: { backgroundColor: "#dbeafe", color: "#1e40af" },
  type: { backgroundColor: "#f3e8ff", color: "#6b21a8" },
} as const satisfies Record<string, CSSProperties>;
