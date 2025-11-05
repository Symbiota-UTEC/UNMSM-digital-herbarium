import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { MapPin, Calendar, Leaf, Eye, Users } from "lucide-react";

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
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

export function OccurrencesPage({ onNavigate }: OccurrencesPageProps) {
  const [occurrences] = useState<Occurrence[]>([
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
    },
    {
      id: '4',
      specimenCode: 'PML-2023-015',
      collection: 'Plantas Medicinales Locales',
      scientificName: 'Uncaria tomentosa',
      location: 'Loreto, Perú',
      latitude: '-4.2028',
      longitude: '-76.3192',
      date: '2023-11-10',
      collector: 'Dr. Roberto Silva',
      notes: 'Uña de gato, propiedades medicinales'
    },
    {
      id: '5',
      specimenCode: 'AM-2023-028',
      collection: 'Árboles Maderables',
      scientificName: 'Swietenia macrophylla',
      location: 'Madre de Dios, Perú',
      latitude: '-12.5934',
      longitude: '-69.1892',
      date: '2023-10-15',
      collector: 'Ing. Carlos Mendoza',
      notes: 'Caoba, espécimen adulto'
    },
    {
      id: '6',
      specimenCode: 'BN-2024-003',
      collection: 'Bambúes Nativos',
      scientificName: 'Guadua angustifolia',
      location: 'Guadua, Colombia',
      latitude: '4.9467',
      longitude: '-75.7645',
      date: '2024-01-08',
      collector: 'Dra. Ana Torres',
      notes: 'Bambú guadua, muestra de culmo'
    },
    {
      id: '7',
      specimenCode: 'LM-2023-042',
      collection: 'Líquenes y Musgos',
      scientificName: 'Sphagnum magellanicum',
      location: 'Páramo, Colombia',
      latitude: '4.7654',
      longitude: '-74.0321',
      date: '2023-07-20',
      collector: 'Dr. Luis Ramírez',
      notes: 'Musgo de turbera, pH ácido'
    },
    {
      id: '8',
      specimenCode: 'PA-2024-012',
      collection: 'Plantas Acuáticas',
      scientificName: 'Victoria amazonica',
      location: 'Pantanal, Brasil',
      latitude: '-16.4356',
      longitude: '-56.6209',
      date: '2024-03-05',
      collector: 'Dra. Patricia Vega',
      notes: 'Nenúfar gigante, hojas hasta 2m de diámetro'
    }
  ]);

  const handleViewClick = (occurrenceId: string) => {
    onNavigate('occurrence-detail', { occurrenceId });
  };

  return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl mb-2">Ocurrencias</h1>
          <p className="text-muted-foreground">
            Registro de ocurrencias a las que tienes acceso
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Ocurrencias Compartidas</CardTitle>
                <CardDescription>
                  {occurrences.length} ocurrencias disponibles para visualizar
                </CardDescription>
              </div>
            </div>
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
