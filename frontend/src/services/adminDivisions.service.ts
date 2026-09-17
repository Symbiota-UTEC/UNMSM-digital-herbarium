import { API } from "@constants/api";
import { throwIfError, type ApiFetch } from "./api.error";
import type { AdminDivision, CatalogCountry } from "@interfaces/adminDivision";

export const adminDivisionsService = {
    /** Países del catálogo (única fuente de la lista de países de la UI) */
    async countries(apiFetch: ApiFetch): Promise<CatalogCountry[]> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.ADMIN_DIVISIONS.COUNTRIES}`);
        await throwIfError(res);
        const data = await res.json();
        return data.items ?? [];
    },

    /** Divisiones raíz de un país (nivel 1) */
    async topLevel(apiFetch: ApiFetch, countryCode: string): Promise<AdminDivision[]> {
        const params = new URLSearchParams({ countryCode, level: "1" });
        return adminDivisionsService.query(apiFetch, params);
    },

    /** Hijos de una división (provincias de un departamento, distritos de una provincia) */
    async children(apiFetch: ApiFetch, parentId: string): Promise<AdminDivision[]> {
        const params = new URLSearchParams({ parentId });
        return adminDivisionsService.query(apiFetch, params);
    },

    async query(apiFetch: ApiFetch, params: URLSearchParams): Promise<AdminDivision[]> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.ADMIN_DIVISIONS.BASE}?${params.toString()}`,
        );
        await throwIfError(res);
        const data = await res.json();
        return data.items ?? [];
    },
};
