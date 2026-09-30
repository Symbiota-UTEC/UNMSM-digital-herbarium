import { BASEMAPS, type BasemapId } from "@utils/basemaps";

type Props = {
  value: BasemapId;
  onChange: (id: BasemapId) => void;
  /** true: sin posición ni chip propios, para embeberlo en una barra que ya los provee (LocationPicker). */
  inline?: boolean;
};

// Estilos en línea: index.css es Tailwind precompilado y no incluye clases nuevas.
/** Selector de mapa base; por defecto va dentro de un contenedor `relative` que envuelve al mapa. */
export function BasemapSwitcher({ value, onChange, inline = false }: Props) {
  return (
    <div
      style={
        inline
          ? { display: "flex", gap: 2 }
          : {
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 10,
              display: "flex",
              gap: 2,
              padding: 2,
              borderRadius: 8,
              border: "1px solid rgba(0, 0, 0, 0.15)",
              background: "rgba(255, 255, 255, 0.92)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
            }
      }
    >
      {BASEMAPS.map((b) => {
        const active = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(b.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              color: active ? "var(--primary-foreground)" : "#111827",
              background: active ? "var(--primary)" : "transparent",
            }}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
