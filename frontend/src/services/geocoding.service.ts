import { API } from "@constants/api";
import { adminDivisionsService } from "@services/adminDivisions.service";
import type { ApiFetch } from "@services/api.error";

export interface AdminUnits {
  countryCode?: string;
  country?: string;
  stateProvince?: string;
  county?: string;
  municipality?: string;
  locationId?: string;
}

type NominatimAddress = Record<string, string | undefined>;
type PeruResolver = "inei" | "nominatim";

let resolverConfig: Promise<PeruResolver> | null = null;

async function getPeruResolver(apiFetch: ApiFetch): Promise<PeruResolver> {
  if (!resolverConfig) {
    resolverConfig = apiFetch(`${API.BASE_URL}${API.PATHS.ADMIN_DIVISIONS.CONFIG}`)
      .then(async (response) => {
        if (!response.ok) return "inei" as const;
        const data = await response.json();
        return data?.peruResolver === "nominatim" ? "nominatim" : "inei";
      })
      .catch(() => "inei" as const);
  }
  return resolverConfig;
}

const firstOf = (...values: (string | undefined)[]) => values.find((value) => value?.trim());

/** Map Nominatim's address fields to Darwin Core administrative fields. */
export function addressToAdminUnits(address: NominatimAddress): AdminUnits {
  const municipality = firstOf(address.municipality, address.city, address.town, address.village);
  return {
    countryCode: address.country_code?.toUpperCase(),
    country: address.country,
    stateProvince: firstOf(address.state, address.region),
    county: firstOf(address.county, address.province, address.state ? address.region : undefined),
    municipality,
  };
}

/** Nominatim reverse lookup for international addresses and configured fallbacks. */
export async function reverseGeocodeAdminUnits(lat: number, lon: number): Promise<AdminUnits | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("accept-language", "es");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const data = await response.json();
    return data?.address ? addressToAdminUnits(data.address) : null;
  } catch {
    return null;
  }
}

/** Use INEI for Peru by default; fall back to Nominatim on misses or errors. */
export async function resolveAdminUnits(apiFetch: ApiFetch, lat: number, lon: number): Promise<AdminUnits | null> {
  const withinPeruSearchArea = lat >= -18.5 && lat <= 0.5 && lon >= -81.5 && lon <= -68.5;
  if (withinPeruSearchArea && (await getPeruResolver(apiFetch)) === "inei") {
    try {
      const resolved = await adminDivisionsService.resolve(apiFetch, lat, lon);
      if (resolved) {
        return {
          countryCode: "PE",
          country: "Perú",
          stateProvince: resolved.department?.name,
          county: resolved.province?.name,
          municipality: resolved.district?.name,
          locationId: resolved.district?.locationId ?? resolved.province?.locationId ?? resolved.department?.locationId,
        };
      }
    } catch {
      // Nominatim below handles missing polygons, unavailable data, and API errors.
    }
  }
  return reverseGeocodeAdminUnits(lat, lon);
}
