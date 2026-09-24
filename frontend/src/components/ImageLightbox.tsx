import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import "./image-manager.css";

export interface LightboxImage {
  src: string;
  title: string;
  caption?: ReactNode;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  /** Índice de la imagen abierta; null = cerrado. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Visor a pantalla completa: cierra con la X, Esc o clic fuera; navega con las flechas (o ← →). */
export function ImageLightbox({ images, index, onIndexChange, onClose }: ImageLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const open = index !== null && count > 0;
  const current = open ? Math.min(index, count - 1) : 0;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    toast.dismiss(); // los avisos (arriba a la derecha) taparían el botón de cerrar

    const go = (delta: number) => onIndexChange((current + delta + count) % count);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) go(-1);
      else if (e.key === "ArrowRight" && count > 1) go(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
    // Solo al abrir/cerrar y al cambiar de imagen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current, count]);

  if (!open) return null;
  const image = images[current];
  const step = (delta: number) => onIndexChange((current + delta + count) % count);

  return createPortal(
    <div className="hb-lightbox" role="dialog" aria-modal="true" aria-label={image.title} onClick={onClose}>
      <div className="hb-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="hb-lightbox-title" title={image.title}>
          {image.title}
        </span>
        {count > 1 && (
          <span className="hb-lightbox-count">
            {current + 1} / {count}
          </span>
        )}
        <button ref={closeRef} type="button" className="hb-lightbox-btn" onClick={onClose} aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </div>

      {count > 1 && (
        <button
          type="button"
          className="hb-lightbox-btn hb-lightbox-nav hb-lightbox-prev"
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
          aria-label="Imagen anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img className="hb-lightbox-img" src={image.src} alt={image.title} onClick={(e) => e.stopPropagation()} />

      {count > 1 && (
        <button
          type="button"
          className="hb-lightbox-btn hb-lightbox-nav hb-lightbox-next"
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
          aria-label="Imagen siguiente"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {image.caption && (
        <div className="hb-lightbox-caption" onClick={(e) => e.stopPropagation()}>
          {image.caption}
        </div>
      )}
    </div>,
    document.body,
  );
}
