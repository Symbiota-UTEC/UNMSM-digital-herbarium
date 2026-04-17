import { PaginatedResponse } from "@interfaces/utils/pagination";

export interface RegistrationRequest {
    registrationRequestId: string;
    username: string;
    email: string;
    institutionId: string;
    institutionName: string;
    fullName?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    orcid?: string | null;
    phone?: string | null;
    address?: string | null;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
    reviewedAt?: string | null;
    reviewedByUserId?: string | null;
    resultingUserId?: string | null;
}

export type RegistrationRequestPage = PaginatedResponse<RegistrationRequest>;
