// interface/auth.ts
import { Role } from '@constants/roles';

/* =======================
 * Domain models (Frontend)
 * ======================= */

export interface BasicUserInfo {
  userId: string;
  username?: string;
  email?: string;
}

export interface User extends BasicUserInfo {
  role: Role;
  institutionId?: string | null;   // UUID, alineado al backend
  institution?: string | null;     // opcional si luego mapeas el nombre
}

/** Contexto de autenticación del front */
export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

/* =======================
 * API DTOs (Backend)
 * ======================= */

/** Usuario "completo" devuelto por el backend cuando visibility='full' */
export interface ApiUserOut {
  userId: string;
  username: string;
  email: string;
  isActive: boolean;
  isSuperuser: boolean;
  isInstitutionAdmin: boolean;
  institutionId: string | null;
  institution?: string;
  createdAt: string;
}

/** Objeto + unión para Visibility */
export const VISIBILITY = {
  FULL: 'full',
  LIMITED: 'limited',
  NONE: 'none',
} as const;

export type Visibility = typeof VISIBILITY[keyof typeof VISIBILITY];

/** Respuesta del endpoint /by-email */
export interface ApiUserLookupResponse {
  found: boolean;
  sameInstitution?: boolean;   // puede omitirse si visibility='none'
  visibility: Visibility;      // 'full' | 'limited' | 'none'
  user?: ApiUserOut;           // presente solo si visibility='full'
  message?: string;
}

/* =======================
 * View Models para la UI
 * ======================= */

export interface UserLookupResult {
  found: boolean;
  sameInstitution?: boolean;
  visibility: Visibility;
  user: User | null;            // null cuando visibility !== 'full'
  message?: string;
}

/* =======================
 * Mappers / Helpers
 * ======================= */

/** Mapea ApiUserOut → User (modelo del front) */
export const mapApiUserToUser = (apiUser: ApiUserOut): User => {
  let role: Role = Role.User;
  if (apiUser.isSuperuser) {
    role = Role.Admin;
  } else if (apiUser.isInstitutionAdmin) {
    role = Role.InstitutionAdmin;
  }

  return {
    userId: apiUser.userId,
    username: apiUser.username,
    email: apiUser.email,
    role,
    institutionId: apiUser.institutionId ?? null,
    institution: apiUser.institution ?? null,
  };
};

/** Mapea la respuesta del lookup a un objeto amigable para la UI */
export const mapApiLookupToResult = (api: ApiUserLookupResponse): UserLookupResult => {
  const isFull = api.visibility === VISIBILITY.FULL && !!api.user;
  return {
    found: api.found,
    sameInstitution: api.sameInstitution,
    visibility: api.visibility,
    user: isFull ? mapApiUserToUser(api.user!) : null,
    message: api.message,
  };
};

/** Type guard: resultado con visibilidad completa y user no-nulo */
export const isFullVisibility = (
  r: UserLookupResult
): r is UserLookupResult & { user: User } =>
  r.visibility === VISIBILITY.FULL && r.user !== null;

/** Helper: determina si al menos hay info mínima para mostrar en UI */
export const canSeeMinimalInfo = (r: UserLookupResult) =>
  r.visibility === VISIBILITY.LIMITED || r.visibility === VISIBILITY.FULL;
