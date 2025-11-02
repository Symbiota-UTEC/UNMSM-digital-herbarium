import { BasicUserInfo } from "@interfaces/auth";

export interface Institution {
    id?: number;
    institutionID?: string | null;
    institutionCode?: string | null;
    institutionName?: string | null;
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
