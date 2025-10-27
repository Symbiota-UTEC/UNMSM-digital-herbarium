import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Leaf, Database, Search, Users } from "lucide-react";

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const features = [
    {
      icon: Database,
      title: "Gestión de Colecciones",
      description: "Organiza y administra tus colecciones de especímenes botánicos de manera eficiente."
    },
    {
      icon: Search,
      title: "Registro de Ocurrencias",
      description: "Documenta detalladamente cada muestra de hoja seca con información geográfica y temporal."
    },
    {
      icon: Leaf,
      title: "Clasificación Taxonómica",
      description: "Mantén un catálogo completo de taxones y sus relaciones jerárquicas."
    },
    {
      icon: Users,
      title: "Colaboración",
      description: "Trabaja en equipo con otros botánicos y comparte tus descubrimientos."
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-red-50 to-white py-20">
        <div className="container mx-auto px-4 text-center">
          <Leaf className="h-16 w-16 text-primary mx-auto mb-6" />
          <h1 className="text-5xl mb-4">Herbario Digital</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Plataforma desarrollada por la UNMSM para la gestión y catalogación de especímenes botánicos.
            Digitaliza tus colecciones de hojas secas y comparte conocimiento científico.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => onNavigate('register')}>
              Solicitar Registro
            </Button>
            <Button size="lg" variant="outline" onClick={() => onNavigate('login')}>
              Iniciar Sesión
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl text-center mb-12">Características Principales</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index}>
                  <CardHeader>
                    <Icon className="h-10 w-10 text-primary mb-2" />
                    <CardTitle>{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl mb-4">¿Listo para comenzar?</h2>
          <p className="text-lg mb-8 opacity-90">
            Únete a la comunidad de botánicos que ya están digitalizando sus colecciones.
          </p>
          <Button size="lg" variant="secondary" onClick={() => onNavigate('register')}>
            Solicitar Acceso
          </Button>
        </div>
      </section>
    </div>
  );
}