import { Role } from '@constants/roles'

export interface BasicUserInfo {
    id: number;
    username?: string;
    email?: string;
}

export interface User extends BasicUserInfo {
    role: Role;
    institutionId?: string | null;
    institution?: string | null;
}

export interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export interface ApiUserOut {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    is_superuser: boolean;
    is_institution_admin: boolean;
    institution_id: number | null;
    created_at: string;
}

export const mapApiUserToUser = (apiUser: ApiUserOut): User => {
    let role: Role = Role.User;
    if (apiUser.is_superuser) {
        role = Role.Admin;
    } else if (apiUser.is_institution_admin) {
        role = Role.InstitutionAdmin;
    }

    return {
        id: apiUser.id,
        username: apiUser.username,
        email: apiUser.email,
        role,
        institutionId: apiUser.institution_id
            ? String(apiUser.institution_id)
            : null,
    };
};
