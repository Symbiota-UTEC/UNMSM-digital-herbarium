import type { CollectionRole, EffectiveRole } from "@constants/enums";

export interface InstitutionOut {
  institutionId: string;
  institutionName?: string | null;
}

export interface CreatorOut {
  userId: string;
  username: string;
  email: string;
  fullName?: string | null;
}

export interface CollectionOut {
  collectionId: string;
  collectionName?: string | null;
  description?: string | null;
  institution?: InstitutionOut | null;
  creator?: CreatorOut | null;
  myRole?: EffectiveRole | null;
  /** Lo calcula el backend: no se deduce en el cliente. */
  canEdit?: boolean; // crear/editar ocurrencias, importar CSV
  canManage?: boolean; // gestionar accesos y la colección
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
  my_role?: EffectiveRole | null;
  canEdit: boolean;
  canManage: boolean;
  institutionId?: string | null;
  institutionName?: string | null;
  creatorName?: string | null;
}

export interface CollectionUserAccessItem {
  full_name: string;
  email: string;
  institution: string | null;
  role: CollectionRole;
}

export function toCollectionListItem(c: CollectionOut): CollectionListItem {
  return {
    collectionId: c.collectionId,
    name: c.collectionName ?? null,
    occurrencesCount: c.occurrencesCount ?? 0,
    my_role: c.myRole ?? null,
    canEdit: c.canEdit ?? false,
    canManage: c.canManage ?? false,
    institutionId: c.institution?.institutionId ?? null,
    institutionName: c.institution?.institutionName ?? null,
    creatorName: c.creator?.fullName || c.creator?.username || null,
  };
}
