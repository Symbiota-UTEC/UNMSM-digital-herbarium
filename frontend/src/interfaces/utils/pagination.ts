export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    currentPage: number;
    totalPages: number;
    remainingPages: number;
}
