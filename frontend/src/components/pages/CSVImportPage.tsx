import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from "../ui/alert-dialog";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, X, Info, Download } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import Papa from 'papaparse';

interface CSVImportPageProps {
    collectionId: string;
    collectionName: string;
    onNavigate: (page: string, params?: Record<string, any>) => void;
}

interface CSVColumn {
    name: string;
    sample: string;
}

type DwCEntity = "Occurrence" | "Event" | "Location" | "Taxon";
interface DwCFieldOption {
    value: string;
    label: string;
    entity: DwCEntity;
    term: string;
    recommended?: boolean;
    required?: boolean;
}

interface ColumnMapping {
    [csvColumn: string]: string;
}

type DatasetModel = "Occurrence";

// Definición de campos DwC (solo los propios para nuevo dataset de ocurrencias)
const DWC_FIELDS: Record<DatasetModel, DwCFieldOption[]> = {
    Occurrence: [
        // Occurrence
        { entity: "Occurrence", term: "occurrenceID", value: "Occurrence.occurrenceID", label: "dwc:Occurrence:occurrenceID" },
        { entity: "Occurrence", term: "catalogNumber", value: "Occurrence.catalogNumber", label: "dwc:Occurrence:catalogNumber", required: true, recommended: true },
        { entity: "Occurrence", term: "recordNumber", value: "Occurrence.recordNumber", label: "dwc:Occurrence:recordNumber" },
        { entity: "Occurrence", term: "recordedBy", value: "Occurrence.recordedBy", label: "dwc:Occurrence:recordedBy", recommended: true },
        { entity: "Occurrence", term: "recordEnteredBy", value: "Occurrence.recordEnteredBy", label: "dwc:Occurrence:recordEnteredBy" },
        { entity: "Occurrence", term: "individualCount", value: "Occurrence.individualCount", label: "dwc:Occurrence:individualCount" },
        { entity: "Occurrence", term: "occurrenceStatus", value: "Occurrence.occurrenceStatus", label: "dwc:Occurrence:occurrenceStatus" },
        { entity: "Occurrence", term: "preparations", value: "Occurrence.preparations", label: "dwc:Occurrence:preparations" },
        { entity: "Occurrence", term: "disposition", value: "Occurrence.disposition", label: "dwc:Occurrence:disposition" },
        { entity: "Occurrence", term: "occurrenceRemarks", value: "Occurrence.occurrenceRemarks", label: "dwc:Occurrence:occurrenceRemarks" },
        { entity: "Occurrence", term: "modified", value: "Occurrence.modified", label: "dwc:Occurrence:modified" },
        { entity: "Occurrence", term: "license", value: "Occurrence.license", label: "dwc:Occurrence:license" },
        { entity: "Occurrence", term: "rightsHolder", value: "Occurrence.rightsHolder", label: "dwc:Occurrence:rightsHolder" },
        { entity: "Occurrence", term: "accessRights", value: "Occurrence.accessRights", label: "dwc:Occurrence:accessRights" },
        { entity: "Occurrence", term: "bibliographicCitation", value: "Occurrence.bibliographicCitation", label: "dwc:Occurrence:bibliographicCitation" },
        // Event
        { entity: "Event", term: "eventDate", value: "Event.eventDate", label: "dwc:Event:eventDate", recommended: true },
        { entity: "Event", term: "year", value: "Event.year", label: "dwc:Event:year" },
        { entity: "Event", term: "month", value: "Event.month", label: "dwc:Event:month" },
        { entity: "Event", term: "day", value: "Event.day", label: "dwc:Event:day" },
        { entity: "Event", term: "verbatimEventDate", value: "Event.verbatimEventDate", label: "dwc:Event:verbatimEventDate" },
        { entity: "Event", term: "fieldNumber", value: "Event.fieldNumber", label: "dwc:Event:fieldNumber" },
        { entity: "Event", term: "samplingProtocol", value: "Event.samplingProtocol", label: "dwc:Event:samplingProtocol" },
        { entity: "Event", term: "samplingEffort", value: "Event.samplingEffort", label: "dwc:Event:samplingEffort" },
        { entity: "Event", term: "habitat", value: "Event.habitat", label: "dwc:Event:habitat" },
        { entity: "Event", term: "eventRemarks", value: "Event.eventRemarks", label: "dwc:Event:eventRemarks" },
        // Location
        { entity: "Location", term: "stateProvince", value: "Location.stateProvince", label: "dwc:Location:stateProvince" },
        { entity: "Location", term: "county", value: "Location.county", label: "dwc:Location:county" },
        { entity: "Location", term: "municipality", value: "Location.municipality", label: "dwc:Location:municipality" },
        { entity: "Location", term: "locality", value: "Location.locality", label: "dwc:Location:locality", recommended: true },
        { entity: "Location", term: "verbatimLocality", value: "Location.verbatimLocality", label: "dwc:Location:verbatimLocality" },
        { entity: "Location", term: "decimalLatitude", value: "Location.decimalLatitude", label: "dwc:Location:decimalLatitude" },
        { entity: "Location", term: "decimalLongitude", value: "Location.decimalLongitude", label: "dwc:Location:decimalLongitude" },
        { entity: "Location", term: "geodeticDatum", value: "Location.geodeticDatum", label: "dwc:Location:geodeticDatum" },
        { entity: "Location", term: "coordinateUncertaintyInMeters", value: "Location.coordinateUncertaintyInMeters", label: "dwc:Location:coordinateUncertaintyInMeters" },
        { entity: "Location", term: "coordinatePrecision", value: "Location.coordinatePrecision", label: "dwc:Location:coordinatePrecision" },
        { entity: "Location", term: "minimumElevationInMeters", value: "Location.minimumElevationInMeters", label: "dwc:Location:minimumElevationInMeters" },
        { entity: "Location", term: "maximumElevationInMeters", value: "Location.maximumElevationInMeters", label: "dwc:Location:maximumElevationInMeters" },
        { entity: "Location", term: "verbatimElevation", value: "Location.verbatimElevation", label: "dwc:Location:verbatimElevation" },
        // Taxon
        { entity: "Taxon", term: "scientificName", value: "Taxon.scientificName", label: "dwc:Taxon:scientificName", required: true, recommended: true },
        { entity: "Taxon", term: "scientificNameAuthorship", value: "Taxon.scientificNameAuthorship", label: "dwc:Taxon:scientificNameAuthorship" },
        { entity: "Taxon", term: "family", value: "Taxon.family", label: "dwc:Taxon:family", recommended: true },
        { entity: "Taxon", term: "genus", value: "Taxon.genus", label: "dwc:Taxon:genus", recommended: true },
        { entity: "Taxon", term: "specificEpithet", value: "Taxon.specificEpithet", label: "dwc:Taxon:specificEpithet" },
        { entity: "Taxon", term: "infraspecificEpithet", value: "Taxon.infraspecificEpithet", label: "dwc:Taxon:infraspecificEpithet" },
        { entity: "Taxon", term: "taxonRank", value: "Taxon.taxonRank", label: "dwc:Taxon:taxonRank" },
        { entity: "Taxon", term: "acceptedNameUsage", value: "Taxon.acceptedNameUsage", label: "dwc:Taxon:acceptedNameUsage" }
    ]
};

