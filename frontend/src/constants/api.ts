import { env } from "@config/env";

export const API = {
    BASE_URL: env.API_URL,
    PATHS: {
        AUTH: {
            LOGIN: "/auth/login",
            REG_REQUESTS: "/auth/registration-requests",
            REG_REQUEST: "/auth/registration-request",
        },
        USERS: {
            BY_EMAIL: "/users/by-email",
            BY_ID: (userId: string) => `/users/${userId}`,
        },
        COLLECTIONS: {
            BASE: "/collections",
            BY_USER: (userId: string) => `/collections/by-user/${userId}`,
            ALLOWED: "/collections/allowed",
            ACCESS_USERS: (collectionId: string) => `/collections/${collectionId}/access-users`,
            OCCURRENCES_BRIEF: (collectionId: string) => `/collections/${collectionId}/occurrences/brief`,
            ADD_USER: (collectionId: string) => `/collections/${collectionId}/permissions/add-user`,
        },
        OCCURRENCES: {
            BASE: "/occurrences",
            BY_ID: (occurrenceId: string) => `/occurrences/${occurrenceId}`,
            IDENTIFICATIONS: (occurrenceId: string) => `/occurrences/${occurrenceId}/identifications`,
            IDENTIFICATION_BY_ID: (occurrenceId: string, identificationId: string) =>
                `/occurrences/${occurrenceId}/identifications/${identificationId}`,
            IDENTIFICATION_SET_CURRENT: (occurrenceId: string, identificationId: string) =>
                `/occurrences/${occurrenceId}/identifications/${identificationId}/current`,
        },
        TAXON: {
            TREE: "/taxon/tree",
            SEARCH: "/taxon/search",
            BY_ID: (taxonId: string) => `/taxon/${taxonId}`,
        },
        UPLOAD: {
            DWC_CSV: "/upload/dwc-csv",
            TAXON_FLORA_CSV: "/upload/taxon-flora-csv",
            TAXON_FLORA_CSV_JOBS: "/upload/taxon-flora-csv/jobs",
            TAXON_FLORA_CSV_JOB_BY_ID: (jobId: string) => `/upload/taxon-flora-csv/jobs/${jobId}`,
            IMAGE: "/upload/image",
            IMAGE_BY_ID: (imageId: string) => `/upload/image/${imageId}`,
        },
        INSTITUTIONS: {
            BASE: "/institutions",
            BY_ID: (institutionId: string | number) => `/institutions/${institutionId}`,
        },
        ADMIN: {
            METRICS: "/admin/metrics",
        },
        AUTOCOMPLETE: {
            SCIENTIFIC_NAME: "/autocomplete/scientific-name",
            ENDPOINT: (endpoint: string) => `/autocomplete/${endpoint}`,
        },
    },
};

export const PAGE_SIZE = {
    INSTITUTIONS: 4,
    REGISTRATIONS: 6,
    COLLECTIONS: 3,
};
