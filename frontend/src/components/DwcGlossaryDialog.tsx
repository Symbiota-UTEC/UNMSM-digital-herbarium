import { BookOpen, CalendarDays, ClipboardList, Fingerprint, Leaf, MapPin } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { FieldSectionHeader, RequirementBadge } from "./ui/field-section";
import { DWC_FIELDS, type DwCEntity } from "@constants/dwc";

const ENTITY_LABELS: Record<DwCEntity, string> = {
  Occurrence: "Ocurrencia",
  Event: "Evento",
  Location: "Localización",
  Taxon: "Taxonomía",
  Identification: "Identificación",
};

const ENTITY_ICONS: Record<DwCEntity, typeof ClipboardList> = {
  Occurrence: ClipboardList,
  Event: CalendarDays,
  Location: MapPin,
  Taxon: Leaf,
  Identification: Fingerprint,
};

const ENTITY_ORDER: DwCEntity[] = ["Occurrence", "Event", "Location", "Taxon", "Identification"];

/** Botón + diálogo con el significado de cada término Darwin Core, agrupado por la clase a la
 * que pertenece (dwc:Occurrence, dwc:Event, …), usando la misma fuente de datos (`constants/dwc.ts`)
 * que ya describe qué campos son obligatorios/recomendados/opcionales en el formulario. */
export function DwcGlossaryDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Glosario
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: "52rem" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Glosario Darwin Core
          </DialogTitle>
          <DialogDescription>Significado de cada término y a qué campo del formulario corresponde.</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto" style={{ maxHeight: "70vh", paddingRight: 4 }}>
          <div className="space-y-6">
            {ENTITY_ORDER.map((entity) => {
              const Icon = ENTITY_ICONS[entity];
              return (
                <div key={entity}>
                  <FieldSectionHeader
                    title={ENTITY_LABELS[entity]}
                    subtitle={`dwc:${entity}`}
                    icon={<Icon className="h-4 w-4" />}
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    {DWC_FIELDS[entity].map((field) => (
                      <div key={field.value} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Badge fuerza whitespace-nowrap; algunas etiquetas
                              (p. ej. dwc:Identification:identificationVerificationStatus) son
                              más anchas que la tarjeta y necesitan poder partirse. */}
                          <Badge
                            variant="outline"
                            className="font-mono text-xs font-normal"
                            style={{ whiteSpace: "normal", wordBreak: "break-all" }}
                          >
                            {field.label}
                          </Badge>
                          <RequirementBadge
                            kind={field.required ? "required" : field.recommended ? "recommended" : "optional"}
                          />
                        </div>
                        {field.helpEs && <p className="text-xs text-muted-foreground">{field.helpEs}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
