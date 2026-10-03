import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
    setShowConfirmDialog(true);
  };

  // ==============================
  // CSV mapeado (con override de labels por DWC value)
  // ==============================
  const buildMappedCSV = (labelOverride?: Record<string, string>): string => {
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

    for (const r of csvRows) {
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
    }

    return lines.join("\r\n");
  };

  // ==============================
  // Importar con reintentos de encabezado para dynamicProperties
  // ==============================
  const DYNAMIC_HEADER_TRY = [
    "dwc:Occurrence:dynamicProperties",
    "dwc:dynamicProperties",
    "dwc:RecordLevel:dynamicProperties",
  ] as const;

  /** Sube el CSV mapeado. Devuelve null si no hay columnas para importar; lanza ApiError si el backend lo rechaza. */
  const submitImportWithDynamicHeader = async (dynamicHeaderLabel: string) => {
    const csvOut = buildMappedCSV({ "Occurrence.dynamicProperties": dynamicHeaderLabel });

    if (!csvOut) {
      toast.error("No hay columnas mapeadas para importar.");
      return null;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `occurrences-${collectionId}-${ts}.dwc.csv`;
    const blob = new Blob([csvOut], { type: "text/csv;charset=utf-8" });
    const fileToSend = new File([blob], filename, { type: "text/csv" });

    return uploadService.uploadDwcCsv(apiFetch, String(collectionId), fileToSend);
  };

  const handleConfirmImport = async () => {
    try {
      setIsProcessing(true);
      setShowConfirmDialog(false);

      let lastText: string | null = null;
      for (let i = 0; i < DYNAMIC_HEADER_TRY.length; i++) {
        const label = DYNAMIC_HEADER_TRY[i];
        try {
          const stats = await submitImportWithDynamicHeader(label);
          if (!stats) return;

          const msg = `Importadas ${stats.occurrencesInserted} ocurrencias.`;
          toast.success(`${msg} (encabezado usado: ${label})`);
          onNavigate("collection-detail", { collectionId });
          return;
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          let txt = err.detail ?? "";
          try {
            const parsed = JSON.parse(txt);
            if (typeof parsed.detail === "string") txt = parsed.detail;
          } catch {
            // Some API errors are plain text.
          }

          if (err.status === 400) {
            lastText = txt;
            if (txt && /dynamicProperties/i.test(txt) && i < DYNAMIC_HEADER_TRY.length - 1) {
              toast.message(`Reintentando con encabezado alternativo para dynamicProperties…`, {
                description: DYNAMIC_HEADER_TRY[i + 1],
              });
              continue;
            }
            toast.error(txt || "CSV inválido. Revisa los encabezados y el formato.");
          } else if (err.status === 409) {
            toast.error(txt || "El número de catálogo ya existe en esta institución.");
          } else if (err.status === 403) {
            toast.error("No tienes permisos para importar en esta colección.");
          } else if (err.status === 404) {
            toast.error("Colección no encontrada.");
          } else if (err.status === 413) {
            toast.error("Archivo demasiado grande.");
          } else {
            lastText = txt;
            toast.error(txt || "Error inesperado al importar.");
          }
          return;
        }
      }

      if (lastText) {
        toast.error(lastText);
      } else {
        toast.error("No se pudo completar la importación.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error de red al importar el CSV.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onNavigate("collection-detail", { collectionId });
  };

  const mappedCount = useMemo(
    () => Object.values(columnMapping).filter((v) => v && v !== "ignore").length,
    [columnMapping],
  );

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
          Volver a Colección
        </Button>

        <div>
          <h1 className="text-3xl mb-2">Importar Ocurrencias desde CSV</h1>
          <p className="text-muted-foreground">
            Carga un archivo CSV y mapea las columnas a términos <span className="font-medium">Darwin Core</span> de tu
            modelo.
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
                  <input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
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
              Cancelar
            </Button>
            <Button onClick={handleImportClick} disabled={isProcessing || headerDupReport.hasDuplicates}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
