import { env } from "@config/env";

const CAPTURE_TIMEOUT_MS = 15000;
const HEALTHCHECK_TIMEOUT_MS = 1000;

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

  /** true solo si el servicio de cámara responde y confirma que está lista; false ante cualquier error, timeout o estado distinto de "ok". */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${env.CAMERA_BASE_URL}/api/camera/healthcheck`, {
        signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
      });
      if (!res.ok) return false;
      const body: unknown = await res.json();
      return !!body && typeof body === "object" && (body as { status?: unknown }).status === "ok";
    } catch {
      return false;
    }
  },
};
