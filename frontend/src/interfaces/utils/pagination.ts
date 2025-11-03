export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
    current_page: number;
    total_pages: number;
    remaining_pages: number;
}
