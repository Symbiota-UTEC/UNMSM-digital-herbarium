import { API } from "@constants/api";
import { throwIfError, type ApiFetch } from "./api.error";

export interface ScientificNameSuggestion {
    scientificName: string;
    taxonId: string | null;
    wfoTaxonId: string | null;
    scientificNameAuthorship?: string | null;
}

export const autocompleteService = {

    /** Autocomplete genérico — devuelve lista de strings */
    async query(
        apiFetch: ApiFetch,
        endpoint: string,
        q: string,
        limit = 10,
    ): Promise<string[]> {
        const params = new URLSearchParams({ q, limit: String(limit) });
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.AUTOCOMPLETE.ENDPOINT(endpoint)}?${params.toString()}`,
        );
        await throwIfError(res);
        const data = await res.json();
        return data.items ?? [];
    },

    /** Autocomplete específico para nombres científicos — devuelve objetos con taxonId */
    async scientificNames(
        apiFetch: ApiFetch,
        q: string,
        limit = 10,
    ): Promise<ScientificNameSuggestion[]> {
        const params = new URLSearchParams({ q, limit: String(limit) });
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.AUTOCOMPLETE.SCIENTIFIC_NAME}?${params.toString()}`,
        );
        await throwIfError(res);
        const data = await res.json();
        return data.items ?? [];
    },
};
