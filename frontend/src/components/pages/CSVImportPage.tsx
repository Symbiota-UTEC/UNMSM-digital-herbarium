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
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, X, Info, Download } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { useAuth } from "@contexts/AuthContext";
import { API } from "@constants/api";
import { DWC_FIELDS, DwCFieldOption, DwCEntity } from "@constants/dwc";

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
    pattern:
      /\b(record number|numero de colecta|nro colecta|num colecta|n de colecta|field number|numero de campo)\b/,
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
    pattern:
      /\b(georeference verification status|estado georreferenciacion|verificacion georreferenciacion)\b/,
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
    pattern:
      /\b(associated taxa|taxa asociados|taxones asociados|hospedero|huesped|parasito|forofito)\b/,
    target: "Occurrence.associatedTaxa",
  },
  {
    pattern:
      /\b(dynamic properties?|propiedades dinamicas?|propiedades dinamicas|campos extra|datos adicionales)\b/,
    target: "Occurrence.dynamicProperties",
  },

  // --------- Event ----------
  {
    pattern:
      /\b(fecha verbatim|fecha original|fecha etiqueta|fecha texto|verbatim event date)\b/,
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
    pattern:
      /\b(event remarks?|observaciones del evento|notas del evento|notas de muestreo)\b/,
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
    pattern:
      /\b(localidad verbatim|localidad original|localidad etiqueta|localidad texto)\b/,
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
    pattern:
      /\b(location remarks?|observaciones de la localidad|notas de localidad)\b/,
    target: "Location.locationRemarks",
  },
  { pattern: /\b(latitud|lat)\b/, target: "Location.decimalLatitude" },
  { pattern: /\b(longitud|lon|lng|long)\b/, target: "Location.decimalLongitude" },
  {
    pattern: /\b(country code|codigo pais|codigo de pais)\b/,
    target: "Location.countryCode",
  },
  {
    pattern:
      /\b(verbatim coordinate system|sistema de coordenadas|sist coord)\b/,
    target: "Location.verbatimCoordinateSystem",
  },
  {
    pattern:
      /\b(contexto hidrografico|hydrographic context|cuerpo de agua|isla|archipielago)\b/,
    target: "Location.hydrographicContext",
  },
  {
    pattern:
      /\b(footprint wkt|poligono|area de muestreo|area muestreo)\b/,
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
  {
    pattern:
      /\b(identified by id|id identificador|id determinador|identificador de determinador)\b/,
    target: "Identification.identifiedByID",
  },
];

// ==============================
// Heurística de decodificación (encoding)
// ==============================
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

