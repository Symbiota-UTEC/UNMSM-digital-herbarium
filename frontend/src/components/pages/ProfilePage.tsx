import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Mail, Calendar, Building, Award } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function ProfilePage() {
  const { user } = useAuth();

  const stats = [
    { label: 'Colecciones', value: '3' },
    { label: 'Ocurrencias', value: '45' },
    { label: 'Taxones', value: '32' },
    { label: 'Contribuciones', value: '78' }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl mb-6">Mi Perfil</h1>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="text-center">
              <Avatar className="h-24 w-24 mx-auto mb-4">
                <AvatarFallback className="bg-primary text-white text-2xl">
                  {user?.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <CardTitle>{user?.name}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <Badge className="mx-auto mt-2" variant={user?.role === 'admin' ? 'default' : 'secondary'}>
                {user?.role === 'admin' ? 'Administrador' : 'Usuario'}
              </Badge>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Editar Perfil
              </Button>
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
                {stats.map((stat, index) => (
                  <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-3xl text-primary mb-1">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Información Profesional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p>{user?.email}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Institución</p>
                  <p>Universidad Nacional de Botánica</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Especialización</p>
                  <p>Taxonomía de Plantas Tropicales</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Miembro desde</p>
                  <p>Enero 2024</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}