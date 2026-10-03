import { API, PAGE_SIZE } from "@constants/api";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type {
  DwcImportJob,
  DwcImportJobAcceptedResponse,
  DwcImportResult,
  TaxonFloraImportJob,
  TaxonFloraUploadAcceptedResponse,
} from "@interfaces/upload";
import { throwIfError, type ApiFetch } from "./api.error";

export const uploadService = {
  /** Lanza ApiError (con `status` y `detail`) si el backend rechaza el CSV. */
  async uploadDwcCsv(apiFetch: ApiFetch, collectionId: string, file: File): Promise<DwcImportResult> {
    const form = new FormData();
    form.append("collection_id", collectionId);
    form.append("file", file);

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.DWC_CSV}`, {
      method: "POST",
      body: form,
    });
    await throwIfError(res);
    return res.json();
  },

  async uploadDwcCsvJob(apiFetch: ApiFetch, collectionId: string, file: File): Promise<DwcImportJobAcceptedResponse> {
    const form = new FormData();
    form.append("collection_id", collectionId);
    form.append("file", file);

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.DWC_CSV_JOBS}`, {
      method: "POST",
      body: form,
    });
    await throwIfError(res);
    return res.json();
  },

  async getDwcCsvJobs(
    apiFetch: ApiFetch,
    collectionId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<PaginatedResponse<DwcImportJob>> {
    const params = new URLSearchParams({
      collectionId,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.DWC_CSV_JOBS}?${params}`);
    await throwIfError(res);
    return res.json();
  },

  async getDwcCsvJobById(apiFetch: ApiFetch, jobId: string): Promise<DwcImportJob> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.DWC_CSV_JOB_BY_ID(jobId)}`);
    await throwIfError(res);
    return res.json();
  },

  async uploadTaxonFloraCsv(apiFetch: ApiFetch, file: File): Promise<TaxonFloraUploadAcceptedResponse> {
    const form = new FormData();
    form.append("file", file);

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV}`, {
      method: "POST",
      body: form,
    });
    await throwIfError(res);
    return res.json();
  },

  async getTaxonFloraCsvJobs(
    apiFetch: ApiFetch,
    pageSize: number = PAGE_SIZE.TAXON_FLORA_JOBS,
    page: number = 1,
  ): Promise<PaginatedResponse<TaxonFloraImportJob>> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV_JOBS}?${params}`);
    await throwIfError(res);
    return res.json();
  },

  async getTaxonFloraCsvJobById(apiFetch: ApiFetch, jobId: string): Promise<TaxonFloraImportJob> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV_JOB_BY_ID(jobId)}`);
    await throwIfError(res);
    return res.json();
  },

  /** `photographer` lo escribe la persona; si va vacío no se envía y queda sin dato. */
  async uploadImage(apiFetch: ApiFetch, occurrenceId: string, file: File, photographer?: string): Promise<void> {
    const form = new FormData();
    form.append("occurrence_id", occurrenceId);
    form.append("file", file);
    if (photographer?.trim()) form.append("photographer", photographer.trim());

    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE}`, {
      method: "POST",
      body: form,
    });
    await throwIfError(res);
  },

  async updateImagePhotographer(
    apiFetch: ApiFetch,
    imageId: string,
    photographer: string,
  ): Promise<{ occurrenceImageId: string; photographer: string | null }> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE_BY_ID(imageId)}`, {
      method: "PATCH",
      body: JSON.stringify({ photographer: photographer.trim() || null }),
    });
    await throwIfError(res);
    return res.json();
  },

  async deleteImage(apiFetch: ApiFetch, imageId: string): Promise<void> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE_BY_ID(imageId)}`, {
      method: "DELETE",
    });
    await throwIfError(res);
  },

  imageUrl(imageId: string): string {
    return `${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE_BY_ID(imageId)}`;
  },
};
