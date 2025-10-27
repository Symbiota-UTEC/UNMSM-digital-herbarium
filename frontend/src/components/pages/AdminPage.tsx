import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "../ui/pagination";
import { Users, Database, Activity, Shield, CheckCircle, XCircle, Plus, Building2, Trash2, UserCog, Eye, Ban, X, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "../../contexts/AuthContext";

interface Institution {
  id: string;
  name: string;
  usersCount: number;
  adminUserId?: string;
  adminUserName?: string;
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
    action: 'created' | 'updated' | 'deleted';
    scientificName: string;
    datetime: string;
  }>;
}

export function AdminPage() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === 'admin';
  const isInstitutionAdmin = user?.institutionAdmin;

  const [institutions, setInstitutions] = useState<Institution[]>([
    { id: '1', name: 'Universidad Nacional de Botánica', usersCount: 12, adminUserId: '3', adminUserName: 'Admin Institución' },
    { id: '2', name: 'Instituto de Investigación Amazónica', usersCount: 8 },
    { id: '3', name: 'Jardín Botánico Nacional', usersCount: 15 },
    { id: '4', name: 'Academia de Ciencias Naturales', usersCount: 6 }
  ]);

  const [allUsers] = useState<UserDetail[]>([
    {
      id: '1',
      name: 'Dr. Juan Pérez',
      email: 'jperez@botanica.edu',
      institution: 'Universidad Nacional de Botánica',
      institutionId: '1',
      lastConnection: '2024-10-25T14:30:00',
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        { id: 'occ-001', action: 'created', scientificName: 'Cinchona officinalis', datetime: '2024-10-20T14:30:00' },
        { id: 'occ-002', action: 'updated', scientificName: 'Uncaria tomentosa', datetime: '2024-10-22T09:15:00' },
        { id: 'occ-003', action: 'created', scientificName: 'Myrciaria dubia', datetime: '2024-10-24T16:45:00' },
        { id: 'occ-007', action: 'updated', scientificName: 'Passiflora edulis', datetime: '2024-10-18T11:20:00' },
        { id: 'occ-008', action: 'created', scientificName: 'Erythroxylum coca', datetime: '2024-10-15T08:30:00' },
        { id: 'occ-009', action: 'updated', scientificName: 'Theobroma cacao', datetime: '2024-10-12T13:45:00' }
      ]
    },
    {
      id: '2',
      name: 'Dra. Ana Torres',
      email: 'atorres@botanica.edu',
      institution: 'Universidad Nacional de Botánica',
      institutionId: '1',
      lastConnection: '2024-10-26T09:15:00',
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        { id: 'occ-004', action: 'created', scientificName: 'Physalis peruviana', datetime: '2024-10-23T10:20:00' },
        { id: 'occ-005', action: 'deleted', scientificName: 'Solanum quitoense', datetime: '2024-10-25T15:30:00' },
        { id: 'occ-010', action: 'created', scientificName: 'Lupinus mutabilis', datetime: '2024-10-19T14:00:00' },
        { id: 'occ-011', action: 'updated', scientificName: 'Chenopodium quinoa', datetime: '2024-10-17T09:45:00' }
      ]
    },
    {
      id: '3',
      name: 'Admin Institución',
      email: 'admin.inst@botanica.com',
      institution: 'Universidad Nacional de Botánica',
      institutionId: '1',
      lastConnection: '2024-10-26T10:00:00',
      isActive: true,
      isInstitutionAdmin: true,
      occurrenceHistory: []
    },
    {
      id: '4',
      name: 'Dr. Carlos Mendoza',
      email: 'cmendoza@amazonia.org',
      institution: 'Instituto de Investigación Amazónica',
      institutionId: '2',
      lastConnection: '2024-10-24T16:20:00',
      isActive: true,
      isInstitutionAdmin: false,
      occurrenceHistory: [
        { id: 'occ-006', action: 'created', scientificName: 'Victoria amazonica', datetime: '2024-10-19T12:15:00' },
        { id: 'occ-012', action: 'updated', scientificName: 'Hevea brasiliensis', datetime: '2024-10-16T10:30:00' },
        { id: 'occ-013', action: 'created', scientificName: 'Bertholletia excelsa', datetime: '2024-10-14T16:00:00' }
      ]
    },
    {
      id: '5',
      name: 'Dra. Patricia Vega',
      email: 'pvega@jardin.edu',
      institution: 'Jardín Botánico Nacional',
      institutionId: '3',
      lastConnection: '2024-10-21T11:45:00',
      isActive: false,
      isInstitutionAdmin: false,
      occurrenceHistory: []
    }
  ]);

  const [showInstitutionDialog, setShowInstitutionDialog] = useState(false);
  const [showDeleteInstitutionDialog, setShowDeleteInstitutionDialog] = useState(false);
  const [showAssignAdminDialog, setShowAssignAdminDialog] = useState(false);
  const [showDisableUserDialog, setShowDisableUserDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [showUsersView, setShowUsersView] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [userToDisable, setUserToDisable] = useState<{ id: string; name: string; isActive: boolean } | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newInstitution, setNewInstitution] = useState('');
  const [selectedAdminUserId, setSelectedAdminUserId] = useState('');
  
  // Paginación de usuarios
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 5;
  
  // Estado de expansión de usuarios
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  
  // Paginación de historial de ocurrencias por usuario
  const [historyPages, setHistoryPages] = useState<Record<string, number>>({});
  const historyItemsPerPage = 3;

  const stats = [
    { label: 'Usuarios Totales', value: allUsers.length.toString(), icon: Users, color: 'text-blue-600', clickable: true },
    { label: 'Colecciones', value: '15', icon: Database, color: 'text-primary', clickable: false },
    { label: 'Ocurrencias', value: '342', icon: Activity, color: 'text-purple-600', clickable: false },
    { label: 'Solicitudes Pendientes', value: '5', icon: Shield, color: 'text-orange-600', clickable: false }
  ];

  const pendingRequests = [
    { id: '1', name: 'Dr. Carlos Mendoza', email: 'cmendoza@univ.edu', institution: 'Universidad de Lima', date: '2024-10-15' },
    { id: '2', name: 'Dra. Ana Torres', email: 'atorres@research.org', institution: 'Instituto de Investigación', date: '2024-10-16' },
    { id: '3', name: 'Luis Ramírez', email: 'lramirez@botanical.com', institution: 'Jardín Botánico Nacional', date: '2024-10-17' },
    { id: '4', name: 'Patricia Vega', email: 'pvega@academy.edu', institution: 'Academia de Ciencias', date: '2024-10-18' },
    { id: '5', name: 'Roberto Silva', email: 'rsilva@nature.org', institution: 'Conservación Natural', date: '2024-10-19' }
  ];

  const handleApprove = (name: string) => {
    toast.success(`Solicitud de ${name} aprobada`);
  };

  const handleReject = (name: string) => {
    toast.error(`Solicitud de ${name} rechazada`);
  };

  const handleCreateInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstitution.trim()) {
      toast.error('Por favor ingresa un nombre válido');
      return;
    }
    const institution = {
      id: Date.now().toString(),
      name: newInstitution,
      usersCount: 0
    };
    setInstitutions([...institutions, institution]);
    setNewInstitution('');
    setShowInstitutionDialog(false);
    toast.success('Institución creada exitosamente. Ahora puedes asignar un administrador.');
  };

  const handleDeleteInstitutionClick = (institution: Institution) => {
    setSelectedInstitution(institution);
    setShowDeleteInstitutionDialog(true);
  };

  const handleDeleteInstitution = () => {
    if (selectedInstitution) {
      setInstitutions(institutions.filter(inst => inst.id !== selectedInstitution.id));
      toast.success(`Institución "${selectedInstitution.name}" eliminada. Se han deshabilitado ${selectedInstitution.usersCount} usuarios.`);
      setShowDeleteInstitutionDialog(false);
      setSelectedInstitution(null);
    }
  };

  const handleAssignAdminClick = (institution: Institution) => {
    setSelectedInstitution(institution);
    setSelectedAdminUserId('');
    setShowAssignAdminDialog(true);
  };

  const handleAssignAdmin = () => {
    if (!selectedAdminUserId || !selectedInstitution) {
      toast.error('Por favor selecciona un usuario');
      return;
    }

    const selectedUser = allUsers.find(u => u.id === selectedAdminUserId);
    if (!selectedUser) return;

    setInstitutions(institutions.map(inst => 
      inst.id === selectedInstitution.id
        ? { ...inst, adminUserId: selectedUser.id, adminUserName: selectedUser.name }
        : inst
    ));

    toast.success(`${selectedUser.name} asignado como administrador de ${selectedInstitution.name}`);
    setShowAssignAdminDialog(false);
    setSelectedInstitution(null);
    setSelectedAdminUserId('');
  };

  const handleUsersClick = () => {
    setShowUsersView(true);
    setCurrentPage(1);
  };

  const toggleUserExpansion = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
      // Inicializar la página del historial si no existe
      if (!historyPages[userId]) {
        setHistoryPages(prev => ({ ...prev, [userId]: 1 }));
      }
    }
    setExpandedUsers(newExpanded);
  };

  const loadMoreHistory = (userId: string) => {
    setHistoryPages(prev => ({
      ...prev,
      [userId]: (prev[userId] || 1) + 1
    }));
  };

  const handleDisableUserClick = (userId: string, userName: string, isActive: boolean) => {
    // Verificar que no sea el usuario actual
    if (userId === user?.id) {
      toast.error('No puedes deshabilitarte a ti mismo');
      return;
    }

    const targetUser = allUsers.find(u => u.id === userId);
    
    // Si es admin de institución, solo el admin del sistema puede deshabilitarlo
    if (targetUser?.isInstitutionAdmin && !isSystemAdmin) {
      toast.error('Solo el administrador del sistema puede deshabilitar a un administrador de institución');
      return;
    }

    setUserToDisable({ id: userId, name: userName, isActive });
    setShowDisableUserDialog(true);
  };

  const handleDisableUserConfirm = () => {
    if (userToDisable) {
      const action = userToDisable.isActive ? 'deshabilitado' : 'habilitado';
      toast.success(`Usuario ${userToDisable.name} ${action}`);
      setShowDisableUserDialog(false);
      setUserToDisable(null);
    }
  };

  const handleDeleteUserClick = (userId: string, userName: string) => {
    // Verificar que no sea el usuario actual
    if (userId === user?.id) {
      toast.error('No puedes eliminarte a ti mismo');
      return;
    }

    const targetUser = allUsers.find(u => u.id === userId);
    
    // Si es admin de institución, solo el admin del sistema puede eliminarlo
    if (targetUser?.isInstitutionAdmin && !isSystemAdmin) {
      toast.error('Solo el administrador del sistema puede eliminar a un administrador de institución');
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
    ? allUsers.filter(u => u.institutionId === user?.institutionId)
    : allUsers;

  // Paginación
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  // Filtrar instituciones visibles
  const visibleInstitutions = isInstitutionAdmin
    ? institutions.filter(inst => inst.id === user?.institutionId)
    : institutions;

  const getUsersForInstitution = (institutionId: string) => {
    return allUsers.filter(u => u.institutionId === institutionId && u.id !== u.id); // Mock filter
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
                const currentHistoryPage = historyPages[userDetail.id] || 1;
                const historyToShow = userDetail.occurrenceHistory.slice(0, currentHistoryPage * historyItemsPerPage);
                const hasMoreHistory = historyToShow.length < userDetail.occurrenceHistory.length;

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
                        <p className="text-sm text-muted-foreground ml-6">{userDetail.email}</p>
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
                              handleDisableUserClick(userDetail.id, userDetail.name, userDetail.isActive);
                            }}
                            disabled={userDetail.id === user?.id}
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            {userDetail.isActive ? 'Deshabilitar' : 'Habilitar'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUserClick(userDetail.id, userDetail.name);
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
                            <p className="text-sm text-muted-foreground">Institución</p>
                            <p className="text-sm">{userDetail.institution}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Última Conexión</p>
                            <p className="text-sm">
                              {new Date(userDetail.lastConnection).toLocaleString('es-ES')}
                            </p>
                          </div>
                        </div>

                        {userDetail.occurrenceHistory.length > 0 && (
                          <div>
                            <p className="text-sm mb-2">
                              Historial de Ocurrencias ({userDetail.occurrenceHistory.length})
                            </p>
                            <div className="space-y-2">
                              {historyToShow.map((history) => (
                                <div key={history.id} className="flex items-center gap-3 text-sm p-2 bg-muted rounded">
                                  <Badge 
                                    variant={
                                      history.action === 'created' ? 'default' :
                                      history.action === 'updated' ? 'secondary' : 'outline'
                                    }
                                    className="min-w-20"
                                  >
                                    {history.action === 'created' ? 'Creado' :
                                     history.action === 'updated' ? 'Actualizado' : 'Eliminado'}
                                  </Badge>
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {history.id}
                                  </span>
                                  <span className="italic flex-1">{history.scientificName}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(history.datetime).toLocaleString('es-ES', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              ))}
                              {hasMoreHistory && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    loadMoreHistory(userDetail.id);
                                  }}
                                  className="w-full mt-2"
                                >
                                  <ChevronDown className="h-4 w-4 mr-2" />
                                  Ver más en el pasado ({userDetail.occurrenceHistory.length - historyToShow.length} más)
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="mt-6">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
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
            : 'Gestiona usuarios, colecciones y solicitudes de acceso'}
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={index}
              className={stat.clickable ? 'cursor-pointer hover:border-primary transition-colors' : ''}
              onClick={stat.clickable ? handleUsersClick : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">{stat.label}</CardTitle>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl">{stat.value}</div>
                {stat.clickable && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Click para ver detalles
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
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
                <Dialog open={showInstitutionDialog} onOpenChange={setShowInstitutionDialog}>
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
                        <Label htmlFor="institutionName">Nombre de la Institución</Label>
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
              <div className="space-y-2">
                {visibleInstitutions.map((institution) => (
                  <div key={institution.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3 flex-1">
                      <Building2 className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p>{institution.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-muted-foreground">
                            {institution.usersCount} usuarios
                          </p>
                          {institution.adminUserName && (
                            <Badge variant="secondary" className="text-xs">
                              Admin: {institution.adminUserName}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isSystemAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAssignAdminClick(institution)}
                          >
                            <UserCog className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteInstitutionClick(institution)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Solicitudes de Registro Pendientes</CardTitle>
            <CardDescription>
              Revisa y aprueba las solicitudes de nuevos usuarios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p>{request.name}</p>
                      <p className="text-sm text-muted-foreground">{request.email}</p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-800">
                      Pendiente
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mb-3">
                    <p>Institución: {request.institution}</p>
                    <p>Fecha: {new Date(request.date).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApprove(request.name)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleReject(request.name)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog para asignar admin */}
      <Dialog open={showAssignAdminDialog} onOpenChange={setShowAssignAdminDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar Administrador de Institución</DialogTitle>
            <DialogDescription>
              Selecciona un usuario de {selectedInstitution?.name} para asignarlo como administrador
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminUser">Usuario</Label>
              <Select value={selectedAdminUserId} onValueChange={setSelectedAdminUserId}>
                <SelectTrigger id="adminUser">
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {selectedInstitution && getUsersForInstitution(selectedInstitution.id).length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No hay usuarios en esta institución
                    </div>
                  ) : (
                    allUsers
                      .filter(u => u.institutionId === selectedInstitution?.id)
                      .map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAssignAdminDialog(false)} className="flex-1">
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
      <AlertDialog open={showDisableUserDialog} onOpenChange={setShowDisableUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDisable?.isActive 
                ? `Se deshabilitará el acceso de ${userToDisable?.name} al sistema. El usuario no podrá iniciar sesión hasta ser habilitado nuevamente.`
                : `Se habilitará el acceso de ${userToDisable?.name} al sistema. El usuario podrá iniciar sesión nuevamente.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDisableUserConfirm} 
              className={userToDisable?.isActive ? "bg-orange-600 hover:bg-orange-700" : ""}
            >
              {userToDisable?.isActive ? 'Deshabilitar Usuario' : 'Habilitar Usuario'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación para eliminar usuario */}
      <AlertDialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el usuario <span className="font-semibold">{userToDelete?.name}</span> y 
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
      <AlertDialog open={showDeleteInstitutionDialog} onOpenChange={setShowDeleteInstitutionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Al eliminar la institución "{selectedInstitution?.name}", 
              se <span className="text-red-600">deshabilitarán todos los {selectedInstitution?.usersCount} usuarios</span> asociados a ella.
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
