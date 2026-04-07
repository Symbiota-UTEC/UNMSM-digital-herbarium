export const env = {
    API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:8000/api",
    CAMERA_BASE_URL: import.meta.env.VITE_CAMERA_BASE_URL ?? "http://172.31.99.9:8000",
    APP_NAME: import.meta.env.VITE_APP_NAME ?? "Digital Herbarium",
};
