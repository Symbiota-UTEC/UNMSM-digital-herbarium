import { env } from "@config/env";

const CAPTURE_TIMEOUT_MS = 15000;

export const cameraService = {
  /** Pide una foto a la cámara conectada (servicio digital-camera-integration) y la devuelve como archivo. */
  async captureImage(): Promise<File> {
    const res = await fetch(`${env.CAMERA_BASE_URL}/api/camera/capture-image`, {
      method: "POST",
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
    const blob = await res.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `captura-${timestamp}.jpg`, { type: blob.type || "image/jpeg" });
  },
};
