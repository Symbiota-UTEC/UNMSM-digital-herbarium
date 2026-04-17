import { API } from "@constants/api";
import type { AdminMetrics } from "@interfaces/admin";
import { throwIfError, type ApiFetch } from "./api.error";

export const adminService = {

    async getMetrics(apiFetch: ApiFetch): Promise<AdminMetrics> {
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.ADMIN.METRICS}`);
        await throwIfError(res);
        const raw = await res.json();
        return {
            institutionId: raw.institutionId ?? raw.institution_id,
            metrics: raw.metrics,
        };
    },
};
