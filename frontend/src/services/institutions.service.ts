import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { Institution } from "@interfaces/institution";
import { throwIfError, type ApiFetch } from "./api.error";

export interface InstitutionListParams {
    page?: number;
    limit?: number;
    namePrefix?: string;
}

export interface InstitutionUpdatePayload {
    institutionName?: string;
    country?: string;
    city?: string;
    address?: string;
    email?: string;
    phone?: string;
    webSite?: string;
    institutionAdminUserId?: number | null;
}

export const institutionsService = {

    async list(
        apiFetch: ApiFetch,
        params: InstitutionListParams,
    ): Promise<PaginatedResponse<Institution>> {
        const { page = 1, limit = 10, namePrefix } = params;
        const offset = (page - 1) * limit;
        const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (namePrefix?.trim()) query.set("namePrefix", namePrefix.trim());

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.INSTITUTIONS.BASE}?${query.toString()}`);
        await throwIfError(res);
        return res.json();
    },

    async getById(apiFetch: ApiFetch, institutionId: string | number): Promise<Institution> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.INSTITUTIONS.BY_ID(institutionId)}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async create(apiFetch: ApiFetch, payload: Partial<Institution>): Promise<Institution> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.INSTITUTIONS.BASE}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        await throwIfError(res);
        return res.json();
    },

    async update(
        apiFetch: ApiFetch,
        institutionId: string | number,
        payload: InstitutionUpdatePayload,
    ): Promise<Institution> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.INSTITUTIONS.BY_ID(institutionId)}`,
            { method: "PATCH", body: JSON.stringify(payload) },
        );
        await throwIfError(res);
        return res.json();
    },

    /** Búsqueda por prefijo de nombre — para autocompletado */
    async search(apiFetch: ApiFetch, namePrefix: string, limit: number): Promise<PaginatedResponse<Institution>> {
        const query = new URLSearchParams({ namePrefix, limit: String(limit) });
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.INSTITUTIONS.BASE}?${query.toString()}`);
        await throwIfError(res);
        return res.json();
    },
};
