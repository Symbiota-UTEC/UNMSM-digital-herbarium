import { useEffect, useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { adminDivisionsService } from "@services/adminDivisions.service";
import type { ApiFetch } from "@services/api.error";
import type { AdminDivision, CatalogCountry } from "@interfaces/adminDivision";

/** Normaliza para matching con la BD (minúsculas, sin tildes) */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface GeoValues {
  stateProvince: string;
  county: string;
  municipality: string;
}

interface GeographicHierarchyProps {
  apiFetch: ApiFetch;
  countries: CatalogCountry[];
  catalogUnavailable: boolean;
  countryCode: string;
  countryNameFallback: string;
  values: GeoValues;
  onCountryChange: (code: string) => void;
  onCountryNameFallbackChange: (name: string) => void;
  /** Parche de valores; locationId = URI de la división seleccionada más profunda */
  onValuesChange: (patch: Partial<GeoValues & { locationId: string }>) => void;
}

const LEVELS: {
  level: 1 | 2 | 3;
  label: string;
  field: keyof GeoValues;
  dwc: string;
  placeholder: string;
}[] = [
  { level: 1, label: "Departamento", field: "stateProvince", dwc: "dwc:stateProvince", placeholder: "Ej: Cusco" },
  { level: 2, label: "Provincia", field: "county", dwc: "dwc:county", placeholder: "Ej: Urubamba" },
  { level: 3, label: "Distrito", field: "municipality", dwc: "dwc:municipality", placeholder: "Ej: Ollantaytambo" },
];

export function GeographicHierarchy({
  apiFetch,
  countries,
  catalogUnavailable,
  countryCode,
  countryNameFallback,
  values,
  onCountryChange,
  onCountryNameFallbackChange,
  onValuesChange,
}: GeographicHierarchyProps) {
  const [deptOptions, setDeptOptions] = useState<AdminDivision[]>([]);
  const [provOptions, setProvOptions] = useState<AdminDivision[]>([]);
  const [distOptions, setDistOptions] = useState<AdminDivision[]>([]);
  const [loading, setLoading] = useState(false);

  const countryMeta = countries.find((c) => c.code === countryCode) ?? null;
  const useCatalog = !catalogUnavailable && !!countryMeta;

  /* Nivel 1: se recarga al cambiar de país */
  useEffect(() => {
    setDeptOptions([]);
    setProvOptions([]);
    setDistOptions([]);
    if (!useCatalog || !countryCode) return;
    let cancelled = false;
    setLoading(true);
    adminDivisionsService
      .topLevel(apiFetch, countryCode)
      .then((opts) => !cancelled && setDeptOptions(opts))
      .catch(() => !cancelled && setDeptOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, catalogUnavailable, countries.length]);

  /* Coincidencias por nombre normalizado (precarga en modo edición incluida) */
  const matchedDept = useMemo(
    () => deptOptions.find((o) => norm(o.name) === norm(values.stateProvince)) ?? null,
    [deptOptions, values.stateProvince],
  );
  const matchedProv = useMemo(
    () => provOptions.find((o) => norm(o.name) === norm(values.county)) ?? null,
    [provOptions, values.county],
  );

  /* Nivel 2: hijos del departamento coincidente */
  useEffect(() => {
    setProvOptions([]);
    setDistOptions([]);
    if (!useCatalog || !matchedDept) return;
    let cancelled = false;
    setLoading(true);
    adminDivisionsService
      .children(apiFetch, matchedDept.id)
      .then((opts) => !cancelled && setProvOptions(opts))
      .catch(() => !cancelled && setProvOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedDept?.id, useCatalog]);

  const maxLevel = countryMeta?.adminLevels ?? 0;

  /* Nivel 3: hijos de la provincia coincidente (solo países con nivel 3) */
  useEffect(() => {
    setDistOptions([]);
    if (!useCatalog || maxLevel < 3 || !matchedProv) return;
    let cancelled = false;
    setLoading(true);
    adminDivisionsService
      .children(apiFetch, matchedProv.id)
      .then((opts) => !cancelled && setDistOptions(opts))
      .catch(() => !cancelled && setDistOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedProv?.id, useCatalog, maxLevel]);

  const optionsFor = (level: 1 | 2 | 3): AdminDivision[] =>
    level === 1 ? deptOptions : level === 2 ? provOptions : distOptions;

  const handleSelect = (level: 1 | 2 | 3, divisionId: string) => {
    if (level === 1) {
      const d = deptOptions.find((o) => o.id === divisionId);
      onValuesChange({
        stateProvince: d?.name ?? "",
        county: "",
        municipality: "",
        locationId: d?.locationId ?? "",
      });
    } else if (level === 2) {
      const p = provOptions.find((o) => o.id === divisionId);
      onValuesChange({
        county: p?.name ?? "",
        municipality: "",
        locationId: p?.locationId ?? matchedDept?.locationId ?? "",
      });
    } else {
      const m = distOptions.find((o) => o.id === divisionId);
      onValuesChange({
        municipality: m?.name ?? "",
        locationId:
          m?.locationId ?? matchedProv?.locationId ?? matchedDept?.locationId ?? "",
      });
    }
  };

  /** Edición de texto libre: el locationId queda con la división coincidente más profunda */
  const handleFreeText = (level: 1 | 2 | 3, value: string) => {
    const field = LEVELS.find((l) => l.level === level)!.field;
    const locationId =
      level === 1
        ? ""
        : level === 2
          ? matchedDept?.locationId ?? ""
          : matchedProv?.locationId ?? matchedDept?.locationId ?? "";
    onValuesChange({ [field]: value, locationId });
  };

  const renderLevel = (cfg: (typeof LEVELS)[number]) => {
    const value = values[cfg.field];
    const options = optionsFor(cfg.level);
    const catalogued = useCatalog && maxLevel >= cfg.level;
    const matched = options.find((o) => norm(o.name) === norm(value)) ?? null;

    if (!catalogued) {
      return (
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3" key={cfg.level}>
          <Label htmlFor={cfg.field} className="flex flex-wrap items-center gap-2">
            {cfg.label}
            <span className="text-[10px] text-muted-foreground">{cfg.dwc}</span>
          </Label>
          <Input
            id={cfg.field}
            value={value}
            onChange={(e) => handleFreeText(cfg.level, e.target.value)}
            placeholder={cfg.placeholder}
          />
        </div>
      );
    }

    return (
      <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3" key={cfg.level}>
        <Label htmlFor={`${cfg.field}-select`} className="flex flex-wrap items-center gap-2">
          {cfg.label}
          <span className="text-[10px] text-muted-foreground">{cfg.dwc}</span>
        </Label>
        <Select
          value={matched?.id ?? ""}
          onValueChange={(id) => handleSelect(cfg.level, id)}
          disabled={loading && options.length === 0}
        >
          <SelectTrigger id={`${cfg.field}-select`}>
            <SelectValue placeholder={loading && options.length === 0 ? "Cargando…" : "Selecciona"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && !matched && (
          <Input
            id={cfg.field}
            value={value}
            onChange={(e) => handleFreeText(cfg.level, e.target.value)}
            placeholder={cfg.placeholder}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }} className="space-y-3">
          <Label htmlFor="countryCode" className="flex flex-wrap items-center gap-2">
            País <Badge variant="outline" className="text-xs">Recomendado</Badge>
            <span className="text-[10px] text-muted-foreground">dwc:countryCode</span>
          </Label>
          {catalogUnavailable ? (
            <Input
              id="countryNameFallback"
              value={countryNameFallback}
              onChange={(e) => onCountryNameFallbackChange(e.target.value)}
              placeholder="Ej: Perú"
            />
          ) : (
            <Select value={countryCode} onValueChange={onCountryChange}>
              <SelectTrigger id="countryCode">
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} <span className="text-muted-foreground ml-1">({c.code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {LEVELS.map((cfg) => renderLevel(cfg))}
      </div>
    </div>
  );
}
