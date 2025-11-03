import { useEffect, useState, useMemo, useCallback } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Users,
  Database,
  Activity,
  Shield,
  CheckCircle,
  XCircle,
  Plus,
  Building2,
  Trash2,
  UserCog,
  Eye,
  Ban,
  X,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Edit,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Role } from "@constants/roles";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { Institution } from "@interfaces/institution";
import { User, ApiUserOut, mapApiUserToUser } from "@interfaces/auth";
import { ScopedTotals, AdminMetrics } from "@interfaces/admin";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  institution: string;
  institutionId: string;
  lastConnection: string;
  isActive: boolean;
  isInstitutionAdmin: boolean;
  occurrenceHistory: Array<{
    id: string;
    action: "created" | "updated" | "deleted";
    scientificName: string;
    datetime: string;
  }>;
}

interface RegistrationRequestItem {
  id: number;
  username: string;
  email: string;
  institution_id: number;
  institution_name: string;
  full_name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  orcid?: string | null;
  phone?: string | null;
  address?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: number | null;
  resulting_user_id?: number | null;
}

interface RegistrationRequestPage {
  requests: RegistrationRequestItem[];
  total: number;
  total_pages: number;
  limit: number;
  offset: number;
  current_page: number;
  remaining_pages: number;
}

type OnNavigate = (page: string, params?: any) => void;


