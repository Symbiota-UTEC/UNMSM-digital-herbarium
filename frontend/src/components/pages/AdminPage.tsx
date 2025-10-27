import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Users, Database, Activity, Shield, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner@2.0.3";

export function AdminPage() {
  const stats = [
    { label: 'Usuarios Totales', value: '24', icon: Users, color: 'text-blue-600' },
    { label: 'Colecciones', value: '15', icon: Database, color: 'text-primary' },
    { label: 'Ocurrencias', value: '342', icon: Activity, color: 'text-purple-600' },
    { label: 'Solicitudes Pendientes', value: '5', icon: Shield, color: 'text-orange-600' }
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl mb-2">Panel de Administración</h1>
        <p className="text-muted-foreground">
          Gestiona usuarios, colecciones y solicitudes de acceso
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm">{stat.label}</CardTitle>
                <Icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitudes de Registro Pendientes</CardTitle>
          <CardDescription>
            Revisa y aprueba las solicitudes de nuevos usuarios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Institución</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{request.name}</TableCell>
                  <TableCell>{request.email}</TableCell>
                  <TableCell>{request.institution}</TableCell>
                  <TableCell>
                    {new Date(request.date).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-800">
                      Pendiente
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-primary hover:text-primary/80 hover:bg-red-50"
                        onClick={() => handleApprove(request.name)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleReject(request.name)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}