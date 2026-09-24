import type { ApiFetch } from "./api.error";

/** Cabeceras por defecto: JSON salvo FormData (el navegador genera el boundary). */
const withDefaultHeaders = (init: RequestInit): Headers => {
  const headers = new Headers(init.headers);
  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
  } else if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
};

/**
 * Cliente autenticado que reciben los servicios (lo construye AuthContext).
 * Adjunta el Bearer token y avisa con `onUnauthorized` cuando el servidor responde 401
 * con un token enviado (sesión vencida o inválida).
 *
 * Un 403 NO cierra la sesión: significa "sin permiso para esto" y lo maneja quien llamó.
 */
export function createApiFetch({
  getToken,
  onUnauthorized,
}: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}): ApiFetch {
  return async (input, init = {}) => {
    const headers = withDefaultHeaders(init);
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(input, { ...init, headers });

    if (res.status === 401) {
      // Sin token no hay sesión que cerrar (p. ej. la página pide datos antes de restaurarla).
      if (token) onUnauthorized();
      throw new Error("No autorizado");
    }
    return res;
  };
}

/** Cliente para páginas públicas (registro): no adjunta sesión ni token. */
export const publicFetch: ApiFetch = (input, init = {}) => fetch(input, { ...init, headers: withDefaultHeaders(init) });
