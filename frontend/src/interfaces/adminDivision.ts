// Divisiones administrativas (catálogo INEI + GeoNames)
export interface CatalogCountry {
  code: string;
  name: string;
  source: "INEI" | "GEONAMES";
  adminLevels: number;
}

export interface AdminDivision {
  id: string;
  countryCode: string;
  level: number; // 1 departamento · 2 provincia · 3 distrito
  code: string;
  name: string;
  parentId: string | null;
  source: "INEI" | "GEONAMES";
  /** URI estable para dwc:locationID (ubigeo o GeoNames) */
  locationId: string;
}

export interface ResolvedDivision {
  name: string;
  code: string;
  locationId: string;
}

/** Respuesta de GET /admin-divisions/resolve. */
export interface ResolveResult {
  department: ResolvedDivision | null;
  province: ResolvedDivision | null;
  district: ResolvedDivision | null;
}