const IGNORE_OPTION: DwCFieldOption = {
    entity: "Occurrence",
    term: "ignore",
    value: "ignore",
    label: "Ignorar columna"
};

// ==============================
// Sinónimos y heurísticas de auto-mapeo
// ==============================
const AUTO_MAP_RULES: Array<{ pattern: RegExp; target: string }> = [
    // Occurrence
    { pattern: /\b(occurrence[_\s-]?id|id\s*dwc)\b/i, target: "Occurrence.occurrenceID" },
    { pattern: /\b(c(ó|o)digo|codigo|code|catalog(ue)?\s*number|catalogo|catalog-number|cat\s*#|cat\s*no\.?)\b/i, target: "Occurrence.catalogNumber" },
    { pattern: /\b(record\s*number|n[°º]?\s*colecta|nro\s*colecta|num\s*colecta)\b/i, target: "Occurrence.recordNumber" },
    { pattern: /\b(recorded\s*by|colector|collector|col\.)\b/i, target: "Occurrence.recordedBy" },
    {
        pattern: /\b(?:record\s*(?:entered|creator|author)\s*by|entered\s*by|data[-\s]*entry(?:\s*by)?|dcterms[:\s]*creator|registrador(?:a)?|registrad[oa]\s*por|ingresad[oa]\s*por|capturad[oa]\s*por|cread[oa]\s*por|transcrit[oa]\s*por|creador\s*del\s*registro|editor\s*del\s*registro|responsable\s*del\s*registro|qui[eé]n\s*registr[óo])\b/i,
        target: "Occurrence.recordEnteredBy"
    },
    { pattern: /\b(remarks?|observaciones?|notes?)\b/i, target: "Occurrence.occurrenceRemarks" },
    { pattern: /\b(preparations?)\b/i, target: "Occurrence.preparations" },
    { pattern: /\b(disposition)\b/i, target: "Occurrence.disposition" },
    { pattern: /\b(status)\b/i, target: "Occurrence.occurrenceStatus" },
    { pattern: /\b(modified|ultima\s*modificacion|última\s*modificación)\b/i, target: "Occurrence.modified" },
    { pattern: /\b(license|licencia)\b/i, target: "Occurrence.license" },
    { pattern: /\b(rights\s*holder|titular\s*de\s*los\s*derechos)\b/i, target: "Occurrence.rightsHolder" },
    { pattern: /\b(access\s*rights|acceso)\b/i, target: "Occurrence.accessRights" },
    { pattern: /\b(bibliographic\s*citation|cita\s*bibliografica)\b/i, target: "Occurrence.bibliographicCitation" },
    // Event
    { pattern: /\b(event\s*date|fecha(\s*de)?\s*(colecta|colecci(ó|o)n)|fecha\s*evento)\b/i, target: "Event.eventDate" },
    { pattern: /\b(year|a(ñ|n)o)\b/i, target: "Event.year" },
    { pattern: /\b(month|mes)\b/i, target: "Event.month" },
    { pattern: /\b(day|d(í|i)a)\b/i, target: "Event.day" },
    { pattern: /\b(verbatim\s*event\s*date|fecha\s*verbatim|fecha\s*texto)\b/i, target: "Event.verbatimEventDate" },
    { pattern: /\b(field\s*number|n(°|º)?\s*de\s*campo)\b/i, target: "Event.fieldNumber" },
    { pattern: /\b(sampling\s*protocol|protocolo)\b/i, target: "Event.samplingProtocol" },
    { pattern: /\b(sampling\s*effort|esfuerzo)\b/i, target: "Event.samplingEffort" },
    { pattern: /\b(habitat|hábitat)\b/i, target: "Event.habitat" },
    { pattern: /\b(event\s*remarks?)\b/i, target: "Event.eventRemarks" },
    // Location
    { pattern: /\b(state\s*province|departamento|regi(ó|o)n)\b/i, target: "Location.stateProvince" },
    { pattern: /\b(county|provincia)\b/i, target: "Location.county" },
    { pattern: /\b(municipality|distrito|municipalidad)\b/i, target: "Location.municipality" },
    { pattern: /\b(localidad|locality|ciudad|pueblo|comunidad)\b/i, target: "Location.locality" },
    { pattern: /\b(verbatim\s*locality|localidad\s*verbatim)\b/i, target: "Location.verbatimLocality" },
    { pattern: /\b(lat(itud)?|lat\.)\b/i, target: "Location.decimalLatitude" },
    { pattern: /\b(lon(gitud)?|lng|long\.)\b/i, target: "Location.decimalLongitude" },
    { pattern: /\b(geodetic\s*datum|datum)\b/i, target: "Location.geodeticDatum" },
    { pattern: /\b(uncertainty|incertidumbre)\b/i, target: "Location.coordinateUncertaintyInMeters" },
    { pattern: /\b(precision|precisi(ó|o)n)\b/i, target: "Location.coordinatePrecision" },
    { pattern: /\b(altitud|elevaci(ó|o)n\s*m((e|é)tros?)?)\b/i, target: "Location.minimumElevationInMeters" },
    { pattern: /\b(elevaci(ó|o)n\s*m(á|a)x(ima)?)\b/i, target: "Location.maximumElevationInMeters" },
    { pattern: /\b(verbatim\s*elev(ation)?|altitud\s*verbatim)\b/i, target: "Location.verbatimElevation" },
    // Taxon
    { pattern: /\b(scientific\s*name|nombre\s*cient(í|i)fico)\b/i, target: "Taxon.scientificName" },
    { pattern: /\b(author(ship)?|aut(ó|o)r)\b/i, target: "Taxon.scientificNameAuthorship" },
    { pattern: /\b(family|familia)\b/i, target: "Taxon.family" },
    { pattern: /\b(genus|g(é|e)nero)\b/i, target: "Taxon.genus" },
    { pattern: /\b(specific\s*epithet|ep(í|i)teto\s*(espec(í|i)fico)?|especie\b)\b/i, target: "Taxon.specificEpithet" },
    { pattern: /\b(infraspecific\s*epithet|infra(espec(í|i)fico)?|subsp|var\.?)\b/i, target: "Taxon.infraspecificEpithet" },
    { pattern: /\b(rank|rango|taxon\s*rank)\b/i, target: "Taxon.taxonRank" }
];



type Guess = { text: string; encoding: string; source: "bom" | "heuristic" };

const ENCODING_CANDIDATES = [
  "utf-8",
  "windows-1252",
  "iso-8859-1",
  "iso-8859-15",
  "macintosh",
] as const;

const decodeWith = (bytes: Uint8Array, enc: string): string => {
  let out = new TextDecoder(enc as any, { fatal: false }).decode(bytes);
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1);
  return out;
};

const hasManyReplacements = (s: string) => (s.match(/\uFFFD/g) || []).length;
const countControlWeird = (s: string) => {
  let bad = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) bad++;
  }
  return bad;
};
const looksLikeUTF8Misdecoded = (s: string) => /Ã[\x80-\xBFÀ-ÿA-Za-z]/.test(s);
const countSpanishDiacritics = (s: string) =>
  (s.match(/[áéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;

const scoreDecoded = (s: string) => {
  const rep = hasManyReplacements(s);
  const ctrl = countControlWeird(s);
  const mis = looksLikeUTF8Misdecoded(s) ? 5 : 0;
  const diac = countSpanishDiacritics(s);
  return diac * 3 - rep * 10 - ctrl * 2 - mis * 8;
};

const detectBOM = (bytes: Uint8Array): { enc?: string; offset: number } => {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { enc: "utf-8", offset: 3 };
  }
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { enc: "utf-16le", offset: 2 };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { enc: "utf-16be", offset: 2 };
  }
  return { offset: 0 };
};

export const guessDecode = (bytes: Uint8Array): Guess => {
  const bom = detectBOM(bytes);
  if (bom.enc) {
    try {
      const txt = decodeWith(bytes.subarray(bom.offset), bom.enc);
      return { text: txt, encoding: bom.enc, source: "bom" };
    } catch { /* fall-through */ }
  }

  try {
    const utf8 = decodeWith(bytes, "utf-8");
    const bad = hasManyReplacements(utf8);
    if (bad === 0 && !looksLikeUTF8Misdecoded(utf8)) {
      return { text: utf8, encoding: "utf-8", source: "heuristic" };
    }
  } catch {}

  let best: { enc: string; text: string; score: number } | null = null;
  for (const enc of ENCODING_CANDIDATES) {
    try {
      const txt = decodeWith(bytes, enc);
      const sc = scoreDecoded(txt);
      if (!best || sc > best.score) best = { enc, text: txt, score: sc };
    } catch { }
  }
  if (best) return { text: best.text, encoding: best.enc, source: "heuristic" };

  return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8", source: "heuristic" };
};

export const readFileBytes = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer | null;
      if (!buf) return resolve(new Uint8Array());
      resolve(new Uint8Array(buf));
    };
    fr.onerror = reject;
    fr.readAsArrayBuffer(file);
  });

