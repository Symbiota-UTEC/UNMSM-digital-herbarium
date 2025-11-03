import { PaginatedResponse } from "@interfaces/utils/pagination";

export interface RegistrationRequest {
    id: number;
    username: string;
    email: string;
    institution_id: number;
    institution_name: string;
    full_name?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    orcid?: string | null;
    phone?: string | null;
    address?: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: string;
    reviewed_at?: string | null;
    reviewed_by_user_id?: number | null;
    resulting_user_id?: number | null;
}

export type RegistrationRequestPage = PaginatedResponse<RegistrationRequest>;
