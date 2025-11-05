import { env } from "@config/env";

export const API = {
    BASE_URL: env.API_URL,
    PATHS: {
        LOGIN: "/auth/login",
        INSTITUTIONS: "/institutions",
        REG_REQUESTS: "/auth/registration-requests",
        REG_REQUEST: "/auth/registration-request",
        USER_BY_EMAIL: "/users/by-email",
        ADMIN_METRICS: "/admin/metrics",
        COLLECTIONS_ACCESS_USERS: (collectionId: number | string) => `/collections/${collectionId}/access-users`,
        COLLECTIONS_OCCURRENCES_BRIEF: (collectionId: number | string) => `/collections/${collectionId}/occurrences/brief`,
        COLLECTIONS_ADD_USER: (collectionId: number | string) => `/collections/${collectionId}/permissions/add-user`,
    },
};

export const PAGE_SIZE = {
    INSTITUTIONS: 4,
    REGISTRATIONS: 6,
    COLLECTIONS: 3,
}
