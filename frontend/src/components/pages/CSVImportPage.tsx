import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
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
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, X, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@contexts/AuthContext";
import { ApiError } from "@services/api.error";
import { uploadService } from "@services/upload.service";
import { collectionsService } from "@services/collections.service";
import type { CollectionOut } from "@interfaces/collection";
import { DWC_FIELDS, DwCFieldOption, DwCEntity } from "@constants/dwc";
import { ImportJobStatus } from "@constants/enums";
import type { DwcImportJob } from "@interfaces/upload";
import { dwcImportElapsedSeconds } from "@utils/dwcImportProgress";

interface CSVImportPageProps {
  collectionId: string;
  onNavigate: (page: string, params?: Record<string, any>) => void;
}

interface CSVColumn {
  name: string;
  sample: string;
}

interface ColumnMapping {
  [csvColumn: string]: string;
}

const IGNORE_OPTION: DwCFieldOption = {
  entity: "Occurrence",
  term: "ignore",
  value: "ignore",
  label: "Ignorar columna",
};

const DWC_IMPORT_HISTORY_PAGE_SIZE = 10;
const DWC_IMPORT_POLL_INTERVAL_MS = 2000;

const isActiveImport = (status: ImportJobStatus) =>
  status === ImportJobStatus.Queued || status === ImportJobStatus.Running;

const importStatusLabel = (status: ImportJobStatus) => {
  switch (status) {
    case ImportJobStatus.Queued:
      return "En cola";
    case ImportJobStatus.Running:
      return "Procesando";
    case ImportJobStatus.Completed:
      return "Completado";
    case ImportJobStatus.Failed:
      return "Falló";
  }
};

const formatElapsed = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

// ==============================
// Normalización de encabezados
// ==============================
const normalizeHeader = (s: string): string =>
  s
    .normalize("NFD") // separa letras y tildes
    .replace(/[\u0300-\u036f]/g, "") // elimina tildes
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ") // _, -, espacios múltiples → un solo espacio
    .trim();

