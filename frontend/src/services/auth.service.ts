import { API } from "@constants/api";
import type { RegistrationStatus } from "@constants/enums";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { RegistrationRequest } from "@interfaces/registrationRequest";
import type { ApiUserOut } from "@interfaces/auth";
import { ApiError, throwIfError, type ApiFetch } from "./api.error";

export interface RegistrationRequestsParams {
  page: number;
  pageSize: number;
  statusFilter?: string;
  institutionId?: string | number;
  fullNamePrefix?: string;
}

export interface LoginResponse {
  access_token: string;
  user: ApiUserOut;
}

export const authService = {
  /** Inicio de sesión (sin token: todavía no hay sesión). */
  async login(email: string, password: string): Promise<LoginResponse> {
    const form = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API.BASE_URL}${API.PATHS.AUTH.LOGIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) throw new Error("Credenciales incorrectas");

    const data = await res.json();
    if (!data.access_token || !data.user) throw new Error("Respuesta del servidor inválida");
    return data;
  },

  async getRegistrationRequests(
    apiFetch: ApiFetch,
    params: RegistrationRequestsParams,
  ): Promise<PaginatedResponse<RegistrationRequest>> {
    const query = new URLSearchParams({
      page: String(params.page),
      pageSize: String(params.pageSize),
    });
    if (params.statusFilter) query.set("statusFilter", params.statusFilter);
    if (params.institutionId != null) query.set("institutionId", String(params.institutionId));
    if (params.fullNamePrefix?.trim()) query.set("fullNamePrefix", params.fullNamePrefix.trim());

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUESTS}?${query.toString()}`);

    await throwIfError(res);
    return res.json();
  },

  async updateRegistrationRequest(
    apiFetch: ApiFetch,
    registrationRequestId: string,
    newStatus: RegistrationStatus.Approved | RegistrationStatus.Rejected,
  ): Promise<void> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUEST}`, {
      method: "PATCH",
      body: JSON.stringify({ registrationRequestId, newStatus }),
    });
    await throwIfError(res);
  },

  /** Registro de nuevo usuario (sin autenticación). El error trae el `detail` del backend como mensaje. */
  async register(body: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUEST}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return;

    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err?.detail === "string") message = err.detail;
    } catch {
      // sin cuerpo JSON: se queda el mensaje HTTP
    }
    throw new ApiError(message, res.status, message);
  },
};
