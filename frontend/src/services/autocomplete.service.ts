import { API } from "@constants/api";
import type { ScientificNameSuggestion } from "@interfaces/autocomplete";
import { throwIfError, type ApiFetch } from "./api.error";

export const autocompleteService = {
  /** Autocomplete genérico — devuelve lista de strings */
  async query(apiFetch: ApiFetch, endpoint: string, q: string, limit = 10): Promise<string[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTOCOMPLETE.ENDPOINT(endpoint)}?${params.toString()}`);
    await throwIfError(res);
    const data = await res.json();
    return data.items ?? [];
  },

  /** Autocomplete específico para nombres científicos — devuelve objetos con taxonId */
  async scientificNames(apiFetch: ApiFetch, q: string, limit = 10): Promise<ScientificNameSuggestion[]> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.AUTOCOMPLETE.SCIENTIFIC_NAME}?${params.toString()}`);
    await throwIfError(res);
    const data = await res.json();
    return data.items ?? [];
  },
};