// ==============================
// Reglas de auto-mapeo (sobre encabezado normalizado)
// SOLO usan targets que existen en DWC_FIELDS
// ==============================
const AUTO_MAP_RULES: Array<{ pattern: RegExp; target: string }> = [
  // --------- Occurrence ----------
  {
    pattern: /\b(codigo usm|codigo catalogo|catalogo|catalog number|catalogue number|cat #|cat no)\b/,
    target: "Occurrence.catalogNumber",
  },
  {
    pattern: /\b(record number|numero de colecta|nro colecta|num colecta|n de colecta|field number|numero de campo)\b/,
    target: "Occurrence.recordNumber",
  },
  {
    pattern: /\b(recorded by|colector|colectores|collector|col)\b/,
    target: "Occurrence.recordedBy",
  },
  {
    pattern: /\b(organism quantity|cantidad de organismos|cantidad de individuos|abundancia)\b/,
    target: "Occurrence.organismQuantity",
  },
  {
    pattern: /\b(organism quantity type|tipo de cantidad|unidad de cantidad)\b/,
    target: "Occurrence.organismQuantityType",
  },
  {
    pattern: /\b(georeference verification status|estado georreferenciacion|verificacion georreferenciacion)\b/,
    target: "Occurrence.georeferenceVerificationStatus",
  },
  {
    pattern: /\b(life stage|etapa de vida|estado fenologico|fenologia)\b/,
    target: "Occurrence.lifeStage",
  },
  {
    pattern: /\b(remark|remarks|observacion|observaciones|nota|notas)\b/,
    target: "Occurrence.occurrenceRemarks",
  },
  {
    pattern: /\b(establishment means|origen|forma de establecimiento)\b/,
    target: "Occurrence.establishmentMeans",
  },
  {
    pattern: /\b(associated references?|referencias asociadas?|trabajos asociados?)\b/,
    target: "Occurrence.associatedReferences",
  },
  {
    pattern: /\b(associated taxa|taxa asociados|taxones asociados|hospedero|huesped|parasito|forofito)\b/,
    target: "Occurrence.associatedTaxa",
  },
  {
    pattern: /\b(dynamic properties?|propiedades dinamicas?|propiedades dinamicas|campos extra|datos adicionales)\b/,
    target: "Occurrence.dynamicProperties",
  },

  // --------- Event ----------
  {
    pattern: /\b(fecha verbatim|fecha original|fecha etiqueta|fecha texto|verbatim event date)\b/,
    target: "Event.verbatimEventDate",
  },
  {
    pattern: /\b(fecha colecta|fecha de colecta|fecha muestreo|fecha evento|event date)\b/,
    target: "Event.eventDate",
  },
  { pattern: /\b(year|ano|año)\b/, target: "Event.year" },
  { pattern: /\b(month|mes)\b/, target: "Event.month" },
  { pattern: /\b(day|dia)\b/, target: "Event.day" },
  { pattern: /\b(habitat)\b/, target: "Event.habitat" },
  {
    pattern: /\b(event remarks?|observaciones del evento|notas del evento|notas de muestreo)\b/,
    target: "Event.eventRemarks",
  },
  {
    pattern: /\b(field notes?|notas de campo)\b/,
    target: "Event.fieldNotes",
  },
  // --------- Location ----------
  { pattern: /\b(pais|country)\b/, target: "Location.country" },
  { pattern: /\b(departamento|region|state province)\b/, target: "Location.stateProvince" },
  {
    pattern: /\b(localidad verbatim|localidad original|localidad etiqueta|localidad texto)\b/,
    target: "Location.verbatimLocality",
  },
  {
    pattern: /\b(elevacion verbatim|altitud verbatim|altitud etiqueta)\b/,
    target: "Location.verbatimElevation",
  },
  { pattern: /\b(provincia|county)\b/, target: "Location.county" },
  {
    pattern: /\b(distrito|municipio|municipalidad|municipality)\b/,
    target: "Location.municipality",
  },
  { pattern: /\b(localidad|locality)\b/, target: "Location.locality" },
  {
    pattern: /\b(location remarks?|observaciones de la localidad|notas de localidad)\b/,
    target: "Location.locationRemarks",
  },
  { pattern: /\b(latitud|lat)\b/, target: "Location.decimalLatitude" },
  { pattern: /\b(longitud|lon|lng|long)\b/, target: "Location.decimalLongitude" },
  {
    pattern: /\b(incertidumbre|coordinate uncertainty|uncertainty)\b/,
    target: "Location.coordinateUncertaintyInMeters",
  },
  {
    pattern: /\b(country code|codigo pais|codigo de pais)\b/,
    target: "Location.countryCode",
  },
  {
    pattern: /\b(verbatim coordinate system|sistema de coordenadas|sist coord)\b/,
    target: "Location.verbatimCoordinateSystem",
  },
  {
    pattern: /\b(footprint wkt|poligono|area de muestreo|area muestreo)\b/,
    target: "Location.footprintWKT",
  },

  // --------- Taxon ----------
  {
    pattern: /\b(scientific name|nombre cientifico)\b/,
    target: "Taxon.scientificName",
  },
  {
    pattern: /\b(author|authorship|autor)\b/,
    target: "Taxon.scientificNameAuthorship",
  },

  // --------- Identification ----------
  {
    pattern: /\b(identified by|identificado por|determinado por|det\.)\b/,
    target: "Identification.identifiedBy",
  },
];

// ==============================
// Heurística de decodificación (encoding)
// ==============================
type Guess = { text: string; encoding: string; source: "bom" | "heuristic" };

const ENCODING_CANDIDATES = ["utf-8", "windows-1252", "iso-8859-1", "iso-8859-15", "macintosh"] as const;

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
const countSpanishDiacritics = (s: string) => (s.match(/[áéíóúÁÉÍÓÚñÑüÜ]/g) || []).length;

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
    } catch {
      /* fall-through */
    }
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
    } catch {}
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

// ==============================
// CSV utils
// ==============================
const parseCSVAll = (csvContent: string): { headers: string[]; rows: string[][] } => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let recordHasContent = false;

  const finishField = () => {
    let value = field.trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    record.push(value.replace(/""/g, '"'));
    field = "";
  };

  const finishRecord = () => {
    finishField();
    if (recordHasContent) records.push(record);
    record = [];
    recordHasContent = false;
  };

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];

    if (char === '"') {
      if (inQuotes && csvContent[i + 1] === '"') {
        field += '""';
        i++;
      } else {
        if (inQuotes || field.trim().length === 0) inQuotes = !inQuotes;
        field += char;
      }
      recordHasContent = true;
    } else if (!inQuotes && char === ",") {
      finishField();
      recordHasContent = true;
    } else if (!inQuotes && (char === "\n" || char === "\r")) {
      finishRecord();
      if (char === "\r" && csvContent[i + 1] === "\n") i++;
    } else {
      field += char;
      if (char.trim().length > 0) recordHasContent = true;
    }
  }

  if (inQuotes) throw new Error("El CSV contiene comillas sin cerrar.");
  if (field.length > 0 || record.length > 0) finishRecord();

  return { headers: records[0] ?? [], rows: records.slice(1) };
};