const splitCSVLine = (line: string): string[] => {
    const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g);
    return parts.map((c) => {
        let v = c.trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        v = v.replace(/""/g, '"');
        return v;
    });
};

const parseCSVAll = (csvContent: string): { headers: string[]; rows: string[][] } => {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = splitCSVLine(lines[0]);
    const rows = lines.slice(1).map(splitCSVLine);
    return { headers, rows };
};

const csvEscape = (v: string): string => {
    if (/[",\n\r]/.test(v)) {
        return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
};

const labelFor = (opt: DwCFieldOption) => opt.label;


export function CSVImportPage({ collectionId, collectionName, onNavigate }: CSVImportPageProps) {
    const { token } = useAuth();

    const [datasetModel, setDatasetModel] = useState<DatasetModel>("Occurrence");
    const [csvFile, setCSVFile] = useState<File | null>(null);

    const [csvBytes, setCsvBytes] = useState<Uint8Array | null>(null);
    const [encodingUsed, setEncodingUsed] = useState<string>("utf-8");
    const [encodingAuto, setEncodingAuto] = useState<boolean>(true);

    const [rawCSVText, setRawCSVText] = useState<string>("");
    const [csvHeaders, setCSVHeaders] = useState<string[]>([]);
    const [csvRows, setCSVRows] = useState<string[][]>([]);

    const [columns, setColumns] = useState<CSVColumn[]>([]);
    const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
    const [rowCount, setRowCount] = useState(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const FIELD_OPTIONS: DwCFieldOption[] = useMemo(() => {
        const base = DWC_FIELDS[datasetModel];
        return [IGNORE_OPTION, ...base];
    }, [datasetModel]);

    const REQUIRED_VALUES = useMemo(() => ({
        alternatives: [["Occurrence.catalogNumber", "Occurrence.occurrenceID"]],
        required: [] // ["Taxon.scientificName"]
    }), []);

    const headerDupReport = useMemo(() => {
        const byDwc: Record<string, string[]> = {};
        Object.entries(columnMapping).forEach(([csvHeader, dwcPath]) => {
            if (!dwcPath || dwcPath === "ignore") return;
            if (!byDwc[dwcPath]) byDwc[dwcPath] = [];
            byDwc[dwcPath].push(csvHeader);
        });

        const duplicates = Object.entries(byDwc)
            .filter(([, cols]) => cols.length > 1)
            .map(([dwcPath, cols]) => {
                const opt = FIELD_OPTIONS.find((o) => o.value === dwcPath);
                const label = opt ? opt.label : `dwc:${dwcPath.replace(".", ":")}`;
                return { dwcPath, label, csvColumns: cols };
            });

        return { hasDuplicates: duplicates.length > 0, duplicates };
    }, [columnMapping, FIELD_OPTIONS]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!(file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv"))) {
            toast.error("Por favor, selecciona un archivo .csv");
            return;
        }
        try {
            setCSVFile(file);
            setIsProcessing(true);

            // 1) bytes crudos
            const bytes = await readFileBytes(file);
            setCsvBytes(bytes);

            // 2) decodificación inteligente
            const { text, encoding } = guessDecode(bytes);
            setEncodingUsed(encoding);
            setEncodingAuto(true);

            // 3) parse con tus utilidades existentes
            const { headers, rows } = parseCSVAll(text);
            if (headers.length === 0 || rows.length === 0) {
                toast.error("El archivo CSV debe tener encabezados y al menos una fila de datos");
                setIsProcessing(false);
                return;
            }

            setRawCSVText(text);
            setCSVHeaders(headers);
            setCSVRows(rows);
            setRowCount(rows.length);

            const first = rows[0] || [];
            const detected: CSVColumn[] = headers.map((h, idx) => ({
                name: h.trim(),
                sample: first[idx] || ""
            }));
            setColumns(detected);

            const mapping: ColumnMapping = {};
            detected.forEach((col) => {
                const name = col.name;
                let mapped = "ignore";
                for (const rule of AUTO_MAP_RULES) {
                    if (rule.pattern.test(name)) { mapped = rule.target; break; }
                }
                mapping[name] = mapped;
            });
            setColumnMapping(mapping);

            toast.success(`Archivo cargado (${encoding}). Filas detectadas: ${rows.length}`);
        } catch (err) {
            console.error(err);
            toast.error("No se pudo leer el CSV.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleEncodingChange = (enc: string) => {
        if (!csvBytes) return;
        try {
            const text = decodeWith(csvBytes, enc);
            // re-parsea
            const { headers, rows } = parseCSVAll(text);
            setRawCSVText(text);
            setCSVHeaders(headers);
            setCSVRows(rows);
            setRowCount(rows.length);

            const first = rows[0] || [];
            const detected: CSVColumn[] = headers.map((h, idx) => ({
                name: h.trim(),
                sample: first[idx] || ""
            }));
            setColumns(detected);
            // mantenemos tus mapeos actuales si los headers coinciden;
            // si no, los reseteamos por seguridad:
            setColumnMapping((prev) => {
                const newMap: ColumnMapping = {};
                const prevKeys = new Set(Object.keys(prev));
                headers.forEach((h) => {
                    if (prevKeys.has(h)) newMap[h] = prev[h];
                    else newMap[h] = "ignore";
                });
                return newMap;
            });

            setEncodingUsed(enc);
            setEncodingAuto(false);
            toast.success(`Codificación aplicada: ${enc}`);
        } catch (err) {
            console.error(err);
            toast.error(`No se pudo decodificar como ${enc}`);
        }
    };

    const handleMappingChange = (csvColumn: string, value: string) => {
        setColumnMapping((prev) => ({ ...prev, [csvColumn]: value }));
    };

    const handleRemoveFile = () => {
        setCSVFile(null);
        setCsvBytes(null);
        setEncodingUsed("utf-8");
        setEncodingAuto(true);
        setColumns([]);
        setColumnMapping({});
        setRowCount(0);
        setRawCSVText("");
        setCSVHeaders([]);
        setCSVRows([]);
    };

    const validateRequired = (): { ok: boolean; messages: string[] } => {
        const chosen = Object.values(columnMapping);
        const messages: string[] = [];
        for (const group of REQUIRED_VALUES.alternatives) {
            if (!group.some((g) => chosen.includes(g))) {
                messages.push(`Debes mapear al menos uno: ${group.map((g) => `dwc:${g.replace(".", ":")}`).join(" o ")}`);
            }
        }
        for (const req of REQUIRED_VALUES.required) {
            if (!chosen.includes(req)) {
                messages.push(`Campo obligatorio no mapeado: dwc:${req.replace(".", ":")}`);
            }
        }
        return { ok: messages.length === 0, messages };
    };

    const handleImportClick = () => {
        const { ok, messages } = validateRequired();
        if (!ok) { messages.forEach((m) => toast.error(m)); return; }
        if (headerDupReport.hasDuplicates) {
            headerDupReport.duplicates.forEach((d) => {
                toast.error(`Encabezado duplicado ${d.label}. Columnas: ${d.csvColumns.join(", ")}`);
            });
            return;
        }
        setShowConfirmDialog(true);
    };

    // ======= construir CSV mapeado con headers dwc:Entidad:termino =======
    const buildMappedCSV = (): string => {
        const mappedCols: Array<{ csvIndex: number; csvHeader: string; dwcValue: string; dwcLabel: string; }> = [];
        const dwcByHeader: Record<string, string> = {};

        Object.entries(columnMapping).forEach(([h, v]) => {
            if (v && v !== "ignore") dwcByHeader[h] = v;
        });

        csvHeaders.forEach((h, idx) => {
            const dwcPath = dwcByHeader[h];
            if (!dwcPath) return;
            const opt = FIELD_OPTIONS.find((o) => o.value === dwcPath);
            const dwcLabel = opt ? labelFor(opt) : `dwc:${dwcPath.replace(".", ":")}`;
            mappedCols.push({ csvIndex: idx, csvHeader: h, dwcValue: dwcPath, dwcLabel });
        });

        if (mappedCols.length === 0) return "";

        const headersOut = mappedCols.map((c) => c.dwcLabel);
        const lines: string[] = [];
        lines.push(headersOut.map(csvEscape).join(","));
        for (const r of csvRows) {
            const projected = mappedCols.map((c) => {
                const val = r[c.csvIndex] ?? "";
                return csvEscape(val);
            });
            lines.push(projected.join(","));
        }
        return lines.join("\r\n");
    };

    const handleDownloadMappedCSV = () => {
        if (headerDupReport.hasDuplicates) {
            toast.error("No puedes descargar: hay encabezados DWC duplicados. Ajusta el mapeo.");
            return;
        }
        if (!csvFile) return;
        const out = buildMappedCSV();
        if (!out) { toast.error("No hay columnas mapeadas para exportar."); return; }
        const blob = new Blob([out], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const baseName = csvFile.name.replace(/\.csv$/i, "");
        a.href = url;
        a.download = `${baseName}.dwc-mapped.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("CSV mapeado generado.");
    };

    // ======= CONFIRMAR E IMPORTAR: llamar al endpoint /upload/dwc-csv =======
    const handleConfirmImport = async () => {
        try {
            setIsProcessing(true);
            setShowConfirmDialog(false);

            // 1) Generar el CSV mapeado (con headers dwc:Entidad:termino)
            const csvOut = buildMappedCSV();
            if (!csvOut) {
                toast.error("No hay columnas mapeadas para importar.");
                setIsProcessing(false);
                return;
            }

            // 2) Preparar FormData
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `occurrences-${collectionId}-${ts}.dwc.csv`;
            const blob = new Blob([csvOut], { type: "text/csv;charset=utf-8" });
            const fileToSend = new File([blob], filename, { type: "text/csv" });

            const form = new FormData();
            form.append("collection_id", String(collectionId));
            form.append("file", fileToSend);

            // 3) Llamar al endpoint (no seteamos Content-Type manualmente)
            const url = `${API.BASE_URL}/upload/dwc-csv`;
            const res = await fetch(url, {
                method: "POST",
                body: form,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                credentials: "include"
            });

            if (res.status === 201) {
                // éxito — puede retornar stats JSON
                let stats: any = null;
                try { stats = await res.json(); } catch {}
                const msg = stats
                    ? `Importadas ${stats.occurrences_inserted ?? "?"} ocurrencias (eventos: ${stats.events_inserted ?? 0}, ubicaciones: ${stats.locations_inserted ?? 0}, taxones: ${stats.taxa_inserted ?? 0}).`
                    : "Importación completada.";
                toast.success(msg);
                // 4) Redirigir a la colección
                onNavigate("collection-detail", { collectionId, collectionName, isOwner: true });
            } else if (res.status === 400) {
                const txt = await res.text();
                toast.error(txt || "CSV inválido. Revisa los encabezados y el formato.");
            } else if (res.status === 403) {
                toast.error("No tienes permisos para importar en esta colección.");
            } else if (res.status === 404) {
                toast.error("Colección no encontrada.");
            } else if (res.status === 413) {
                toast.error("Archivo demasiado grande.");
            } else {
                const txt = await res.text();
                toast.error(txt || "Error inesperado al importar.");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error de red al importar el CSV.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = () => {
        onNavigate("collection-detail", { collectionId, collectionName, isOwner: true });
    };

    const mappedCount = useMemo(
        () => Object.values(columnMapping).filter((v) => v && v !== "ignore").length,
        [columnMapping]
    );

    const recommendedCount = useMemo(() => {
        const recommendedSet = new Set(
            DWC_FIELDS[datasetModel].filter((f) => f.recommended).map((f) => f.value)
        );
        return Object.values(columnMapping).filter((v) => recommendedSet.has(v)).length;
    }, [columnMapping, datasetModel]);

    const requiredSummary = useMemo(() => {
        const alt = REQUIRED_VALUES.alternatives
            .map((group) => group.map((g) => `dwc:${g.replace(".", ":")}`).join(" o "))
            .join(" • ");
        const req = REQUIRED_VALUES.required.map((g) => `dwc:${g.replace(".", ":")}`).join(" • ");
        return { alt, req };
    }, [REQUIRED_VALUES]);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <Button variant="ghost" onClick={handleCancel} className="mb-4">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver a {collectionName}
                </Button>

                <div>
                    <h1 className="text-3xl mb-2">Importar Ocurrencias desde CSV</h1>
                    <p className="text-muted-foreground">
                        Carga un archivo CSV y mapea las columnas a términos <span className="font-medium">Darwin Core</span> de tu modelo.
                    </p>
                </div>
            </div>

            {/* Selección de modelo */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Modelo de dataset</CardTitle>
                    <CardDescription>Selecciona el núcleo al que corresponde la importación.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    <div className="grid gap-2">
                        <Label>Modelo</Label>
                        <Select value={datasetModel} onValueChange={(v) => setDatasetModel(v as DatasetModel)}>
                            <SelectTrigger className="w-[260px]">
                                <SelectValue placeholder="Selecciona un modelo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Occurrence">Occurrence (núcleo)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Paso 1: Cargar archivo */}
            {!csvFile ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Paso 1: Selecciona un archivo CSV</CardTitle>
                        <CardDescription>El archivo debe contener una fila de encabezados y al menos una fila de datos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
                            <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                            <div className="mb-4">
                                <label htmlFor="csv-file" className="cursor-pointer">
                                    <span className="text-primary hover:underline text-lg">Seleccionar archivo CSV</span>
                                    <input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                                </label>
                            </div>
                            <p className="text-sm text-muted-foreground">Formatos aceptados: .csv</p>
                            <p className="text-xs text-muted-foreground mt-2">Tamaño máximo: 10 MB</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Archivo cargado */}
                    <Card className="mb-6">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Archivo cargado</CardTitle>
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
                        <CardContent>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="grid gap-2">
                            <Label>Codificación del archivo</Label>
                            <Select value={encodingUsed} onValueChange={(v) => handleEncodingChange(v)}>
                                <SelectTrigger className="w-[220px]">
                                <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                <SelectItem value="utf-8">UTF-8</SelectItem>
                                <SelectItem value="windows-1252">Windows-1252 (ANSI)</SelectItem>
                                <SelectItem value="iso-8859-1">ISO-8859-1</SelectItem>
                                <SelectItem value="iso-8859-15">ISO-8859-15</SelectItem>
                                <SelectItem value="macintosh">Macintosh</SelectItem>
                                <SelectItem value="utf-16le">UTF-16 LE</SelectItem>
                                <SelectItem value="utf-16be">UTF-16 BE</SelectItem>
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                                {encodingAuto ? "Detectado automáticamente" : "Forzado manualmente"}
                            </span>
                            </div>
                        </div>
                        </CardContent>
                    </Card>

                    {/* Paso 2: Mapeo */}
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Paso 2: Mapeo de columnas</CardTitle>
                            <CardDescription>
                                Selecciona el término <span className="font-medium">Darwin Core</span> para cada columna del CSV.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Alert className="mb-4">
                                <CheckCircle className="h-4 w-4" />
                                <AlertDescription>
                                    {mappedCount} de {columns.length} columnas mapeadas • Requisitos:{" "}
                                    <span className="font-medium">{requiredSummary.alt}</span> y{" "}
                                    <span className="font-medium">{requiredSummary.req}</span>
                                </AlertDescription>
                            </Alert>

                            {headerDupReport.hasDuplicates && (
                                <Alert className="mb-4">
                                    <Info className="h-4 w-4" />
                                    <AlertDescription>
                                        <span className="font-medium">Hay encabezados DWC duplicados</span>.
                                        Ajusta el mapeo para que cada término <code className="px-1 rounded bg-muted">dwc:Entidad:termino</code> se use solo una vez.
                                        <br />
                                        {headerDupReport.duplicates.map((d) => (
                                            <div key={d.dwcPath} className="mt-1">
                                                <span className="font-medium">{d.label}</span>: {d.csvColumns.join(", ")}
                                            </div>
                                        ))}
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="text-xs text-muted-foreground mb-3">
                                Sugeridos: <span className="font-medium">Taxon.scientificName</span>,{" "}
                                <span className="font-medium">Occurrence.catalogNumber</span>,{" "}
                                <span className="font-medium">Event.eventDate</span>,{" "}
                                <span className="font-medium">Location.locality</span> y/o coordenadas.
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Columna del CSV</TableHead>
                                        <TableHead>Mapear a (Darwin Core)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {columns.map((column, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-medium">{column.name}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={columnMapping[column.name] || "ignore"}
                                                    onValueChange={(value) => handleMappingChange(column.name, value)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {FIELD_OPTIONS.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>
                                                                {labelFor(opt)}
                                                                {opt.required ? " *" : opt.recommended ? " •" : ""}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            <div className="text-xs text-muted-foreground mt-3">
                                * obligatorio • recomendado — Para Occurrence, las opciones aparecen como{" "}
                                <code className="px-1 rounded bg-muted">dwc:Entidad:termino</code>.
                            </div>
                        </CardContent>
                    </Card>

                    {/* Paso 3: Descargar CSV mapeado */}
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Paso 3: Descargar CSV mapeado</CardTitle>
                            <CardDescription>
                                Se generará un archivo con <strong>solo</strong> las columnas mapeadas a Darwin Core,
                                usando encabezados en formato <code>dwc:Entidad:termino</code>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-4">
                            <div className="text-sm text-muted-foreground">
                                Columnas seleccionadas: <span className="font-medium">{mappedCount}</span>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleDownloadMappedCSV}
                                disabled={mappedCount === 0 || headerDupReport.hasDuplicates}
                                title={
                                    headerDupReport.hasDuplicates
                                        ? "Hay encabezados DWC duplicados"
                                        : mappedCount === 0
                                            ? "Mapea al menos una columna"
                                            : "Descargar CSV mapeado"
                                }
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Descargar CSV mapeado
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Acciones */}
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancelar
                        </Button>
                        <Button onClick={handleImportClick} disabled={isProcessing || headerDupReport.hasDuplicates}>
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

            {/* Confirmación */}
            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Confirmar importación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se importarán {rowCount} filas como nuevas ocurrencias en la colección “{collectionName}”.
                            <br />
                            <br />
                            Esta acción no se puede deshacer. ¿Deseas continuar?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmImport}>Confirmar importación</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
