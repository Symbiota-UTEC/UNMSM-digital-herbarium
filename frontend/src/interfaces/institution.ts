import { BasicUserInfo } from "@interfaces/auth";
import { PaginatedResponse } from "@interfaces/utils/pagination";

export interface BasicInstitutionInfo {
    id?: number;
    institutionName?: string;
}

export interface Institution extends BasicInstitutionInfo {
    institutionID?: string | null;
    institutionCode?: string | null;
    country?: string | null;
    city?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    webSite?: string | null;
    institution_admin_user_id?: number | null;
    admin_user?: BasicUserInfo | null;
    usersCount?: number;
}

export type InstitutionPage = PaginatedResponse<Institution>;

export function toBasicInstitutionInfo(inst: Institution | any): BasicInstitutionInfo {
    return {
        id: inst.id,
        institutionName: inst.institutionName,
    };
}

export function pageToBasicInstitutionInfo(page: InstitutionPage): BasicInstitutionInfo[] {
    return (page.items ?? []).map(toBasicInstitutionInfo);
}
