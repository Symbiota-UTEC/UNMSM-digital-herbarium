import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

// Estilos en línea: index.css es Tailwind precompilado y no incluye clases nuevas.
/** Botón (i) que muestra el término Darwin Core del campo mientras el cursor está encima. */
export function DwcTerm({ term }: { term: string }) {
    return (
        <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    aria-label={`Término Darwin Core: dwc:${term}`}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        padding: 0,
                        border: "none",
                        borderRadius: "50%",
                        background: "transparent",
                        color: "var(--muted-foreground)",
                        cursor: "help",
                    }}
                >
                    <Info size={15} />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>dwc:{term}</span>
            </TooltipContent>
        </Tooltip>
    );
}
