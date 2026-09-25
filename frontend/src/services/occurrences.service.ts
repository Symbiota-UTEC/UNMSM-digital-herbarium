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

type CategoricalFilters = Pick<
  OccurrenceFilters,
  | "code"
  | "scientificName"
  | "family"
  | "institution"
  | "location"
  | "collector"
  | "dateFrom"
  | "dateTo"
  | "collectionId"
>;

// Los mismos filtros por atributos los usan el listado y el mapa.
function appendCategoricalParams(params: URLSearchParams, f: CategoricalFilters) {
  if (f.code?.trim()) params.set("code", f.code.trim());
  if (f.scientificName?.trim()) params.set("scientificName", f.scientificName.trim());
  if (f.family?.trim()) params.set("family", f.family.trim());
  if (f.institution?.trim()) params.set("institution", f.institution.trim());
  if (f.location?.trim()) params.set("location", f.location.trim());
  if (f.collector?.trim()) params.set("collector", f.collector.trim());
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  if (f.collectionId) params.set("collection_id", f.collectionId);
}

// Cómo se registró la ubicación: punto exacto, punto con incertidumbre (círculo) o polígono.
export type OccurrenceLocationType = "point" | "circle" | "polygon";

export interface OccurrenceMapPoint {
  occurrenceId: string;
  code?: string | null;
  scientificName?: string | null;
  lat: number;
  lon: number;
  locationType: OccurrenceLocationType;
  uncertaintyMeters?: number | null;
  // null sin área de búsqueda; con área, si esta contiene por completo la ubicación real
  // (footprint o punto) o solo la toca (podría quedar parcialmente fuera por su incertidumbre).
  fullyContained?: boolean | null;
}

export interface OccurrenceMapResponse {
  items: OccurrenceMapPoint[];
  total: number;
  truncated: boolean;
}

export interface OccurrenceMapFilters extends CategoricalFilters {
  nearLat?: number;
  nearLon?: number;
  radiusKm?: number;
  withinPolygon?: string;
  limit?: number;
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
  country?: string | null;
  countryCode?: string | null;
  locationId?: string | null;
  stateProvince?: string | null;
  county?: string | null;
  municipality?: string | null;
  locality?: string | null;
  verbatimLocality?: string | null;
  decimalLatitude?: number | null;
  decimalLongitude?: number | null;
  verbatimElevation?: string | null;
  georeferenceVerificationStatus?: string | null;
  locationRemarks?: string | null;
  coordinateUncertaintyInMeters?: number | null;
  footprintWKT?: string | null;
  taxonId?: string | null;
  scientificName?: string | null;
  dateIdentified?: string | null;
  typeStatus?: string | null;
  identificationVerificationStatus?: string | null;
  identifiers?: { name: string; orcid?: string | null }[] | null;
  dynamicProperties?: Record<string, any> | null;
}

export const occurrencesService = {
  async list(apiFetch: ApiFetch, filters: OccurrenceFilters): Promise<PaginatedResponse<OccurrenceListItem>> {
    const params = new URLSearchParams({
      page: String(filters.page ?? 1),
      page_size: String(filters.pageSize ?? 20),
    });
    appendCategoricalParams(params, filters);

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BASE}?${params.toString()}`);
    await throwIfError(res);
    return res.json();
  },

  async mapPoints(apiFetch: ApiFetch, filters: OccurrenceMapFilters): Promise<OccurrenceMapResponse> {
    const params = new URLSearchParams();
    appendCategoricalParams(params, filters);
    if (filters.nearLat != null) params.set("nearLat", String(filters.nearLat));
    if (filters.nearLon != null) params.set("nearLon", String(filters.nearLon));
    if (filters.radiusKm != null) params.set("radiusKm", String(filters.radiusKm));
    if (filters.withinPolygon) params.set("withinPolygon", filters.withinPolygon);
    if (filters.limit) params.set("limit", String(filters.limit));

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.MAP}?${params.toString()}`);
    await throwIfError(res);
    return res.json();
  },

  async getById(apiFetch: ApiFetch, occurrenceId: string): Promise<OccurrenceItem> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BY_ID(occurrenceId)}`);
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

  async update(
    apiFetch: ApiFetch,
    occurrenceId: string,
    payload: Partial<OccurrenceCreatePayload>,
  ): Promise<OccurrenceItem> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.BY_ID(occurrenceId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await throwIfError(res);
    return res.json();
  },

  async addIdentification(
    apiFetch: ApiFetch,
    occurrenceId: string,
    payload: {
      taxonId?: string | null;
      scientificName?: string | null;
      dateIdentified?: string | null;
      typeStatus?: string | null;
      identificationVerificationStatus?: string | null;
      identifiers?: { name: string; orcid?: string | null }[];
      setAsCurrent?: boolean;
    },
  ): Promise<OccurrenceItem> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATIONS(occurrenceId)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await throwIfError(res);
    return res.json();
  },

  async deleteIdentification(
    apiFetch: ApiFetch,
    occurrenceId: string,
    identificationId: string,
  ): Promise<OccurrenceItem> {
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATION_BY_ID(occurrenceId, identificationId)}`,
      { method: "DELETE" },
    );
    await throwIfError(res);
    return res.json();
  },

  async setCurrentIdentification(
    apiFetch: ApiFetch,
    occurrenceId: string,
    identificationId: string,
  ): Promise<OccurrenceItem> {
    const res = await apiFetch(
      `${API.BASE_URL}${API.PATHS.OCCURRENCES.IDENTIFICATION_SET_CURRENT(occurrenceId, identificationId)}`,
      { method: "PATCH" },
    );
    await throwIfError(res);
    return res.json();
  },
};
