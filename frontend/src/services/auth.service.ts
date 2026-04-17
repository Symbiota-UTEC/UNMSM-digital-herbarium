import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { RegistrationRequest } from "@interfaces/registrationRequest";
import { throwIfError, type ApiFetch } from "./api.error";

export interface RegistrationRequestsParams {
    limit: number;
    offset: number;
    statusFilter?: string;
    institutionId?: string | number;
    fullNamePrefix?: string;
}

export const authService = {

    async getRegistrationRequests(
        apiFetch: ApiFetch,
        params: RegistrationRequestsParams,
    ): Promise<PaginatedResponse<RegistrationRequest>> {
        const query = new URLSearchParams({
            limit: String(params.limit),
            offset: String(params.offset),
        });
        if (params.statusFilter) query.set("statusFilter", params.statusFilter);
        if (params.institutionId != null) query.set("institution_id", String(params.institutionId));
        if (params.fullNamePrefix?.trim()) query.set("full_name_prefix", params.fullNamePrefix.trim());

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUESTS}?${query.toString()}`);

        await throwIfError(res);
        return res.json();
    },

    async updateRegistrationRequest(
        apiFetch: ApiFetch,
        registrationRequestId: number,
        newStatus: "approved" | "rejected",
    ): Promise<void> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUEST}`, {
            method: "PATCH",
            body: JSON.stringify({ registrationRequestId, newStatus }),
        });
        await throwIfError(res);
    },

    /** Registro de nuevo usuario (sin autenticación) */
    async register(body: Record<string, any>): Promise<void> {
        const res = await fetch(`${API.BASE_URL}${API.PATHS.AUTH.REG_REQUEST}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        await throwIfError(res);
    },
};
