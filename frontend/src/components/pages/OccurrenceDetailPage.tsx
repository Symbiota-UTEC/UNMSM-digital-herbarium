import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

interface OccurrenceDetailPageProps {
  occurrenceId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
  returnTo?: 'occurrences' | 'collection';
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

export function OccurrenceDetailPage({ 
  occurrenceId, 
  onNavigate, 
  returnTo = 'occurrences',
  collectionId,
  collectionName,
  isOwner 
}: OccurrenceDetailPageProps) {
  // Datos simulados de la ocurrencia
  const occurrence = {
    // Colección & Registro
    collectionName: collectionName || 'Flora Amazónica 2024',
    catalogNumber: 'BOT-2024-001',
    occurrenceID: 'urn:uuid:a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    recordNumber: 'JP-2024-045',
    preparations: 'Herbarium sheet',
    disposition: 'In collection.ts',
    
    // Evento
    eventDate: '2024-03-15',
    eventDateEnd: '',
    recordedBy: ['Dr. Juan Pérez', 'Dra. Ana Torres'],
    recordedByID: ['https://orcid.org/0000-0001-2345-6789'],
    individualCount: 3,
    samplingProtocol: 'Transecto 50m x 2m',
    
    // Localización
    country: 'Perú',
    stateProvince: 'Amazonas',
    county: 'Condorcanqui',
    municipality: 'El Cenepa',
    locality: 'Río Santiago, sector Wawas, bosque primario húmedo tropical',
    decimalLatitude: -3.2505,
    decimalLongitude: -78.5255,
    geodeticDatum: 'WGS84',
    coordinateUncertainty: 50,
    minimumElevation: 250,
    maximumElevation: 280,
    habitat: 'Bosque primario húmedo tropical, suelo arcilloso con abundante materia orgánica. Vegetación asociada: Cecropia spp., Inga spp.',
    
    // Identificación
    scientificName: 'Cinchona officinalis L.',
    identifiedBy: ['Dr. Carlos Mendoza'],
    identifiedByID: ['https://orcid.org/0000-0002-3456-7890'],
    dateIdentified: '2024-03-20',
    identificationQualifier: '',
    identificationReferences: 'Flora of Ecuador, Vol. 62 (2008)',
    isCurrent: true,
    verificationStatus: 'confirmed',
    identificationRemarks: 'Identificación confirmada por especialista en Rubiaceae',
    typeStatus: '',
    
    // Organismo
    hasOrganism: true,
    organismID: 'urn:uuid:org-123-456-789',
    organismScope: 'individual',
    sex: 'hermaphrodite',
    lifeStage: 'adulto',
    reproductiveCondition: 'en flor',
    establishmentMeans: 'native',
    organismRemarks: 'Árbol de aproximadamente 8m de altura',
    
    // Observaciones
    occurrenceRemarks: 'Espécimen en buen estado de conservación. Flores de color rosado intenso.',
    measurements: [
      { type: 'Altura del árbol', value: '8', unit: 'm' },
      { type: 'DAP', value: '15', unit: 'cm' },
      { type: 'Longitud de hoja', value: '12', unit: 'cm' }
    ],
    
    // Derechos
    license: 'CC-BY-4.0',
    rightsHolder: 'Universidad Nacional de la Amazonía Peruana',
    accessRights: 'Acceso libre para fines educativos y de investigación',
    modified: '2024-03-21T10:30:00Z'
  };

  // Imágenes simuladas
  const [images] = useState([
    {
      id: '1',
      url: 'https://images.unsplash.com/photo-1530027644375-9c83053d392e?w=800',
      title: 'Vista general del espécimen',
      creator: 'Dr. Juan Pérez',
      rightsHolder: 'Universidad Nacional de la Amazonía Peruana'
    },
    {
      id: '2',
      url: 'https://images.unsplash.com/photo-1466781783364-36c955e42a7f?w=800',
      title: 'Detalle de flores',
      creator: 'Dr. Juan Pérez',
      rightsHolder: 'Universidad Nacional de la Amazonía Peruana'
    },
    {
      id: '3',
      url: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=800',
      title: 'Detalle de hojas',
      creator: 'Dra. Ana Torres',
      rightsHolder: 'Universidad Nacional de la Amazonía Peruana'
    }
  ]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const handleBack = () => {
    if (returnTo === 'collection' && collectionId) {
      onNavigate('collection.ts-detail', {
        collectionId, 
        collectionName: collectionName || '',
        isOwner: isOwner || false
      });
    } else {
      onNavigate('occurrences');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo === 'collection' ? `Volver a ${collectionName}` : 'Volver a Ocurrencias'}
        </Button>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl mb-2">{occurrence.scientificName}</h1>
            <p className="text-muted-foreground">
              Código: {occurrence.catalogNumber} | Colección: {occurrence.collectionName}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Columna principal - Información */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Colección & Registro */}
          <Card>
            <CardHeader>
              <CardTitle>Colección & Registro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Colección</p>
                  <p>{occurrence.collectionName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Número de Catálogo</p>
                  <p>{occurrence.catalogNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Número de Registro</p>
                  <p>{occurrence.recordNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Preparación</p>
                  <p>{occurrence.preparations}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Disposición</p>
                  <Badge variant="secondary">{occurrence.disposition}</Badge>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Occurrence ID</p>
                <p className="font-mono text-xs break-all">{occurrence.occurrenceID}</p>
              </div>
            </CardContent>
          </Card>

          {/* 2. Evento de Registro */}
          <Card>
            <CardHeader>
              <CardTitle>Evento de Registro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fecha del Evento</p>
                  <p>{new Date(occurrence.eventDate).toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</p>
                </div>
                {occurrence.individualCount && (
                  <div>
                    <p className="text-sm text-muted-foreground">Número de Individuos</p>
                    <p>{occurrence.individualCount}</p>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Registrado por</p>
                <div className="flex flex-wrap gap-2">
                  {occurrence.recordedBy.map((person, index) => (
                    <Badge key={index} variant="outline">{person}</Badge>
                  ))}
                </div>
              </div>
              
              {occurrence.recordedByID.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">ORCID</p>
                  <div className="flex flex-wrap gap-2">
                    {occurrence.recordedByID.map((id, index) => (
                      <a 
                        key={index} 
                        href={id} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-primary hover:underline"
                      >
                        {id}
                      </a>
                    ))}
                  </div>
                </div>
              )}
              
              {occurrence.samplingProtocol && (
                <div>
                  <p className="text-sm text-muted-foreground">Protocolo de Muestreo</p>
                  <p>{occurrence.samplingProtocol}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Localización */}
          <Card>
            <CardHeader>
              <CardTitle>Localización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">País</p>
                  <p>{occurrence.country}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Departamento/Provincia</p>
                  <p>{occurrence.stateProvince}</p>
                </div>
                {occurrence.county && (
                  <div>
                    <p className="text-sm text-muted-foreground">Provincia/Condado</p>
                    <p>{occurrence.county}</p>
                  </div>
                )}
                {occurrence.municipality && (
                  <div>
                    <p className="text-sm text-muted-foreground">Municipio/Distrito</p>
                    <p>{occurrence.municipality}</p>
                  </div>
                )}
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">Localidad</p>
                <p>{occurrence.locality}</p>
              </div>
              
              <Separator />
              
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Latitud</p>
                  <p className="font-mono">{occurrence.decimalLatitude}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Longitud</p>
                  <p className="font-mono">{occurrence.decimalLongitude}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Datum</p>
                  <p>{occurrence.geodeticDatum}</p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-4">
                {occurrence.coordinateUncertainty && (
                  <div>
                    <p className="text-sm text-muted-foreground">Incertidumbre</p>
                    <p>±{occurrence.coordinateUncertainty}m</p>
                  </div>
                )}
                {occurrence.minimumElevation && (
                  <div>
                    <p className="text-sm text-muted-foreground">Elevación Min</p>
                    <p>{occurrence.minimumElevation}m</p>
                  </div>
                )}
                {occurrence.maximumElevation && (
                  <div>
                    <p className="text-sm text-muted-foreground">Elevación Max</p>
                    <p>{occurrence.maximumElevation}m</p>
                  </div>
                )}
              </div>
              
              {occurrence.habitat && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Hábitat / Sustrato</p>
                    <p className="mt-1">{occurrence.habitat}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 4. Identificación */}
          <Card>
            <CardHeader>
              <CardTitle>Identificación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Nombre Científico</p>
                <p className="text-xl italic">{occurrence.scientificName}</p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de Identificación</p>
                  <p>{new Date(occurrence.dateIdentified).toLocaleDateString('es-ES')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estado de Verificación</p>
                  <Badge variant={occurrence.verificationStatus === 'confirmed' ? 'default' : 'secondary'}>
                    {occurrence.verificationStatus === 'confirmed' ? 'Confirmado' : 
                     occurrence.verificationStatus === 'pending' ? 'Pendiente' :
                     occurrence.verificationStatus === 'provisionally_accepted' ? 'Prov. Aceptado' : 'Rechazado'}
                  </Badge>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Identificado por</p>
                <div className="flex flex-wrap gap-2">
                  {occurrence.identifiedBy.map((person, index) => (
                    <Badge key={index} variant="outline">{person}</Badge>
                  ))}
                </div>
              </div>
              
              {occurrence.identificationReferences && (
                <div>
                  <p className="text-sm text-muted-foreground">Referencias</p>
                  <p>{occurrence.identificationReferences}</p>
                </div>
              )}
              
              {occurrence.identificationRemarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Notas de Identificación</p>
                  <p>{occurrence.identificationRemarks}</p>
                </div>
              )}
              
              {occurrence.typeStatus && (
                <div>
                  <p className="text-sm text-muted-foreground">Estado de Tipo</p>
                  <Badge>{occurrence.typeStatus}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 5. Organismo (si aplica) */}
          {occurrence.hasOrganism && (
            <Card>
              <CardHeader>
                <CardTitle>Organismo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Alcance</p>
                    <p className="capitalize">{occurrence.organismScope}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sexo</p>
                    <p className="capitalize">{occurrence.sex}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado de Vida</p>
                    <p className="capitalize">{occurrence.lifeStage}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Condición Reproductiva</p>
                    <p className="capitalize">{occurrence.reproductiveCondition}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Establecimiento</p>
                    <Badge variant="secondary" className="capitalize">{occurrence.establishmentMeans}</Badge>
                  </div>
                </div>
                {occurrence.organismRemarks && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground">Notas</p>
                      <p>{occurrence.organismRemarks}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 6. Mediciones */}
          {occurrence.measurements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Mediciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {occurrence.measurements.map((measurement, index) => (
                    <div key={index} className="flex justify-between items-center p-2 border rounded">
                      <span className="text-sm">{measurement.type}</span>
                      <span>
                        <span className="mr-1">{measurement.value}</span>
                        <span className="text-sm text-muted-foreground">{measurement.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 7. Observaciones */}
          {occurrence.occurrenceRemarks && (
            <Card>
              <CardHeader>
                <CardTitle>Observaciones</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{occurrence.occurrenceRemarks}</p>
              </CardContent>
            </Card>
          )}

          {/* 8. Derechos */}
          <Card>
            <CardHeader>
              <CardTitle>Derechos & Publicación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Licencia</p>
                  <Badge>{occurrence.license}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Titular de Derechos</p>
                  <p className="text-sm">{occurrence.rightsHolder}</p>
                </div>
              </div>
              {occurrence.accessRights && (
                <div>
                  <p className="text-sm text-muted-foreground">Derechos de Acceso</p>
                  <p className="text-sm">{occurrence.accessRights}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Última Modificación</p>
                <p className="text-sm">{new Date(occurrence.modified).toLocaleString('es-ES')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral - Imágenes */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Multimedia</CardTitle>
              <CardDescription>
                {images.length} {images.length === 1 ? 'imagen' : 'imágenes'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {images.length > 0 ? (
                <div className="space-y-4">
                  <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                    <img 
                      src={images[currentImageIndex].url} 
                      alt={images[currentImageIndex].title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {images.length > 1 && (
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousImage}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      
                      <span className="text-sm text-muted-foreground">
                        {currentImageIndex + 1} / {images.length}
                      </span>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextImage}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Título</p>
                      <p className="text-sm">{images[currentImageIndex].title}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Fotógrafo</p>
                      <p className="text-sm">{images[currentImageIndex].creator}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Titular de Derechos</p>
                      <p className="text-sm">{images[currentImageIndex].rightsHolder}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay imágenes disponibles
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
