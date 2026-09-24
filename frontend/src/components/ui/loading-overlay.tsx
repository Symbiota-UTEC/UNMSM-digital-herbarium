import { useRef, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import "./feedback.css";

/** true una vez que la carga terminó al menos una vez (distingue primera carga de refresco). */
export function useSettled(loading: boolean): boolean {
  const seenLoading = useRef(false);
  const settled = useRef(false);
  if (loading) seenLoading.current = true;
  else if (seenLoading.current) settled.current = true;
  return settled.current;
}

/** Barra de carga en forma de skeleton, para la primera carga de una lista. */
export function SkeletonBar({ width = "70%", style }: { width?: string; style?: CSSProperties }) {
  return <span className="hb-skeleton" style={{ width, ...style }} aria-hidden />;
}

/**
 * Envuelve contenido que ya se mostró y se está refrescando: lo mantiene en pantalla,
 * lo atenúa y, pasados 200 ms, muestra un spinner. No cambia el tamaño del contenido.
 */
export function LoadingOverlay({
  active,
  children,
  className,
  spinner = true,
  blockInteraction = true,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  spinner?: boolean;
  blockInteraction?: boolean;
}) {
  return (
    <div
      className={["hb-loading-region", className].filter(Boolean).join(" ")}
      data-loading={active}
      aria-busy={active}
    >
      <div
        className="hb-dim"
        data-loading={active}
        style={active && blockInteraction ? { pointerEvents: "none" } : undefined}
      >
        {children}
      </div>
      {spinner && <Loader2 className="hb-loading-spinner animate-spin" aria-hidden />}
    </div>
  );
}
