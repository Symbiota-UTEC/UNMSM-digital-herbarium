import {Button} from "./ui/button";
import {Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from "./ui/sheet";
import {Separator} from "./ui/separator";
import {Avatar, AvatarFallback} from "./ui/avatar";
import {Folder, Home, Leaf, LogOut, Map, MapPin, Menu, Shield, User} from "lucide-react";
import {useAuth} from "@contexts/AuthContext";
import {Role} from "@constants/roles";

interface PrivateNavbarProps {
  onNavigate: (page: string) => void;
  currentPage: string;
}

export function PrivateNavbar({ onNavigate, currentPage }: PrivateNavbarProps) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onNavigate('home');
  };

  const menuItems = [
    { id: 'collections', label: 'Colecciones', icon: Folder },
    { id: 'occurrences', label: 'Ocurrencias', icon: MapPin },
    { id: 'taxon', label: 'Taxon', icon: Leaf },
    { id: 'map', label: 'Mapa', icon: Map },
  ];

  const userMenuItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'profile', label: 'Ver Perfil', icon: User },
  ];

  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
              <SheetDescription className="sr-only">
                Navega por las diferentes secciones de la aplicación
              </SheetDescription>
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-white">
                      {user?.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span>{user?.username}</span>
                    <span className="text-sm text-muted-foreground">{user?.email}</span>
                  </div>
                </div>

                <Separator className="mb-4" />

                <div className="space-y-1 mb-4">
                  <div className="text-sm text-muted-foreground px-3 mb-2">Navegación</div>
                  {userMenuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.id}
                        variant={currentPage === item.id ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => onNavigate(item.id)}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </Button>
                    );
                  })}
                </div>

                <Separator className="mb-4" />

                <div className="space-y-1 mb-4">
                  <div className="text-sm text-muted-foreground px-3 mb-2">Aplicación</div>
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Button
                        key={item.id}
                        variant={currentPage === item.id ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => onNavigate(item.id)}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {item.label}
                      </Button>
                    );
                  })}
                </div>

                {(user?.role == Role.InstitutionAdmin || user.role == Role.Admin) && (
                  <>
                    <Separator className="mb-4" />
                    <Button
                      variant={currentPage === 'admin' ? "secondary" : "ghost"}
                      className="w-full justify-start"
                      onClick={() => onNavigate('admin')}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Admin
                    </Button>
                  </>
                )}

                <div className="mt-auto pt-4">
                  <Separator className="mb-4" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <Leaf className="h-6 w-6 text-primary" />
            <span className="text-lg">Herbario Digital</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-primary text-white">
              {user?.username.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </nav>
  );
}