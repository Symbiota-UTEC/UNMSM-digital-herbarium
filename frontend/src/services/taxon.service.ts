import { API } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { TaxonDetailOut, TaxonIdentificationOut, TaxonSearchItem, TaxonTreeNode } from "@interfaces/taxon";
import { throwIfError, type ApiFetch } from "./api.error";

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
  sort?: string | null;
  order?: "asc" | "desc" | null;
}

export const taxonService = {
  async getTree(apiFetch: ApiFetch, params: TaxonTreeParams): Promise<PaginatedResponse<TaxonTreeNode>> {
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
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.TAXON.BY_ID(encodeURIComponent(taxonId))}`);
    await throwIfError(res);
    return res.json();
  },

  async listIdentifications(
    apiFetch: ApiFetch,
    taxonId: string,
    page: number,
    pageSize: number,
    sort?: string | null,
    order?: "asc" | "desc" | null,
  ): Promise<PaginatedResponse<TaxonIdentificationOut>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (sort) query.set("sort", sort);
    if (sort && order) query.set("order", order);
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.TAXON.IDENTIFICATIONS(encodeURIComponent(taxonId))}?${query.toString()}`,
    );
    await throwIfError(res);
    return res.json();
  },

  async search(apiFetch: ApiFetch, params: TaxonSearchParams): Promise<PaginatedResponse<TaxonSearchItem>> {
    const query = new URLSearchParams({
      q: params.q,
      page: String(params.page ?? 1),
      size: String(params.size ?? 20),
    });
    if (params.onlyCurrent !== undefined) {
      query.set("only_current", String(params.onlyCurrent));
    }
    if (params.sort) query.set("sort", params.sort);
    if (params.sort && params.order) query.set("order", params.order);

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.TAXON.SEARCH}?${query.toString()}`);
    await throwIfError(res);
    return res.json();
  },
};
