# backend/data

Datasets de referencia usados por los scripts de seed. No se sirven por la API.

## ubigeo/

Catálogo oficial INEI de divisiones administrativas del Perú
(25 departamentos, 196 provincias, 1,874 distritos), con códigos de ubigeo
de 2/4/6 dígitos y enlaces explícitos de parentesco. Procedencia:
<https://github.com/ernestorivero/Ubigeo-Peru> (dump del catálogo INEI 2016).

## geonames/ (generado al sembrar)

Descargas de GeoNames (<https://www.geonames.org/export/>) que el script
`backend/scripts/seed_admin_divisions.py` obtiene si no están presentes:

- `countryInfo.txt` — países ISO 3166-1 (~252) con nombres en inglés.
- `country_names_es.json` — nombres en español por código ISO, generado
  localmente con `Intl.DisplayNames(['es'])` (Node) a partir de
  `countryInfo.txt`.
- `admin1CodesASCII.txt` y `admin2Codes.txt` — divisiones ADM1/ADM2 de
  todos los países.
- Opcionalmente `{CC}.zip` para el nivel 3 de algún país (`--adm3`).

Bajo licencia [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
cualquier derivado que se publique debe atribuir a GeoNames.
