import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { AlertCircle, Camera, Check, Eye, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { uploadService } from "@services/upload.service";
import type { OccurrenceImageOut } from "@interfaces/occurrence";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ImageLightbox, type LightboxImage } from "./ImageLightbox";
import "./image-manager.css";

/** Imagen elegida que todavía no se sube (se envía al guardar la ocurrencia). */
export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
  photographer: string;
}

interface ImageManagerProps {
  pending: PendingImage[];
  existing?: OccurrenceImageOut[];
  onAddFiles: (files: File[]) => void;
  onRemovePending: (id: string) => void;
  onPendingPhotographerChange: (id: string, value: string) => void;
  onCopyPhotographerToAll: (value: string) => void;
  onDeleteExisting: (imageId: string) => void;
  /** Valores editados del fotógrafo por id; se persisten con el formulario, no al escribir. */
  existingPhotographers: Record<string, string>;
  onExistingPhotographerChange: (imageId: string, value: string) => void;
  onCapture?: () => void;
  capturing?: boolean;
  cameraError?: string | null;
  disabled?: boolean;
}

const ACCEPTED = ["image/jpeg", "image/png", "image/tiff", "image/webp"];
const PHOTOGRAPHER_PLACEHOLDER = "Quién tomó la foto (opcional)";

/** Nombre legible: sin la ruta ni el UUID que antepone el backend. */
const displayName = (path: string) => (path.split("/").pop() ?? path).replace(/^[0-9a-f-]{36}_/, "");

const formatSize = (bytes: number | null | undefined) => {
  if (!bytes) return "";
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

function PhotographerField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Fotógrafo/a
      </label>
      <Input
        id={id}
        value={value}
        maxLength={255}
        disabled={disabled}
        placeholder={PHOTOGRAPHER_PLACEHOLDER}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          // Enter no debe enviar el formulario de la ocurrencia.
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </div>
  );
}

/** Tarjeta de una imagen ya guardada. El fotógrafo se edita aquí pero se guarda con el formulario. */
function ExistingImageCard({
  image,
  photographer,
  disabled,
  onView,
  onDelete,
  onPhotographerChange,
}: {
  image: OccurrenceImageOut;
  photographer: string;
  disabled?: boolean;
  onView: () => void;
  onDelete: () => void;
  onPhotographerChange: (value: string) => void;
}) {
  const fileName = displayName(image.imagePath);

  return (
    <div className="hb-image-card">
      <div className="hb-image-thumb">
        <img src={uploadService.imageUrl(image.occurrenceImageId)} alt={fileName} loading="lazy" />
        <button
          type="button"
          className="hb-image-remove"
          onClick={onDelete}
          disabled={disabled}
          title="Eliminar imagen"
          aria-label="Eliminar imagen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="hb-image-view"
          onClick={onView}
          title="Ver en pantalla completa"
          aria-label="Ver en pantalla completa"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
      <div className="hb-image-body">
        <div className="hb-image-meta">
          <span className="hb-image-name" title={fileName}>
            {fileName}
          </span>
          <span className="hb-image-size">{formatSize(image.fileSize)}</span>
        </div>
        <PhotographerField
          id={`photographer-${image.occurrenceImageId}`}
          value={photographer}
          onChange={onPhotographerChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export function ImageManager({
  pending,
  existing = [],
  onAddFiles,
  onRemovePending,
  onPendingPhotographerChange,
  onCopyPhotographerToAll,
  onDeleteExisting,
  existingPhotographers,
  onExistingPhotographerChange,
  onCapture,
  capturing = false,
  cameraError,
  disabled = false,
}: ImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Galería del visor: primero las guardadas, luego las nuevas.
  const gallery: LightboxImage[] = [
    ...existing.map((img) => ({
      src: uploadService.imageUrl(img.occurrenceImageId),
      title: displayName(img.imagePath),
      caption: (existingPhotographers[img.occurrenceImageId] ?? img.photographer ?? "").trim()
        ? `Fotógrafo/a: ${(existingPhotographers[img.occurrenceImageId] ?? img.photographer ?? "").trim()}`
        : undefined,
    })),
    ...pending.map((img) => ({
      src: img.previewUrl,
      title: img.file.name,
      caption: img.photographer.trim() ? `Fotógrafo/a: ${img.photographer.trim()}` : undefined,
    })),
  ];

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    const valid = files.filter((f) => ACCEPTED.includes(f.type));
    if (valid.length < files.length) {
      toast.error("Solo se aceptan imágenes JPG, PNG, TIFF o WebP", {
        description: `${files.length - valid.length} archivo(s) omitido(s)`,
      });
    }
    if (valid.length > 0) onAddFiles(valid);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className="space-y-6">
      {existing.length > 0 && (
        <section className="space-y-3">
          <p className="text-sm font-semibold">Imágenes guardadas ({existing.length})</p>
          <div className="hb-image-grid">
            {existing.map((img, i) => (
              <ExistingImageCard
                key={img.occurrenceImageId}
                image={img}
                photographer={existingPhotographers[img.occurrenceImageId] ?? img.photographer ?? ""}
                disabled={disabled}
                onView={() => setViewerIndex(i)}
                onDelete={() => onDeleteExisting(img.occurrenceImageId)}
                onPhotographerChange={(value) => onExistingPhotographerChange(img.occurrenceImageId, value)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div
          className="hb-dropzone"
          data-active={dragging}
          role="button"
          tabIndex={0}
          aria-label="Seleccionar imágenes"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="hb-dropzone-icon">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">{dragging ? "Suelta las imágenes aquí" : "Arrastra tus imágenes aquí"}</p>
          <p className="text-xs text-muted-foreground">o haz clic para seleccionarlas · JPG, PNG, TIFF o WebP</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {onCapture && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={onCapture} disabled={capturing || disabled}>
              {capturing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              {capturing ? "Capturando…" : "Tomar foto con la cámara"}
            </Button>
            {cameraError && (
              <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {cameraError}
              </span>
            )}
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              {pending.length} imagen{pending.length !== 1 ? "es" : ""} por subir
            </p>
            <p className="text-xs text-muted-foreground">Se suben al guardar la ocurrencia.</p>
          </div>
          <div className="hb-image-grid">
            {pending.map((img, i) => (
              <div key={img.id} className="hb-image-card">
                <div className="hb-image-thumb">
                  <img src={img.previewUrl} alt={img.file.name} />
                  <span className="hb-image-badge">Nueva</span>
                  <button
                    type="button"
                    className="hb-image-remove"
                    onClick={() => onRemovePending(img.id)}
                    title="Quitar imagen"
                    aria-label="Quitar imagen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="hb-image-view"
                    onClick={() => setViewerIndex(existing.length + i)}
                    title="Ver en pantalla completa"
                    aria-label="Ver en pantalla completa"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                <div className="hb-image-body">
                  <div className="hb-image-meta">
                    <span className="hb-image-name" title={img.file.name}>
                      {img.file.name}
                    </span>
                    <span className="hb-image-size">{formatSize(img.file.size)}</span>
                  </div>
                  <PhotographerField
                    id={`photographer-${img.id}`}
                    value={img.photographer}
                    onChange={(value) => onPendingPhotographerChange(img.id, value)}
                  />
                  {pending.length > 1 && img.photographer.trim() && (
                    <button
                      type="button"
                      className="hb-link-button"
                      onClick={() => onCopyPhotographerToAll(img.photographer)}
                    >
                      <Check className="h-3 w-3" />
                      Usar este nombre en todas
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ImageLightbox
        images={gallery}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
