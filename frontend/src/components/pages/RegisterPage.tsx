import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface RegisterPageProps {
  onNavigate: (page: string) => void;
}

export function RegisterPage({ onNavigate }: RegisterPageProps) {
  // Mock de instituciones disponibles - en producción vendrían del backend
  const institutions = [
    'Universidad Nacional de Botánica',
    'Instituto de Investigación Amazónica',
    'Jardín Botánico Nacional',
    'Academia de Ciencias Naturales'
  ];

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    institution: '',
    motivation: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institution) {
      toast.error('Por favor selecciona una institución');
      return;
    }
    setLoading(true);
    
    // Simular envío
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast.success('Solicitud enviada correctamente. Te contactaremos pronto.');
    setFormData({ name: '', email: '', institution: '', motivation: '' });
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 py-12 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <Leaf className="h-12 w-12 text-primary mx-auto mb-4" />
          <CardTitle>Solicitud de Registro</CardTitle>
          <CardDescription>
            Completa el formulario para solicitar acceso al Herbario Digital
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre Completo</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Dr. Juan Pérez"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="botanico@universidad.edu"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="institution">Institución / Universidad</Label>
              <Select
                value={formData.institution}
                onValueChange={(value) => setFormData(prev => ({...prev, institution: value}))}
              >
                <SelectTrigger id="institution">
                  <SelectValue placeholder="Selecciona tu institución" />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst} value={inst}>
                      {inst}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="motivation">Motivación para usar el Herbario Digital</Label>
              <Textarea
                id="motivation"
                value={formData.motivation}
                onChange={handleChange}
                placeholder="Describa brevemente cómo planea utilizar la plataforma..."
                rows={4}
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando solicitud...
                </>
              ) : (
                'Enviar Solicitud'
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              ¿Ya tienes una cuenta?{' '}
              <button 
                onClick={() => onNavigate('login')}
                className="text-primary hover:underline"
              >
                Iniciar Sesión
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}