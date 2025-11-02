import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ArrowLeft, Plus, X, MapPin, Upload, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Alert, AlertDescription } from "../ui/alert";

interface NewOccurrencePageProps {
  onNavigate: (page: string, params?: Record<string, any>) => void;
  mode?: 'create' | 'edit';
  occurrenceId?: string;
  returnTo?: 'occurrences' | 'collection';
  collectionId?: string;
  collectionName?: string;
  isOwner?: boolean;
}

export function NewOccurrencePage({ 
  onNavigate, 
  mode = 'create',
  occurrenceId,
  returnTo = 'occurrences',
  collectionId,
  collectionName: collectionNameProp,
  isOwner
}: NewOccurrencePageProps) {
  // Generate UUID v4
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const getCurrentDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // 1. Colección & Registro
  const [selectedCollectionId, setSelectedCollectionId] = useState(collectionId || '');
  const [catalogNumber, setCatalogNumber] = useState('');
  const [occurrenceID, setOccurrenceID] = useState(generateUUID());
  const [recordNumber, setRecordNumber] = useState('');
  const [preparations, setPreparations] = useState('');
  const [disposition, setDisposition] = useState('in_collection');
  const [occurrenceIDEdited, setOccurrenceIDEdited] = useState(false);

  // 2. Evento
  const [eventDate, setEventDate] = useState('');
  const [eventDateEnd, setEventDateEnd] = useState('');
  const [recordedBy, setRecordedBy] = useState<string[]>([]);
  const [recordedByInput, setRecordedByInput] = useState('');
  const [recordedByID, setRecordedByID] = useState<string[]>([]);
  const [recordedByIDInput, setRecordedByIDInput] = useState('');
  const [individualCount, setIndividualCount] = useState('');
  const [samplingProtocol, setSamplingProtocol] = useState('');

  // 3. Localización
  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [county, setCounty] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [locality, setLocality] = useState('');
  const [decimalLatitude, setDecimalLatitude] = useState('');
  const [decimalLongitude, setDecimalLongitude] = useState('');
  const [geodeticDatum, setGeodeticDatum] = useState('WGS84');
  const [coordinateUncertainty, setCoordinateUncertainty] = useState('');
  const [minimumElevation, setMinimumElevation] = useState('');
  const [maximumElevation, setMaximumElevation] = useState('');
  const [habitat, setHabitat] = useState('');

  // 4. Identificación
  const [scientificName, setScientificName] = useState('');
  const [identifiedBy, setIdentifiedBy] = useState<string[]>([]);
  const [identifiedByInput, setIdentifiedByInput] = useState('');
  const [identifiedByID, setIdentifiedByID] = useState<string[]>([]);
  const [identifiedByIDInput, setIdentifiedByIDInput] = useState('');
  const [dateIdentified, setDateIdentified] = useState(getCurrentDate());
  const [identificationQualifier, setIdentificationQualifier] = useState('');
  const [identificationReferences, setIdentificationReferences] = useState('');
  const [isCurrent, setIsCurrent] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [identificationRemarks, setIdentificationRemarks] = useState('');
  const [typeStatus, setTypeStatus] = useState('');

  // 5. Organismo
  const [organismOption, setOrganismOption] = useState('none');
  const [organismID, setOrganismID] = useState('');
  const [organismScope, setOrganismScope] = useState('');
  const [sex, setSex] = useState('');
  const [lifeStage, setLifeStage] = useState('');
  const [reproductiveCondition, setReproductiveCondition] = useState('');
  const [establishmentMeans, setEstablishmentMeans] = useState('');
  const [organismRemarks, setOrganismRemarks] = useState('');

  // 6. Medios
  const [mediaFiles, setMediaFiles] = useState<Array<{id: string; file: File; title: string; creator: string; license: string; rightsHolder: string}>>([]);

  // 7. Observaciones & Medidas
  const [occurrenceRemarks, setOccurrenceRemarks] = useState('');
  const [measurements, setMeasurements] = useState<Array<{id: string; type: string; value: string; unit: string}>>([]);

  // 8. Derechos
  const [license, setLicense] = useState('CC-BY-4.0');
  const [rightsHolder, setRightsHolder] = useState('');
  const [accessRights, setAccessRights] = useState('');

  const [activeView, setActiveView] = useState<'quick' | 'advanced'>('quick');

  const handleAddRecordedBy = () => {
    if (recordedByInput.trim()) {
      setRecordedBy([...recordedBy, recordedByInput.trim()]);
      setRecordedByInput('');
    }
  };

  const handleRemoveRecordedBy = (index: number) => {
    setRecordedBy(recordedBy.filter((_, i) => i !== index));
  };

  const handleAddRecordedByID = () => {
    if (recordedByIDInput.trim()) {
      setRecordedByID([...recordedByID, recordedByIDInput.trim()]);
      setRecordedByIDInput('');
    }
  };

  const handleRemoveRecordedByID = (index: number) => {
    setRecordedByID(recordedByID.filter((_, i) => i !== index));
  };

  const handleAddIdentifiedBy = () => {
    if (identifiedByInput.trim()) {
      setIdentifiedBy([...identifiedBy, identifiedByInput.trim()]);
      setIdentifiedByInput('');
    }
  };

  const handleRemoveIdentifiedBy = (index: number) => {
    setIdentifiedBy(identifiedBy.filter((_, i) => i !== index));
  };

  const handleAddIdentifiedByID = () => {
    if (identifiedByIDInput.trim()) {
      setIdentifiedByID([...identifiedByID, identifiedByIDInput.trim()]);
      setIdentifiedByIDInput('');
    }
  };

  const handleRemoveIdentifiedByID = (index: number) => {
    setIdentifiedByID(identifiedByID.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files).map(file => ({
        id: generateUUID(),
        file,
        title: file.name,
        creator: '',
        license: 'CC-BY-4.0',
        rightsHolder: ''
      }));
      setMediaFiles([...mediaFiles, ...newFiles]);
    }
  };

  const handleRemoveMedia = (id: string) => {
    setMediaFiles(mediaFiles.filter(m => m.id !== id));
  };

  const handleAddMeasurement = () => {
    setMeasurements([...measurements, { id: generateUUID(), type: '', value: '', unit: '' }]);
  };

  const handleRemoveMeasurement = (id: string) => {
    setMeasurements(measurements.filter(m => m.id !== id));
  };

  const handleUpdateMeasurement = (id: string, field: string, value: string) => {
    setMeasurements(measurements.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const handleTakeFromMap = () => {
    // Simulación - en producción se abriría un modal con mapa
    setDecimalLatitude('-12.0464');
    setDecimalLongitude('-77.0428');
    setCoordinateUncertainty('100');
    setCountry('Perú');
    setStateProvince('Lima');
    toast.success('Coordenadas tomadas del mapa');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    if (!selectedCollectionId) {
      toast.error('Debes seleccionar una colección');
      return;
    }
    if (!catalogNumber) {
      toast.error('El número de catálogo es requerido');
      return;
    }
    if (!eventDate) {
      toast.error('La fecha del evento es requerida');
      return;
    }

    // En producción aquí se enviaría al backend
    if (mode === 'edit') {
      toast.success('Ocurrencia actualizada exitosamente');
    } else {
      toast.success('Ocurrencia registrada exitosamente');
    }
    
    // Navegar de vuelta
    if (returnTo === 'collection' && collectionId) {
      onNavigate('collection.ts-detail', {
        collectionId, 
        collectionName: collectionNameProp || '',
        isOwner: isOwner ?? false
      });
    } else {
      onNavigate('occurrences');
    }
  };

  const handleCancel = () => {
    if (returnTo === 'collection' && collectionId) {
      onNavigate('collection.ts-detail', {
        collectionId, 
        collectionName: collectionNameProp || '',
        isOwner: isOwner ?? false
      });
    } else {
      onNavigate('occurrences');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={handleCancel}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {returnTo === 'collection' ? `Volver a ${collectionNameProp}` : 'Volver a Ocurrencias'}
        </Button>
        
        <h1 className="text-3xl mb-2">
          {mode === 'edit' ? 'Actualizar Ocurrencia' : 'Nueva Ocurrencia'}
        </h1>
        <p className="text-muted-foreground">
          {mode === 'edit' 
            ? 'Modifica la información del espécimen' 
            : 'Completa la información del espécimen recolectado'}
        </p>
      </div>

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'quick' | 'advanced')} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="quick">Vista Rápida</TabsTrigger>
          <TabsTrigger value="advanced">Vista Avanzada</TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit}>
        <Accordion type="multiple" className="space-y-4">
          {/* Colección & Registro */}
          <AccordionItem value="collection" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Colección & Registro</h3>
                <p className="text-sm text-muted-foreground">
                  Información básica de identificación del registro
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="collection">Colección *</Label>
                <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                  <SelectTrigger id="collection">
                    <SelectValue placeholder="Selecciona una colección" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="col1">Flora Amazónica 2024</SelectItem>
                    <SelectItem value="col2">Herbáceas Andinas</SelectItem>
                    <SelectItem value="col3">Plantas Medicinales Locales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="catalogNumber">Número de Catálogo *</Label>
                <Input
                  id="catalogNumber"
                  value={catalogNumber}
                  onChange={(e) => setCatalogNumber(e.target.value)}
                  placeholder="BOT-2024-001"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="occurrenceID">Occurrence ID (UUID)</Label>
              <div className="flex gap-2">
                <Input
                  id="occurrenceID"
                  value={occurrenceID}
                  onChange={(e) => {
                    setOccurrenceID(e.target.value);
                    setOccurrenceIDEdited(true);
                  }}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOccurrenceID(generateUUID());
                    setOccurrenceIDEdited(false);
                  }}
                >
                  Regenerar
                </Button>
              </div>
              {occurrenceIDEdited && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Has editado manualmente el UUID. Asegúrate de que sea único.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="recordNumber">Número de Registro</Label>
                <Input
                  id="recordNumber"
                  value={recordNumber}
                  onChange={(e) => setRecordNumber(e.target.value)}
                  placeholder="Número de colecta"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preparations">Preparación</Label>
                <Select value={preparations} onValueChange={setPreparations}>
                  <SelectTrigger id="preparations">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="herbarium_sheet">Herbarium sheet</SelectItem>
                    <SelectItem value="alcohol">Alcohol</SelectItem>
                    <SelectItem value="dried">Dried</SelectItem>
                    <SelectItem value="pressed">Pressed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="disposition">Disposición</Label>
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger id="disposition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_collection">In collection</SelectItem>
                    <SelectItem value="on_loan">On loan</SelectItem>
                    <SelectItem value="missing">Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            </AccordionContent>
          </AccordionItem>

          {/* Evento de Registro */}
          <AccordionItem value="event" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Evento de Registro</h3>
                <p className="text-sm text-muted-foreground">
                  Información sobre cuándo y cómo se colectó
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eventDate">Fecha del Evento *</Label>
                <Input
                  id="eventDate"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventDateEnd">Fecha Final (rango opcional)</Label>
                <Input
                  id="eventDateEnd"
                  type="date"
                  value={eventDateEnd}
                  onChange={(e) => setEventDateEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Registrado por (Recorded by)</Label>
              <div className="flex gap-2">
                <Input
                  value={recordedByInput}
                  onChange={(e) => setRecordedByInput(e.target.value)}
                  placeholder="Nombre del recolector"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRecordedBy();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddRecordedBy}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {recordedBy.map((person, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {person}
                    <button
                      type="button"
                      onClick={() => handleRemoveRecordedBy(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recorded by ID (ORCID/URI)</Label>
              <div className="flex gap-2">
                <Input
                  value={recordedByIDInput}
                  onChange={(e) => setRecordedByIDInput(e.target.value)}
                  placeholder="https://orcid.org/0000-0000-0000-0000"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRecordedByID();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddRecordedByID}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {recordedByID.map((id, index) => (
                  <Badge key={index} variant="secondary" className="gap-1 font-mono text-xs">
                    {id}
                    <button
                      type="button"
                      onClick={() => handleRemoveRecordedByID(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="individualCount">Número de Individuos</Label>
                <Input
                  id="individualCount"
                  type="number"
                  min="0"
                  value={individualCount}
                  onChange={(e) => setIndividualCount(e.target.value)}
                  placeholder="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="samplingProtocol">Protocolo de Muestreo</Label>
                <Input
                  id="samplingProtocol"
                  value={samplingProtocol}
                  onChange={(e) => setSamplingProtocol(e.target.value)}
                  placeholder="Ej: Transecto 50m x 2m"
                />
              </div>
            </div>
            </AccordionContent>
          </AccordionItem>

          {/* Localización */}
          <AccordionItem value="location" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Localización</h3>
                <p className="text-sm text-muted-foreground">
                  Información geográfica del lugar de colecta
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">País</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Selecciona un país" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Perú">Perú</SelectItem>
                    <SelectItem value="Brasil">Brasil</SelectItem>
                    <SelectItem value="Colombia">Colombia</SelectItem>
                    <SelectItem value="Ecuador">Ecuador</SelectItem>
                    <SelectItem value="Bolivia">Bolivia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stateProvince">Departamento/Provincia</Label>
                <Input
                  id="stateProvince"
                  value={stateProvince}
                  onChange={(e) => setStateProvince(e.target.value)}
                  placeholder="Ej: Cusco"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="county">Provincia/Condado</Label>
                <Input
                  id="county"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  placeholder="Ej: Urubamba"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="municipality">Municipio/Distrito</Label>
                <Input
                  id="municipality"
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  placeholder="Ej: Ollantaytambo"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locality">Localidad</Label>
              <Textarea
                id="locality"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="Descripción detallada de la localidad"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <Label>Coordenadas</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleTakeFromMap}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Tomar del Mapa
                </Button>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="decimalLatitude">Latitud Decimal</Label>
                  <Input
                    id="decimalLatitude"
                    type="number"
                    step="0.000001"
                    value={decimalLatitude}
                    onChange={(e) => setDecimalLatitude(e.target.value)}
                    placeholder="-12.0464"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="decimalLongitude">Longitud Decimal</Label>
                  <Input
                    id="decimalLongitude"
                    type="number"
                    step="0.000001"
                    value={decimalLongitude}
                    onChange={(e) => setDecimalLongitude(e.target.value)}
                    placeholder="-77.0428"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="geodeticDatum">Datum</Label>
                  <Select value={geodeticDatum} onValueChange={setGeodeticDatum}>
                    <SelectTrigger id="geodeticDatum">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WGS84">WGS84</SelectItem>
                      <SelectItem value="NAD27">NAD27</SelectItem>
                      <SelectItem value="NAD83">NAD83</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coordinateUncertainty">Incertidumbre (m)</Label>
                <Input
                  id="coordinateUncertainty"
                  type="number"
                  min="0"
                  value={coordinateUncertainty}
                  onChange={(e) => setCoordinateUncertainty(e.target.value)}
                  placeholder="100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minimumElevation">Elevación Mínima (m)</Label>
                <Input
                  id="minimumElevation"
                  type="number"
                  value={minimumElevation}
                  onChange={(e) => setMinimumElevation(e.target.value)}
                  placeholder="500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maximumElevation">Elevación Máxima (m)</Label>
                <Input
                  id="maximumElevation"
                  type="number"
                  value={maximumElevation}
                  onChange={(e) => setMaximumElevation(e.target.value)}
                  placeholder="550"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="habitat">Hábitat / Sustrato</Label>
              <Textarea
                id="habitat"
                value={habitat}
                onChange={(e) => setHabitat(e.target.value)}
                placeholder="Descripción del hábitat, tipo de suelo, vegetación asociada..."
                rows={3}
              />
            </div>
            </AccordionContent>
          </AccordionItem>

          {/* Identificación */}
          <AccordionItem value="identification" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Identificación</h3>
                <p className="text-sm text-muted-foreground">
                  Nombre científico y detalles taxonómicos
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="scientificName">Nombre Científico *</Label>
              <Input
                id="scientificName"
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                placeholder="Genus species Author"
                required
              />
              <p className="text-sm text-muted-foreground">
                Comienza a escribir para buscar en la base de datos de taxones
              </p>
            </div>

            <div className="space-y-2">
              <Label>Identificado por</Label>
              <div className="flex gap-2">
                <Input
                  value={identifiedByInput}
                  onChange={(e) => setIdentifiedByInput(e.target.value)}
                  placeholder="Nombre del identificador"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddIdentifiedBy();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddIdentifiedBy}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {identifiedBy.map((person, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {person}
                    <button
                      type="button"
                      onClick={() => handleRemoveIdentifiedBy(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Identified by ID (ORCID/URI)</Label>
              <div className="flex gap-2">
                <Input
                  value={identifiedByIDInput}
                  onChange={(e) => setIdentifiedByIDInput(e.target.value)}
                  placeholder="https://orcid.org/0000-0000-0000-0000"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddIdentifiedByID();
                    }
                  }}
                />
                <Button type="button" onClick={handleAddIdentifiedByID}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {identifiedByID.map((id, index) => (
                  <Badge key={index} variant="secondary" className="gap-1 font-mono text-xs">
                    {id}
                    <button
                      type="button"
                      onClick={() => handleRemoveIdentifiedByID(index)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateIdentified">Fecha de Identificación</Label>
                <Input
                  id="dateIdentified"
                  type="date"
                  value={dateIdentified}
                  onChange={(e) => setDateIdentified(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identificationQualifier">Calificador</Label>
                <Select value={identificationQualifier} onValueChange={setIdentificationQualifier}>
                  <SelectTrigger id="identificationQualifier">
                    <SelectValue placeholder="Selecciona calificador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin calificador</SelectItem>
                    <SelectItem value="cf.">cf. (confer)</SelectItem>
                    <SelectItem value="aff.">aff. (affinis)</SelectItem>
                    <SelectItem value="sp.">sp. (especie indeterminada)</SelectItem>
                    <SelectItem value="s.l.">s.l. (sensu lato)</SelectItem>
                    <SelectItem value="s.s.">s.s. (sensu stricto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="identificationReferences">Referencias / According to</Label>
              <Input
                id="identificationReferences"
                value={identificationReferences}
                onChange={(e) => setIdentificationReferences(e.target.value)}
                placeholder="Fuente, URL o referencia bibliográfica"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isCurrent"
                checked={isCurrent}
                onCheckedChange={(checked) => setIsCurrent(checked as boolean)}
              />
              <Label htmlFor="isCurrent" className="cursor-pointer">
                Esta es la identificación vigente
              </Label>
            </div>

            {activeView === 'advanced' && (
              <Accordion type="single" collapsible>
                <AccordionItem value="advanced-identification">
                  <AccordionTrigger>Opciones Avanzadas de Identificación</AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="verificationStatus">Estado de Verificación</Label>
                      <Select value={verificationStatus} onValueChange={setVerificationStatus}>
                        <SelectTrigger id="verificationStatus">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="provisionally_accepted">Provisionalmente aceptado</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="rejected">Rechazado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="typeStatus">Estado de Tipo</Label>
                      <Select value={typeStatus} onValueChange={setTypeStatus}>
                        <SelectTrigger id="typeStatus">
                          <SelectValue placeholder="Selecciona si aplica" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No es tipo</SelectItem>
                          <SelectItem value="holotype">Holotipo</SelectItem>
                          <SelectItem value="isotype">Isotipo</SelectItem>
                          <SelectItem value="paratype">Paratipo</SelectItem>
                          <SelectItem value="syntype">Sintipo</SelectItem>
                          <SelectItem value="lectotype">Lectotipo</SelectItem>
                          <SelectItem value="neotype">Neotipo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="identificationRemarks">Notas de Identificación</Label>
                      <Textarea
                        id="identificationRemarks"
                        value={identificationRemarks}
                        onChange={(e) => setIdentificationRemarks(e.target.value)}
                        placeholder="Comentarios adicionales sobre la identificación"
                        rows={3}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            </AccordionContent>
          </AccordionItem>

          {/* Organismo (Avanzado) */}
          {activeView === 'advanced' && (
          <AccordionItem value="organism" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Organismo (Opcional)</h3>
                <p className="text-sm text-muted-foreground">
                  Agrupa múltiples ocurrencias del mismo individuo
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <RadioGroup value={organismOption} onValueChange={setOrganismOption}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="organism-none" />
                  <Label htmlFor="organism-none" className="cursor-pointer">
                    No agrupar (sin Organism)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="existing" id="organism-existing" />
                  <Label htmlFor="organism-existing" className="cursor-pointer">
                    Asociar a Organism existente
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="organism-new" />
                  <Label htmlFor="organism-new" className="cursor-pointer">
                    Crear nuevo Organism
                  </Label>
                </div>
              </RadioGroup>

              {organismOption === 'new' && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="organismID">Organism ID (UUID)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="organismID"
                        value={organismID}
                        onChange={(e) => setOrganismID(e.target.value)}
                        placeholder="Auto-generado"
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOrganismID(generateUUID())}
                      >
                        Generar
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="organismScope">Alcance del Organismo</Label>
                      <Select value={organismScope} onValueChange={setOrganismScope}>
                        <SelectTrigger id="organismScope">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="colony">Colonia</SelectItem>
                          <SelectItem value="clone">Clon</SelectItem>
                          <SelectItem value="population_sample">Muestra poblacional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sex">Sexo</Label>
                      <Select value={sex} onValueChange={setSex}>
                        <SelectTrigger id="sex">
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Masculino</SelectItem>
                          <SelectItem value="female">Femenino</SelectItem>
                          <SelectItem value="hermaphrodite">Hermafrodita</SelectItem>
                          <SelectItem value="unknown">Desconocido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lifeStage">Estado de Vida</Label>
                      <Input
                        id="lifeStage"
                        value={lifeStage}
                        onChange={(e) => setLifeStage(e.target.value)}
                        placeholder="Ej: adulto, juvenil, plántula"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reproductiveCondition">Condición Reproductiva</Label>
                      <Input
                        id="reproductiveCondition"
                        value={reproductiveCondition}
                        onChange={(e) => setReproductiveCondition(e.target.value)}
                        placeholder="Ej: en flor, con frutos"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="establishmentMeans">Medio de Establecimiento</Label>
                    <Select value={establishmentMeans} onValueChange={setEstablishmentMeans}>
                      <SelectTrigger id="establishmentMeans">
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="native">Nativo</SelectItem>
                        <SelectItem value="introduced">Introducido</SelectItem>
                        <SelectItem value="cultivated">Cultivado</SelectItem>
                        <SelectItem value="invasive">Invasivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="organismRemarks">Notas sobre el Organismo</Label>
                    <Textarea
                      id="organismRemarks"
                      value={organismRemarks}
                      onChange={(e) => setOrganismRemarks(e.target.value)}
                      placeholder="Comentarios adicionales"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Multimedia (Avanzado) */}
          {activeView === 'advanced' && (
          <AccordionItem value="multimedia" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Multimedia</h3>
                <p className="text-sm text-muted-foreground">
                  Imágenes y archivos asociados al espécimen
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="media-upload">Subir Imágenes</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <div className="mb-2">
                    <label htmlFor="media-upload" className="cursor-pointer text-primary hover:underline">
                      Seleccionar archivos
                    </label>
                    <input
                      id="media-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formatos: JPG, PNG, TIFF
                  </p>
                </div>
              </div>

              {mediaFiles.length > 0 && (
                <div className="space-y-3">
                  {mediaFiles.map((media) => (
                    <div key={media.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <p className="truncate">{media.title}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMedia(media.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Creador</Label>
                          <Input
                            value={media.creator}
                            onChange={(e) => {
                              setMediaFiles(mediaFiles.map(m => 
                                m.id === media.id ? {...m, creator: e.target.value} : m
                              ));
                            }}
                            placeholder="Nombre del fotógrafo"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Titular de Derechos</Label>
                          <Input
                            value={media.rightsHolder}
                            onChange={(e) => {
                              setMediaFiles(mediaFiles.map(m => 
                                m.id === media.id ? {...m, rightsHolder: e.target.value} : m
                              ));
                            }}
                            placeholder="Institución o persona"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Observaciones & Medidas (Avanzado) */}
          {activeView === 'advanced' && (
          <AccordionItem value="observations" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Observaciones & Medidas</h3>
                <p className="text-sm text-muted-foreground">
                  Notas adicionales y mediciones
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="occurrenceRemarks">Observaciones del Registro</Label>
                <Textarea
                  id="occurrenceRemarks"
                  value={occurrenceRemarks}
                  onChange={(e) => setOccurrenceRemarks(e.target.value)}
                  placeholder="Notas generales sobre la ocurrencia"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Mediciones (MeasurementOrFact)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddMeasurement}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Medida
                  </Button>
                </div>
                
                {measurements.length > 0 && (
                  <div className="space-y-3">
                    {measurements.map((measurement) => (
                      <div key={measurement.id} className="border rounded-lg p-3">
                        <div className="flex gap-2">
                          <Input
                            value={measurement.type}
                            onChange={(e) => handleUpdateMeasurement(measurement.id, 'type', e.target.value)}
                            placeholder="Tipo (ej: altura)"
                            className="flex-1"
                          />
                          <Input
                            value={measurement.value}
                            onChange={(e) => handleUpdateMeasurement(measurement.id, 'value', e.target.value)}
                            placeholder="Valor"
                            className="flex-1"
                          />
                          <Input
                            value={measurement.unit}
                            onChange={(e) => handleUpdateMeasurement(measurement.id, 'unit', e.target.value)}
                            placeholder="Unidad"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMeasurement(measurement.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          )}

          {/* Derechos & Publicación (Avanzado) */}
          {activeView === 'advanced' && (
          <AccordionItem value="rights" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="text-left">
                <h3 className="text-lg">Derechos & Publicación</h3>
                <p className="text-sm text-muted-foreground">
                  Licencia y permisos de uso
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="license">Licencia</Label>
                <Select value={license} onValueChange={setLicense}>
                  <SelectTrigger id="license">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC0">CC0 (Dominio Público)</SelectItem>
                    <SelectItem value="CC-BY-4.0">CC BY 4.0</SelectItem>
                    <SelectItem value="CC-BY-NC-4.0">CC BY-NC 4.0</SelectItem>
                    <SelectItem value="CC-BY-SA-4.0">CC BY-SA 4.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rightsHolderGeneral">Titular de Derechos</Label>
                <Input
                  id="rightsHolderGeneral"
                  value={rightsHolder}
                  onChange={(e) => setRightsHolder(e.target.value)}
                  placeholder="Nombre de la institución o persona"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessRights">Derechos de Acceso</Label>
                <Textarea
                  id="accessRights"
                  value={accessRights}
                  onChange={(e) => setAccessRights(e.target.value)}
                  placeholder="Información sobre restricciones o condiciones de acceso"
                  rows={2}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Los campos de modificación se actualizarán automáticamente al guardar
                </AlertDescription>
              </Alert>
            </AccordionContent>
          </AccordionItem>
          )}
        </Accordion>

        {/* Botones de Acción */}
        <div className="flex gap-4 justify-end sticky bottom-0 bg-background py-4 border-t mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button type="submit">
            {mode === 'edit' ? 'Guardar Cambios' : 'Guardar Ocurrencia'}
          </Button>
        </div>
      </form>
    </div>
  );
}
