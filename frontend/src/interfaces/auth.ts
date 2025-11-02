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
