/** Tipo del apiFetch proveniente de AuthContext */
export type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Error tipado que incluye el código HTTP para que los componentes puedan reaccionar por status */
export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly detail?: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

/** Lanza ApiError si la respuesta no es ok (2xx) */
export async function throwIfError(res: Response): Promise<void> {
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new ApiError(`HTTP ${res.status}`, res.status, detail);
    }
}
