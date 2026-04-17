import { PaginatedResponse } from "@interfaces/utils/pagination";

export interface BasicInstitutionInfo {
    institutionId?: string;
    institutionName?: string;
}

export interface InstitutionAdminUser {
    userId: string;
    username?: string | null;
    email: string;
    fullName?: string | null;
}

export interface Institution extends BasicInstitutionInfo {
    country?: string | null;
    city?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    webSite?: string | null;
    institutionAdminUserId?: string | null;
    institutionAdminUser?: InstitutionAdminUser | null;
    usersCount?: number;
}

export type InstitutionPage = PaginatedResponse<Institution>;

export function toBasicInstitutionInfo(inst: Institution | any): BasicInstitutionInfo {
    return {
        institutionId: inst.institutionId,
        institutionName: inst.institutionName,
    };
}

export function pageToBasicInstitutionInfo(page: InstitutionPage): BasicInstitutionInfo[] {
    return (page.items ?? []).map(toBasicInstitutionInfo);
}
