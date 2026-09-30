import type { ReactNode } from "react";
import { Badge } from "./badge";

/** Encabezado de sección de un grupo de campos: barra de acento + título + subtítulo. Va dentro
 * de un `Card`/`CardContent`; a nivel de módulo (no dentro de otro componente) porque si no se
 * remontaría en cada render. */
export function FieldSectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  /** Ícono opcional (p. ej. de lucide-react, `h-4 w-4`) antes del título. */
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pb-2 mb-4 border-b">
      <div className="flex items-center gap-2">
        <span className="h-5 rounded-full bg-primary" style={{ width: "4px" }} />
        {icon && <span className="text-muted-foreground flex items-center">{icon}</span>}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
  );
}

export type FieldRequirement = "required" | "recommended" | "optional";

/** Nivel de exigencia de un campo del formulario (no confundir con las paletas de
 * roleBadge.ts/identificationStatus.ts: esto es un hint de UX de un formulario, no un
 * atributo del dato en sí). */
export function RequirementBadge({ kind }: { kind: FieldRequirement }) {
  if (kind === "required") {
    return (
      <Badge variant="destructive" className="text-xs font-normal">
        Obligatorio
      </Badge>
    );
  }
  if (kind === "recommended") {
    return (
      <Badge variant="secondary" className="text-xs font-normal bg-green-50 text-green-700">
        Recomendado
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs font-normal">
      Opcional
    </Badge>
  );
}

const showValue = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Fila etiqueta/valor de solo lectura: mismo lenguaje que el resto de cajas informativas de la
 * app (border + bg-muted/40, como el spinner de carga del taxón o el aviso del polígono
 * dibujado). Usado tanto por el panel de taxón verificado del formulario como por todo
 * OccurrenceDetailPage.tsx, para que el detalle y el formulario se vean iguales. La etiqueta va
 * DENTRO de la caja (a diferencia de un campo editable, donde el Label siempre está afuera,
 * encima del Input), así no se confunde con un control de formulario. */
export function ReadOnlyField({
  label,
  value,
  mono = false,
  italic = false,
  className,
}: {
  label: string;
  value?: unknown;
  mono?: boolean;
  italic?: boolean;
  className?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={["text-sm", mono && "font-mono", italic && "italic", className].filter(Boolean).join(" ")}
        style={{ whiteSpace: "pre-wrap" }}
      >
        {showValue(value)}
      </p>
    </div>
  );
}
