import { API } from "@constants/api";
import type { CollectionAccess } from "@constants/enums";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { CollectionOut, CollectionCreate, CollectionUserAccessItem } from "@interfaces/collection";
import type { OccurrenceBriefItem } from "@interfaces/occurrence";
import { ApiError, throwIfError, type ApiFetch } from "./api.error";

export const collectionsService = {
  async getCollections(
    apiFetch: ApiFetch,
    access: CollectionAccess,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<CollectionOut>> {
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.COLLECTIONS.BASE}?access=${access}&page=${page}&pageSize=${pageSize}`,
    );
    await throwIfError(res);
    return res.json();
  },

  /** Detalle + permisos del usuario actual (`canEdit`, `canManage`). ApiError 404/403 si no existe o sin acceso. */
  async getById(apiFetch: ApiFetch, collectionId: string): Promise<CollectionOut> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.COLLECTIONS.BY_ID(collectionId)}`);
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
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<CollectionUserAccessItem>> {
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.COLLECTIONS.ACCESS_USERS(collectionId)}?page=${page}&pageSize=${pageSize}`,
    );
    await throwIfError(res);
    return res.json();
  },

  async getOccurrencesBrief(
    apiFetch: ApiFetch,
    collectionId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResponse<OccurrenceBriefItem>> {
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.COLLECTIONS.OCCURRENCES_BRIEF(collectionId)}?page=${page}&pageSize=${pageSize}`,
    );
    await throwIfError(res);
    return res.json();
  },

  /** Lanza ApiError con el status HTTP para que el componente maneje 409, 404, 403, etc. */
  async addUser(apiFetch: ApiFetch, collectionId: string, email: string): Promise<void> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.COLLECTIONS.ADD_USER(collectionId)}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ApiError(`HTTP ${res.status}`, res.status, detail);
    }
  },
};
