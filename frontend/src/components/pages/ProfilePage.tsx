import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Mail, Calendar, Building } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { Role } from "@constants/roles";
import { usersService, type UserProfileResponse } from "@services/users.service";

const ROLE_LABELS: Record<Role, string> = {
  [Role.Admin]: "Administrador",
  [Role.InstitutionAdmin]: "Admin. de institución",
  [Role.User]: "Usuario",
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
  const [profileDetails, setProfileDetails] = useState<UserProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    setIsLoading(true);
    setErrorMessage(null);
    usersService
      .getById(apiFetch, user.userId)
      .then((profile) => {
        if (isMounted) setProfileDetails(profile);
      })
      .catch((error) => {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "No se pudo recuperar tu perfil";
        setErrorMessage(message);
        toast.error(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

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
                <AvatarFallback className="bg-primary text-white text-2xl">{initials}</AvatarFallback>
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
              <p className="mt-3 text-xs text-muted-foreground">ID usuario: {user.userId}</p>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
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
