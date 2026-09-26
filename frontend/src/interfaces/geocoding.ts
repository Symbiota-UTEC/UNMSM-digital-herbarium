/** Forma normalizada de unidades administrativas, ya sea desde el catálogo INEI propio o desde
 * el reverse geocoding de Nominatim (ver services/geocoding.service.ts). */
export interface AdminUnits {
  countryCode?: string;
  country?: string;
  stateProvince?: string;
  county?: string;
  municipality?: string;
  locationId?: string;
}
