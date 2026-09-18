export interface AdminUnits {
    countryCode?: string;
    stateProvince?: string; // departamento
    county?: string; // provincia
    municipality?: string; // distrito
    locality?: string; // centro poblado o barrio
}

type NominatimAddress = Record<string, string | undefined>;

const firstOf = (...values: (string | undefined)[]) => values.find((v) => v && v.trim());

/** Mapea el `address` de Nominatim. En Perú la provincia viene en `region` y el distrito en `city`/`town`. */
export function addressToAdminUnits(a: NominatimAddress): AdminUnits {
    const municipality = firstOf(a.municipality, a.city, a.town, a.village);
    return {
        countryCode: a.country_code?.toUpperCase(),
        stateProvince: firstOf(a.state, a.region),
        county: firstOf(a.county, a.province, a.state ? a.region : undefined),
        municipality,
        locality: [a.hamlet, a.village, a.neighbourhood, a.suburb].find((v) => v && v !== municipality),
    };
}

/** Deduce las unidades administrativas de un punto vía Nominatim; null si falla o no hay dato (p. ej. en el mar). */
export async function reverseGeocodeAdminUnits(lat: number, lon: number): Promise<AdminUnits | null> {
    try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lon));
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("accept-language", "es");
        url.searchParams.set("addressdetails", "1");
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        const data = await res.json();
        return data?.address ? addressToAdminUnits(data.address) : null;
    } catch {
        return null;
    }
}
