import { useEffect, useState } from "react";
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
import { useAuth, Role } from "../../contexts/AuthContext";

// 👇 esto es lo que devuelve tu backend
interface AdminUserOut {
  id: number;
  username?: string;
  email?: string;
  full_name?: string;
}

interface Institution {
  id: number;
  institutionID?: string | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  webSite?: string | null;
  institution_admin_user_id?: number | null;
  admin_user?: AdminUserOut | null;
  // 👇 props de frontend para no romper nada
  name?: string;
  usersCount?: number;
}

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
}

const API_URL = import.meta.env.VITE_API_URL;

export function AdminPage() {
  const { user, token } = useAuth() as any;
  const isSystemAdmin = user?.role === "admin";
  const isInstitutionAdmin = user?.institutionAdmin;

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(false);

  // 👇 mock de usuarios lo dejamos igual
  const [allUsers] = useState<UserDetail[]>([
    {
      id: "1",
      name: "Dr. Juan Pérez",
      email: "jperez@botanica.edu",
      institution: "Universidad Nacional de Botánica",
      institutionId: "1",
      lastConnection: "2024-10-25T14:30:00",
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        {
          id: "occ-001",
          action: "created",
          scientificName: "Cinchona officinalis",
          datetime: "2024-10-20T14:30:00",
        },
        {
          id: "occ-002",
          action: "updated",
          scientificName: "Uncaria tomentosa",
          datetime: "2024-10-22T09:15:00",
        },
        {
          id: "occ-003",
          action: "created",
          scientificName: "Myrciaria dubia",
          datetime: "2024-10-24T16:45:00",
        },
        {
          id: "occ-007",
          action: "updated",
          scientificName: "Passiflora edulis",
          datetime: "2024-10-18T11:20:00",
        },
        {
          id: "occ-008",
          action: "created",
          scientificName: "Erythroxylum coca",
          datetime: "2024-10-15T08:30:00",
        },
        {
          id: "occ-009",
          action: "updated",
          scientificName: "Theobroma cacao",
          datetime: "2024-10-12T13:45:00",
        },
      ],
    },
    {
      id: "2",
      name: "Dra. Ana Torres",
      email: "atorres@botanica.edu",
      institution: "Universidad Nacional de Botánica",
      institutionId: "1",
      lastConnection: "2024-10-26T09:15:00",
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        {
          id: "occ-004",
          action: "created",
          scientificName: "Physalis peruviana",
          datetime: "2024-10-23T10:20:00",
        },
        {
          id: "occ-005",
          action: "deleted",
          scientificName: "Solanum quitoense",
          datetime: "2024-10-25T15:30:00",
        },
        {
          id: "occ-010",
          action: "created",
          scientificName: "Lupinus mutabilis",
          datetime: "2024-10-19T14:00:00",
        },
        {
          id: "occ-011",
          action: "updated",
          scientificName: "Chenopodium quinoa",
          datetime: "2024-10-17T09:45:00",
        },
      ],
    },
    {
      id: "3",
      name: "Admin Institución",
      email: "ainst@botanica.edu",
      institution: "Universidad Nacional de Botánica",
      institutionId: "1",
      lastConnection: "2024-10-26T10:00:00",
      isActive: true,
      isInstitutionAdmin: true,
      occurrenceHistory: [],
    },
    {
      id: "4",
      name: "Dr. Carlos Mendoza",
      email: "cmendoza@amazonia.org",
      institution: "Instituto de Investigación Amazónica",
      institutionId: "2",
      lastConnection: "2024-10-24T16:20:00",
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        {
          id: "occ-006",
          action: "created",
          scientificName: "Victoria amazonica",
          datetime: "2024-10-19T12:15:00",
        },
        {
          id: "occ-012",
          action: "updated",
          scientificName: "Hevea brasiliensis",
          datetime: "2024-10-16T10:30:00",
        },
        {
          id: "occ-013",
          action: "created",
          scientificName: "Bertholletia excelsa",
          datetime: "2024-10-14T16:00:00",
        },
      ],
    },
    {
      id: "5",
      name: "Dra. Patricia Vega",
      email: "pvega@jardin.edu",
      institution: "Jardín Botánico Nacional",
      institutionId: "3",
      lastConnection: "2024-10-21T11:45:00",
      isActive: false,
      isInstitutionAdmin: false,
      occurrenceHistory: [],
    },
  ]);

  const [showInstitutionDialog, setShowInstitutionDialog] = useState(false);
  const [showDeleteInstitutionDialog, setShowDeleteInstitutionDialog] =
      useState(false);
  const [showAssignAdminDialog, setShowAssignAdminDialog] = useState(false);
  const [showDisableUserDialog, setShowDisableUserDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [showUsersView, setShowUsersView] = useState(false);
  const [selectedInstitution, setSelectedInstitution] =
      useState<Institution | null>(null);
  const [viewInstitutionDetails, setViewInstitutionDetails] =
      useState<Institution | null>(null);
  const [editInstitution, setEditInstitution] =
      useState<Institution | null>(null);
  const [userToDisable, setUserToDisable] = useState<{
    id: string;
    name: string;
    isActive: boolean;
  } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newInstitution, setNewInstitution] = useState("");
  const [selectedAdminUserId, setSelectedAdminUserId] = useState("");
  const [adminSearchEmail, setAdminSearchEmail] = useState("");
  const [adminEmailValidation, setAdminEmailValidation] = useState<{
    isValid: boolean | null;
    message: string;
  }>({ isValid: null, message: "" });

  // Form para editar institución
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
  const requestsPerPage = 5;

  // Filtro de fecha para historial (rango)
  const [historyStartDateFilters, setHistoryStartDateFilters] = useState<
      Record<string, string>
  >({});
  const [historyEndDateFilters, setHistoryEndDateFilters] = useState<
      Record<string, string>
  >({});

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setIsLoadingInstitutions(true);
        const res = await fetch(`${API_URL}/institutions?limit=7&offset=0`, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }

        const data = (await res.json()) as Institution[];

        // 👇 normalizamos un poco para que el frontend no se rompa
        const normalized = data.map((inst) => ({
          ...inst,
          // nombre amigable
          name: inst.institutionName ?? "(sin nombre)",
          // por ahora no viene usersCount en tu endpoint → dejamos 0 o lo que ya tuviera
          usersCount: inst.usersCount ?? 0,
        }));

        setInstitutions(normalized);
      } catch (err) {
        console.error(err);
        toast.error("No se pudieron cargar las instituciones");
      } finally {
        setIsLoadingInstitutions(false);
      }
    };

    fetchInstitutions();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const fetchRequests = async () => {
      try {
        setIsLoadingRequests(true);

        const params = new URLSearchParams();
        params.set("limit", requestsPerPage.toString());
        params.set("offset", ((requestsPage - 1) * requestsPerPage).toString());
        params.set("status_filter", "pending");

        if (user?.role === Role.InstitutionAdmin && user?.institutionId) {
          params.set("institution_id", String(user.institutionId));
        } else {
          if (
              requestInstitutionFilter &&          // hay algo
              requestInstitutionFilter !== "all"   // no es "todas"
          ) {
            params.set("institution_id", requestInstitutionFilter);
          }
        }

        const res = await fetch(
            `${API_URL}/auth/registration-requests?${params.toString()}`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            },
        );

        if (!res.ok) {
          const txt = await res.text();
          console.error("Error al cargar solicitudes:", txt);
          throw new Error("No se pudieron cargar las solicitudes");
        }

        const data = (await res.json()) as RegistrationRequestPage;

        setRegistrationRequests(data.requests);
        setRequestsTotal(data.total);
      } catch (err) {
        console.error(err);
        toast.error("No se pudieron cargar las solicitudes de registro");
      } finally {
        setIsLoadingRequests(false);
      }
    };

    fetchRequests();
  }, [token, user, requestsPage, requestInstitutionFilter]);

  const stats = [
    {
      label: "Usuarios Totales",
      value: allUsers.length.toString(),
      icon: Users,
      color: "text-blue-600",
      clickable: true,
    },
    {
      label: "Colecciones",
      value: "15",
      icon: Database,
      color: "text-primary",
      clickable: false,
    },
    {
      label: "Ocurrencias",
      value: "342",
      icon: Activity,
      color: "text-purple-600",
      clickable: false,
    },
    {
      label: "Solicitudes Pendientes",
      value: "5",
      icon: Shield,
      color: "text-orange-600",
      clickable: false,
    },
  ];

  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequestItem[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsTotal, setRequestsTotal] = useState(0);

  const handleApproveRequest = async (requestId: number) => {
    try {
      console.log("voy a aprobar id =>", requestId);

      const res = await fetch(`${API_URL}/auth/registration-request`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registration_request_id: requestId,
          new_status: "approved",
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Error al aprobar:", txt);
        toast.error("No se pudo aprobar la solicitud");
        return;
      }

      toast.success("Solicitud aprobada correctamente");

      // refrescamos la lista
      // (volvemos a pedir la página actual)
      // la forma simple: volver a setRequestsPage para que dispare el useEffect
      setRequestsPage((p) => p); // o llamar fetchRequests si lo sacas a función
    } catch (err) {
      console.error(err);
      toast.error("Error al aprobar la solicitud");
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      console.log("voy a aprobar id =>", requestId);

      const res = await fetch(`${API_URL}/auth/registration-request`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registration_request_id: requestId,
          new_status: "rejected",
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Error al rechazar:", txt);
        toast.error("No se pudo rechazar la solicitud");
        return;
      }

      toast.success("Solicitud rechazada correctamente");
      setRequestsPage((p) => p);
    } catch (err) {
      console.error(err);
      toast.error("Error al rechazar la solicitud");
    }
  };


  // ⚠️ este crear institución ahora solo la crea en el frontend
  // porque no me diste el POST. Si quieres hago el POST también.
  const handleCreateInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstitution.trim()) {
      toast.error("Por favor ingresa un nombre válido");
      return;
    }
    const institution: Institution = {
      id: Date.now(),
      institutionID: "",
      institutionCode: "",
      institutionName: newInstitution,
      name: newInstitution,
      country: "",
      city: "",
      address: "",
      email: "",
      phone: "",
      webSite: "",
      usersCount: 0,
    };
    setInstitutions((prev) => [...prev, institution]);
    setNewInstitution("");
    setShowInstitutionDialog(false);
    toast.success(
        "Institución creada en la vista. (Para guardarla en el backend hay que hacer POST)",
    );
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
          `Institución "${selectedInstitution.name}" eliminada en la vista.`,
      );
      setShowDeleteInstitutionDialog(false);
      setSelectedInstitution(null);
    }
  };

  const handleAssignAdminClick = (institution: Institution) => {
    setSelectedInstitution(institution);
    setSelectedAdminUserId("");
    setShowAssignAdminDialog(true);
  };

  const handleAssignAdmin = () => {
    if (!selectedAdminUserId || !selectedInstitution) {
      toast.error("Por favor selecciona un usuario");
      return;
    }

    const selectedUser = allUsers.find((u) => u.id === selectedAdminUserId);
    if (!selectedUser) return;

    setInstitutions((institutions) =>
        institutions.map((inst) =>
            inst.id === selectedInstitution.id
                ? {
                  ...inst,
                  institution_admin_user_id: Number(selectedUser.id),
                  admin_user: {
                    id: Number(selectedUser.id),
                    email: selectedUser.email,
                    full_name: selectedUser.name,
                  },
                }
                : inst,
        ),
    );

    toast.success(
        `${selectedUser.name} asignado como administrador de ${selectedInstitution.name}`,
    );
    setShowAssignAdminDialog(false);
    setSelectedInstitution(null);
    setSelectedAdminUserId("");
  };

  const handleUsersClick = () => {
    setShowUsersView(true);
    setCurrentPage(1);
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

  const validateAdminEmail = (email: string) => {
    if (!email.trim()) {
      setAdminEmailValidation({
        isValid: true,
        message: "Sin administrador asignado",
      });
      return;
    }

    const foundUser = allUsers.find(
        (u) => u.email.toLowerCase() === email.toLowerCase(),
    );

    if (!foundUser) {
      setAdminEmailValidation({
        isValid: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // si ya es admin de otra institución (de las que tenemos en memoria)
    const adminInstitution = institutions.find(
        (inst) => inst.institution_admin_user_id === Number(foundUser.id),
    );

    if (
        adminInstitution &&
        editInstitution &&
        adminInstitution.id !== editInstitution.id
    ) {
      setAdminEmailValidation({
        isValid: false,
        message: `Este usuario ya es administrador de ${adminInstitution.name}`,
      });
      return;
    }

    setAdminEmailValidation({
      isValid: true,
      message: `Usuario válido: ${foundUser.name}`,
    });
  };

  const handleSaveInstitution = (e: React.FormEvent) => {
    e.preventDefault();

    if (!editInstitution) return;

    if (editForm.adminEmail && adminEmailValidation.isValid === false) {
      toast.error("El email del administrador no es válido");
      return;
    }

    let newAdminUserId = editInstitution.institution_admin_user_id;
    let newAdminUser: AdminUserOut | null | undefined =
        editInstitution.admin_user;

    if (editForm.adminEmail) {
      const foundUser = allUsers.find(
          (u) => u.email.toLowerCase() === editForm.adminEmail.toLowerCase(),
      );
      if (foundUser) {
        const adminInstitution = institutions.find(
            (inst) =>
                inst.institution_admin_user_id === Number(foundUser.id) &&
                inst.id !== editInstitution.id,
        );
        if (adminInstitution) {
          toast.error(
              `Este usuario ya es administrador de ${adminInstitution.name}`,
          );
          return;
        }
        newAdminUserId = Number(foundUser.id);
        newAdminUser = {
          id: Number(foundUser.id),
          email: foundUser.email,
          full_name: foundUser.name,
        };
      } else {
        toast.error("Usuario no encontrado");
        return;
      }
    } else {
      newAdminUserId = undefined;
      newAdminUser = undefined;
    }

    setInstitutions((institutions) =>
        institutions.map((inst) =>
            inst.id === editInstitution.id
                ? {
                  ...inst,
                  institutionID: editForm.institutionID,
                  institutionCode: editForm.institutionCode,
                  institutionName: editForm.institutionName,
                  name: editForm.institutionName,
                  country: editForm.country,
                  city: editForm.city,
                  address: editForm.address,
                  email: editForm.email,
                  phone: editForm.phone,
                  webSite: editForm.webSite,
                  institution_admin_user_id: newAdminUserId,
                  admin_user: newAdminUser,
                }
                : inst,
        ),
    );

    toast.success(
        `Institución ${editForm.institutionName} actualizada correctamente`,
    );
    setEditInstitution(null);
    setAdminEmailValidation({ isValid: null, message: "" });
  };

  const toggleUserExpansion = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
      if (!historyPages[userId]) {
        setHistoryPages((prev) => ({ ...prev, [userId]: 1 }));
      }
    }
    setExpandedUsers(newExpanded);
  };

  const navigateHistoryPage = (userId: string, direction: "prev" | "next") => {
    setHistoryPages((prev) => {
      const currentPage = prev[userId] || 1;
      if (direction === "next") {
        return { ...prev, [userId]: currentPage + 1 };
      } else {
        return { ...prev, [userId]: Math.max(1, currentPage - 1) };
      }
    });
  };

  const handleDisableUserClick = (
      userId: string,
      userName: string,
      isActive: boolean,
  ) => {
    if (userId === user?.id) {
      toast.error("No puedes deshabilitarte a ti mismo");
      return;
    }

    const targetUser = allUsers.find((u) => u.id === userId);

    if (targetUser?.isInstitutionAdmin && !isSystemAdmin) {
      toast.error(
          "Solo el administrador del sistema puede deshabilitar a un administrador de institución",
      );
      return;
    }

    setUserToDisable({ id: userId, name: userName, isActive });
    setShowDisableUserDialog(true);
  };

  const handleDisableUserConfirm = () => {
    if (userToDisable) {
      const action = userToDisable.isActive ? "deshabilitado" : "habilitado";
      toast.success(`Usuario ${userToDisable.name} ${action}`);
      setShowDisableUserDialog(false);
      setUserToDisable(null);
    }
  };

  const handleDeleteUserClick = (userId: string, userName: string) => {
    if (userId === user?.id) {
      toast.error("No puedes eliminarte a ti mismo");
      return;
    }

    const targetUser = allUsers.find((u) => u.id === userId);

    if (targetUser?.isInstitutionAdmin && !isSystemAdmin) {
      toast.error(
          "Solo el administrador del sistema puede eliminar a un administrador de institución",
      );
      return;
    }

    setUserToDelete({ id: userId, name: userName });
    setShowDeleteUserDialog(true);
  };

  const handleDeleteUserConfirm = () => {
    if (userToDelete) {
      toast.success(`Usuario ${userToDelete.name} eliminado`);
      setShowDeleteUserDialog(false);
      setUserToDelete(null);
    }
  };

  // Filtrar usuarios según permisos
  const filteredUsers = isInstitutionAdmin
      ? allUsers.filter((u) => u.institutionId === user?.institutionId)
      : allUsers;

  // Paginación
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  // Filtrar instituciones visibles
  const filteredInstitutions = (
      isInstitutionAdmin
          ? institutions.filter((inst) => String(inst.id) === String(user?.institutionId))
          : institutions
  ).filter((inst) =>
      (inst.name || inst.institutionName || "")
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

  // Filtrar solicitudes pendientes
  const filteredRequests = registrationRequests.filter((req) => {
    const matchesName = req.full_name?.toLowerCase().includes(requestNameFilter.toLowerCase())
        || req.username?.toLowerCase().includes(requestNameFilter.toLowerCase())
        || req.email?.toLowerCase().includes(requestNameFilter.toLowerCase());

    // si tienes un filtro por institución en el frontend
    const matchesInstitution =
        requestInstitutionFilter === "all" ||
        requestInstitutionFilter === "" ||
        String(req.institution_id) === requestInstitutionFilter;

    return matchesName && matchesInstitution;
  });

  // Paginación de solicitudes pendientes
  const totalRequestsPages = Math.ceil(
      filteredRequests.length / requestsPerPage,
  );
  const startRequestsIndex = (requestsPage - 1) * requestsPerPage;
  const endRequestsIndex = startRequestsIndex + requestsPerPage;
  const visibleRequests = filteredRequests.slice(
      startRequestsIndex,
      endRequestsIndex,
  );

  const institutionOptions = institutions.map((inst) => ({
    id: inst.id,                                   // para el backend
    name: inst.name || inst.institutionName || ""  // para mostrar
  }));

  const getUsersForInstitution = (institutionId: number | string) => {
    // seguimos usando el mock de usuarios
    return allUsers.filter((u) => u.institutionId === String(institutionId));
  };

  if (showUsersView) {
    return (
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Button
                variant="ghost"
                onClick={() => setShowUsersView(false)}
                className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Panel de Administración
            </Button>

            <h1 className="text-3xl mb-2">Gestión de Usuarios</h1>
            <p className="text-muted-foreground">
              {isInstitutionAdmin
                  ? `Usuarios de ${user?.institution} (${filteredUsers.length} total)`
                  : `Todos los usuarios del sistema (${filteredUsers.length} total)`}
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {currentUsers.map((userDetail) => {
                  const isExpanded = expandedUsers.has(userDetail.id);

                  return (
                      <div key={userDetail.id} className="border rounded-lg p-4">
                        <div
                            className="flex justify-between items-start cursor-pointer"
                            onClick={() => toggleUserExpansion(userDetail.id)}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <h3 className="text-lg">{userDetail.name}</h3>
                              {userDetail.isInstitutionAdmin && (
                                  <Badge variant="default">
                                    <UserCog className="h-3 w-3 mr-1" />
                                    Admin Institución
                                  </Badge>
                              )}
                              {!userDetail.isActive && (
                                  <Badge variant="destructive">Deshabilitado</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground ml-6">
                              {userDetail.email}
                            </p>
                          </div>
                        </div>

                        {isExpanded && (
                            <div className="mt-4 ml-6 space-y-4">
                              <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDisableUserClick(
                                          userDetail.id,
                                          userDetail.name,
                                          userDetail.isActive,
                                      );
                                    }}
                                    disabled={userDetail.id === user?.id}
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  {userDetail.isActive
                                      ? "Deshabilitar"
                                      : "Habilitar"}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteUserClick(
                                          userDetail.id,
                                          userDetail.name,
                                      );
                                    }}
                                    disabled={userDetail.id === user?.id}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar
                                </Button>
                              </div>

                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    Institución
                                  </p>
                                  <p className="text-sm">
                                    {userDetail.institution}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">
                                    Última Conexión
                                  </p>
                                  <p className="text-sm">
                                    {new Date(
                                        userDetail.lastConnection,
                                    ).toLocaleString("es-ES")}
                                  </p>
                                </div>
                              </div>

                              {userDetail.occurrenceHistory.length > 0 && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-sm">
                                        Historial de Ocurrencias (
                                        {userDetail.occurrenceHistory.length})
                                      </p>
                                      <div className="flex items-center gap-1">
                                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                          Desde:
                                        </Label>
                                        <Input
                                            type="date"
                                            className="h-7 w-32 text-xs"
                                            value={
                                                historyStartDateFilters[userDetail.id] ||
                                                ""
                                            }
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              setHistoryStartDateFilters((prev) => ({
                                                ...prev,
                                                [userDetail.id]: e.target.value,
                                              }));
                                              setHistoryPages((prev) => ({
                                                ...prev,
                                                [userDetail.id]: 1,
                                              }));
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                                          Hasta:
                                        </Label>
                                        <Input
                                            type="date"
                                            className="h-7 w-32 text-xs"
                                            value={
                                                historyEndDateFilters[userDetail.id] || ""
                                            }
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              setHistoryEndDateFilters((prev) => ({
                                                ...prev,
                                                [userDetail.id]: e.target.value,
                                              }));
                                              setHistoryPages((prev) => ({
                                                ...prev,
                                                [userDetail.id]: 1,
                                              }));
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        {(historyStartDateFilters[userDetail.id] ||
                                            historyEndDateFilters[userDetail.id]) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setHistoryStartDateFilters((prev) => {
                                                    const newFilters = { ...prev };
                                                    delete newFilters[userDetail.id];
                                                    return newFilters;
                                                  });
                                                  setHistoryEndDateFilters((prev) => {
                                                    const newFilters = { ...prev };
                                                    delete newFilters[userDetail.id];
                                                    return newFilters;
                                                  });
                                                  setHistoryPages((prev) => ({
                                                    ...prev,
                                                    [userDetail.id]: 1,
                                                  }));
                                                }}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      {(() => {
                                        const startDate =
                                            historyStartDateFilters[userDetail.id];
                                        const endDate =
                                            historyEndDateFilters[userDetail.id];

                                        const filteredHistory =
                                            startDate || endDate
                                                ? userDetail.occurrenceHistory.filter(
                                                    (h) => {
                                                      const historyDate = new Date(
                                                          h.datetime,
                                                      )
                                                          .toISOString()
                                                          .split("T")[0];
                                                      const matchesStart =
                                                          !startDate ||
                                                          historyDate >= startDate;
                                                      const matchesEnd =
                                                          !endDate || historyDate <= endDate;
                                                      return (
                                                          matchesStart && matchesEnd
                                                      );
                                                    },
                                                )
                                                : userDetail.occurrenceHistory;

                                        const currentHistoryPage =
                                            historyPages[userDetail.id] || 1;
                                        const startIdx =
                                            (currentHistoryPage - 1) *
                                            historyItemsPerPage;
                                        const endIdx = startIdx + historyItemsPerPage;
                                        const historyToShow =
                                            filteredHistory.slice(startIdx, endIdx);
                                        const totalHistoryPages = Math.ceil(
                                            filteredHistory.length /
                                            historyItemsPerPage,
                                        );
                                        const hasPrevHistory = currentHistoryPage > 1;
                                        const hasNextHistory =
                                            currentHistoryPage < totalHistoryPages;

                                        return (
                                            <>
                                              {historyToShow.map((history) => (
                                                  <div
                                                      key={history.id}
                                                      className="flex items-center gap-3 text-sm p-2 bg-muted rounded"
                                                  >
                                                    <Badge
                                                        variant={
                                                          history.action === "created"
                                                              ? "default"
                                                              : history.action === "updated"
                                                                  ? "secondary"
                                                                  : "outline"
                                                        }
                                                        className="min-w-20"
                                                    >
                                                      {history.action === "created"
                                                          ? "Creado"
                                                          : history.action === "updated"
                                                              ? "Actualizado"
                                                              : "Eliminado"}
                                                    </Badge>
                                                    <span className="font-mono text-xs text-muted-foreground">
                                          {history.id}
                                        </span>
                                                    <span className="italic flex-1">
                                          {history.scientificName}
                                        </span>
                                                    <span className="text-xs text-muted-foreground">
                                          {new Date(
                                              history.datetime,
                                          ).toLocaleString("es-ES", {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                                  </div>
                                              ))}
                                              {filteredHistory.length >
                                                  historyItemsPerPage && (
                                                      <div className="flex items-center justify-between pt-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              navigateHistoryPage(
                                                                  userDetail.id,
                                                                  "prev",
                                                              );
                                                            }}
                                                            disabled={!hasPrevHistory}
                                                            className="h-7"
                                                        >
                                                          <ChevronLeft className="h-4 w-4 mr-1" />
                                                          Anterior
                                                        </Button>
                                                        <span className="text-xs text-muted-foreground">
                                          Página {currentHistoryPage} de{" "}
                                                          {totalHistoryPages}
                                        </span>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              navigateHistoryPage(
                                                                  userDetail.id,
                                                                  "next",
                                                              );
                                                            }}
                                                            disabled={!hasNextHistory}
                                                            className="h-7"
                                                        >
                                                          Siguiente
                                                          <ChevronRight className="h-4 w-4 ml-1" />
                                                        </Button>
                                                      </div>
                                                  )}
                                              {filteredHistory.length === 0 && (
                                                  <p className="text-sm text-muted-foreground text-center py-2">
                                                    No hay ocurrencias en esta fecha
                                                  </p>
                                              )}
                                            </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                              )}
                            </div>
                        )}
                      </div>
                  );
                })}
              </div>

              {filteredUsers.length > 0 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setCurrentPage(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
              )}
            </CardContent>
          </Card>
        </div>
    );
  }

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
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={handleUsersClick}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Usuarios Totales</CardTitle>
              <Users className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl">{allUsers.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Click para ver detalles
              </p>
            </CardContent>
          </Card>

          {/* Card Solicitudes Pendientes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Solicitudes Pendientes</CardTitle>
              <Shield className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl">{requestsTotal}</div>
            </CardContent>
          </Card>

          {/* Card Colecciones */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Colecciones</CardTitle>
              <Database className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl">15</div>
            </CardContent>
          </Card>

          {/* Card Ocurrencias */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Ocurrencias</CardTitle>
              <Activity className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl">342</div>
            </CardContent>
          </Card>
        </div>

        {/* Grid principal: Instituciones (izquierda) | Solicitudes Pendientes (derecha) */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Lista de Instituciones - Columna Izquierda */}
          {isSystemAdmin && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Instituciones</CardTitle>
                      <CardDescription>
                        Gestiona las instituciones disponibles para registro
                      </CardDescription>
                    </div>
                    <Dialog
                        open={showInstitutionDialog}
                        onOpenChange={setShowInstitutionDialog}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Nueva
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Crear Nueva Institución</DialogTitle>
                          <DialogDescription>
                            Agrega una nueva institución al sistema
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleCreateInstitution} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="institutionName">
                              Nombre de la Institución
                            </Label>
                            <Input
                                id="institutionName"
                                value={newInstitution}
                                onChange={(e) => setNewInstitution(e.target.value)}
                                placeholder="Ej: Universidad de Ciencias Botánicas"
                                required
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
                    {/* 🔧 Input de búsqueda con ícono a la derecha */}
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
                                  {institution.name || institution.institutionName}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-sm text-muted-foreground">
                                    {/* si tu backend luego manda el número real, lo muestras */}
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
                                {isSystemAdmin && (
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
                                          onClick={() =>
                                              handleDeleteInstitutionClick(institution)
                                          }
                                          title="Eliminar institución"
                                          className="h-9 w-9 p-0"
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
                                    Math.min(totalInstitutionsPages, institutionsPage + 1),
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
          )}

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
                      setRequestInstitutionFilter(value);  // puede ser "all" o "3"
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
                {visibleRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No se encontraron solicitudes pendientes
                    </p>
                ) : (
                    visibleRequests.map((request) => (
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
                                {request.institution}
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
                                onClick={() => handleApproveRequest(request.id)}
                                title="Aprobar solicitud"
                                className="h-9 w-9 p-0"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectRequest(request.id)}
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
              {filteredRequests.length > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setRequestsPage(Math.max(1, requestsPage - 1))
                        }
                        disabled={requestsPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                  Página {requestsPage} de {totalRequestsPages}
                </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setRequestsPage(
                                Math.min(totalRequestsPages, requestsPage + 1),
                            )
                        }
                        disabled={requestsPage === totalRequestsPages}
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

        {/* Dialog para editar institución */}
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
                    <div className="space-y-2">
                      <Label htmlFor="edit-institutionID">
                        ID de Institución
                      </Label>
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
                      />
                    </div>
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

                  <div className="space-y-2">
                    <Label htmlFor="edit-institutionName">
                      Nombre de la Institución
                    </Label>
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

                  <div className="space-y-2 pt-4 border-t">
                    <Label htmlFor="edit-adminEmail">Administrador (email)</Label>
                    <Input
                        id="edit-adminEmail"
                        type="email"
                        value={editForm.adminEmail}
                        onChange={(e) => {
                          setEditForm({ ...editForm, adminEmail: e.target.value });
                          setAdminEmailValidation({ isValid: null, message: "" });
                        }}
                        onBlur={(e) => {
                          validateAdminEmail(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            validateAdminEmail(editForm.adminEmail);
                          }
                        }}
                        placeholder="admin@email.com"
                        className={
                          adminEmailValidation.isValid === false
                              ? "border-red-500"
                              : adminEmailValidation.isValid === true
                                  ? "border-green-500"
                                  : ""
                        }
                    />
                    {adminEmailValidation.message && (
                        <div
                            className={`flex items-center gap-2 text-sm mt-1 ${
                                adminEmailValidation.isValid
                                    ? "text-green-600"
                                    : "text-red-600"
                            }`}
                        >
                          {adminEmailValidation.isValid ? (
                              <CheckCircle className="h-4 w-4" />
                          ) : (
                              <XCircle className="h-4 w-4" />
                          )}
                          <span>{adminEmailValidation.message}</span>
                        </div>
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

        {/* Dialog para asignar admin */}
        <Dialog open={showAssignAdminDialog} onOpenChange={setShowAssignAdminDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asignar Administrador de Institución</DialogTitle>
              <DialogDescription>
                Selecciona un usuario de {selectedInstitution?.name} para asignarlo
                como administrador
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adminUser">Usuario</Label>
                <Select
                    value={selectedAdminUserId}
                    onValueChange={setSelectedAdminUserId}
                >
                  <SelectTrigger id="adminUser">
                    <SelectValue placeholder="Selecciona un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedInstitution &&
                    getUsersForInstitution(selectedInstitution.id).length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">
                          No hay usuarios en esta institución
                        </div>
                    ) : (
                        allUsers
                            .filter(
                                (u) =>
                                    u.institutionId ===
                                    String(selectedInstitution?.id ?? ""),
                            )
                            .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name} ({u.email})
                                </SelectItem>
                            ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                    variant="outline"
                    onClick={() => setShowAssignAdminDialog(false)}
                    className="flex-1"
                >
                  Cancelar
                </Button>
                <Button onClick={handleAssignAdmin} className="flex-1">
                  Asignar Administrador
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmación para deshabilitar usuario */}
        <AlertDialog
            open={showDisableUserDialog}
            onOpenChange={setShowDisableUserDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                {userToDisable?.isActive
                    ? `Se deshabilitará el acceso de ${userToDisable?.name} al sistema. El usuario no podrá iniciar sesión hasta ser habilitado nuevamente.`
                    : `Se habilitará el acceso de ${userToDisable?.name} al sistema. El usuario podrá iniciar sesión nuevamente.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                  onClick={handleDisableUserConfirm}
                  className={
                    userToDisable?.isActive
                        ? "bg-orange-600 hover:bg-orange-700"
                        : ""
                  }
              >
                {userToDisable?.isActive
                    ? "Deshabilitar Usuario"
                    : "Habilitar Usuario"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de confirmación para eliminar usuario */}
        <AlertDialog
            open={showDeleteUserDialog}
            onOpenChange={setShowDeleteUserDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminará permanentemente el
                usuario{" "}
                <span className="font-semibold">{userToDelete?.name}</span> y
                todos sus datos asociados del sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                  onClick={handleDeleteUserConfirm}
                  className="bg-red-600 hover:bg-red-700"
              >
                Eliminar Usuario
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                {selectedInstitution?.name}", se{" "}
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