// ==============================
// Componente
// ==============================
export function CSVImportPage({
  collectionId,
  collectionName,
  onNavigate,
}: CSVImportPageProps) {
  const { token } = useAuth();

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
  const ALL_FIELDS: DwCFieldOption[] = useMemo(
    () => Object.values(DWC_FIELDS).flat(),
    []
  );

  const FIELD_OPTIONS: DwCFieldOption[] = useMemo(() => {
    return [IGNORE_OPTION, ...ALL_FIELDS];
  }, [ALL_FIELDS]);

  // Targets permitidos (exactamente los presentes en DWC_FIELDS)
  const ALLOWED_TARGETS = useMemo(
    () => new Set(ALL_FIELDS.map((f) => f.value)),
    [ALL_FIELDS]
  );

  // Auto-map sólo a targets permitidos y usando encabezado normalizado
  const autoMapHeader = (header: string): string => {
    const norm = normalizeHeader(header);
    for (const rule of AUTO_MAP_RULES) {
      if (!ALLOWED_TARGETS.has(rule.target)) continue;
      if (rule.pattern.test(norm)) return rule.target;
    }
    return "ignore";
  };

  // Reglas adicionales para requeridos:
  // - Grupo alternativo: al menos uno entre catalogNumber o recordNumber
  const REQUIRED_VALUES = useMemo(
    () => ({
      alternatives: [["Occurrence.catalogNumber", "Occurrence.recordNumber"]],
      required: [] as string[],
    }),
    []
  );

  // Obligatorios según el esquema (todos los DwCFieldOption con required: true)
  const REQUIRED_FROM_SCHEMA = useMemo(
    () =>
      new Set(
        ALL_FIELDS.filter((f) => f.required).map((f) => f.value)
      ),
    [ALL_FIELDS]
  );

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

      const bytes = await readFileBytes(file);
      setCsvBytes(bytes);

      const { text, encoding } = guessDecode(bytes);
      setEncodingUsed(encoding);
      setEncodingAuto(true);

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

  // Validación de obligatorios (campo required:true + reglas de grupo)
  const validateRequired = (): { ok: boolean; messages: string[] } => {
    const chosen = Object.values(columnMapping);
    const messages: string[] = [];

    // 1) Grupos de alternativas (p.ej. catalogNumber O recordNumber)
    for (const group of REQUIRED_VALUES.alternatives) {
      if (!group.some((g) => chosen.includes(g))) {
        const labels = group
          .map((g) => {
            const opt = ALL_FIELDS.find((f) => f.value === g);
            return opt ? opt.label : `dwc:${g.replace(".", ":")}`;
          })
          .join(" o ");
        messages.push(`Debes mapear al menos uno: ${labels}`);
      }
    }

    // 2) Obligatorios tomados de DWC_FIELDS (required:true),
    // excluyendo los que forman parte de grupos alternativos o REQUIRED_VALUES.required
    const schemaRequired = new Set(REQUIRED_FROM_SCHEMA);
    for (const group of REQUIRED_VALUES.alternatives) {
      group.forEach((term) => schemaRequired.delete(term));
    }
    REQUIRED_VALUES.required.forEach((term) => schemaRequired.delete(term));

    // 3) Obligatorios explícitos en REQUIRED_VALUES.required
    for (const req of REQUIRED_VALUES.required) {
      if (!chosen.includes(req)) {
        const opt = ALL_FIELDS.find((f) => f.value === req);
        const label = opt ? opt.label : `dwc:${req.replace(".", ":")}`;
        messages.push(`Campo obligatorio no mapeado: ${label}`);
      }
    }

    // 4) Obligatorios de esquema restantes
    schemaRequired.forEach((req) => {
      if (!chosen.includes(req)) {
        const opt = ALL_FIELDS.find((f) => f.value === req);
        const label = opt ? opt.label : `dwc:${req.replace(".", ":")}`;
        messages.push(`Campo obligatorio no mapeado: ${label}`);
      }
    });

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
  // Descarga CSV mapeado
  // ==============================
  const handleDownloadMappedCSV = () => {
    if (headerDupReport.hasDuplicates) {
      toast.error("No puedes descargar: hay encabezados DWC duplicados. Ajusta el mapeo.");
      return;
    }
    if (!csvFile) return;
    const out = buildMappedCSV();
    if (!out) {
      toast.error("No hay columnas mapeadas para exportar.");
      return;
    }
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

  // ==============================
  // Importar con reintentos de encabezado para dynamicProperties
  // ==============================
  const DYNAMIC_HEADER_TRY = [
    "dwc:Occurrence:dynamicProperties",
    "dwc:dynamicProperties",
    "dwc:RecordLevel:dynamicProperties",
  ] as const;

  const submitImportWithDynamicHeader = async (dynamicHeaderLabel: string) => {
    const csvOut = buildMappedCSV({ "Occurrence.dynamicProperties": dynamicHeaderLabel });

    if (!csvOut) {
      toast.error("No hay columnas mapeadas para importar.");
      return { ok: false, res: null as any };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `occurrences-${collectionId}-${ts}.dwc.csv`;
    const blob = new Blob([csvOut], { type: "text/csv;charset=utf-8" });
    const fileToSend = new File([blob], filename, { type: "text/csv" });

    const form = new FormData();
    form.append("collection_id", String(collectionId));
    form.append("file", fileToSend);

    const url = `${API.BASE_URL}/upload/dwc-csv`;
    const res = await fetch(url, {
      method: "POST",
      body: form,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
    });

    return { ok: res.status === 201, res };
  };

  const handleConfirmImport = async () => {
    try {
      setIsProcessing(true);
      setShowConfirmDialog(false);

      let lastText: string | null = null;
      for (let i = 0; i < DYNAMIC_HEADER_TRY.length; i++) {
        const label = DYNAMIC_HEADER_TRY[i];
        const { ok, res } = await submitImportWithDynamicHeader(label);
        if (ok) {
          let stats: any = null;
          try {
            stats = await res.json();
          } catch {}
          const msg = stats
            ? `Importadas ${stats.occurrences_inserted ?? "?"} ocurrencias.`
            : "Importación completada.";
          toast.success(`${msg} (encabezado usado: ${label})`);
          onNavigate("collection-detail", { collectionId, collectionName, isOwner: true });
          return;
        } else if (res.status === 400) {
          const txt = await res.text();
          lastText = txt;
          if (txt && /dynamicProperties/i.test(txt)) {
            if (i < DYNAMIC_HEADER_TRY.length - 1) {
              toast.message(`Reintentando con encabezado alternativo para dynamicProperties…`, {
                description: DYNAMIC_HEADER_TRY[i + 1],
              });
              continue;
            }
          }
          toast.error(txt || "CSV inválido. Revisa los encabezados y el formato.");
          return;
        } else if (res.status === 403) {
          toast.error("No tienes permisos para importar en esta colección.");
          return;
        } else if (res.status === 404) {
          toast.error("Colección no encontrada.");
          return;
        } else if (res.status === 413) {
          toast.error("Archivo demasiado grande.");
          return;
        } else {
          const txt = await res.text();
          lastText = txt;
          toast.error(txt || "Error inesperado al importar.");
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
    onNavigate("collection-detail", { collectionId, collectionName, isOwner: true });
  };

  const mappedCount = useMemo(
    () => Object.values(columnMapping).filter((v) => v && v !== "ignore").length,
    [columnMapping]
  );

  // Resumen de requeridos (grupos alternativos + obligatorios de esquema)
  const requiredSummary = useMemo(() => {
    const alt = REQUIRED_VALUES.alternatives
      .map((group) =>
        group
          .map((g) => {
            const opt = ALL_FIELDS.find((f) => f.value === g);
            return opt ? opt.label : `dwc:${g.replace(".", ":")}`;
          })
          .join(" o ")
      )
      .join(" • ");

    const schemaRequired = new Set(REQUIRED_FROM_SCHEMA);
    for (const group of REQUIRED_VALUES.alternatives) {
      group.forEach((term) => schemaRequired.delete(term));
    }
    REQUIRED_VALUES.required.forEach((term) => schemaRequired.delete(term));

    const reqList: string[] = [];

    REQUIRED_VALUES.required.forEach((g) => {
      const opt = ALL_FIELDS.find((f) => f.value === g);
      reqList.push(opt ? opt.label : `dwc:${g.replace(".", ":")}`);
    });

    schemaRequired.forEach((g) => {
      const opt = ALL_FIELDS.find((f) => f.value === g);
      reqList.push(opt ? opt.label : `dwc:${g.replace(".", ":")}`);
    });

    const req = reqList.join(" • ");

    return { alt, req };
  }, [REQUIRED_VALUES, ALL_FIELDS, REQUIRED_FROM_SCHEMA]);

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
            Carga un archivo CSV y mapea las columnas a términos{" "}
            <span className="font-medium">Darwin Core</span> de tu modelo.
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

      {/* Paso 1: Cargar archivo */}
      {!csvFile ? (
        <Card>
          <CardHeader>
            <CardTitle>Paso 1: Selecciona un archivo CSV</CardTitle>
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
                  <span className="font-medium">{requiredSummary.alt}</span>
                  {requiredSummary.req && (
                    <>
                      {" "}
                      y <span className="font-medium">{requiredSummary.req}</span>
                    </>
                  )}
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
                Puedes mapear varias columnas a <code>Occurrence.dynamicProperties</code>; se combinarán en un solo campo
                JSON por fila.
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
                Se generará un archivo con <strong>solo</strong> las columnas mapeadas a Darwin Core, usando encabezados
                en formato <code>dwc:Entidad:termino</code>.
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
