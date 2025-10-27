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
import { Plus, MapPin, Calendar, Leaf, Eye } from "lucide-react";
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

interface OccurrencesPageProps {
  onNavigate: (page: string) => void;
}

export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
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

  const handleViewClick = (occurrenceId: string) => {
    onNavigate('occurrence-detail', { occurrenceId });
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
        
        <Button onClick={() => onNavigate('new-occurrence')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Ocurrencia
        </Button>
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
                <TableHead>Acciones</TableHead>
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
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewClick(occurrence.id)}
                      title="Ver detalles"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
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