const findRepeatedHeaders = (headers: string[]): Array<{ header: string; positions: number[] }> => {
  const positionsByHeader = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const normalized = header.trim();
    const positions = positionsByHeader.get(normalized) ?? [];
    positions.push(index + 1);
    positionsByHeader.set(normalized, positions);
  });

  return Array.from(positionsByHeader.entries())
    .filter(([, positions]) => positions.length > 1)
    .map(([header, positions]) => ({ header: header || "(vacío)", positions }));
};

const repeatedHeaderMessage = (duplicates: Array<{ header: string; positions: number[] }>) =>
  `Encabezados de origen repetidos: ${duplicates
    .map(({ header, positions }) => `"${header}" (columnas ${positions.join(", ")})`)
    .join("; ")}`;

const csvEscape = (v: string): string => {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
};

const labelFor = (opt: DwCFieldOption) => opt.label;

// ==============================
// Componente
// ==============================
export function CSVImportPage({ collectionId, onNavigate }: CSVImportPageProps) {
  const { apiFetch } = useAuth();

  // Nombre y permiso de la colección: los da el backend (así funciona también con un enlace directo).
  const [collection, setCollection] = useState<CollectionOut | null>(null);
  const [collectionError, setCollectionError] = useState(false);
  const collectionName = collection?.collectionName ?? "";

  useEffect(() => {
    let active = true;
    collectionsService
      .getById(apiFetch, collectionId)
      .then((c) => active && setCollection(c))
      .catch(() => active && setCollectionError(true));
    return () => {
      active = false;
    };
  }, [apiFetch, collectionId]);

  const [datasetModel, setDatasetModel] = useState<DwCEntity>("Occurrence");
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [uploadStartedAt, setUploadStartedAt] = useState<number | null>(null);
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<DwcImportJob | null>(null);
  const [jobHistory, setJobHistory] = useState<DwcImportJob[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [trackingError, setTrackingError] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const pollingRef = useRef(false);
  const activeJobRef = useRef<DwcImportJob | null>(null);

  const currentTrackedJob = activeJob?.jobId === trackedJobId ? activeJob : null;
  const activeJobStatus = activeJob?.status;
  const importActive =
    isUploading || Boolean(trackedJobId && (!currentTrackedJob || isActiveImport(currentTrackedJob.status)));

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  // APLANA todas las entidades de DWC_FIELDS
  const ALL_FIELDS: DwCFieldOption[] = useMemo(() => Object.values(DWC_FIELDS).flat(), []);

  const FIELD_OPTIONS: DwCFieldOption[] = useMemo(() => {
    return [IGNORE_OPTION, ...ALL_FIELDS];
  }, [ALL_FIELDS]);

  // Targets permitidos (exactamente los presentes en DWC_FIELDS)
  const ALLOWED_TARGETS = useMemo(() => new Set(ALL_FIELDS.map((f) => f.value)), [ALL_FIELDS]);

  // Auto-map sólo a targets permitidos y usando encabezado normalizado
  const autoMapHeader = (header: string): string => {
    const norm = normalizeHeader(header);
    for (const rule of AUTO_MAP_RULES) {
      if (!ALLOWED_TARGETS.has(rule.target)) continue;
      if (rule.pattern.test(norm)) return rule.target;
    }
    return "ignore";
  };

  // La carga CSV requiere solo catalogNumber; los formularios usan otras reglas.
  const CATALOG_TARGET = "Occurrence.catalogNumber";

  useEffect(() => {
    let current = true;
    setHistoryLoading(true);
    setHistoryError(false);
    uploadService
      .getDwcCsvJobs(apiFetch, collectionId, historyPage, DWC_IMPORT_HISTORY_PAGE_SIZE)
      .then((data) => {
        if (!current) return;
        const jobs = data.items ?? [];
        setJobHistory(jobs);
        setHistoryTotalPages(data.totalPages);
        const retainedJob =
          jobs.find((job) => job.jobId === trackedJobId) ??
          (activeJobRef.current?.jobId === trackedJobId ? activeJobRef.current : null);
        const preferred = jobs.find((job) => isActiveImport(job.status)) ?? retainedJob ?? jobs[0] ?? null;
        setActiveJob(preferred);
        setTrackedJobId(preferred?.jobId ?? null);
      })
      .catch((error) => {
        if (!current) return;
        setHistoryError(true);
        if (error instanceof ApiError && error.status !== 403 && error.status !== 404) {
          console.error(error);
        }
      })
      .finally(() => current && setHistoryLoading(false));
    return () => {
      current = false;
    };
  }, [apiFetch, collectionId, historyPage, trackedJobId]);

  useEffect(() => {
    if (!trackedJobId || (activeJobStatus && !isActiveImport(activeJobStatus))) return;
    let current = true;
    const poll = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        const job = await uploadService.getDwcCsvJobById(apiFetch, trackedJobId);
        if (!current) return;
        setActiveJob(job);
        setTrackingError(false);
        setJobHistory((previous) => {
          const existing = previous.some((item) => item.jobId === job.jobId);
          const next = existing
            ? previous.map((item) => (item.jobId === job.jobId ? job : item))
            : [job, ...previous].slice(0, DWC_IMPORT_HISTORY_PAGE_SIZE);
          return next;
        });
      } catch (error) {
        if (!current) return;
        setTrackingError(true);
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          console.error(error);
        }
      } finally {
        pollingRef.current = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), DWC_IMPORT_POLL_INTERVAL_MS);
    return () => {
      current = false;
      window.clearInterval(interval);
    };
  }, [apiFetch, trackedJobId, activeJobStatus]);

  useEffect(() => {
    if (!importActive) return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [importActive]);

  const clearCsvState = () => {
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
    setShowConfirmDialog(false);
  };

  const headerDupReport = useMemo(() => {
    const ALLOW_MULTI_MAP = new Set<string>(["Occurrence.dynamicProperties"]);

    const byDwc: Record<string, string[]> = {};
    Object.entries(columnMapping).forEach(([csvHeader, dwcPath]) => {
      if (!dwcPath || dwcPath === "ignore") return;
      if (!byDwc[dwcPath]) byDwc[dwcPath] = [];
      byDwc[dwcPath].push(csvHeader);
    });

    const duplicates = Object.entries(byDwc)
      .filter(([dwcPath, cols]) => cols.length > 1 && !ALLOW_MULTI_MAP.has(dwcPath))
      .map(([dwcPath, cols]) => {
        const opt = FIELD_OPTIONS.find((o) => o.value === dwcPath);
        const label = opt ? opt.label : `dwc:${dwcPath.replace(".", ":")}`;
        return { dwcPath, label, csvColumns: cols };
      });

    return { hasDuplicates: duplicates.length > 0, duplicates, byDwc, allowMulti: ALLOW_MULTI_MAP };
  }, [columnMapping, FIELD_OPTIONS]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileInput = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!(file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv"))) {
      clearCsvState();
      fileInput.value = "";
      toast.error("Por favor, selecciona un archivo .csv");
      return;
    }
    try {
      setIsProcessing(true);

      const bytes = await readFileBytes(file);
      const { text, encoding } = guessDecode(bytes);
      const { headers, rows } = parseCSVAll(text);
      if (headers.length === 0 || rows.length === 0) {
        clearCsvState();
        fileInput.value = "";
        toast.error("El archivo CSV debe tener encabezados y al menos una fila de datos");
        return;
      }

      const repeatedHeaders = findRepeatedHeaders(headers);
      if (repeatedHeaders.length > 0) {
        clearCsvState();
        fileInput.value = "";
        toast.error(repeatedHeaderMessage(repeatedHeaders));
        return;
      }

      setCSVFile(file);
      setCsvBytes(bytes);
      setEncodingUsed(encoding);
      setEncodingAuto(true);
      setRawCSVText(text);
      setCSVHeaders(headers);
      setCSVRows(rows);
      setRowCount(rows.length);

      const first = rows[0] || [];
      const detected: CSVColumn[] = headers.map((h, idx) => ({
        name: h.trim(),
        sample: first[idx] || "",
      }));
      setColumns(detected);

      const mapping: ColumnMapping = {};
      detected.forEach((col) => {
        mapping[col.name] = autoMapHeader(col.name);
      });
      setColumnMapping(mapping);

      toast.success(`Archivo cargado (${encoding}). Filas detectadas: ${rows.length}`);
    } catch (err) {
      console.error(err);
      clearCsvState();
      fileInput.value = "";
      toast.error("No se pudo leer el CSV.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEncodingChange = (enc: string) => {
    if (!csvBytes) return;
    try {
      const text = decodeWith(csvBytes, enc);
      const { headers, rows } = parseCSVAll(text);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("El archivo CSV debe tener encabezados y al menos una fila de datos");
        return;
      }
      const repeatedHeaders = findRepeatedHeaders(headers);
      if (repeatedHeaders.length > 0) {
        toast.error(repeatedHeaderMessage(repeatedHeaders));
        return;
      }

      setRawCSVText(text);
      setCSVHeaders(headers);
      setCSVRows(rows);
      setRowCount(rows.length);

      const first = rows[0] || [];
      const detected: CSVColumn[] = headers.map((h, idx) => ({
        name: h.trim(),
        sample: first[idx] || "",
      }));
      setColumns(detected);

      // Conserva mapeos existentes cuando el encabezado coincide,
      // y auto-mapea sólo los nuevos.
      setColumnMapping((prev) => {
        const newMap: ColumnMapping = {};
        const prevKeys = new Set(Object.keys(prev));

        detected.forEach((col) => {
          const name = col.name;
          if (prevKeys.has(name)) {
            newMap[name] = prev[name];
          } else {
            newMap[name] = autoMapHeader(name);
          }
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
    clearCsvState();
  };

  // Validación de la columna y sus valores antes de enviar el archivo.
  const validateRequired = (): { ok: boolean; messages: string[] } => {
    const messages: string[] = [];
    const catalogIndex = csvHeaders.findIndex((header) => columnMapping[header] === CATALOG_TARGET);
    if (catalogIndex < 0) {
      messages.push("Debes mapear dwc:Occurrence:catalogNumber");
    } else {
      const seen = new Set<string>();
      for (const [index, row] of csvRows.entries()) {
        const number = (row[catalogIndex] ?? "").trim();
        if (!/^[0-9]{1,100}$/.test(number)) {
          messages.push(`Fila ${index + 1}: el número de catálogo debe contener entre 1 y 100 dígitos`);
          break;
        }
        if (seen.has(number)) {
          messages.push(`Fila ${index + 1}: número de catálogo duplicado (${number})`);
          break;
        }
        seen.add(number);
      }
    }

    return { ok: messages.length === 0, messages };
  };

  const handleImportClick = () => {
    const { ok, messages } = validateRequired();
    if (!ok) {
      messages.forEach((m) => toast.error(m));
      return;
    }
    if (headerDupReport.hasDuplicates) {
      headerDupReport.duplicates.forEach((d) => {
        toast.error(`Encabezado duplicado ${d.label}. Columnas: ${d.csvColumns.join(", ")}`);
      });
      return;
    }
    if (importActive) {
      toast.message("Ya hay una importación activa para esta institución.");
      return;
    }
    setShowConfirmDialog(true);
  };

  // ==============================
  // CSV mapeado (con override de labels por DWC value)
  // ==============================
  const buildMappedCSV = async (labelOverride?: Record<string, string>): Promise<string> => {
    const dwcByHeader: Record<string, string> = {};
    Object.entries(columnMapping).forEach(([h, v]) => {
      if (v && v !== "ignore") dwcByHeader[h] = v;
    });

    const dwcToCols: Record<string, Array<{ csvIndex: number; csvHeader: string }>> = {};
    csvHeaders.forEach((h, idx) => {
      const dwcPath = dwcByHeader[h];
      if (!dwcPath) return;
      if (!dwcToCols[dwcPath]) dwcToCols[dwcPath] = [];
      dwcToCols[dwcPath].push({ csvIndex: idx, csvHeader: h });
    });

    type OutCol =
      | { kind: "normal"; dwcValue: string; dwcLabel: string; csvIndex: number }
      | {
          kind: "dynamic";
          dwcValue: string;
          dwcLabel: string;
          cols: Array<{ csvIndex: number; csvHeader: string }>;
        };

    const outCols: OutCol[] = [];
    const makeLabel = (dwcValue: string) => {
      if (labelOverride && labelOverride[dwcValue]) return labelOverride[dwcValue];
      const opt = FIELD_OPTIONS.find((o) => o.value === dwcValue);
      return opt ? labelFor(opt) : `dwc:${dwcValue.replace(".", ":")}`;
    };

    const DYNAMIC_KEY = "Occurrence.dynamicProperties";

    Object.entries(dwcToCols).forEach(([dwcValue, cols]) => {
      if (dwcValue === DYNAMIC_KEY) {
        outCols.push({
          kind: "dynamic",
          dwcValue,
          dwcLabel: makeLabel(dwcValue),
          cols,
        });
      } else {
        outCols.push({
          kind: "normal",
          dwcValue,
          dwcLabel: makeLabel(dwcValue),
          csvIndex: cols[0].csvIndex,
        });
      }
    });

    if (outCols.length === 0) return "";

    const headersOut = outCols.map((c) => c.dwcLabel);
    const lines: string[] = [];
    lines.push(headersOut.map(csvEscape).join(","));

    for (const [rowIndex, r] of csvRows.entries()) {
      const projected = outCols.map((c) => {
        if (c.kind === "normal") {
          const val = r[c.csvIndex] ?? "";
          return csvEscape(val);
        } else {
          const obj: Record<string, string> = {};
          for (const { csvIndex, csvHeader } of c.cols) {
            const raw = (r[csvIndex] ?? "").toString();
            if (raw.trim().length > 0) obj[csvHeader] = raw;
          }
          const json = JSON.stringify(obj);
          return csvEscape(json);
        }
      });
      lines.push(projected.join(","));
      if ((rowIndex + 1) % 500 === 0) {
        setUploadStage(`Preparando CSV: ${rowIndex + 1} de ${csvRows.length} filas`);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }

    return lines.join("\r\n");
  };

  /** Prepara y encola el CSV mapeado como un trabajo de importación. */
  const submitDwcImport = async () => {
    const csvOut = await buildMappedCSV({
      "Occurrence.dynamicProperties": "dwc:Occurrence:dynamicProperties",
    });

    if (!csvOut) {
      toast.error("No hay columnas mapeadas para importar.");
      return null;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `occurrences-${collectionId}-${ts}.dwc.csv`;
    const blob = new Blob([csvOut], { type: "text/csv;charset=utf-8" });
    const fileToSend = new File([blob], filename, { type: "text/csv" });

    setUploadStage("Enviando CSV al servidor…");
    return uploadService.uploadDwcCsvJob(apiFetch, String(collectionId), fileToSend);
  };

  const handleConfirmImport = async () => {
    if (importActive) return;
    setShowConfirmDialog(false);
    setIsUploading(true);
    setUploadStartedAt(Date.now());
    setUploadStage("Preparando el CSV para enviarlo…");
    setTrackedJobId(null);
    setActiveJob(null);
    setTrackingError(false);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const accepted = await submitDwcImport();
      if (!accepted) return;

      setTrackedJobId(accepted.jobId);
      setUploadStage(null);
      setHistoryPage(1);
      toast.message("CSV recibido. La importación continuará en segundo plano.");
      try {
        const job = await uploadService.getDwcCsvJobById(apiFetch, accepted.jobId);
        setActiveJob(job);
        setJobHistory((previous) => [job, ...previous.filter((item) => item.jobId !== job.jobId)]);
      } catch {
        // The polling effect will retry; the accepted job is already saved on the server.
        setTrackingError(true);
      }
    } catch (err) {
      console.error(err);
      const apiError = err instanceof ApiError ? err : null;
      const detail = apiError?.detail ?? "";
      try {
        const parsed = JSON.parse(detail);
        if (typeof parsed.detail === "string") {
          toast.error(parsed.detail);
          return;
        }
      } catch {
        // API details may be plain text.
      }
      if (apiError?.status === 409) {
        toast.error(detail || "Ya hay una importación activa para esta institución.");
      } else if (apiError?.status === 403) {
        toast.error("No tienes permisos para importar en esta colección.");
      } else if (apiError?.status === 413) {
        toast.error("Archivo demasiado grande.");
      } else {
        toast.error(detail || "No se pudo iniciar la importación CSV.");
      }
    } finally {
      setIsUploading(false);
      setUploadStage(null);
    }
  };

  const handleCancel = () => {
    onNavigate("collection-detail", { collectionId });
  };

  const mappedCount = useMemo(
    () => Object.values(columnMapping).filter((v) => v && v !== "ignore").length,
    [columnMapping],
  );

  const displayedJob = currentTrackedJob;
  const elapsedSeconds = dwcImportElapsedSeconds(displayedJob, clock, isUploading ? uploadStartedAt : null);
  const progressValue =
    displayedJob?.progressPercent == null ? null : Math.min(100, Math.max(0, displayedJob.progressPercent));

  const selectHistoryJob = (job: DwcImportJob) => {
    setActiveJob(job);
    setTrackedJobId(job.jobId);
    setTrackingError(false);
  };

  if (collectionError || (collection && !collection.canEdit)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={handleCancel} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a Colección
        </Button>
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {collectionError
            ? "No se pudo cargar la colección (no existe o no tienes acceso)."
            : "No tienes permiso para importar ocurrencias en esta colección."}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={handleCancel} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {importActive ? "Volver a colección (la importación continúa)" : "Volver a Colección"}
        </Button>

        <div>
          <h1 className="text-3xl mb-2">Importar Ocurrencias desde CSV</h1>
          <p className="text-muted-foreground">
            Carga un archivo CSV y mapea las columnas a términos <span className="font-medium">Darwin Core</span> de tu
            modelo.
          </p>
        </div>
      </div>

      {(isUploading || trackedJobId || activeJob) && (
        <Card className="mb-6" aria-busy={importActive}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importActive && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {isUploading
                ? "Preparando importación"
                : displayedJob
                  ? `${displayedJob.stage} · ${importStatusLabel(displayedJob.status)}`
                  : "Consultando importación"}
            </CardTitle>
            <CardDescription role="status" aria-live="polite">
              {isUploading
                ? uploadStage || "Enviando el CSV al servidor…"
                : trackingError
                  ? "No se pudo consultar el estado. Se reintentará automáticamente."
                  : displayedJob?.detail || "Recuperando el estado guardado en el servidor…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="flex flex-wrap text-sm text-muted-foreground"
              style={{ columnGap: "1.5rem", rowGap: "0.5rem" }}
            >
              <span>Archivo: {displayedJob?.filename || csvFile?.name || "CSV preparado"}</span>
              {displayedJob?.totalRows != null && (
                <span>
                  Filas: {displayedJob.rowsProcessed.toLocaleString()} / {displayedJob.totalRows.toLocaleString()}
                </span>
              )}
              <span>Tiempo transcurrido: {formatElapsed(elapsedSeconds)}</span>
            </div>

            {importActive && displayedJob?.totalRows != null && progressValue != null ? (
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-label="Progreso de filas CSV"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressValue}
                  style={{
                    height: 8,
                    width: "100%",
                    overflow: "hidden",
                    borderRadius: 9999,
                    background: "var(--muted)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progressValue}%`,
                      background: "var(--primary)",
                      transition: "width 200ms ease",
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{progressValue.toFixed(1)}% de las filas procesadas</p>
              </div>
            ) : importActive ? (
              <p className="text-sm text-muted-foreground">
                El servidor está preparando el archivo; el conteo aparecerá cuando termine de validar el CSV.
              </p>
            ) : null}

            {displayedJob?.status === ImportJobStatus.Completed && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Ocurrencias importadas</p>
                    <p className="text-sm font-semibold">{displayedJob.occurrencesInserted.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Con taxón vinculado</p>
                    <p className="text-sm font-semibold">{displayedJob.taxaMatched.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Pendientes de vincular</p>
                    <p className="text-sm font-semibold">{displayedJob.taxaUnmatched.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Identificadores</p>
                    <p className="text-sm font-semibold">{displayedJob.identifiersInserted.toLocaleString()}</p>
                  </div>
                </div>
                <Button onClick={() => onNavigate("collection-detail", { collectionId })}>Ver colección</Button>
              </>
            )}

            {displayedJob?.status === ImportJobStatus.Failed && (
              <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertTitle>La importación falló; no se guardó ninguna ocurrencia.</AlertTitle>
                <AlertDescription style={{ overflowWrap: "anywhere" }}>
                  {displayedJob.errorMessage || displayedJob.detail || "Error desconocido al importar el archivo."}
                </AlertDescription>
              </Alert>
            )}

            {trackingError && !importActive && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>Se perdió temporalmente la conexión con el estado del trabajo.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Selección de modelo */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Modelo de dataset</CardTitle>
          <CardDescription>Selecciona el núcleo al que corresponde la importación.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="grid gap-2">
            <Label>Modelo</Label>
            <Select value={datasetModel} onValueChange={(v) => setDatasetModel(v as DwCEntity)}>
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

      {/* Selección del archivo */}
      {!csvFile ? (
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar archivo CSV</CardTitle>
            <CardDescription>
              El archivo debe contener una fila de encabezados y al menos una fila de datos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
              <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <div className="mb-4">
                <label htmlFor="csv-file" className="cursor-pointer">
                  <span className="text-primary hover:underline text-lg">Seleccionar archivo CSV</span>
                  <input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={importActive}
                  />
                </label>
              </div>
              <p className="text-sm text-muted-foreground">Formatos aceptados: .csv</p>
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
                <Button variant="ghost" size="sm" onClick={handleRemoveFile} disabled={importActive}>
                  <X className="h-4 w-4 mr-2" />
                  Cambiar archivo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid gap-2">
                  <Label>Codificación del archivo</Label>
                  <Select value={encodingUsed} onValueChange={(v) => handleEncodingChange(v)} disabled={importActive}>
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

          {/* Mapeo de columnas */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Mapeo de columnas</CardTitle>
              <CardDescription>
                Selecciona el término <span className="font-medium">Darwin Core</span> para cada columna del CSV.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="mb-4">
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {mappedCount} de {columns.length} columnas mapeadas • Requisitos:{" "}
                  <span className="font-medium">dwc:Occurrence:catalogNumber (dígitos por fila)</span>
                </AlertDescription>
              </Alert>

              {headerDupReport.hasDuplicates && (
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">Hay encabezados DWC duplicados</span> (excepto{" "}
                    <code>dwc:Occurrence:dynamicProperties</code>, que sí permite varios). Ajusta el mapeo para que cada
                    término <code className="px-1 rounded bg-muted">dwc:Entidad:termino</code> se use una sola vez.
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
                Sugeridos: campos de taxonomía (cuando los agregues a DWC_FIELDS),{" "}
                <span className="font-medium">Occurrence.catalogNumber</span>,{" "}
                <span className="font-medium">Event.eventDate</span>,{" "}
                <span className="font-medium">Location.locality</span> y/o coordenadas.
                <br />
                Puedes mapear varias columnas a <code>Occurrence.dynamicProperties</code>; se combinarán en un solo
                campo JSON por fila.
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
                          disabled={importActive}
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
                                {opt.value === CATALOG_TARGET ? " *" : opt.recommended ? " •" : ""}
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
                * obligatorio para la importación • recomendado — Para Occurrence, las opciones aparecen como{" "}
                <code className="px-1 rounded bg-muted">dwc:Entidad:termino</code>.
              </div>
            </CardContent>
          </Card>

          {/* Acciones */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleCancel}>
              {importActive ? "Volver a colección" : "Cancelar"}
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={isProcessing || importActive || headerDupReport.hasDuplicates}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Leyendo CSV...
                </>
              ) : importActive ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importación en curso
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Historial de importaciones</CardTitle>
          <CardDescription>Progreso y resultados de las importaciones DwC de esta colección.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading && jobHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cargando historial…</p>
          ) : historyError ? (
            <p className="text-sm text-muted-foreground">No se pudo cargar el historial.</p>
          ) : jobHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay importaciones para esta colección.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Filas</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead style={{ width: "1px" }} className="whitespace-nowrap">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobHistory.map((job) => (
                    <TableRow key={job.jobId} data-selected={job.jobId === trackedJobId || undefined}>
                      <TableCell className="truncate font-medium" style={{ maxWidth: 220 }}>
                        {job.filename}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-md border px-2 py-1 text-xs">{importStatusLabel(job.status)}</span>
                      </TableCell>
                      <TableCell>
                        {job.status === ImportJobStatus.Completed
                          ? job.occurrencesInserted.toLocaleString()
                          : `${job.rowsProcessed.toLocaleString()} / ${job.totalRows?.toLocaleString() ?? "…"}`}
                      </TableCell>
                      <TableCell>{new Date(job.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => selectHistoryJob(job)}>
                            Ver detalles
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {historyTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Página {historyPage} de {historyTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage <= 1 || historyLoading}
                      onClick={() => setHistoryPage((page) => page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyPage >= historyTotalPages || historyLoading}
                      onClick={() => setHistoryPage((page) => page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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
