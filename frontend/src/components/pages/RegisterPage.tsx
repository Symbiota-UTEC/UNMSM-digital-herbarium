import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { Leaf, Loader2, User, UserCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { API } from "@constants/api";
import { AutocompleteInstitution } from "../AutocompleteInstitution";

interface RegisterPageProps {
  onNavigate: (page: string) => void;
}

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  // Texto visible y selección del Autocomplete
  const [instText, setInstText] = useState("");
  const [userData, setUserData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    institutionId: "", // se llena al seleccionar del autocomplete
  });

  const [agentData, setAgentData] = useState({
    givenName: "",
    familyName: "",
    orcid: "",
    phone: "",
    address: "",
  });

  const [loading, setLoading] = useState(false);

  // fetch sin auth (borra cualquier Authorization que añada el Autocomplete)
  const unAuthFetch = async (input: RequestInfo, init?: RequestInit) => {
    const headersObj: Record<string, string> = { ...(init?.headers as Record<string, string>) };
    if (headersObj && "Authorization" in headersObj) delete headersObj.Authorization;
    return fetch(input, { ...init, headers: headersObj });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userData.institutionId) {
      toast.error("Por favor selecciona una institución de la lista");
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
      institutionId: Number(userData.institutionId),
      givenName: agentData.givenName || null,
      familyName: agentData.familyName || null,
      orcid: agentData.orcid || null,
      phone: agentData.phone || null,
      address: agentData.address || null,
    };

    try {
      const res = await fetch(`${API.BASE_URL}${API.PATHS.REG_REQUEST}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errorText = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) errorText = errJson.detail;
        } catch {}
        throw new Error(errorText);
      }

      toast.success("Solicitud de registro enviada correctamente. Te contactaremos pronto.");
      setUserData({
        username: "",
        email: "",
        password: "",
        confirmPassword: "",
        institutionId: "",
      });
      setAgentData({ givenName: "", familyName: "", orcid: "", phone: "", address: "" });
      setInstText("");
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

                {/* Autocomplete de Institución */}
                <div className="space-y-2">
                  <Label>Institución / Universidad *</Label>
                  <AutocompleteInstitution
                    token=""
                    apiFetch={unAuthFetch}
                    placeholder="Escribe y selecciona tu institución…"
                    value={instText}
                    onChange={(t) => {
                      setInstText(t);
                      setUserData((prev) => ({ ...prev, institutionId: "" }));
                    }}
                    onSelect={(item) => {
                      setInstText(item.institutionName);
                      setUserData((prev) => ({ ...prev, institutionId: String(item.id) }));
                    }}
                    minChars={1}
                  />
                  {!userData.institutionId && instText.length > 0 && (
                    <p className="text-xs text-red-600">Selecciona una opción de la lista.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Empieza a escribir para ver sugerencias.</p>
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
                    <Input
                      id="givenName"
                      value={agentData.givenName}
                      onChange={handleAgentChange}
                      placeholder="Juan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="familyName">Apellido(s) *</Label>
                    <Input
                      id="familyName"
                      value={agentData.familyName}
                      onChange={handleAgentChange}
                      placeholder="Pérez García"
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="orcid">ORCID</Label>
                    <Input
                      id="orcid"
                      value={agentData.orcid}
                      onChange={handleAgentChange}
                      placeholder="0000-0001-2345-6789"
                    />
                    <p className="text-sm text-muted-foreground">Identificador único de investigador</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={agentData.phone}
                      onChange={handleAgentChange}
                      placeholder="+51 999 888 777"
                    />
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
