import { API } from "@constants/api";
import type { ApiUserLookupResponse } from "@interfaces/auth";
import { throwIfError, type ApiFetch } from "./api.error";

export interface UserProfileResponse {
  userId: string;
  username: string;
  email: string;
  isActive: boolean;
  isSuperuser: boolean;
  isInstitutionAdmin: boolean;
  institutionId: string;
  createdAt: string;
}

export const usersService = {
  async getById(apiFetch: ApiFetch, userId: string): Promise<UserProfileResponse> {
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.USERS.BY_ID(userId)}`);
    await throwIfError(res);
    return res.json();
  },

  async getByEmail(apiFetch: ApiFetch, email: string): Promise<ApiUserLookupResponse> {
    const params = new URLSearchParams({ email });
    const res = await apiFetch(`${API.BASE_URL}${API.PATHS.USERS.BY_EMAIL}?${params.toString()}`);
    await throwIfError(res);
    return res.json();
  },
};
