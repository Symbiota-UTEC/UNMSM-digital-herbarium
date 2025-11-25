import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Mail, Calendar, Building, Award, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { Role } from "@constants/roles";
import type { PaginatedResponse } from "@interfaces/utils/pagination";
import type { CollectionOut } from "@interfaces/collection";

type CollectionsResponse = PaginatedResponse<CollectionOut> | CollectionOut[];

interface UserProfileResponse {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_institution_admin: boolean;
  agent_id: number | null;
  institution_id: number | null;
  created_at: string | null;
}

interface OccurrenceListResponse {
  items?: Array<{ scientificName?: string | null }>;
  total?: number;
}

interface StatBuckets {
  collections: number | null;
  occurrences: number | null;
  taxa: number | null;
  contributions: number | null;
}

const ROLE_LABELS: Record<Role, string> = {
  [Role.Admin]: "Administrador",
  [Role.InstitutionAdmin]: "Admin. de institución",
  [Role.User]: "Usuario",
};

const parseJson = async <T,>(res: Response, fallbackMessage: string): Promise<T> => {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || fallbackMessage);
  }
  return (await res.json()) as T;
};

const extractCollectionsTotal = (payload: CollectionsResponse | null): number | null => {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload.total === "number") return payload.total;
  if (Array.isArray(payload.items)) return payload.items.length;
  return null;
};

const formatNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    return value.toLocaleString("es-PE");
  }
  return value;
};

const initialsFrom = (primary?: string | null, fallback?: string | null) => {
  const source = (primary || fallback || "US").trim();
  if (!source) return "US";
  return source
    .split(/\s+/)
    .map((segment) => segment.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const formatDateLong = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export function ProfilePage() {
  const { user, apiFetch } = useAuth();
  console.log("ProfilePage user:", user);
  const [profileDetails, setProfileDetails] = useState<UserProfileResponse | null>(null);
  const [statBuckets, setStatBuckets] = useState<StatBuckets>({
    collections: null,
    occurrences: null,
    taxa: null,
    contributions: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    console.log("Fetching profile data for user:", user);
    if (!user) return;
    let isMounted = true;

    const fetchProfileData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const profilePromise = apiFetch(`${API.BASE_URL}/users/${user.id}`).then((res) =>
          parseJson<UserProfileResponse>(res, "No se pudo recuperar tu perfil")
        );

        const allowedPromise = apiFetch(`${API.BASE_URL}/collections/allowed?limit=1&offset=0`).then(
          async (res) => {
            const data = await parseJson<CollectionsResponse>(
              res,
              "No se pudieron cargar las colecciones compartidas"
            );
            return extractCollectionsTotal(data);
          }
        );

        const ownedPromise = user.id
          ? apiFetch(`${API.BASE_URL}/collections/by-user/${user.id}?limit=1&offset=0`).then(
              async (res) => {
                const data = await parseJson<CollectionsResponse>(
                  res,
                  "No se pudieron cargar tus colecciones"
                );
                return extractCollectionsTotal(data);
              }
            )
          : Promise.resolve(null);

        const occurrencesPromise = apiFetch(
          `${API.BASE_URL}/occurrences?page=1&page_size=50`
        ).then((res) =>
          parseJson<OccurrenceListResponse>(res, "No se pudieron cargar las ocurrencias")
        );

        const [profile, allowedTotal, ownedTotal, occurrencesData] = await Promise.all([
          profilePromise,
          allowedPromise,
          ownedPromise,
          occurrencesPromise,
        ]);

        if (!isMounted) return;

        const taxaCount = Array.isArray(occurrencesData.items)
          ? Array.from(
              new Set(
                occurrencesData.items
                  .map((item) => item.scientificName)
                  .filter((name): name is string => Boolean(name))
              )
            ).length
          : null;

        setProfileDetails(profile);
        setStatBuckets({
          collections: allowedTotal,
          occurrences: typeof occurrencesData.total === "number" ? occurrencesData.total : null,
          taxa: taxaCount,
          contributions: ownedTotal,
        });
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Ocurrió un error al cargar el perfil";
        setErrorMessage(message);
        toast.error(message);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProfileData();

    return () => {
      isMounted = false;
    };
  }, [user, apiFetch]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Perfil no disponible</CardTitle>
            <CardDescription>Inicia sesión para acceder a tu perfil.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[user.role] ?? "Usuario";
  const displayName = user.username || user.email || "Usuario sin nombre";
  const initials = initialsFrom(user.username, user.email);
  const institutionName = user.institution || "Sin institución asignada";
  const memberSince = formatDateLong(profileDetails?.createdAt);

  const stats = useMemo(
    () => [
      { label: "Colecciones", value: statBuckets.collections },
      { label: "Ocurrencias", value: statBuckets.occurrences },
      { label: "Taxones", value: statBuckets.taxa },
      { label: "Contribuciones", value: statBuckets.contributions },
    ],
    [statBuckets.collections, statBuckets.occurrences, statBuckets.taxa, statBuckets.contributions]
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl mb-6">Mi Perfil</h1>

      {errorMessage && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="text-center">
              <Avatar className="h-24 w-24 mx-auto mb-4">
                <AvatarFallback className="bg-primary text-white text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <CardTitle>{displayName}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
              <Badge className="mx-auto mt-2" variant={user.role === Role.Admin ? "default" : "secondary"}>
                {roleLabel}
              </Badge>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => toast.info("La edición de perfil estará disponible pronto.")}
                disabled={isLoading}
              >
                Editar Perfil
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">ID usuario: {user.id}</p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estadísticas</CardTitle>
              <CardDescription>Resumen de tu actividad en el herbario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-3xl text-primary mb-1 min-h-[2.5rem] flex items-center justify-center">
                      {isLoading && (stat.value === null || stat.value === undefined) ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        formatNumber(stat.value)
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información profesional</CardTitle>
              <CardDescription>Datos sincronizados con tu cuenta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p>{user.email}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Institución</p>
                  <p>{institutionName}</p>
                </div>
              </div>
              {/* <Separator />
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Especialización</p>
                  <p>Taxonomía de Plantas Tropicales</p>
                </div>
              </div> */}
              <Separator />
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Miembro desde</p>
                  <p>{memberSince}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
