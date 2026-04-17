import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { OccurrenceItem } from "@interfaces/occurrence";

import { throwIfError, type ApiFetch } from "./api.error";

export interface OccurrenceListItem {
    occurrenceId: string;
    code?: string | null;
    scientificName?: string | null;
    family?: string | null;
    institutionName?: string | null;
    location?: string | null;
    collector?: string | null;
    date?: string | null;
}

export interface OccurrenceFilters {
    page?: number;
    pageSize?: number;
    code?: string;
    scientificName?: string;
    family?: string;
    institution?: string;
    location?: string;
    collector?: string;
    dateFrom?: string;
    dateTo?: string;
    collectionId?: string;
}

export interface OccurrenceCreatePayload {
    collectionId?: string | null;
    occurrenceID?: string | null;
    catalogNumber?: string | null;
    recordNumber?: string | null;
    recordedBy?: string | null;
    eventDate?: string | null;
    verbatimEventDate?: string | null;
    year?: number | null;
    month?: number | null;
    day?: number | null;
    habitat?: string | null;
    eventRemarks?: string | null;
    stateProvince?: string | null;
    county?: string | null;
    municipality?: string | null;
    locality?: string | null;
    verbatimLocality?: string | null;
    decimalLatitude?: number | null;
    decimalLongitude?: number | null;
    verbatimElevation?: string | null;
    taxonId?: string | null;
    scientificName?: string | null;
    identifiers?: { name: string; orcid?: string | null }[] | null;
    dynamicProperties?: Record<string, any> | null;
}

export const occurrencesService = {

    async list(
        apiFetch: ApiFetch,
        filters: OccurrenceFilters,
    ): Promise<PaginatedResponse<OccurrenceListItem>> {
        const params = new URLSearchParams({
            page: String(filters.page ?? 1),
            page_size: String(filters.pageSize ?? 20),
        });
        if (filters.code?.trim()) params.set("code", filters.code.trim());
        if (filters.scientificName?.trim()) params.set("scientificName", filters.scientificName.trim());
        if (filters.family?.trim()) params.set("family", filters.family.trim());
        if (filters.institution?.trim()) params.set("institution", filters.institution.trim());
        if (filters.location?.trim()) params.set("location", filters.location.trim());
        if (filters.collector?.trim()) params.set("collector", filters.collector.trim());
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.collectionId) params.set("collection_id", filters.collectionId);

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BASE}?${params.toString()}`);
        await throwIfError(res);
        return res.json();
    },

    async getById(apiFetch: ApiFetch, occurrenceId: string): Promise<OccurrenceItem> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.OCCURRENCES.BY_ID(occurrenceId)}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async create(apiFetch: ApiFetch, payload: OccurrenceCreatePayload): Promise<{ occurrenceId: string }> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BASE}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        await throwIfError(res);
        return res.json();
    },

    async update(apiFetch: ApiFetch, occurrenceId: string, payload: Partial<OccurrenceCreatePayload>): Promise<OccurrenceItem> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BY_ID(occurrenceId)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
        await throwIfError(res);
        return res.json();
    },

    async addIdentification(apiFetch: ApiFetch, occurrenceId: string, payload: {
        taxonId?: string | null;
        scientificName?: string | null;
        dateIdentified?: string | null;
        typeStatus?: string | null;
        isVerified?: boolean;
        identifiers?: { name: string; orcid?: string | null }[];
        setAsCurrent?: boolean;
    }): Promise<OccurrenceItem> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATIONS(occurrenceId)}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        await throwIfError(res);
        return res.json();
    },

    async deleteIdentification(apiFetch: ApiFetch, occurrenceId: string, identificationId: string): Promise<OccurrenceItem> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATION_BY_ID(occurrenceId, identificationId)}`,
            { method: "DELETE" }
        );
        await throwIfError(res);
        return res.json();
    },

    async setCurrentIdentification(apiFetch: ApiFetch, occurrenceId: string, identificationId: string): Promise<OccurrenceItem> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATION_SET_CURRENT(occurrenceId, identificationId)}`,
            { method: "PATCH" }
        );
        await throwIfError(res);
        return res.json();
    },
};
