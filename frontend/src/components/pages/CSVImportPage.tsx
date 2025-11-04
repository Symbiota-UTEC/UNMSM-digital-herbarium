import { useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, AlertCircle, X } from "lucide-react";
import { toast } from "sonner@2.0.3";

interface CSVImportPageProps {
    collectionId: string;
    collectionName: string;
    onNavigate: (page: string, params?: Record<string, any>) => void;
}

interface CSVColumn {
    name: string;
    sample: string;
}

interface ColumnMapping {
    [csvColumn: string]: string;
}

const STANDARD_FIELDS = [
    { value: 'ignore', label: 'Ignorar columna' },
    { value: 'code', label: 'Código' },
    { value: 'scientificName', label: 'Nombre Científico' },
    { value: 'family', label: 'Familia' },
    { value: 'genus', label: 'Género' },
    { value: 'species', label: 'Especie' },
    { value: 'location', label: 'Ubicación' },
    { value: 'coordinates', label: 'Coordenadas' },
    { value: 'latitude', label: 'Latitud' },
    { value: 'longitude', label: 'Longitud' },
    { value: 'altitude', label: 'Altitud' },
    { value: 'collector', label: 'Recolector' },
    { value: 'date', label: 'Fecha de Recolección' },
    { value: 'habitat', label: 'Hábitat' },
    { value: 'notes', label: 'Notas' }
];

