"""Create editable expert-review CSVs from a USM cleaner output directory."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Optional, Sequence

from backend.scripts.clean_usm_csv import OUTPUT_DWC_FIELDS, SOURCE_COLUMNS, normalize_text

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
REVIEW_REPORT_COLUMNS = {
    "sourceFile",
    "sourceRow",
    "catalogNumber",
    "field",
    "originalValue",
    "resultingValue",
    "severity",
    "reason",
}
NEEDS_REVIEW_COLUMNS = {
    "sourceFile",
    "sourceRow",
    "catalogNumber",
    "cleaningStatus",
    "dynamicProperties",
}
HELD_COLUMNS = {"sourceFile", "sourceRow", "holdReason", *SOURCE_COLUMNS}
EXPERT_REVIEW_COLUMNS = (
    "sourceFile",
    "sourceRow",
    "catalogNumber",
    "field",
    "originalValue",
    "currentMappedValue",
    "reviewReasons",
    *SOURCE_COLUMNS,
    "sourceOriginal",
    "expertDecision",
    "expertProposedValue",
    "expertNotes",
)
EXPERT_DUPLICATE_COLUMNS = (
    "duplicateCatalogNumber",
    "duplicateGroupSize",
    "sourceFile",
    "sourceRow",
    "holdReason",
    *SOURCE_COLUMNS,
    "sourceOriginal",
    "expertDecision",
    "expertProposedCatalogNumber",
    "expertNotes",
)
OUTPUT_NAMES = ("expert_review.csv", "expert_duplicates.csv", "summary.json")
DUPLICATE_REASON = re.compile(r"^Código USM duplicado \((\d{1,100})\);")


class ExportError(ValueError):
    """Raised when cleaner outputs cannot be safely joined for expert review."""


def read_csv(path: Path, required_columns: set[str]) -> list[dict[str, str]]:
    if not path.is_file():
        raise ExportError(f"No existe el archivo requerido: {path}")
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = set(reader.fieldnames or ())
            missing = required_columns - columns
            if missing:
                raise ExportError(
                    f"Encabezados faltantes en {path.name}: {', '.join(sorted(missing))}."
                )
            return [dict(row) for row in reader]
    except (OSError, UnicodeError, csv.Error) as exc:
        raise ExportError(f"No se pudo leer {path}: {exc}") from exc


def row_key(row: dict[str, str], source: str) -> tuple[str, str]:
    source_file = row.get("sourceFile", "")
    source_row = row.get("sourceRow", "")
    if not source_file or not source_row:
        raise ExportError(f"Falta sourceFile o sourceRow en {source}.")
    try:
        int(source_row)
    except ValueError as exc:
        raise ExportError(f"sourceRow inválido en {source}: {source_row!r}.") from exc
    return source_file, source_row


def load_source_data(row: dict[str, str], key: tuple[str, str]) -> dict[str, str]:
    try:
        properties = json.loads(row["dynamicProperties"])
    except (KeyError, json.JSONDecodeError) as exc:
        raise ExportError(f"dynamicProperties inválido para {key[0]} fila {key[1]}.") from exc
    source_data = properties.get("sourceData") if isinstance(properties, dict) else None
    if not isinstance(source_data, dict) or set(SOURCE_COLUMNS) - set(source_data):
        raise ExportError(f"Falta sourceData completo para {key[0]} fila {key[1]}.")
    return {column: str(source_data[column]) for column in SOURCE_COLUMNS}


def source_original(row: dict[str, str], key: tuple[str, str], mapped: bool) -> str:
    """Return exact source cells, or a canonical snapshot for legacy reports."""
    if mapped:
        original = json.loads(row["dynamicProperties"]).get("sourceOriginal")
    else:
        try:
            original = json.loads(row["sourceOriginal"]) if row.get("sourceOriginal") else None
        except json.JSONDecodeError as exc:
            raise ExportError(f"sourceOriginal inválido para {key[0]} fila {key[1]}.") from exc
    if original is None:
        data = load_source_data(row, key) if mapped else row
        original = {"headers": list(SOURCE_COLUMNS), "values": [data[c] for c in SOURCE_COLUMNS]}
    if (
        not isinstance(original, dict)
        or not isinstance(original.get("headers"), list)
        or not isinstance(original.get("values"), list)
        or not all(isinstance(value, str) for value in original["headers"] + original["values"])
    ):
        raise ExportError(f"sourceOriginal inválido para {key[0]} fila {key[1]}.")
    return json.dumps(original, ensure_ascii=False)


def review_rows(
    pending_records: list[dict[str, str]], issue_rows: list[dict[str, str]]
) -> tuple[list[dict[str, Any]], int]:
    records: dict[tuple[str, str], dict[str, str]] = {}
    source_data: dict[tuple[str, str], dict[str, str]] = {}
    for record in pending_records:
        key = row_key(record, "needs_review.csv")
        if record["cleaningStatus"] != "review":
            raise ExportError(f"Estatus distinto de review en fila {key[0]}:{key[1]}.")
        if key in records:
            raise ExportError(f"Registro repetido en needs_review.csv: {key[0]}:{key[1]}.")
        records[key] = record
        source_data[key] = load_source_data(record, key)

    grouped_issues: dict[tuple[tuple[str, str], str], list[dict[str, str]]] = defaultdict(list)
    review_issue_count = 0
    for issue in issue_rows:
        if issue["severity"] != "review":
            continue
        review_issue_count += 1
        key = row_key(issue, "review.csv")
        record = records.get(key)
        if record is None:
            raise ExportError(f"Incidencia sin registro correspondiente: {key[0]} fila {key[1]}.")
        if issue["catalogNumber"] != record["catalogNumber"]:
            raise ExportError(f"catalogNumber no coincide para {key[0]} fila {key[1]}.")
        if not issue["field"]:
            raise ExportError(f"Campo vacío en incidencia de {key[0]} fila {key[1]}.")
        grouped_issues[(key, issue["field"])].append(issue)

    issue_records = {key for key, _ in grouped_issues}
    missing_issues = set(records) - issue_records
    if missing_issues:
        missing = min(missing_issues, key=lambda key: (key[0], int(key[1])))
        raise ExportError(f"Registro sin incidencia de revisión: {missing[0]} fila {missing[1]}.")

    exported: list[dict[str, Any]] = []
    for (key, field), issues in sorted(
        grouped_issues.items(), key=lambda item: (item[0][0][0], int(item[0][0][1]), item[0][1])
    ):
        record = records[key]
        originals = list(dict.fromkeys(issue["originalValue"] for issue in issues))
        if len({normalize_text(value) for value in originals}) != 1:
            raise ExportError(
                f"Valores originales distintos en {key[0]} fila {key[1]}, campo {field}."
            )
        if field in OUTPUT_DWC_FIELDS:
            mapped_value = record.get(field, "")
        else:
            mapped_values = list(
                dict.fromkeys(
                    issue["resultingValue"] for issue in issues if issue["resultingValue"]
                )
            )
            if len(mapped_values) > 1:
                raise ExportError(
                    f"Valores resultantes distintos en {key[0]} fila {key[1]}, campo {field}."
                )
            mapped_value = mapped_values[0] if mapped_values else ""
        reasons = list(dict.fromkeys(issue["reason"] for issue in issues))
        output = {
            "sourceFile": key[0],
            "sourceRow": key[1],
            "catalogNumber": record["catalogNumber"],
            "field": field,
            "originalValue": originals[0],
            "currentMappedValue": mapped_value,
            "reviewReasons": "\n".join(reasons),
            **source_data[key],
            "sourceOriginal": source_original(record, key, mapped=True),
            "expertDecision": "",
            "expertProposedValue": "",
            "expertNotes": "",
        }
        exported.append(output)
    return exported, review_issue_count


def duplicate_rows(held_records: list[dict[str, str]]) -> tuple[list[dict[str, Any]], int]:
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in held_records:
        match = DUPLICATE_REASON.match(row["holdReason"])
        if match:
            groups[match.group(1)].append(row)

    exported: list[dict[str, Any]] = []
    for catalog_number, group in sorted(groups.items(), key=lambda item: item[0]):
        if len(group) < 2:
            raise ExportError(f"Grupo duplicado incompleto para catalogNumber {catalog_number}.")
        for row in sorted(group, key=lambda item: (item["sourceFile"], int(item["sourceRow"]))):
            if row["Código USM"].strip() != catalog_number:
                raise ExportError(
                    f"Código USM no coincide con grupo duplicado {catalog_number}, "
                    f"fila {row['sourceRow']}."
                )
            exported.append(
                {
                    "duplicateCatalogNumber": catalog_number,
                    "duplicateGroupSize": len(group),
                    "sourceFile": row["sourceFile"],
                    "sourceRow": row["sourceRow"],
                    "holdReason": row["holdReason"],
                    **{column: row[column] for column in SOURCE_COLUMNS},
                    "sourceOriginal": source_original(row, row_key(row, "held.csv"), mapped=False),
                    "expertDecision": "",
                    "expertProposedCatalogNumber": "",
                    "expertNotes": "",
                }
            )
    return exported, len(groups)


def write_csv(path: Path, headers: Sequence[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def export_review(input_dir: Path, output_dir: Path, overwrite: bool = False) -> dict[str, Any]:
    existing = [output_dir / name for name in OUTPUT_NAMES if (output_dir / name).exists()]
    if existing and not overwrite:
        raise ExportError(
            "Ya existe un paquete de revisión; use --overwrite para reemplazarlo: "
            + ", ".join(map(str, existing))
        )
    pending = read_csv(input_dir / "needs_review.csv", NEEDS_REVIEW_COLUMNS)
    issues = read_csv(input_dir / "review.csv", REVIEW_REPORT_COLUMNS)
    held = read_csv(input_dir / "held.csv", HELD_COLUMNS)
    expert_rows, issue_count = review_rows(pending, issues)
    duplicate_records, duplicate_group_count = duplicate_rows(held)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "sourceOutputDirectory": str(input_dir),
        "reviewIssueCount": issue_count,
        "reviewFieldDecisionCount": len(expert_rows),
        "reviewSpecimenCount": len(pending),
        "duplicateGroupCount": duplicate_group_count,
        "duplicateRecordCount": len(duplicate_records),
        "outputs": {name: str(output_dir / name) for name in OUTPUT_NAMES},
    }
    with tempfile.TemporaryDirectory(prefix="usm-review-", dir=output_dir) as tmp_dir:
        temporary = Path(tmp_dir)
        write_csv(temporary / "expert_review.csv", EXPERT_REVIEW_COLUMNS, expert_rows)
        write_csv(temporary / "expert_duplicates.csv", EXPERT_DUPLICATE_COLUMNS, duplicate_records)
        (temporary / "summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        for name in OUTPUT_NAMES:
            (temporary / name).replace(output_dir / name)
    return summary


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Directory containing needs_review.csv, held.csv, and review.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Review packet directory (default: data/expert_review/<input directory name>)",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing review packet")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    output_dir = args.output_dir or REPOSITORY_ROOT / "data/expert_review" / args.input_dir.name
    try:
        summary = export_review(args.input_dir, output_dir, args.overwrite)
    except (ExportError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
