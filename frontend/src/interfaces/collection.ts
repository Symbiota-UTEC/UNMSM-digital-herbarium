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
    collectionID?: string | null;
    collectionCode?: string | null;
    collectionName?: string | null;
    description?: string | null;
    webSite?: string | null;
    institution?: InstitutionOut | null;
    creator: AgentOut;
    my_role?: CollectionRole | null;
    occurrencesCount: number;
}

export interface CollectionCreate {
    collectionID?: string | null;
    collectionCode?: string | null;
    collectionName?: string | null;
    description?: string | null;
    webSite?: string | null;
    institution_id?: number | null;
    creator_agent_id?: number | null;
}

export interface CollectionListItem {
    id: number;
    name: string | null;
    occurrencesCount: number;
    my_role?: CollectionRole | null;
    institutionName?: string | null;
}

export function toCollectionListItem(c: CollectionOut): CollectionListItem {
    return {
        id: c.id,
        name: c.collectionName ?? null,
        occurrencesCount: c.occurrencesCount,
        my_role: c.my_role ?? null,
        institutionName: c.institution?.institutionName ?? null,
    };
}
