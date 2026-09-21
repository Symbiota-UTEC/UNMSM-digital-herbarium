// Espejo de backend/models/enums.py: mismos nombres y valores. Se usan los miembros, no literales.

/** Rol explícito de un usuario en una colección. */
export enum CollectionRole {
  Viewer = "viewer",
  Editor = "editor",
  Owner = "owner",
}

/** Lo que el backend devuelve en `myRole`: el rol explícito o el privilegio que lo reemplaza. */
export enum EffectiveRole {
  Superuser = "superuser",
  InstitutionAdmin = "institution_admin",
  Owner = "owner",
  Editor = "editor",
  Viewer = "viewer",
}

/** Filtro de la lista de colecciones: las que creé o todas a las que tengo acceso. */
export enum CollectionAccess {
  Owner = "owner",
  Allowed = "allowed",
}

export enum RegistrationStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
}

export enum ImportJobStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}
