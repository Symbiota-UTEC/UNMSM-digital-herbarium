import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { CollectionOut, CollectionCreate, CollectionUserAccessItem } from "@interfaces/collection";
import type { OccurrenceBriefItem } from "@interfaces/occurrence";
import { ApiError, throwIfError, type ApiFetch } from "./api.error";

export const collectionsService = {

    async getByUser(
        apiFetch: ApiFetch,
        userId: string,
        page: number,
        limit: number,
    ): Promise<PaginatedResponse<CollectionOut>> {
        const offset = (page - 1) * limit;
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.COLLECTIONS.BY_USER(userId)}?limit=${limit}&offset=${offset}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async getAllowed(
        apiFetch: ApiFetch,
        page: number,
        limit: number,
    ): Promise<PaginatedResponse<CollectionOut>> {
        const offset = (page - 1) * limit;
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.COLLECTIONS.ALLOWED}?limit=${limit}&offset=${offset}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async create(apiFetch: ApiFetch, payload: CollectionCreate): Promise<CollectionOut> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.COLLECTIONS.BASE}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        await throwIfError(res);
        return res.json();
    },

    async getAccessUsers(
        apiFetch: ApiFetch,
        collectionId: string,
        offset: number,
        limit: number,
    ): Promise<PaginatedResponse<CollectionUserAccessItem>> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.COLLECTIONS.ACCESS_USERS(collectionId)}?limit=${limit}&offset=${offset}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async getOccurrencesBrief(
        apiFetch: ApiFetch,
        collectionId: string,
        offset: number,
        limit: number,
    ): Promise<PaginatedResponse<OccurrenceBriefItem>> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.COLLECTIONS.OCCURRENCES_BRIEF(collectionId)}?limit=${limit}&offset=${offset}`,
        );
        await throwIfError(res);
        return res.json();
    },

    /** Lanza ApiError con el status HTTP para que el componente maneje 409, 404, 403, etc. */
    async addUser(apiFetch: ApiFetch, collectionId: string, email: string): Promise<void> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.COLLECTIONS.ADD_USER(collectionId)}`,
            { method: "POST", body: JSON.stringify({ email }) },
        );
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new ApiError(`HTTP ${res.status}`, res.status, detail);
        }
    },
};
