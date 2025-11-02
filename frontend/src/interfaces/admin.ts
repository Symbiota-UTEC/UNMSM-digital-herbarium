export interface ScopedTotals {
    institution: number;
    app?: number;
}

export interface AdminMetrics {
    institutionId: number;
    metrics: {
        users: ScopedTotals;
        collections: ScopedTotals;
        requestsPending: ScopedTotals;
        occurrences: ScopedTotals;
    };
}
