"""Export cleaned USM records to the application's occurrence ingestion CSV."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import tempfile
from collections import Counter
from contextlib import ExitStack
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

from backend.scripts.clean_usm_csv import AUDIT_COLUMNS, OUTPUT_DWC_FIELDS, REPOSITORY_ROOT
from backend.utils.catalog import normalize_catalog_number
from backend.utils.dwc import ALLOWED_FIELDS

DEFAULT_INPUT_DIR = REPOSITORY_ROOT / "data/cleaned/usm_all"
INPUT_COLUMNS = (*OUTPUT_DWC_FIELDS, *AUDIT_COLUMNS)
OUTPUT_NAMES = ("occurrences.dwc.csv", "rejected.csv", "ingestion_review.csv", "summary.json")
NAMESPACE = "usmIngestion"

# This is an adapter to the application's current allowlist, not a new DwC mapping.
ENTITY_FIELDS = {
    "Occurrence": (
        "catalogNumber",
        "recordNumber",
        "recordedBy",
        "occurrenceRemarks",
        "dynamicProperties",
    ),
    "Event": ("verbatimEventDate", "eventDate", "year", "month", "day", "habitat"),
    "Location": (
        "country",
        "countryCode",
        "stateProvince",
        "county",
        "municipality",
        "locality",
        "verbatimLocality",
        "decimalLatitude",
        "decimalLongitude",
        "verbatimElevation",
    ),
    "Taxon": ("scientificName", "scientificNameAuthorship"),
    "Identification": ("identifiedBy", "dateIdentified", "typeStatus"),
}
DIRECT_FIELDS = tuple((entity, term) for entity, terms in ENTITY_FIELDS.items() for term in terms)
INGESTION_HEADERS = tuple(f"dwc:{entity}:{term}" for entity, term in DIRECT_FIELDS)
UNSUPPORTED_FIELDS = tuple(
    term for term in OUTPUT_DWC_FIELDS if term not in {field for _, field in DIRECT_FIELDS}
)
STRING_LIMITS = {
    "catalogNumber": 100,
    "recordNumber": 100,
    "recordedBy": 255,
    "verbatimEventDate": 100,
    "eventDate": 100,
    "country": 100,
    "countryCode": 10,
    "stateProvince": 100,
    "county": 100,
    "municipality": 100,
    "verbatimElevation": 100,
    "scientificName": 500,
    "scientificNameAuthorship": 255,
    "dateIdentified": 100,
    "typeStatus": 100,
}
REVIEW_COLUMNS = (
    "sourceFile",
    "sourceRow",
    "catalogNumber",
    "field",
    "originalValue",
    "reason",
)


class ExportError(ValueError):
    """A source or ingestion-contract error safe to report to the operator."""


def input_rows(path: Path) -> Iterable[tuple[int, list[str], dict[str, str]]]:
    try:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle, strict=True)
            headers = next(reader, [])
            if len(headers) != len(set(headers)) or set(headers) != set(INPUT_COLUMNS):
                raise ExportError(
                    "cleaned.csv debe tener el esquema completo y único del limpiador."
                )
            for values in reader:
                yield reader.line_num, values, dict(zip(headers, values))
    except (OSError, UnicodeError, csv.Error) as exc:
        raise ExportError(f"No se pudo leer {path}: {exc}") from exc


def parse_determiners(text: str) -> Optional[list[str]]:
    """Recognize explicit lists and clear single credits; never split arbitrary commas."""
    if not text.strip():
        return []
    parts = re.split(r"[;|]", text)
    names = []
    for part in parts:
        name = part.strip()
        if not name or re.search(r"&|/|\b(?:y|and|et\s+al)\b", name, re.IGNORECASE):
            return None
        if "," in name and not re.fullmatch(r"[^,]+,\s*(?:[^\W\d_]\.\s*)+", name):
            return None
        names.append(name)
    return names


def adapt_record(row: dict[str, str]) -> tuple[dict[str, str], Optional[dict[str, str]]]:
    if row["cleaningStatus"] != "cleaned":
        raise ValueError(
            "cleaningStatus debe ser cleaned; no se exportan filas pendientes de revisión."
        )
    if not row["sourceFile"].strip() or not re.fullmatch(r"[0-9]+", row["sourceRow"]):
        raise ValueError("Falta una referencia válida de sourceFile/sourceRow.")
    if int(row["sourceRow"]) < 2:
        raise ValueError("sourceRow debe referenciar una fila de datos.")
    values = {term: row[term].strip() for _, term in DIRECT_FIELDS}
    values["catalogNumber"] = normalize_catalog_number(values["catalogNumber"])
    raw_properties = row["dynamicProperties"].strip()
    try:
        properties = json.loads(raw_properties) if raw_properties else None
    except json.JSONDecodeError as exc:
        raise ValueError("dynamicProperties no es un JSON válido") from exc
    if properties is None:
        properties = {}
    if not isinstance(properties, dict):
        raise ValueError("dynamicProperties debe ser un objeto JSON o null")
    if NAMESPACE in properties:
        raise ValueError(f"dynamicProperties ya contiene el espacio reservado {NAMESPACE}")
    metadata: dict[str, Any] = {
        "sourceFile": row["sourceFile"],
        "sourceRow": int(row["sourceRow"]),
        "cleaningStatus": "cleaned",
        "unsupportedDwcFields": {term: row[term] for term in UNSUPPORTED_FIELDS if row[term]},
    }
    name = values["scientificName"]
    author = values["scientificNameAuthorship"]
    if author and name.endswith(" " + author):
        values["scientificName"] = name[: -(len(author) + 1)].rstrip()
        metadata["originalScientificName"] = row["scientificName"]

    warning = None
    names = parse_determiners(row["identifiedBy"])
    if names is None:
        reason = "Crédito de determinación ambiguo; se preservó sin inferir personas individuales."
        metadata["deferredIdentifiedBy"] = {"verbatim": row["identifiedBy"], "reason": reason}
        values["identifiedBy"] = ""
        warning = {
            "sourceFile": row["sourceFile"],
            "sourceRow": row["sourceRow"],
            "catalogNumber": values["catalogNumber"],
            "field": "identifiedBy",
            "originalValue": row["identifiedBy"],
            "reason": reason,
        }
    else:
        if any(len(name) > 255 for name in names):
            raise ValueError("identifiedBy contiene un nombre que excede 255 caracteres")
        values["identifiedBy"] = json.dumps(names, ensure_ascii=False) if names else ""
        if row["identifiedBy"]:
            metadata["originalIdentifiedBy"] = row["identifiedBy"]

    for term, limit in STRING_LIMITS.items():
        if len(values[term]) > limit:
            raise ValueError(f"{term} excede el límite de {limit} caracteres; no se truncó.")
    components = {}
    for term, low, high in (("year", 1, 9999), ("month", 1, 12), ("day", 1, 31)):
        value = values[term]
        if value:
            if not re.fullmatch(r"[0-9]+", value) or not low <= int(value) <= high:
                raise ValueError(f"{term} debe ser un entero entre {low} y {high}")
            components[term] = int(value)
    if len(components) == 3:
        try:
            date(components["year"], components["month"], components["day"])
        except ValueError as exc:
            raise ValueError("year/month/day no forman una fecha válida") from exc
    lat, lon = values["decimalLatitude"], values["decimalLongitude"]
    if bool(lat) != bool(lon):
        raise ValueError("Las coordenadas requieren un par completo de latitud y longitud")
    for term, bound in (("decimalLatitude", 90), ("decimalLongitude", 180)):
        if values[term]:
            try:
                number = float(values[term])
            except ValueError as exc:
                raise ValueError(f"{term} no es un número decimal") from exc
            if not math.isfinite(number) or not -bound <= number <= bound:
                raise ValueError(f"{term} debe ser finito y estar entre {-bound} y {bound}")
    properties[NAMESPACE] = metadata
    try:
        values["dynamicProperties"] = json.dumps(
            properties, ensure_ascii=False, separators=(",", ":"), allow_nan=False
        )
    except ValueError as exc:
        raise ValueError("dynamicProperties contiene valores JSON numéricos no finitos") from exc
    return {f"dwc:{entity}:{term}": values[term] for entity, term in DIRECT_FIELDS}, warning


def generate_ingestion(
    input_dir: Path,
    output_dir: Path,
    overwrite: bool = False,
) -> dict[str, Any]:
    path = input_dir / "cleaned.csv"
    existing = [output_dir / name for name in OUTPUT_NAMES if (output_dir / name).exists()]
    if existing and not overwrite:
        raise ExportError("Ya existen salidas; use --overwrite: " + ", ".join(map(str, existing)))
    for entity, term in DIRECT_FIELDS:
        if term not in ALLOWED_FIELDS.get(entity, set()):
            raise ExportError(f"El importador no admite dwc:{entity}:{term}")
    catalogs: Counter[str] = Counter()
    for _, raw, row in input_rows(path):
        if len(raw) == len(INPUT_COLUMNS):
            try:
                catalogs[normalize_catalog_number(row["catalogNumber"])] += 1
            except ValueError:
                pass  # The record will be quarantined with its source context.
    duplicates = sorted(catalog for catalog, count in catalogs.items() if count > 1)
    if duplicates:
        raise ExportError("cleaned.csv contiene catálogos duplicados: " + ", ".join(duplicates))
    counts: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="usm-ingestion-", dir=output_dir) as temporary_dir:
        temporary = Path(temporary_dir)
        with ExitStack() as stack:
            writers = {}
            for name, headers in (
                ("occurrences.dwc.csv", INGESTION_HEADERS),
                ("rejected.csv", (*INPUT_COLUMNS, "inputLine", "ingestionReason", "extraColumns")),
                ("ingestion_review.csv", REVIEW_COLUMNS),
            ):
                handle = stack.enter_context(
                    (temporary / name).open("w", encoding="utf-8-sig", newline="")
                )
                writers[name] = csv.DictWriter(handle, fieldnames=headers)
                writers[name].writeheader()
            for input_line, raw, row in input_rows(path):
                counts["inputRows"] += 1
                try:
                    if len(raw) != len(INPUT_COLUMNS):
                        raise ValueError(
                            f"Ancho inválido: {len(raw)} celdas, se esperaban {len(INPUT_COLUMNS)}"
                        )
                    output, warning = adapt_record(row)
                except ValueError as exc:
                    reason = str(exc)
                    writers["rejected.csv"].writerow(
                        {
                            **{term: row.get(term, "") for term in INPUT_COLUMNS},
                            "inputLine": input_line,
                            "ingestionReason": reason,
                            "extraColumns": json.dumps(
                                raw[len(INPUT_COLUMNS) :], ensure_ascii=False
                            ),
                        }
                    )
                    counts["rejectedRows"] += 1
                    reasons[reason] += 1
                    continue
                writers["occurrences.dwc.csv"].writerow(output)
                counts["exportedRows"] += 1
                if not output["dwc:Taxon:scientificName"]:
                    counts["rowsWithoutScientificName"] += 1
                if warning:
                    writers["ingestion_review.csv"].writerow(warning)
                    counts["deferredIdentifierRows"] += 1
        summary = {
            "source": str(path),
            **{
                key: counts[key]
                for key in (
                    "inputRows",
                    "exportedRows",
                    "rejectedRows",
                    "rowsWithoutScientificName",
                    "deferredIdentifierRows",
                )
            },
            "rejectionReasons": dict(reasons),
            "taxonMatching": "Deferred to import against the current database; unmatched specimens are allowed.",
            "unsupportedFieldsPreserved": list(UNSUPPORTED_FIELDS),
            "outputs": {name: str(output_dir / name) for name in OUTPUT_NAMES},
        }
        if counts["inputRows"] != counts["exportedRows"] + counts["rejectedRows"]:
            raise ExportError("Los totales de exportación no coinciden")
        (temporary / "summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        for name in OUTPUT_NAMES:
            (temporary / name).replace(output_dir / name)
    return summary


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    output_dir = args.output_dir or REPOSITORY_ROOT / "data/ingestion" / args.input_dir.name
    try:
        summary = generate_ingestion(args.input_dir, output_dir, args.overwrite)
    except (ExportError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