export function CSVImportPage({ collectionId, collectionName, onNavigate }: CSVImportPageProps) {
    const [csvFile, setCSVFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<CSVColumn[]>([]);
    const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
    const [rowCount, setRowCount] = useState(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                setCSVFile(file);
                parseCSV(file);
            } else {
                toast.error('Por favor selecciona un archivo CSV válido');
            }
        }
    };

    const parseCSV = (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const csvContent = event.target?.result as string;
            const lines = csvContent.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                toast.error('El archivo CSV debe contener al menos un encabezado y una fila de datos');
                return;
            }

            // Extraer encabezados y primera fila como muestra
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const firstDataRow = lines[1].split(',').map(d => d.trim().replace(/^"|"$/g, ''));

            const detectedColumns: CSVColumn[] = headers.map((header, index) => ({
                name: header,
                sample: firstDataRow[index] || ''
            }));

            setColumns(detectedColumns);
            setRowCount(lines.length - 1);

            // Auto-mapeo inicial basado en nombres comunes
            const initialMapping: ColumnMapping = {};
            detectedColumns.forEach(col => {
                const lowerName = col.name.toLowerCase();
                if (lowerName.includes('código') || lowerName.includes('codigo') || lowerName.includes('code')) {
                    initialMapping[col.name] = 'code';
                } else if (lowerName.includes('científico') || lowerName.includes('cientifico') || lowerName.includes('scientific')) {
                    initialMapping[col.name] = 'scientificName';
                } else if (lowerName.includes('familia') || lowerName.includes('family')) {
                    initialMapping[col.name] = 'family';
                } else if (lowerName.includes('ubicación') || lowerName.includes('ubicacion') || lowerName.includes('location')) {
                    initialMapping[col.name] = 'location';
                } else if (lowerName.includes('coordenadas') || lowerName.includes('coordinates')) {
                    initialMapping[col.name] = 'coordinates';
                } else if (lowerName.includes('recolector') || lowerName.includes('collector')) {
                    initialMapping[col.name] = 'collector';
                } else if (lowerName.includes('fecha') || lowerName.includes('date')) {
                    initialMapping[col.name] = 'date';
                } else {
                    initialMapping[col.name] = 'ignore';
                }
            });

            setColumnMapping(initialMapping);
            toast.success(`Archivo cargado: ${lines.length - 1} filas detectadas`);
        };
        reader.readAsText(file);
    };

    const handleMappingChange = (csvColumn: string, standardField: string) => {
        setColumnMapping({
            ...columnMapping,
            [csvColumn]: standardField
        });
    };

    const handleRemoveFile = () => {
        setCSVFile(null);
        setColumns([]);
        setColumnMapping({});
        setRowCount(0);
    };

    const handleImportClick = () => {
        // Validar que al menos los campos obligatorios estén mapeados
        const mappedValues = Object.values(columnMapping);
        const hasCode = mappedValues.includes('code');
        const hasScientificName = mappedValues.includes('scientificName');

        if (!hasCode) {
            toast.error('Debes mapear al menos la columna de Código');
            return;
        }

        if (!hasScientificName) {
            toast.error('Debes mapear al menos la columna de Nombre Científico');
            return;
        }

        setShowConfirmDialog(true);
    };

    const handleConfirmImport = () => {
        setIsProcessing(true);
        setShowConfirmDialog(false);

        // Simular proceso de importación
        setTimeout(() => {
            toast.success(`${rowCount} ocurrencias importadas exitosamente`);
            setIsProcessing(false);
            onNavigate('collection-detail', { collectionId, collectionName, isOwner: true });
        }, 2000);
    };

    const handleCancel = () => {
        onNavigate('collection-detail', { collectionId, collectionName, isOwner: true });
    };

    const getMappedCount = () => {
        return Object.values(columnMapping).filter(v => v !== 'ignore').length;
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
                    Volver a {collectionName}
                </Button>

                <div>
                    <h1 className="text-3xl mb-2">Importar Ocurrencias desde CSV</h1>
                    <p className="text-muted-foreground">
                        Carga un archivo CSV y mapea las columnas a los campos estándar de la aplicación
                    </p>
                </div>
            </div>

            {/* Paso 1: Cargar archivo */}
            {!csvFile ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Paso 1: Selecciona un archivo CSV</CardTitle>
                        <CardDescription>
                            El archivo debe contener una fila de encabezados y los datos de las ocurrencias
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
                            <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                            <div className="mb-4">
                                <label htmlFor="csv-file" className="cursor-pointer">
                  <span className="text-primary hover:underline text-lg">
                    Seleccionar archivo CSV
                  </span>
                                    <input
                                        id="csv-file"
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Formatos aceptados: .csv
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                                Tamaño máximo: 10 MB
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Archivo cargado y mapeo de columnas */}
                    <Card className="mb-6">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Archivo Cargado</CardTitle>
                                    <CardDescription>
                                        {csvFile.name} • {rowCount} filas
                                    </CardDescription>
                                </div>
                                <Button variant="ghost" size="sm" onClick={handleRemoveFile}>
                                    <X className="h-4 w-4 mr-2" />
                                    Cambiar archivo
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Paso 2: Mapeo de Columnas</CardTitle>
                            <CardDescription>
                                Selecciona el campo estándar correspondiente para cada columna del CSV
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Alert className="mb-6">
                                <CheckCircle className="h-4 w-4" />
                                <AlertDescription>
                                    {getMappedCount()} de {columns.length} columnas mapeadas • Los campos Código y Nombre Científico son obligatorios
                                </AlertDescription>
                            </Alert>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Columna del CSV</TableHead>
                                        <TableHead>Ejemplo de Dato</TableHead>
                                        <TableHead>Mapear a Campo Estándar</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {columns.map((column, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{column.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{column.sample}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={columnMapping[column.name] || 'ignore'}
                                                    onValueChange={(value) => handleMappingChange(column.name, value)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {STANDARD_FIELDS.map((field) => (
                                                            <SelectItem key={field.value} value={field.value}>
                                                                {field.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Acciones */}
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleImportClick}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <>
                                    <Upload className="h-4 w-4 mr-2 animate-spin" />
                                    Importando...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Importar {rowCount} Ocurrencias
                                </>
                            )}
                        </Button>
                    </div>
                </>
            )}

            {/* Diálogo de confirmación */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar importación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Estás a punto de importar {rowCount} ocurrencias a la colección "{collectionName}".
                            <br /><br />
                            Esta acción no se puede deshacer. ¿Deseas continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmImport}>
                            Confirmar Importación
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
