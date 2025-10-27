import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "../ui/pagination";
import { ArrowLeft, Plus, UserPlus, Pencil, Trash2, Eye, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "../../contexts/AuthContext";

interface Occurrence {
  id: string;
  code: string;
  scientificName: string;
  family: string;
  location: string;
  coordinates: string;
  collector: string;
  date: string;
}

interface CollectionUser {
  id: string;
  name: string;
  email: string;
  role: 'viewer' | 'editor';
}

interface CollectionDetailPageProps {
  collectionId: string;
  collectionName: string;
  isOwner: boolean;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

export function CollectionDetailPage({ collectionId, collectionName, isOwner, onNavigate }: CollectionDetailPageProps) {
  const { user } = useAuth();
  
  const [occurrences, setOccurrences] = useState<Occurrence[]>([
    {
      id: '1',
      code: 'BOT-2024-001',
      scientificName: 'Cinchona officinalis',
      family: 'Rubiaceae',
      location: 'Amazonas, Perú',
      coordinates: '-3.2505, -78.5255',
      collector: 'Dr. Juan Pérez',
      date: '2024-03-15'
    },
    {
      id: '2',
      code: 'BOT-2024-002',
      scientificName: 'Uncaria tomentosa',
      family: 'Rubiaceae',
      location: 'Loreto, Perú',
      coordinates: '-4.2028, -76.3192',
      collector: 'Dr. Juan Pérez',
      date: '2024-03-18'
    },
    {
      id: '3',
      code: 'BOT-2024-003',
      scientificName: 'Myrciaria dubia',
      family: 'Myrtaceae',
      location: 'Ucayali, Perú',
      coordinates: '-8.3791, -74.5539',
      collector: 'Dra. María González',
      date: '2024-03-20'
    }
  ]);

  const [users, setUsers] = useState<CollectionUser[]>([
    { id: '1', name: 'Dr. Carlos Mendoza', email: 'cmendoza@univ.edu', role: 'editor' },
    { id: '2', name: 'Dra. Ana Torres', email: 'atorres@research.org', role: 'viewer' },
    { id: '3', name: 'Dr. Juan Pérez', email: 'jperez@botanica.edu', role: 'viewer' },
    { id: '4', name: 'Dra. Patricia Vega', email: 'pvega@academy.edu', role: 'editor' },
    { id: '5', name: 'Luis Ramírez', email: 'lramirez@botanical.com', role: 'viewer' },
    { id: user?.id || '999', name: user?.name || 'Usuario Actual', email: user?.email || 'current@user.com', role: 'editor' }
  ]);

  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteCollectionDialog, setShowDeleteCollectionDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [occurrenceToDelete, setOccurrenceToDelete] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isUsersExpanded, setIsUsersExpanded] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    role: 'viewer' as 'viewer' | 'editor'
  });

  // Paginación para usuarios
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const usersPerPage = 4;
  const totalUserPages = Math.ceil(users.length / usersPerPage);
  const startUserIndex = (currentUserPage - 1) * usersPerPage;
  const endUserIndex = startUserIndex + usersPerPage;
  const currentUsers = users.slice(startUserIndex, endUserIndex);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const collectionUser: CollectionUser = {
      id: Date.now().toString(),
      name: newUser.email.split('@')[0],
      email: newUser.email,
      role: newUser.role
    };
    setUsers([...users, collectionUser]);
    toast.success(`Usuario agregado como ${newUser.role === 'viewer' ? 'visualizador' : 'editor'}`);
    setNewUser({ email: '', role: 'viewer' });
    setShowAddUserDialog(false);
  };

  const handleRemoveUserClick = (userId: string, userName: string) => {
    // No permitir eliminar si es el usuario actual
    if (userId === user?.id) {
      toast.error('No puedes eliminarte a ti mismo de la colección');
      return;
    }

    setUserToDelete({ id: userId, name: userName });
    setShowDeleteUserDialog(true);
  };

  const handleRemoveUserConfirm = () => {
    if (userToDelete) {
      setUsers(users.filter(u => u.id !== userToDelete.id));
      toast.success(`${userToDelete.name} removido de la colección`);
      setShowDeleteUserDialog(false);
      setUserToDelete(null);
    }
  };

  const handleToggleRole = (userId: string, currentRole: 'viewer' | 'editor') => {
    // No permitir cambiar el rol si es el usuario actual
    if (userId === user?.id) {
      toast.error('No puedes cambiar tu propio rol');
      return;
    }

    const newRole = currentRole === 'viewer' ? 'editor' : 'viewer';
    setUsers(users.map(u => 
      u.id === userId ? { ...u, role: newRole } : u
    ));
    toast.success(`Rol actualizado a ${newRole === 'viewer' ? 'visualizador' : 'editor'}`);
  };

  const handleEditClick = (occurrence: Occurrence) => {
    onNavigate('edit-occurrence', { 
      occurrenceId: occurrence.id, 
      collectionId,
      collectionName,
      isOwner
    });
  };

  const handleViewClick = (occurrence: Occurrence) => {
    onNavigate('occurrence-detail', { 
      occurrenceId: occurrence.id,
      collectionId,
      collectionName,
      isOwner
    });
  };

  const handleDeleteClick = (occurrenceId: string) => {
    setOccurrenceToDelete(occurrenceId);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (occurrenceToDelete) {
      setOccurrences(occurrences.filter(occ => occ.id !== occurrenceToDelete));
      setShowDeleteDialog(false);
      setOccurrenceToDelete(null);
      toast.success('Ocurrencia eliminada exitosamente');
    }
  };

  const handleDeleteCollection = () => {
    if (confirmText !== 'CONFIRMAR') {
      toast.error('Debes escribir CONFIRMAR para eliminar la colección');
      return;
    }

    // En producción, aquí se eliminaría la colección del backend
    toast.success(`Colección "${collectionName}" eliminada exitosamente`);
    setShowDeleteCollectionDialog(false);
    onNavigate('collections');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => onNavigate('collections')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Colecciones
        </Button>
        
        <div>
          <h1 className="text-3xl mb-2">{collectionName}</h1>
          <p className="text-muted-foreground">
            {occurrences.length} ocurrencias en esta colección
          </p>
        </div>
      </div>

      {isOwner && users.length > 0 && (
        <Card className="mb-6">
          <CardHeader 
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setIsUsersExpanded(!isUsersExpanded)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                {isUsersExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1">
                  <CardTitle className="mb-1">Usuarios con Acceso</CardTitle>
                  <CardDescription>
                    Usuarios que pueden acceder a esta colección ({users.length} total)
                  </CardDescription>
                </div>
              </div>
              {isUsersExpanded && (
                <Dialog open={showAddUserDialog} onOpenChange={(open) => {
                  setShowAddUserDialog(open);
                  if (!open) {
                    // Resetear el formulario al cerrar
                    setNewUser({ email: '', role: 'viewer' });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button 
                      onClick={(e) => e.stopPropagation()}
                      size="sm"
                      className="flex-shrink-0"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Agregar Usuario
                    </Button>
                  </DialogTrigger>
                  <DialogContent onClick={(e) => e.stopPropagation()}>
                    <DialogHeader>
                      <DialogTitle>Agregar Usuario a la Colección</DialogTitle>
                      <DialogDescription>
                        Invita a otros usuarios a colaborar en esta colección
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddUser} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="userEmail">Correo Electrónico</Label>
                        <Input
                          id="userEmail"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                          placeholder="usuario@ejemplo.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="userRole">Rol</Label>
                        <Select
                          value={newUser.role}
                          onValueChange={(value: 'viewer' | 'editor') => setNewUser({...newUser, role: value})}
                        >
                          <SelectTrigger id="userRole">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                          {newUser.role === 'viewer' 
                            ? 'Puede ver las ocurrencias pero no editarlas' 
                            : 'Puede ver, editar y eliminar ocurrencias'}
                        </p>
                      </div>
                      <Button type="submit" className="w-full">Agregar Usuario</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          {isUsersExpanded && (
            <CardContent>
              <div className="space-y-2">
                {currentUsers.map((collectionUser) => (
                  <div key={collectionUser.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {collectionUser.role === 'viewer' ? (
                          <Eye className="h-5 w-5 text-primary" />
                        ) : (
                          <Pencil className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p>{collectionUser.name}</p>
                          {collectionUser.id === user?.id && (
                            <Badge variant="outline" className="text-xs">Tú</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{collectionUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={collectionUser.role === 'editor' ? 'default' : 'secondary'}>
                        {collectionUser.role === 'viewer' ? 'Visualizador' : 'Editor'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleRole(collectionUser.id, collectionUser.role)}
                        disabled={collectionUser.id === user?.id}
                        title={collectionUser.id === user?.id ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUserClick(collectionUser.id, collectionUser.name)}
                        disabled={collectionUser.id === user?.id}
                        title={collectionUser.id === user?.id ? 'No puedes eliminarte a ti mismo' : 'Eliminar usuario'}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {totalUserPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentUserPage(Math.max(1, currentUserPage - 1))}
                          className={currentUserPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalUserPages }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentUserPage(page)}
                            isActive={currentUserPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentUserPage(Math.min(totalUserPages, currentUserPage + 1))}
                          className={currentUserPage === totalUserPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ocurrencias</CardTitle>
          <CardDescription>
            Lista de especímenes en esta colección
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre Científico</TableHead>
                <TableHead>Familia</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Recolector</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {occurrences.map((occurrence) => (
                <TableRow key={occurrence.id}>
                  <TableCell>{occurrence.code}</TableCell>
                  <TableCell className="italic">{occurrence.scientificName}</TableCell>
                  <TableCell>{occurrence.family}</TableCell>
                  <TableCell>{occurrence.location}</TableCell>
                  <TableCell>{occurrence.collector}</TableCell>
                  <TableCell>
                    {new Date(occurrence.date).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewClick(occurrence)}
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isOwner && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(occurrence)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(occurrence.id)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sección de eliminar colección */}
      {isOwner && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setShowDeleteCollectionDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar Colección
          </Button>
        </div>
      )}

      {/* Delete Occurrence Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La ocurrencia será eliminada permanentemente de la colección.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el acceso de <span className="font-semibold">{userToDelete?.name}</span> a esta colección. 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveUserConfirm} className="bg-red-600 hover:bg-red-700">
              Eliminar Acceso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Collection Confirmation Dialog */}
      <AlertDialog open={showDeleteCollectionDialog} onOpenChange={setShowDeleteCollectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de eliminar esta colección?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán permanentemente todas las ocurrencias ({occurrences.length}) 
              y se removerá el acceso de todos los usuarios ({users.length}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="confirmDelete">
              Escribe <span className="font-mono bg-muted px-1">CONFIRMAR</span> para proceder
            </Label>
            <Input
              id="confirmDelete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRMAR"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCollection}
              className="bg-red-600 hover:bg-red-700"
              disabled={confirmText !== 'CONFIRMAR'}
            >
              Eliminar Colección
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
