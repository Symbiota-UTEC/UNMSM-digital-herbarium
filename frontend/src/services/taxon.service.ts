import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import { throwIfError, type ApiFetch } from "./api.error";

export interface TaxonSynonym {
    taxonId: string;
    wfoTaxonId: string | null;
    scientificName: string | null;
    scientificNameAuthorship: string | null;
    taxonomicStatus: string | null;
}

export interface TaxonTreeNode {
    taxonId: string;
    wfoTaxonId: string | null;
    scientificName: string | null;
    scientificNameAuthorship: string | null;
    fullName: string | null;
    taxonRank: string | null;
    parentNameUsageID: string | null;
    acceptedNameUsageID: string | null;
    taxonomicStatus: string | null;
    isCurrent: boolean;
    hasChildren: boolean;
    synonyms: TaxonSynonym[];
}

export interface TaxonSearchItem {
    taxonId: string;
    wfoTaxonId: string | null;
    scientificName: string | null;
    scientificNameAuthorship: string | null;
    taxonRank: string | null;
    taxonomicStatus: string | null;
    family: string | null;
    isCurrent: boolean;
    occurrenceCount: number;
}

export interface TaxonDetailOut {
    taxonId: string;
    scientificNameID: string | null;
    localID: string | null;
    scientificName: string | null;
    taxonRank: string | null;
    parentNameUsageID: string | null;
    scientificNameAuthorship: string | null;
    family: string | null;
    subfamily: string | null;
    tribe: string | null;
    subtribe: string | null;
    genus: string | null;
    subgenus: string | null;
    specificEpithet: string | null;
    infraspecificEpithet: string | null;
    verbatimTaxonRank: string | null;
    nomenclaturalStatus: string | null;
    namePublishedIn: string | null;
    taxonomicStatus: string | null;
    acceptedNameUsageID: string | null;
    originalNameUsageID: string | null;
    nameAccordingToID: string | null;
    taxonRemarks: string | null;
    created: string | null;
    modified: string | null;
    references: string | null;
    source: string | null;
    majorGroup: string | null;
    tplID: string | null;
    isCurrent: boolean;
    identifications: any[];
}

export interface TaxonTreeParams {
    page?: number;
    size?: number;
    parentId?: string;
}

export interface TaxonSearchParams {
    q: string;
    page?: number;
    size?: number;
    onlyCurrent?: boolean;
}

export const taxonService = {

    async getTree(
        apiFetch: ApiFetch,
        params: TaxonTreeParams,
    ): Promise<PaginatedResponse<TaxonTreeNode>> {
        const query = new URLSearchParams({
            page: String(params.page ?? 1),
            size: String(params.size ?? 50),
        });
        if (params.parentId) query.set("parent_id", params.parentId);

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.TAXON.TREE}?${query.toString()}`);
        await throwIfError(res);
        return res.json();
    },

    async getById(apiFetch: ApiFetch, taxonId: string): Promise<TaxonDetailOut> {
        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.TAXON.BY_ID(encodeURIComponent(taxonId))}`,
        );
        await throwIfError(res);
        return res.json();
    },

    async search(
        apiFetch: ApiFetch,
        params: TaxonSearchParams,
    ): Promise<PaginatedResponse<TaxonSearchItem>> {
        const query = new URLSearchParams({
            q: params.q,
            page: String(params.page ?? 1),
            size: String(params.size ?? 20),
        });
        if (params.onlyCurrent !== undefined) {
            query.set("only_current", String(params.onlyCurrent));
        }

        const res = await apiFetch(
            `${API.BASE_URL}${API.PATHS.TAXON.SEARCH}?${query.toString()}`,
        );
        await throwIfError(res);
        return res.json();
    },
};
