import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Plus, MapPin, Calendar, Leaf } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface Occurrence {
  id: string;
  specimenCode: string;
  collection: string;
  scientificName: string;
  location: string;
  latitude: string;
  longitude: string;
  date: string;
  collector: string;
  notes: string;
}

export function OccurrencesPage() {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([
    {
      id: '1',
      specimenCode: 'FAM-2024-001',
      collection: 'Flora Amazónica 2024',
      scientificName: 'Heliconia bihai',
      location: 'Río Negro, Amazonas',
      latitude: '-0.5234',
      longitude: '-64.7823',
      date: '2024-03-15',
      collector: 'Dr. Juan Pérez',
      notes: 'Espécimen en buen estado, flores rojas'
    },
    {
      id: '2',
      specimenCode: 'FAM-2024-002',
      collection: 'Flora Amazónica 2024',
      scientificName: 'Ceiba pentandra',
      location: 'Selva de Manaos',
      latitude: '-3.1190',
      longitude: '-60.0217',
      date: '2024-03-17',
      collector: 'Dr. Juan Pérez',
      notes: 'Árbol de gran tamaño, muestra de corteza y hojas'
    },
    {
      id: '3',
      specimenCode: 'HA-2024-001',
      collection: 'Herbáceas Andinas',
      scientificName: 'Gentiana sedifolia',
      location: 'Valle Sagrado, Cusco',
      latitude: '-13.2987',
      longitude: '-72.1345',
      date: '2024-01-20',
      collector: 'Dra. María García',
      notes: 'Flores azules, altitud 3800 msnm'
    }
  ]);

  const [open, setOpen] = useState(false);
  const [newOccurrence, setNewOccurrence] = useState({
    specimenCode: '',
    collection: '',
    scientificName: '',
    location: '',
    latitude: '',
    longitude: '',
    date: '',
    collector: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const occurrence: Occurrence = {
      id: Date.now().toString(),
      ...newOccurrence
    };
    setOccurrences([occurrence, ...occurrences]);
    setNewOccurrence({
      specimenCode: '',
      collection: '',
      scientificName: '',
      location: '',
      latitude: '',
      longitude: '',
      date: '',
      collector: '',
      notes: ''
    });
    setOpen(false);
    toast.success('Ocurrencia registrada exitosamente');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl mb-2">Ocurrencias</h1>
          <p className="text-muted-foreground">
            Registro de muestras de hojas secas y especímenes
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Ocurrencia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Nueva Ocurrencia</DialogTitle>
              <DialogDescription>
                Documenta los detalles del espécimen recolectado
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="specimenCode">Código del Espécimen</Label>
                  <Input
                    id="specimenCode"
                    value={newOccurrence.specimenCode}
                    onChange={(e) => setNewOccurrence({...newOccurrence, specimenCode: e.target.value})}
                    placeholder="FAM-2024-003"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collection">Colección</Label>
                  <Select
                    value={newOccurrence.collection}
                    onValueChange={(value) => setNewOccurrence({...newOccurrence, collection: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una colección" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Flora Amazónica 2024">Flora Amazónica 2024</SelectItem>
                      <SelectItem value="Herbáceas Andinas">Herbáceas Andinas</SelectItem>
                      <SelectItem value="Plantas Medicinales Locales">Plantas Medicinales Locales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scientificName">Nombre Científico</Label>
                <Input
                  id="scientificName"
                  value={newOccurrence.scientificName}
                  onChange={(e) => setNewOccurrence({...newOccurrence, scientificName: e.target.value})}
                  placeholder="Genus species"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Ubicación</Label>
                <Input
                  id="location"
                  value={newOccurrence.location}
                  onChange={(e) => setNewOccurrence({...newOccurrence, location: e.target.value})}
                  placeholder="Localidad, Región"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitud</Label>
                  <Input
                    id="latitude"
                    value={newOccurrence.latitude}
                    onChange={(e) => setNewOccurrence({...newOccurrence, latitude: e.target.value})}
                    placeholder="-12.0464"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitud</Label>
                  <Input
                    id="longitude"
                    value={newOccurrence.longitude}
                    onChange={(e) => setNewOccurrence({...newOccurrence, longitude: e.target.value})}
                    placeholder="-77.0428"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Fecha de Recolección</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newOccurrence.date}
                    onChange={(e) => setNewOccurrence({...newOccurrence, date: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collector">Recolector</Label>
                  <Input
                    id="collector"
                    value={newOccurrence.collector}
                    onChange={(e) => setNewOccurrence({...newOccurrence, collector: e.target.value})}
                    placeholder="Nombre del recolector"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas / Observaciones</Label>
                <Textarea
                  id="notes"
                  value={newOccurrence.notes}
                  onChange={(e) => setNewOccurrence({...newOccurrence, notes: e.target.value})}
                  rows={3}
                  placeholder="Descripción del hábitat, características del espécimen..."
                />
              </div>

              <Button type="submit" className="w-full">Registrar Ocurrencia</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro de Ocurrencias</CardTitle>
          <CardDescription>
            {occurrences.length} especímenes registrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre Científico</TableHead>
                <TableHead>Colección</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Recolector</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {occurrences.map((occurrence) => (
                <TableRow key={occurrence.id}>
                  <TableCell>
                    <Badge variant="outline">{occurrence.specimenCode}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Leaf className="h-4 w-4 text-primary" />
                      <span className="italic">{occurrence.scientificName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{occurrence.collection}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{occurrence.location}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">
                        {new Date(occurrence.date).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{occurrence.collector}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}