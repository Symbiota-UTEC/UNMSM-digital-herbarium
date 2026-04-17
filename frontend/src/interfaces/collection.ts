export type CollectionRole = "viewer" | "editor" | "owner";

export interface InstitutionOut {
    institutionId: string;
    institutionName?: string | null;
}

export interface CollectionOut {
    collectionId: string;
    collectionName?: string | null;
    description?: string | null;
    institution?: InstitutionOut | null;
    creatorName?: string | null;
    myRole?: CollectionRole | null;
    occurrencesCount?: number;
}

export interface CollectionCreate {
    collectionName?: string | null;
    description?: string | null;
    institutionId?: string | null;
    creatorUserId?: string | null;
}

export interface CollectionListItem {
    collectionId: string;
    name: string | null;
    occurrencesCount: number;
    my_role?: CollectionRole | null;
    institutionId?: string | null;
    institutionName?: string | null;
    creatorName?: string | null;
}

export interface CollectionUserAccessItem {
    full_name: string;
    email: string;
    institution: string | null;
    role: "viewer" | "editor" | "owner";
}

export function toCollectionListItem(c: CollectionOut): CollectionListItem {
    return {
        collectionId: c.collectionId,
        name: c.collectionName ?? null,
        occurrencesCount: c.occurrencesCount ?? 0,
        my_role: c.myRole ?? null,
        institutionId: c.institution?.institutionId ?? null,
        institutionName: c.institution?.institutionName ?? null,
        creatorName: c.creatorName ?? null,
    };
}
