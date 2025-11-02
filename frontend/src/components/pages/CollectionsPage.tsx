import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Plus, Folder, Calendar, MapPin, Upload, FileSpreadsheet, Users } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { Collection } from "@interfaces/collection";

interface CollectionsPageProps {
  onNavigate: (page: string, params?: { collectionId?: string; collectionName?: string; isOwner?: boolean }) => void;
}

export function CollectionsPage({ onNavigate }: CollectionsPageProps) {
  const { user } = useAuth();
  const currentUserId = user?.id || '2';

  // Mock de instituciones disponibles
  const institutions = [
    'Universidad Nacional de Botánica',
    'Instituto de Investigación Amazónica',
    'Jardín Botánico Nacional',
    'Academia de Ciencias Naturales'
  ];

  const [collections, setCollections] = useState<Collection[]>([
    {
      id: '1',
      name: 'Flora Amazónica 2024',
      description: 'Colección de especímenes recolectados en la región amazónica durante la expedición de marzo 2024',
      location: 'Amazonas, Brasil',
      date: '2024-03-15',
      occurrencesCount: 45,
      institution: 'Universidad Nacional de Botánica',
      ownerId: currentUserId
    },
    {
      id: '2',
      name: 'Herbáceas Andinas',
      description: 'Muestras de plantas herbáceas de los Andes centrales',
      location: 'Cusco, Perú',
      date: '2024-01-20',
      occurrencesCount: 32,
      institution: 'Instituto de Investigación Amazónica',
      ownerId: currentUserId
    },
    {
      id: '3',
      name: 'Plantas Medicinales Locales',
      description: 'Catálogo de plantas con usos medicinales tradicionales',
      location: 'Varios',
      date: '2023-11-10',
      occurrencesCount: 28,
      institution: 'Jardín Botánico Nacional',
      ownerId: 'other-user'
    }
  ]);

  const [open, setOpen] = useState(false);
  const [newCollection, setNewCollection] = useState({
    name: '',
    description: '',
    location: '',
    date: '',
    institution: ''
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleSubmitEmpty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollection.institution) {
      toast.error('Por favor selecciona una institución');
      return;
    }
    const collection: Collection = {
      id: Date.now().toString(),
      ...newCollection,
      occurrencesCount: 0,
      ownerId: currentUserId
    };
    setCollections([collection, ...collections]);
    resetForm();
    toast.success('Colección vacía creada exitosamente');
  };

  const handleSubmitWithCSV = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('Por favor selecciona un archivo CSV');
      return;
    }
    if (!newCollection.institution) {
      toast.error('Por favor selecciona una institución');
      return;
    }

    // In a real app, you would parse the CSV here
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvContent = event.target?.result as string;
      // Count lines (excluding header) as a simple approximation
      const lines = csvContent.split('\n').filter(line => line.trim());
      const occurrencesCount = Math.max(0, lines.length - 1);

      const collection: Collection = {
        id: Date.now().toString(),
        ...newCollection,
        occurrencesCount,
        ownerId: currentUserId
      };
      setCollections([collection, ...collections]);
      resetForm();
      toast.success(`Colección creada con ${occurrencesCount} ocurrencias importadas`);
    };
    reader.readAsText(csvFile);
  };

  const resetForm = () => {
    setNewCollection({ name: '', description: '', location: '', date: '', institution: '' });
    setCsvFile(null);
    setOpen(false);
  };

  const handleCollectionClick = (collection: Collection) => {
    onNavigate('collection.ts-detail', {
      collectionId: collection.id,
      collectionName: collection.name,
      isOwner: collection.ownerId === currentUserId
    });
  };

  const myCollections = collections.filter(c => c.ownerId === currentUserId);
  const sharedCollections = collections.filter(c => c.ownerId !== currentUserId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setCsvFile(file);
        toast.success('Archivo CSV cargado');
      } else {
        toast.error('Por favor selecciona un archivo CSV válido');
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl mb-2">Colecciones</h1>
          <p className="text-muted-foreground">
            Gestiona tus colecciones de especímenes botánicos
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Colección
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Crear Nueva Colección</DialogTitle>
              <DialogDescription>
                Elige cómo deseas crear tu colección
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="empty" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="empty">Colección Vacía</TabsTrigger>
                <TabsTrigger value="csv">Importar CSV</TabsTrigger>
              </TabsList>
              
              <TabsContent value="empty" className="space-y-4">
                <div className="rounded-lg bg-blue-50 p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Folder className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-blue-900 mb-1">Colección Vacía</h4>
                      <p className="text-sm text-blue-700">
                        Crea una colección con solo los metadatos. Podrás agregar ocurrencias manualmente después.
                      </p>
                    </div>
                  </div>
                </div>
                
                <form onSubmit={handleSubmitEmpty} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-empty">Nombre de la Colección</Label>
                    <Input
                      id="name-empty"
                      value={newCollection.name}
                      onChange={(e) => setNewCollection({...newCollection, name: e.target.value})}
                      placeholder="Ej: Flora del Amazonas 2024"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description-empty">Descripción</Label>
                    <Textarea
                      id="description-empty"
                      value={newCollection.description}
                      onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
                      rows={3}
                      placeholder="Describe el propósito y contenido de esta colección"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="institution-empty">Institución</Label>
                    <Select
                      value={newCollection.institution}
                      onValueChange={(value) => setNewCollection({...newCollection, institution: value})}
                    >
                      <SelectTrigger id="institution-empty">
                        <SelectValue placeholder="Selecciona una institución" />
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
                    <Label htmlFor="location-empty">Ubicación</Label>
                    <Input
                      id="location-empty"
                      value={newCollection.location}
                      onChange={(e) => setNewCollection({...newCollection, location: e.target.value})}
                      placeholder="Ej: Amazonas, Brasil"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-empty">Fecha de Recolección</Label>
                    <Input
                      id="date-empty"
                      type="date"
                      value={newCollection.date}
                      onChange={(e) => setNewCollection({...newCollection, date: e.target.value})}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    <Folder className="h-4 w-4 mr-2" />
                    Crear Colección Vacía
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="csv" className="space-y-4">
                <div className="rounded-lg bg-green-50 p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm text-green-900 mb-1">Importar desde CSV</h4>
                      <p className="text-sm text-green-700">
                        Crea una colección e importa múltiples ocurrencias desde un archivo CSV.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmitWithCSV} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-csv">Nombre de la Colección</Label>
                    <Input
                      id="name-csv"
                      value={newCollection.name}
                      onChange={(e) => setNewCollection({...newCollection, name: e.target.value})}
                      placeholder="Ej: Flora del Amazonas 2024"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description-csv">Descripción</Label>
                    <Textarea
                      id="description-csv"
                      value={newCollection.description}
                      onChange={(e) => setNewCollection({...newCollection, description: e.target.value})}
                      rows={3}
                      placeholder="Describe el propósito y contenido de esta colección"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="institution-csv">Institución</Label>
                    <Select
                      value={newCollection.institution}
                      onValueChange={(value) => setNewCollection({...newCollection, institution: value})}
                    >
                      <SelectTrigger id="institution-csv">
                        <SelectValue placeholder="Selecciona una institución" />
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
                    <Label htmlFor="location-csv">Ubicación</Label>
                    <Input
                      id="location-csv"
                      value={newCollection.location}
                      onChange={(e) => setNewCollection({...newCollection, location: e.target.value})}
                      placeholder="Ej: Amazonas, Brasil"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-csv">Fecha de Recolección</Label>
                    <Input
                      id="date-csv"
                      type="date"
                      value={newCollection.date}
                      onChange={(e) => setNewCollection({...newCollection, date: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="csv-file">Archivo CSV</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <div className="mb-2">
                        <label htmlFor="csv-file" className="cursor-pointer text-primary hover:underline">
                          Seleccionar archivo CSV
                        </label>
                        <input
                          id="csv-file"
                          type="file"
                          accept=".csv"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </div>
                      {csvFile && (
                        <p className="text-sm text-muted-foreground">
                          Archivo: <span className="text-foreground">{csvFile.name}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        El CSV debe incluir columnas para código, nombre científico, ubicación, coordenadas, etc.
                      </p>
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Crear e Importar Ocurrencias
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {myCollections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl mb-4">Mis Colecciones</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myCollections.map((collection) => (
              <Card 
                key={collection.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleCollectionClick(collection)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Folder className="h-8 w-8 text-primary" />
                    <span className="text-sm bg-red-50 text-primary px-2 py-1 rounded">
                      {collection.occurrencesCount} ocurrencias
                    </span>
                  </div>
                  <CardTitle>{collection.name}</CardTitle>
                  <CardDescription>{collection.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {collection.institution}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {collection.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(collection.date).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {sharedCollections.length > 0 && (
        <div>
          <h2 className="text-2xl mb-4">Colecciones Compartidas</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sharedCollections.map((collection) => (
              <Card 
                key={collection.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleCollectionClick(collection)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <Folder className="h-8 w-8 text-primary" />
                    <span className="text-sm bg-red-50 text-primary px-2 py-1 rounded">
                      {collection.occurrencesCount} ocurrencias
                    </span>
                  </div>
                  <CardTitle>{collection.name}</CardTitle>
                  <CardDescription>{collection.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {collection.institution}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {collection.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(collection.date).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
