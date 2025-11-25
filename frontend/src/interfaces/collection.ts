export type CollectionRole = "viewer" | "editor" | "owner";

export interface InstitutionOut {
    id: number;
    institutionCode?: string | null;
    institutionName?: string | null;
}

export interface AgentOut {
    id: number;
    fullName?: string | null;
    orcid?: string | null;
}

export interface CollectionOut {
    id: number;
    collectionCode?: string | null;
    collectionName?: string | null;
    description?: string | null;
    institution?: InstitutionOut | null;
    creator?: AgentOut | null;
    myRole?: CollectionRole | null;
    occurrencesCount?: number;
}

export interface CollectionCreate {
    collectionCode?: string | null;
    collectionName?: string | null;
    description?: string | null;
    institutionId?: number | null;
    creatorUserId?: number | null;
}

export interface CollectionListItem {
    id: number;
    name: string | null;
    occurrencesCount: number;
    my_role?: CollectionRole | null;
    institutionId?: number | null;
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
        id: c.id,
        name: c.collectionName ?? null,
        occurrencesCount: c.occurrencesCount ?? 0,
        my_role: c.myRole ?? null,
        institutionId: c.institution?.id ?? null,
        institutionName: c.institution?.institutionName ?? null,
        creatorName: c.creator?.fullName ?? null,
    };
}
