// Colores del badge de rol, en un solo lugar para que se vean igual en todas partes: la lista
// de colecciones (CollectionsPage), los usuarios con acceso a una colección (CollectionDetailPage)
// y el rol propio en el perfil (ProfilePage). Se indexa por el valor string del rol (no por un
// solo enum) porque EffectiveRole, CollectionRole y Role usan enums distintos que comparten
// algunos valores ("owner", "editor", "viewer", "institution_admin").
export const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  superuser: { label: "Superuser", className: "bg-purple-100 text-purple-800" },
  institution_admin: { label: "Admin institución", className: "bg-orange-100 text-orange-800" },
  owner: { label: "Propietario", className: "bg-blue-100 text-blue-800" },
  editor: { label: "Editor", className: "bg-green-50 text-green-700" },
  viewer: { label: "Lector", className: "bg-gray-100 text-gray-800" },
};