export function AdminPage({ onNavigate }: { onNavigate: OnNavigate }) {
  const { user, token, apiFetch } = useAuth() as any;
  const isSystemAdmin = user?.role === Role.Admin;
  const isInstitutionAdmin = user?.role === Role.InstitutionAdmin;

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(false);

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const [showInstitutionDialog, setShowInstitutionDialog] = useState(false);
  const [showDeleteInstitutionDialog, setShowDeleteInstitutionDialog] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [viewInstitutionDetails, setViewInstitutionDetails] = useState<Institution | null>(null);
  const [editInstitution, setEditInstitution] = useState<Institution | null>(null);
  const [userToDisable, setUserToDisable] = useState<{
    id: string;
    name: string;
    isActive: boolean;
  } | null>(null);

  const [newInstitutionName, setNewInstitutionName] = useState("");
  const [newInstitutionCode, setNewInstitutionCode] = useState("");
  const [newInstitutionCountry, setNewInstitutionCountry] = useState("");
  const [newInstitutionCity, setNewInstitutionCity] = useState("");
  const [newInstitutionAddress, setNewInstitutionAddress] = useState("");
  const [newInstitutionEmail, setNewInstitutionEmail] = useState("");
  const [newInstitutionPhone, setNewInstitutionPhone] = useState("");
  const [newInstitutionWebSite, setNewInstitutionWebSite] = useState("");

  const [selectedAdminUserId, setSelectedAdminUserId] = useState("");
  const [adminSearchEmail, setAdminSearchEmail] = useState("");
  const [adminEmailValidation, setAdminEmailValidation] = useState<{
    isValid: boolean | null;
    message: string;
  }>({ isValid: null, message: "" });


  const [editForm, setEditForm] = useState({
    institutionID: "",
    institutionCode: "",
    institutionName: "",
    country: "",
    city: "",
    address: "",
    email: "",
    phone: "",
    webSite: "",
    adminEmail: "",
  });

  // Paginación de usuarios
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 5;

  // Estado de expansión de usuarios
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Paginación de historial de ocurrencias por usuario
  const [historyPages, setHistoryPages] = useState<Record<string, number>>({});
  const historyItemsPerPage = 3;

  // Paginación y filtros de instituciones
  const [institutionsPage, setInstitutionsPage] = useState(1);
  const [institutionFilter, setInstitutionFilter] = useState("");
  const institutionsPerPage = 5;

  // Paginación y filtros de solicitudes pendientes
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestNameFilter, setRequestNameFilter] = useState("");
  const [requestInstitutionFilter, setRequestInstitutionFilter] =
      useState("all");
  const requestsPerPage = 2;

  useEffect(() => {
    if (!token) return;

    const fetchMetrics = async () => {
      try {
        setIsLoadingMetrics(true);
        const res = await apiFetch(`${API.BASE_URL}${API.PATHS.ADMIN_METRICS}`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const txt = await res.text();
          console.error("Error /admin/metrics:", txt);
          toast.error("No se pudieron cargar las métricas");
          return;
        }

        const raw = await res.json();
        const parsed: AdminMetrics = {
          institutionId: raw.institution_id,
          metrics: raw.metrics,
        };
        setMetrics(parsed);
      } catch (e) {
        console.error(e);
        toast.error("Error al cargar métricas");
      } finally {
        setIsLoadingMetrics(false);
      }
    };

    fetchMetrics();
  }, [token]);

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setIsLoadingInstitutions(true);

        // Si el usuario es un `institutionAdmin`, trae solo su institución
        const endpoint = isInstitutionAdmin
            ? `${API.BASE_URL}${API.PATHS.INSTITUTIONS}/${user.institutionId}` // Llamada para obtener solo su institución
            : `${API.BASE_URL}${API.PATHS.INSTITUTIONS}?limit=2&offset=0`; // Llamada para obtener todas las instituciones

        const res = await apiFetch(endpoint, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }

        const raw = await res.json() as Institution[] | Institution;

        const institutions: Institution[] = Array.isArray(raw) ? raw : [raw];

        console.log(institutions);
        setInstitutions(institutions);
      } catch (err) {
        console.error(err);
        toast.error("No se pudieron cargar las instituciones");
      } finally {
        setIsLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, [token, isInstitutionAdmin, user.institutionId]);

  const fetchRequests = useCallback(async (page: number) => {
    if (!token) return;

    try {
      setIsLoadingRequests(true);

      const params = new URLSearchParams();
      params.set("limit", requestsPerPage.toString());
      params.set("offset", ((page - 1) * requestsPerPage).toString());
      params.set("status_filter", "pending");

      if (user?.role === Role.InstitutionAdmin && user?.institutionId) {
        params.set("institution_id", String(user.institutionId));
      } else {
        if (requestInstitutionFilter && requestInstitutionFilter !== "all") {
          params.set("institution_id", requestInstitutionFilter);
        }
      }

      const res = await apiFetch(`${API.BASE_URL}${API.PATHS.REG_REQUESTS}?${params.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Error al cargar solicitudes:", txt);
        throw new Error("No se pudieron cargar las solicitudes");
      }

      const data = (await res.json()) as RegistrationRequestPage;
      setRegistrationRequests(data.requests);
      setRequestsTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron cargar las solicitudes de registro");
    } finally {
      setIsLoadingRequests(false);
    }
  }, [token, apiFetch, requestInstitutionFilter, requestsPerPage, user?.role, user?.institutionId]);

  useEffect(() => {
    fetchRequests(requestsPage);
  }, [fetchRequests, requestsPage]);

  const goToNextPage = () => setRequestsPage(p => Math.min(p + 1, totalPages));
  const goToPreviousPage = () => setRequestsPage(p => Math.max(1, p - 1));

  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequestItem[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const patchMetrics = (opts: { institutionId: number; deltaUsers?: number; deltaPending?: number }) => {
    const { institutionId, deltaUsers = 0, deltaPending = 0 } = opts;
    setMetrics(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);

      const bump = (s?: ScopedTotals, k: "app" | "institution", d: number) => {
        if (!s) return;
        if (typeof s[k] === "number") (s as any)[k] = Math.max(0, (s as any)[k] + d);
      };

      bump(next.metrics.requestsPending, "app", deltaPending);
      bump(next.metrics.users, "app", deltaUsers);

      if (institutionId === user.institutionId) {
        bump(next.metrics.requestsPending, "institution", deltaPending);
        bump(next.metrics.users, "institution", deltaUsers);

      }
      return next;
    });
  };

  const bumpInstitutionUsers = (institutionId: number | string, delta: number) => {
    setInstitutions(prev =>
        prev.map(inst =>
            String(inst.id) === String(institutionId)
                ? { ...inst, usersCount: Math.max(0, (inst.usersCount ?? 0) + delta) }
                : inst
        )
    );
  };

  const handleApproveRequest = async (requestId: number, institutionId) => {
    const prevMetrics = metrics;
    const prevRequests = registrationRequests;
    const request = registrationRequests.find(r => r.id === requestId);

    patchMetrics({ institutionId, deltaUsers: 1, deltaPending: -1 });
    if (request) bumpInstitutionUsers(request.institution_id, +1);
    setRegistrationRequests(prev => prev.filter(r => r.id !== requestId));

    const totalAfter = Math.max(0, requestsTotal - 1);
    const pagesAfter = Math.max(1, Math.ceil(totalAfter / requestsPerPage));
    const targetPage = Math.min(requestsPage, pagesAfter);
    setRequestsTotal(totalAfter);
    setTotalPages(pagesAfter);
    setRequestsPage(targetPage);

    try {
      const res = await apiFetch(`${API.BASE_URL}${API.PATHS.REG_REQUEST}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ registration_request_id: requestId, new_status: "approved" }),
      });

      if (!res.ok) {
        setMetrics(prevMetrics);
        setRegistrationRequests(prevRequests);
        if (request) bumpInstitutionUsers(request.institution_id, -1);

        const totalRollback = requestsTotal;
        const pagesRollback = Math.max(1, Math.ceil(totalRollback / requestsPerPage));
        setRequestsTotal(totalRollback);
        setTotalPages(pagesRollback);
        setRequestsPage(Math.min(requestsPage, pagesRollback));

        toast.error("No se pudo aprobar la solicitud");
        return;
      }

      fetchRequests(targetPage);
      toast.success("Solicitud aprobada correctamente");
    } catch (err) {
      setMetrics(prevMetrics);
      setRegistrationRequests(prevRequests);
      if (request) bumpInstitutionUsers(request.institution_id, -1);

      const totalRollback = requestsTotal;
      const pagesRollback = Math.max(1, Math.ceil(totalRollback / requestsPerPage));
      setRequestsTotal(totalRollback);
      setTotalPages(pagesRollback);
      setRequestsPage(Math.min(requestsPage, pagesRollback));

      console.error(err);
      toast.error("Error al aprobar la solicitud");
    }
  };

  const handleRejectRequest = async (requestId: number, institutionId: number) => {
    const prevMetrics = metrics;
    const prevRequests = registrationRequests;

    patchMetrics({ institutionId, deltaPending: -1 });
    setRegistrationRequests(prev => prev.filter(r => r.id !== requestId));

    const totalAfter = Math.max(0, requestsTotal - 1);
    const pagesAfter = Math.max(1, Math.ceil(totalAfter / requestsPerPage));
    const targetPage = Math.min(requestsPage, pagesAfter);
    setRequestsTotal(totalAfter);
    setTotalPages(pagesAfter);
    setRequestsPage(targetPage);

    try {
      const res = await apiFetch(`${API.BASE_URL}${API.PATHS.REG_REQUEST}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ registration_request_id: requestId, new_status: "rejected" }),
      });

      if (!res.ok) {
        setMetrics(prevMetrics);
        setRegistrationRequests(prevRequests);

        const totalRollback = requestsTotal;
        const pagesRollback = Math.max(1, Math.ceil(totalRollback / requestsPerPage));
        setRequestsTotal(totalRollback);
        setTotalPages(pagesRollback);
        setRequestsPage(Math.min(requestsPage, pagesRollback));

        toast.error("No se pudo rechazar la solicitud");
        return;
      }

      fetchRequests(targetPage);
      toast.success("Solicitud rechazada correctamente");
    } catch (err) {
      setMetrics(prevMetrics);
      setRegistrationRequests(prevRequests);

      const totalRollback = requestsTotal;
      const pagesRollback = Math.max(1, Math.ceil(totalRollback / requestsPerPage));
      setRequestsTotal(totalRollback);
      setTotalPages(pagesRollback);
      setRequestsPage(Math.min(requestsPage, pagesRollback));

      console.error(err);
      toast.error("Error al rechazar la solicitud");
    }
  };


  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validación del nombre de la institución
    if (!newInstitutionName.trim()) {
      toast.error("Por favor ingresa un nombre válido");
      return;
    }

    // Crear el objeto institución con los valores del formulario
    const institution: Institution = {
      institutionID: generateUUID(),  // Genera el UUID
      institutionCode: newInstitutionCode,
      institutionName: newInstitutionName,
      country: newInstitutionCountry,
      city: newInstitutionCity,
      address: newInstitutionAddress,
      email: newInstitutionEmail,
      phone: newInstitutionPhone,
      webSite: newInstitutionWebSite,
    };

    try {
      const res = await apiFetch(`${API.BASE_URL}${API.PATHS.INSTITUTIONS}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(institution),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Error al crear institución:", txt);
        toast.error("No se pudo crear la institución");
        return;
      }

      const newInstitution = await res.json();
      setInstitutions((prev) => [...prev, newInstitution]);

      setNewInstitutionName("");
      setNewInstitutionCode("");
      setNewInstitutionCountry("");
      setNewInstitutionCity("");
      setNewInstitutionAddress("");
      setNewInstitutionEmail("");
      setNewInstitutionPhone("");
      setNewInstitutionWebSite("");

      setShowInstitutionDialog(false);

      toast.success("Institución creada correctamente");

    } catch (err) {
      console.error(err);
      toast.error("Hubo un error al crear la institución");
    }
  };

  const handleDeleteInstitutionClick = (institution: Institution) => {
    setSelectedInstitution(institution);
    setShowDeleteInstitutionDialog(true);
  };

  const handleDeleteInstitution = () => {
    if (selectedInstitution) {
      setInstitutions((institutions) =>
          institutions.filter((inst) => inst.id !== selectedInstitution.id),
      );
      toast.success(
          `Institución "${selectedInstitution.institutionName}" eliminada en la vista.`,
      );
      setShowDeleteInstitutionDialog(false);
      setSelectedInstitution(null);
    }
  };

  const handleEditInstitution = (institution: Institution) => {
    setEditInstitution(institution);
    setEditForm({
      institutionID: institution.institutionID || "",
      institutionCode: institution.institutionCode || "",
      institutionName: institution.institutionName || "",
      country: institution.country || "",
      city: institution.city || "",
      address: institution.address || "",
      email: institution.email || "",
      phone: institution.phone || "",
      webSite: institution.webSite || "",
      adminEmail: institution.admin_user?.email || "",
    });
    setAdminSearchEmail(institution.admin_user?.email || "");
    setAdminEmailValidation({ isValid: null, message: "" });
  };

  const validateAdminEmail = async (
      email: string,
      institutionId?: number
  ): Promise<User | null> => {
    if (!email.trim()) {
      setAdminEmailValidation({
        isValid: true,
        message: "Sin administrador asignado",
      });
      return null;
    }

    try {
      const emailTrimmed = email.trim();

      const params = new URLSearchParams({ email: emailTrimmed });
      if (typeof institutionId === "number") {
        params.set("institution_id", String(institutionId));
      }

      const response = await apiFetch(
          `${API.BASE_URL}${API.PATHS.USER_BY_EMAIL}?${params.toString()}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
      );

      if (!response.ok) {
        const txt = await response.text();
        console.error("validateAdminEmail error:", txt);
        setAdminEmailValidation({
          isValid: false,
          message:
              response.status === 403
                  ? "No tienes permisos para ver este usuario"
                  : "Usuario no encontrado",
        });
        return null;
      }

      const foundUser: ApiUserOut = await response.json();

      if (!foundUser) {
        setAdminEmailValidation({
          isValid: false,
          message: "Usuario no encontrado",
        });
        return null;
      }

      if (foundUser.is_institution_admin) {
        setAdminEmailValidation({
          isValid: false,
          message: "Este usuario ya es administrador",
        });
        return null;
      }

      const user = mapApiUserToUser(foundUser);

      setAdminEmailValidation({
        isValid: true,
        message: `Usuario válido: ${user.username || user.email}`,
      });

      return user;
    } catch (error) {
      console.error(error);
      setAdminEmailValidation({
        isValid: false,
        message: "Error al validar el correo",
      });
      return null;
    }
  };

// asumiendo que ya tienes esta helper del mensaje anterior
// const validateAdminEmail = async (email: string, institutionId?: number): Promise<User | null> => { ... }

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editInstitution) return;

    if (editForm.adminEmail && adminEmailValidation.isValid === false) {
      toast.error("El email del administrador no es válido");
      return;
    }

    let newAdminUserId: number | null = null;

    if (editForm.adminEmail?.trim()) {
      const user = await validateAdminEmail(
          editForm.adminEmail,
          editInstitution.id
      );

      if (!user) {
        return;
      }

      if (
          user.role === Role.InstitutionAdmin &&
          String(user.institutionId) !== String(editInstitution.id)
      ) {
        toast.error("Este usuario ya es administrador de otra institución");
        return;
      }

      newAdminUserId = user.id;
    } else {
      newAdminUserId = null;
    }

    const payload = {
      institutionID: editForm.institutionID,
      institutionCode: editForm.institutionCode,
      institutionName: editForm.institutionName,
      country: editForm.country,
      city: editForm.city,
      address: editForm.address,
      email: editForm.email,
      phone: editForm.phone,
      webSite: editForm.webSite,
      institution_admin_user_id: newAdminUserId,
    };

    try {
      const res = await apiFetch(
          `${API.BASE_URL}${API.PATHS.INSTITUTIONS}/${editInstitution.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error al actualizar la institución:", errorText);
        toast.error("Error al actualizar la institución");
        return;
      }

      const updatedInstitution = await res.json();

      setInstitutions((institutions) =>
          institutions.map((inst) =>
              inst.id === updatedInstitution.id
                  ? { ...inst, ...updatedInstitution }
                  : inst
          )
      );

      toast.success(
          `Institución ${editForm.institutionName} actualizada correctamente`
      );
      setEditInstitution(null);
      setAdminEmailValidation({ isValid: null, message: "" });
    } catch (error) {
      console.error("Error al actualizar la institución:", error);
      toast.error("Error al actualizar la institución");
    }
  };

  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;

  // Filtrar instituciones visibles
  const filteredInstitutions = (
      isInstitutionAdmin
          ? institutions.filter((inst) => String(inst.id) === String(user?.institutionId))
          : institutions
  ).filter((inst) =>
      (inst.institutionName || "")
          .toLowerCase()
          .includes(institutionFilter.toLowerCase()),
  );

  // Paginación de instituciones
  const totalInstitutionsPages = Math.ceil(
      filteredInstitutions.length / institutionsPerPage,
  );
  const startInstitutionsIndex = (institutionsPage - 1) * institutionsPerPage;
  const endInstitutionsIndex = startInstitutionsIndex + institutionsPerPage;
  const visibleInstitutions = filteredInstitutions.slice(
      startInstitutionsIndex,
      endInstitutionsIndex,
  );

  const institutionOptions = institutions.map((inst) => ({
    id: inst.id,                                   // para el backend
    name: inst.institutionName || ""  // para mostrar
  }));

  const renderTotals = (totals?: ScopedTotals) => {
    if (isLoadingMetrics) return "…";
    if (!totals) return "0";

    if (isSystemAdmin && typeof totals.app === "number") {
      return (
          <div className="space-y-0.5">
            <div className="text-3xl">{totals.app}</div>
            <p className="text-xs text-muted-foreground">
              Tu institución: {totals.institution ?? 0}
            </p>
          </div>
      );
    }

    return (
        <div className="space-y-0.5">
          <div className="text-3xl">{totals.institution ?? 0}</div>
        </div>
    );
  };

  return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl mb-2">Panel de Administración</h1>
          <p className="text-muted-foreground">
            {isInstitutionAdmin
                ? `Administración de ${user?.institution}`
                : "Gestiona usuarios, colecciones y solicitudes de acceso"}
          </p>
        </div>

        {/* 4 Cards principales */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card Usuarios Totales */}
          <Card
              // className="cursor-pointer hover:border-primary transition-colors"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Usuarios Totales</CardTitle>
              <Users className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              {renderTotals(metrics?.metrics.users)}
            </CardContent>
          </Card>

          {/* Card Solicitudes Pendientes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Solicitudes Pendientes</CardTitle>
              <Shield className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              {renderTotals(metrics?.metrics.requestsPending)}
            </CardContent>
          </Card>

          {/* Card Colecciones */}
          <Card
              role="button"
              tabIndex={0}
              className="cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
              onClick={() => onNavigate('collections')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('collections')}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Colecciones</CardTitle>
              <Database className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              {renderTotals(metrics?.metrics.collections)}
            </CardContent>
          </Card>

          {/* Card Ocurrencias */}
          <Card
              role="button"
              tabIndex={0}
              className="cursor-pointer hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
              onClick={() => onNavigate('occurrences')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigate('occurrences')}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Ocurrencias</CardTitle>
              <Activity className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              {renderTotals(metrics?.metrics.occurrences)}
            </CardContent>
          </Card>
        </div>

        {/* Grid principal: Instituciones (izquierda) | Solicitudes Pendientes (derecha) */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Lista de Instituciones - Columna Izquierda */}
          {
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Instituciones</CardTitle>
                    <CardDescription>
                      Gestiona las instituciones disponibles para registro
                    </CardDescription>
                  </div>
                    {/* Botón para crear nueva institución */}
                    <Dialog open={showInstitutionDialog} onOpenChange={setShowInstitutionDialog}>
                        <DialogTrigger asChild>
                            <Button size="sm" disabled={isInstitutionAdmin}>
                                <Plus className="h-4 w-4 mr-2" />
                                Nueva Institución
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Crear Nueva Institución</DialogTitle>
                                <DialogDescription>Agrega una nueva institución al sistema</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateInstitution} className="space-y-4">
                                {/* Campos del formulario de creación */}
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionName">Nombre de la Institución</Label>
                                    <Input
                                        id="newInstitutionName"
                                        value={newInstitutionName}
                                        onChange={(e) => setNewInstitutionName(e.target.value)}
                                        placeholder="Ej: Universidad de Ciencias Botánicas"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionCode">Código de la Institución</Label>
                                    <Input
                                        id="newInstitutionCode"
                                        value={newInstitutionCode}
                                        onChange={(e) => setNewInstitutionCode(e.target.value)}
                                        placeholder="Ej: UNCB"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionCountry">País</Label>
                                    <Input
                                        id="newInstitutionCountry"
                                        value={newInstitutionCountry}
                                        onChange={(e) => setNewInstitutionCountry(e.target.value)}
                                        placeholder="Ej: Perú"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionCity">Ciudad</Label>
                                    <Input
                                        id="newInstitutionCity"
                                        value={newInstitutionCity}
                                        onChange={(e) => setNewInstitutionCity(e.target.value)}
                                        placeholder="Ej: Lima"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionAddress">Dirección</Label>
                                    <Input
                                        id="newInstitutionAddress"
                                        value={newInstitutionAddress}
                                        onChange={(e) => setNewInstitutionAddress(e.target.value)}
                                        placeholder="Ej: Av. Universidad 123"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionEmail">Correo Electrónico</Label>
                                    <Input
                                        id="newInstitutionEmail"
                                        value={newInstitutionEmail}
                                        onChange={(e) => setNewInstitutionEmail(e.target.value)}
                                        type="email"
                                        placeholder="contacto@institucion.edu"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionPhone">Teléfono</Label>
                                    <Input
                                        id="newInstitutionPhone"
                                        value={newInstitutionPhone}
                                        onChange={(e) => setNewInstitutionPhone(e.target.value)}
                                        placeholder="Ej: +51 123 456 789"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newInstitutionWebSite">Sitio Web</Label>
                                    <Input
                                        id="newInstitutionWebSite"
                                        value={newInstitutionWebSite}
                                        onChange={(e) => setNewInstitutionWebSite(e.target.value)}
                                        placeholder="https://www.institucion.edu"
                                    />
                                </div>

                                <Button type="submit" className="w-full">
                                    <Building2 className="h-4 w-4 mr-2" />
                                    Crear Institución
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  {/* Input de búsqueda con ícono a la derecha */}
                  <div className="relative w-full">
                    <Input
                        placeholder="Buscar institución por nombre..."
                        value={institutionFilter}
                        onChange={(e) => {
                          setInstitutionFilter(e.target.value);
                          setInstitutionsPage(1);
                        }}
                        className="w-full pr-10"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
              <Search className="h-4 w-4 text-muted-foreground" />
                </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {isLoadingInstitutions ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Cargando instituciones...
                      </p>
                  ) : visibleInstitutions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No se encontraron instituciones
                      </p>
                  ) : (
                      visibleInstitutions.map((institution) => (
                          <div
                              key={institution.id}
                              className="flex items-center gap-3 p-3 border rounded-lg"
                          >
                            <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate">
                                { institution.institutionName}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-sm text-muted-foreground">
                                  {institution.usersCount ?? 0} usuarios
                                </p>
                                {institution.admin_user && (
                                    <Badge variant="secondary" className="text-xs">
                                      Admin:{" "}
                                      {institution.admin_user.full_name ||
                                          institution.admin_user.username ||
                                          institution.admin_user.email}
                                    </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setViewInstitutionDetails(institution)}
                                  title="Ver detalles"
                                  className="h-9 w-9 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(isSystemAdmin || isInstitutionAdmin) && (
                                  <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEditInstitution(institution)}
                                        title="Editar institución"
                                        className="h-9 w-9 p-0"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteInstitutionClick(institution)}
                                        title="Eliminar institución"
                                        className="h-9 w-9 p-0"
                                        disabled={isInstitutionAdmin}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </>
                              )}
                            </div>
                          </div>
                      ))
                  )}
                </div>
                {filteredInstitutions.length > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                              setInstitutionsPage(Math.max(1, institutionsPage - 1))
                          }
                          disabled={institutionsPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Anterior
                      </Button>
                      <span className="text-sm text-muted-foreground">
              Página {institutionsPage} de {totalInstitutionsPages}
            </span>
                      <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                              setInstitutionsPage(
                                  Math.min(totalInstitutionsPages, institutionsPage + 1)
                              )
                          }
                          disabled={institutionsPage === totalInstitutionsPages}
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                )}
              </CardContent>
            </Card>
          }

        {/* Solicitudes Pendientes - Columna Derecha */}
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes de Registro Pendientes</CardTitle>
            <CardDescription>
              Revisa y aprueba las solicitudes de nuevos usuarios
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="mb-4 space-y-2">
              {/* 🔧 Buscador de solicitudes por nombre con ícono a la derecha */}
              <div className="relative w-full">
                <Input
                    placeholder="Buscar solicitud por nombre..."
                    value={requestNameFilter}
                    onChange={(e) => {
                      setRequestNameFilter(e.target.value);
                      setRequestsPage(1);
                    }}
                    className="pr-10"
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <Search className="h-4 w-4 text-muted-foreground" />
        </span>
              </div>

              {/* Filtro por institución */}
              <Select
                  value={requestInstitutionFilter}
                  onValueChange={(value) => {
                    // value viene como string
                    setRequestInstitutionFilter(value); // puede ser "all" o "3"
                    setRequestsPage(1);
                  }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por institución" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las instituciones</SelectItem>
                  {institutionOptions.map((inst) => (
                      <SelectItem key={inst.id} value={String(inst.id)}>
                        {inst.name}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {registrationRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No se encontraron solicitudes pendientes
                  </p>
              ) : (
                  registrationRequests.map((request) => (
                      <div
                          key={request.id}
                          className="flex items-center gap-3 p-3 border rounded-lg"
                      >
                        <Users className="h-5 w-5 text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{request.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {request.email}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground truncate">
                              {request.institution_name}
                            </p>
                            <span className="text-xs text-muted-foreground">•</span>
                            <p className="text-xs text-muted-foreground">
                              {new Date(request.created_at).toLocaleDateString("es-ES")}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                              size="sm"
                              onClick={() => handleApproveRequest(request.id, request.institution_id)}
                              title="Aprobar solicitud"
                              className="h-9 w-9 p-0"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>

                          <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRejectRequest(request.id, request.institution_id)}
                              title="Rechazar solicitud"
                              className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                  ))
              )}
            </div>

            {registrationRequests.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={goToPreviousPage} // Llama a la función para la página anterior
                      disabled={requestsPage === 1} // Deshabilitar si ya está en la primera página
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>

                  <span className="text-sm text-muted-foreground">
          Página {requestsPage} de {totalPages}
        </span>

                  <Button
                      variant="outline"
                      size="sm"
                      onClick={goToNextPage} // Llama a la función para la página siguiente
                      disabled={requestsPage === totalPages} // Deshabilitar si ya está en la última página
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Dialog para ver detalles de institución */}
        <Dialog
            open={!!viewInstitutionDetails}
            onOpenChange={() => setViewInstitutionDetails(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles de la Institución</DialogTitle>
              <DialogDescription>
                Información completa de la institución
              </DialogDescription>
            </DialogHeader>
            {viewInstitutionDetails && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        ID de Institución
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.institutionID || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        Código
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.institutionCode || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground">
                      Nombre de la Institución
                    </Label>
                    <p className="text-sm">
                      {viewInstitutionDetails.institutionName ||
                          viewInstitutionDetails.name}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">País</Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.country || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        Ciudad
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.city || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground">
                      Dirección
                    </Label>
                    <p className="text-sm">
                      {viewInstitutionDetails.address || (
                          <span className="text-muted-foreground italic">
                      No especificado
                    </span>
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        Email
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.email || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        Teléfono
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.phone || (
                            <span className="text-muted-foreground italic">
                        No especificado
                      </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground">
                      Sitio Web
                    </Label>
                    <p className="text-sm">
                      {viewInstitutionDetails.webSite || (
                          <span className="text-muted-foreground italic">
                      No especificado
                    </span>
                      )}
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Label className="text-sm text-muted-foreground">
                      Administrador
                    </Label>
                    {viewInstitutionDetails.admin_user ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary">
                            {viewInstitutionDetails.admin_user.full_name ||
                                viewInstitutionDetails.admin_user.username ||
                                viewInstitutionDetails.admin_user.email}
                          </Badge>
                          {viewInstitutionDetails.admin_user.email && (
                              <span className="text-sm text-muted-foreground">
                        ({viewInstitutionDetails.admin_user.email})
                      </span>
                          )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                          Sin administrador asignado
                        </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <Label className="text-sm text-muted-foreground">
                        Total de Usuarios
                      </Label>
                      <p className="text-sm">
                        {viewInstitutionDetails.usersCount ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
            )}
          </DialogContent>
        </Dialog>

          <Dialog
              open={!!editInstitution}
              onOpenChange={() => setEditInstitution(null)}
          >
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                      <DialogTitle>Editar Institución</DialogTitle>
                      <DialogDescription>
                          Actualiza la información de la institución
                      </DialogDescription>
                  </DialogHeader>
                  {editInstitution && (
                      <form onSubmit={handleSaveInstitution} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              {/* ID de Institución */}
                              <div className="space-y-2">
                                  <Label htmlFor="edit-institutionID">ID de Institución</Label>
                                  <Input
                                      id="edit-institutionID"
                                      value={editForm.institutionID}
                                      onChange={(e) =>
                                          setEditForm({
                                              ...editForm,
                                              institutionID: e.target.value,
                                          })
                                      }
                                      placeholder="Ej: UNB-001"
                                      disabled={isInstitutionAdmin}  // Bloqueado si es InstitutionAdmin
                                  />
                              </div>

                              {/* Código de la Institución */}
                              <div className="space-y-2">
                                  <Label htmlFor="edit-institutionCode">Código</Label>
                                  <Input
                                      id="edit-institutionCode"
                                      value={editForm.institutionCode}
                                      onChange={(e) =>
                                          setEditForm({
                                              ...editForm,
                                              institutionCode: e.target.value,
                                          })
                                      }
                                      placeholder="Ej: UNB"
                                  />
                              </div>
                          </div>

                          {/* Nombre de la Institución */}
                          <div className="space-y-2">
                              <Label htmlFor="edit-institutionName">Nombre de la Institución</Label>
                              <Input
                                  id="edit-institutionName"
                                  value={editForm.institutionName}
                                  onChange={(e) =>
                                      setEditForm({
                                          ...editForm,
                                          institutionName: e.target.value,
                                      })
                                  }
                                  placeholder="Ej: Universidad Nacional de Botánica"
                                  required
                              />
                          </div>

                          {/* País */}
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <Label htmlFor="edit-country">País</Label>
                                  <Input
                                      id="edit-country"
                                      value={editForm.country}
                                      onChange={(e) =>
                                          setEditForm({ ...editForm, country: e.target.value })
                                      }
                                      placeholder="Ej: Ecuador"
                                  />
                              </div>

                              {/* Ciudad */}
                              <div className="space-y-2">
                                  <Label htmlFor="edit-city">Ciudad</Label>
                                  <Input
                                      id="edit-city"
                                      value={editForm.city}
                                      onChange={(e) =>
                                          setEditForm({ ...editForm, city: e.target.value })
                                      }
                                      placeholder="Ej: Quito"
                                  />
                              </div>
                          </div>

                          {/* Dirección */}
                          <div className="space-y-2">
                              <Label htmlFor="edit-address">Dirección</Label>
                              <Input
                                  id="edit-address"
                                  value={editForm.address}
                                  onChange={(e) =>
                                      setEditForm({ ...editForm, address: e.target.value })
                                  }
                                  placeholder="Ej: Av. Universidad 123"
                              />
                          </div>

                          {/* Email */}
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <Label htmlFor="edit-email">Email</Label>
                                  <Input
                                      id="edit-email"
                                      type="email"
                                      value={editForm.email}
                                      onChange={(e) =>
                                          setEditForm({ ...editForm, email: e.target.value })
                                      }
                                      placeholder="contacto@institucion.edu"
                                  />
                              </div>

                              {/* Teléfono */}
                              <div className="space-y-2">
                                  <Label htmlFor="edit-phone">Teléfono</Label>
                                  <Input
                                      id="edit-phone"
                                      value={editForm.phone}
                                      onChange={(e) =>
                                          setEditForm({ ...editForm, phone: e.target.value })
                                      }
                                      placeholder="+593-2-1234567"
                                  />
                              </div>
                          </div>

                          {/* Sitio Web */}
                          <div className="space-y-2">
                              <Label htmlFor="edit-webSite">Sitio Web</Label>
                              <Input
                                  id="edit-webSite"
                                  value={editForm.webSite}
                                  onChange={(e) =>
                                      setEditForm({ ...editForm, webSite: e.target.value })
                                  }
                                  placeholder="https://www.institucion.edu"
                              />
                          </div>

                          {/* Administrador */}
                        <div className="space-y-2">
                          <Label htmlFor="edit-adminEmail">Administrador (email)</Label>
                          <Input
                              id="edit-adminEmail"
                              type="email"
                              value={editForm.adminEmail}
                              onChange={(e) => {
                                setEditForm({ ...editForm, adminEmail: e.target.value });
                                // limpiar estado al escribir
                                setAdminEmailValidation({ isValid: null, message: "" });
                              }}
                              onBlur={(e) => {
                                validateAdminEmail(e.target.value, editInstitution?.id);
                              }}
                              placeholder="admin@email.com"
                              disabled={
                                  isInstitutionAdmin ||
                                  (isSystemAdmin &&
                                      user.email === editInstitution?.admin_user?.email)
                              }
                          />
                          {adminEmailValidation.message && (
                              <p
                                  className={`text-xs mt-1 ${
                                      adminEmailValidation.isValid ? "text-green-600" : "text-red-600"
                                  }`}
                              >
                                {adminEmailValidation.message}
                              </p>
                          )}
                        </div>


                          <div className="flex gap-2 pt-4">
                              <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setEditInstitution(null)}
                                  className="flex-1"
                              >
                                  Cancelar
                              </Button>
                              <Button type="submit" className="flex-1">
                                  Guardar Cambios
                              </Button>
                          </div>
                      </form>
                  )}
              </DialogContent>
          </Dialog>

        {/* Dialog de confirmación para eliminar institución */}
        <AlertDialog
            open={showDeleteInstitutionDialog}
            onOpenChange={setShowDeleteInstitutionDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Al eliminar la institución "
                {selectedInstitution?.institutionName}", se{" "}
                <span className="text-red-600">
                deshabilitarán todos los {selectedInstitution?.usersCount ?? 0}{" "}
                  usuarios
              </span>{" "}
                asociados a ella.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                  onClick={handleDeleteInstitution}
                  className="bg-red-600 hover:bg-red-700"
              >
                Eliminar Institución
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}
