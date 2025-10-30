import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { Leaf, Loader2, User, UserCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface RegisterPageProps {
  onNavigate: (page: string) => void;
}

type InstitutionItem = { id: number; institutionName: string | null };

const API_BASE = import.meta.env.VITE_API_URL;

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  // === Estado instituciones (desde backend) ===
  const [institutions, setInstitutions] = useState<InstitutionItem[]>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Información de Usuario
  const [userData, setUserData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    institution_id: "", // guardamos como string para el Select
  });

  // Información de Curador/Agente
  const [agentData, setAgentData] = useState({
    givenName: "",
    familyName: "",
    orcid: "",
    phone: "",
    address: "",
  });

  const [loading, setLoading] = useState(false);
  // === Cargar instituciones del backend al montar ===
  useEffect(() => {
    let cancelled = false;

    async function loadInstitutions() {
      setLoadingInstitutions(true);
      setFetchError(null);
      try {
        // Si usas proxy en el frontend, /api apunta al backend. Si tienes VITE_API_URL, puedes usar `/institutions?...`
        const res = await fetch(`http://0.0.0.0:8000/api/institutions?limit=10&offset=0`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: InstitutionItem[] = await res.json();
        if (!cancelled) {
          setInstitutions(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setFetchError(err?.message ?? "Error al cargar instituciones");
          toast.error("No se pudieron cargar las instituciones. Intenta de nuevo.");
        }
      } finally {
        if (!cancelled) setLoadingInstitutions(false);
      }
    }

    loadInstitutions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userData.institution_id) {
      toast.error("Por favor selecciona una institución");
      return;
    }
    if (userData.password !== userData.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    if (userData.password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    const body = {
      username: userData.username,
      email: userData.email,
      password: userData.password,
      institution_id: Number(userData.institution_id),
      given_name: agentData.givenName || null,
      family_name: agentData.familyName || null,
      orcid: agentData.orcid || null,
      phone: agentData.phone || null,
      address: agentData.address || null,
    };

    try {
      console.log(body);

      console.log(API_BASE);
      const res = await fetch(`${API_BASE}/auth/registration-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // intentamos leer mensaje del backend
        let errorText = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) errorText = errJson.detail;
        } catch {}
        throw new Error(errorText);
      }

      toast.success("Solicitud de registro enviada correctamente. Te contactaremos pronto.");
      setUserData({ username: "", email: "", password: "", confirmPassword: "", institution_id: "" });
      setAgentData({ givenName: "", familyName: "", orcid: "", phone: "", address: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Error al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserData((prev) => ({
      ...prev,
      [e.target.id]: e.target.value,
    }));
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setAgentData((prev) => ({
      ...prev,
      [e.target.id]: e.target.value,
    }));
  };

  return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 py-12 px-4">
        <Card className="w-full max-w-4xl">
          <CardHeader className="text-center">
            <Leaf className="h-12 w-12 text-primary mx-auto mb-4" />
            <CardTitle>Solicitud de Registro</CardTitle>
            <CardDescription>Completa el formulario para solicitar acceso al Herbario Digital</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* SECCIÓN 1: Información de Usuario */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="text-lg">Información de Usuario</h3>
                </div>

                <div className="space-y-4 pl-7">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Nombre de Usuario *</Label>
                      <Input
                          id="username"
                          value={userData.username}
                          onChange={handleUserChange}
                          placeholder="juan.perez"
                          required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Correo Electrónico *</Label>
                      <Input
                          id="email"
                          type="email"
                          value={userData.email}
                          onChange={handleUserChange}
                          placeholder="botanico@universidad.edu"
                          required
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña *</Label>
                      <Input
                          id="password"
                          type="password"
                          value={userData.password}
                          onChange={handleUserChange}
                          placeholder="Mínimo 8 caracteres"
                          required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Contraseña *</Label>
                      <Input
                          id="confirmPassword"
                          type="password"
                          value={userData.confirmPassword}
                          onChange={handleUserChange}
                          placeholder="Repite la contraseña"
                          required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="institution_id">Institución / Universidad *</Label>
                    <Select
                        value={userData.institution_id}
                        onValueChange={(value) => setUserData((prev) => ({ ...prev, institution_id: value }))}
                        disabled={loadingInstitutions || !!fetchError}
                    >
                      <SelectTrigger id="institution_id">
                        <SelectValue
                            placeholder={
                              loadingInstitutions
                                  ? "Cargando instituciones..."
                                  : fetchError
                                      ? "Error al cargar instituciones"
                                      : "Selecciona tu institución"
                            }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map((inst) => (
                            <SelectItem key={inst.id} value={String(inst.id)}>
                              {inst.institutionName || `Institución #${inst.id}`}
                            </SelectItem>
                        ))}
                        {!loadingInstitutions && institutions.length === 0 && !fetchError && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No hay instituciones disponibles</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* SECCIÓN 2: Información de Curador/Agente */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <UserCircle className="h-5 w-5 text-primary" />
                  <h3 className="text-lg">Información de Curador</h3>
                </div>

                <div className="space-y-4 pl-7">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="givenName">Nombre(s) *</Label>
                      <Input id="givenName" value={agentData.givenName} onChange={handleAgentChange} placeholder="Juan" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="familyName">Apellido(s) *</Label>
                      <Input id="familyName" value={agentData.familyName} onChange={handleAgentChange} placeholder="Pérez García" required />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="orcid">ORCID</Label>
                      <Input id="orcid" value={agentData.orcid} onChange={handleAgentChange} placeholder="0000-0001-2345-6789" />
                      <p className="text-sm text-muted-foreground">Identificador único de investigador</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input id="phone" value={agentData.phone} onChange={handleAgentChange} placeholder="+51 999 888 777" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Textarea
                        id="address"
                        value={agentData.address}
                        onChange={handleAgentChange}
                        placeholder="Dirección institucional o personal (opcional)"
                        rows={3}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando solicitud...
                    </>
                ) : (
                    "Enviar Solicitud de Registro"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <p className="text-muted-foreground">
                ¿Ya tienes una cuenta?{" "}
                <button onClick={() => onNavigate("login")} className="text-primary hover:underline">
                  Iniciar Sesión
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
