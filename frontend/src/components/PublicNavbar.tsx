import { Button } from "./ui/button";
import { Leaf } from "lucide-react";

interface PublicNavbarProps {
  onNavigate: (page: string) => void;
}

export function PublicNavbar({ onNavigate }: PublicNavbarProps) {
  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-lg">Herbario Digital</span>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => onNavigate('home')}>
            Home
          </Button>
          <Button variant="ghost" onClick={() => onNavigate('register')}>
            Solicitud de Registro
          </Button>
          <Button onClick={() => onNavigate('login')}>
            Login
          </Button>
        </div>
      </div>
    </nav>
  );
}