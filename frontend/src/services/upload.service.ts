import { API } from "@constants/api";
import { throwIfError, type ApiFetch } from "./api.error";

export const uploadService = {

    async uploadDwcCsv(apiFetch: ApiFetch, collectionId: string, file: File): Promise<void> {
        const form = new FormData();
        form.append("collection_id", collectionId);
        form.append("file", file);

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.DWC_CSV}`, {
            method: "POST",
            body: form,
        });
        await throwIfError(res);
    },

    async uploadTaxonFloraCsv(apiFetch: ApiFetch, file: File): Promise<void> {
        const form = new FormData();
        form.append("file", file);

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.TAXON_FLORA_CSV}`, {
            method: "POST",
            body: form,
        });
        await throwIfError(res);
    },

    async uploadImage(apiFetch: ApiFetch, occurrenceId: string, file: File): Promise<void> {
        const form = new FormData();
        form.append("occurrence_id", occurrenceId);
        form.append("file", file);

        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE}`, {
            method: "POST",
            body: form,
        });
        await throwIfError(res);
    },

    async deleteImage(apiFetch: ApiFetch, imageId: string): Promise<void> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE_BY_ID(imageId)}`, {
            method: "DELETE",
        });
        await throwIfError(res);
    },

    /** URL para mostrar una imagen directamente en un <img src=...> */
    imageUrl(imageId: string): string {
        return `${API.BASE_URL}${API.PATHS.UPLOAD.IMAGE_BY_ID(imageId)}`;
    },
};
