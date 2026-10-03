import csv
import json
import tempfile
import unittest
from pathlib import Path

from backend.scripts.clean_usm_csv import SOURCE_COLUMNS
from backend.scripts.export_usm_expert_review import ExportError, export_review


class ExportUsmExpertReviewTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.input_dir = self.root / "cleaner-output"
        self.output_dir = self.root / "expert-review"
        self.input_dir.mkdir()
        self.source_data = {column: "" for column in SOURCE_COLUMNS}
        self.source_data.update({"Código USM": "0001", "Género": "Jarava", "Especie": "cf. ichu"})
        self._write_inputs()

    def tearDown(self):
        self.temporary_directory.cleanup()

    @staticmethod
    def _write_csv(path, headers, rows):
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    def _write_inputs(self, *, issues=None):
        record = {
            "sourceFile": "32_310.csv",
            "sourceRow": "2",
            "catalogNumber": "0001",
            "cleaningStatus": "review",
            "dynamicProperties": json.dumps({"sourceData": self.source_data}),
            "stateProvince": "Cusco",
            "eventDate": "",
        }
        self._write_csv(
            self.input_dir / "needs_review.csv",
            tuple(record),
            [record],
        )
        issue_rows = issues or [
            {
                "sourceFile": "32_310.csv",
                "sourceRow": "2",
                "catalogNumber": "0001",
                "field": "stateProvince",
                "originalValue": "Cuzco",
                "resultingValue": "",
                "severity": "review",
                "reason": "Departamento no coincide exactamente con INEI.",
            },
            {
                "sourceFile": "32_310.csv",
                "sourceRow": "2",
                "catalogNumber": "0001",
                "field": "stateProvince",
                "originalValue": "Cuzco",
                "resultingValue": "Cusco",
                "severity": "review",
                "reason": "Departamento inferido desde provincia.",
            },
            {
                "sourceFile": "32_310.csv",
                "sourceRow": "2",
                "catalogNumber": "0001",
                "field": "eventDate",
                "originalValue": "Abr. 2104",
                "resultingValue": "",
                "severity": "review",
                "reason": "Fecha ambigua.",
            },
            {
                "sourceFile": "32_310.csv",
                "sourceRow": "2",
                "catalogNumber": "0001",
                "field": "country",
                "originalValue": "",
                "resultingValue": "Perú",
                "severity": "info",
                "reason": "País inferido.",
            },
        ]
        self._write_csv(
            self.input_dir / "review.csv",
            (
                "sourceFile",
                "sourceRow",
                "catalogNumber",
                "field",
                "originalValue",
                "resultingValue",
                "severity",
                "reason",
            ),
            issue_rows,
        )
        held_rows = []
        for source_row in ("10", "11"):
            held = {column: "" for column in SOURCE_COLUMNS}
            held.update(
                {
                    "Código USM": "0002",
                    "sourceFile": "32_310.csv",
                    "sourceRow": source_row,
                    "holdReason": "Código USM duplicado (0002); se retuvieron ambas filas.",
                }
            )
            held_rows.append(held)
        libre = {column: "" for column in SOURCE_COLUMNS}
        libre.update(
            {
                "Código USM": "LIBRE",
                "sourceFile": "32_310.csv",
                "sourceRow": "12",
                "holdReason": "Fila de reserva marcada como LIBRE.",
            }
        )
        held_rows.append(libre)
        self._write_csv(
            self.input_dir / "held.csv",
            (*SOURCE_COLUMNS, "sourceFile", "sourceRow", "holdReason", "extraColumns"),
            held_rows,
        )

    def test_export_groups_flags_preserves_context_and_exports_duplicates(self):
        summary = export_review(self.input_dir, self.output_dir)
        self.assertEqual(summary["reviewIssueCount"], 3)
        self.assertEqual(summary["reviewFieldDecisionCount"], 2)
        self.assertEqual(summary["reviewSpecimenCount"], 1)
        self.assertEqual(summary["duplicateGroupCount"], 1)
        self.assertEqual(summary["duplicateRecordCount"], 2)

        with (self.output_dir / "expert_review.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            review = list(csv.DictReader(handle))
        location = next(row for row in review if row["field"] == "stateProvince")
        self.assertEqual(location["originalValue"], "Cuzco")
        self.assertEqual(location["currentMappedValue"], "Cusco")
        self.assertEqual(location["reviewReasons"].count("\n"), 1)
        self.assertEqual(location["Departamento"], self.source_data["Departamento"])
        self.assertEqual(location["expertDecision"], "")
        self.assertEqual(location["expertProposedValue"], "")
        self.assertEqual(
            json.loads(location["sourceOriginal"]),
            {"headers": list(SOURCE_COLUMNS), "values": list(self.source_data.values())},
        )

        with (self.output_dir / "expert_duplicates.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            duplicates = list(csv.DictReader(handle))
        self.assertEqual(len(duplicates), 2)
        self.assertEqual({row["sourceRow"] for row in duplicates}, {"10", "11"})
        self.assertEqual({row["Código USM"] for row in duplicates}, {"0002"})

    def test_export_rejects_an_issue_without_a_matching_review_record(self):
        issues = [
            {
                "sourceFile": "32_310.csv",
                "sourceRow": "99",
                "catalogNumber": "9999",
                "field": "county",
                "originalValue": "Desconocido",
                "resultingValue": "",
                "severity": "review",
                "reason": "No coincide con catálogo.",
            }
        ]
        self._write_inputs(issues=issues)
        with self.assertRaisesRegex(ExportError, "sin registro correspondiente"):
            export_review(self.input_dir, self.output_dir)

    def test_export_refuses_to_replace_an_existing_packet_without_flag(self):
        export_review(self.input_dir, self.output_dir)
        with self.assertRaisesRegex(ExportError, "use --overwrite"):
            export_review(self.input_dir, self.output_dir)
        export_review(self.input_dir, self.output_dir, overwrite=True)

    def _read(self, directory, name):
        with (directory / name).open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))

    def test_whitespace_equivalent_issues_are_grouped_but_conflicting_values_fail(self):
        issues = self._read(self.input_dir, "review.csv")
        issues[1]["originalValue"] = " Cuzco \n"
        self._write_csv(self.input_dir / "review.csv", tuple(issues[0]), issues)
        summary = export_review(self.input_dir, self.output_dir)
        self.assertEqual(summary["reviewFieldDecisionCount"], 2)
        issues[1]["originalValue"] = "Huancavelica"
        self._write_csv(self.input_dir / "review.csv", tuple(issues[0]), issues)
        before = (self.output_dir / "expert_review.csv").read_bytes()
        with self.assertRaisesRegex(ExportError, "Valores originales distintos"):
            export_review(self.input_dir, self.output_dir, True)
        self.assertEqual(before, (self.output_dir / "expert_review.csv").read_bytes())

    def test_extra_values_and_original_alias_headers_reach_expert_packet(self):
        records = self._read(self.input_dir, "needs_review.csv")
        original = {
            "headers": [" CÓDIGO USM", *SOURCE_COLUMNS[1:], "Unnamed: 26"],
            "values": [*self.source_data.values(), "Consultar a especialista"],
        }
        records[0]["dynamicProperties"] = json.dumps(
            {
                "sourceData": self.source_data,
                "sourceOriginal": original,
            }
        )
        self._write_csv(self.input_dir / "needs_review.csv", tuple(records[0]), records)
        issues = self._read(self.input_dir, "review.csv")
        issues.append(
            {
                **issues[0],
                "field": "sourceExtraColumns",
                "originalValue": json.dumps(
                    [{"column": "Unnamed: 26", "value": "Consultar a especialista"}]
                ),
                "resultingValue": "",
                "reason": "Columna adicional con contenido.",
            }
        )
        self._write_csv(self.input_dir / "review.csv", tuple(issues[0]), issues)
        export_review(self.input_dir, self.output_dir)
        exported = self._read(self.output_dir, "expert_review.csv")
        extra = next(row for row in exported if row["field"] == "sourceExtraColumns")
        self.assertEqual(json.loads(extra["sourceOriginal"]), original)
        self.assertIn("Consultar a especialista", extra["originalValue"])
        self.assertEqual(extra["expertDecision"], "")

    def test_cross_file_duplicates_keep_complete_context_and_stable_order(self):
        held = self._read(self.input_dir, "held.csv")
        held[0].update({"sourceFile": "37_360.csv", "sourceRow": "2"})
        held[1].update({"sourceFile": "1_0.csv", "sourceRow": "2"})
        original = {"headers": ["CÓDIGO USM", "Autor.1"], "values": ["0002", ""]}
        for row in held:
            row["sourceOriginal"] = json.dumps(original)
        self._write_csv(self.input_dir / "held.csv", tuple(held[0]), held)
        summary = export_review(self.input_dir, self.output_dir)
        self.assertEqual(summary["duplicateGroupCount"], 1)
        duplicates = self._read(self.output_dir, "expert_duplicates.csv")
        self.assertEqual([r["sourceFile"] for r in duplicates], ["1_0.csv", "37_360.csv"])
        self.assertEqual({r["duplicateGroupSize"] for r in duplicates}, {"2"})
        self.assertEqual(json.loads(duplicates[0]["sourceOriginal"]), original)

    def test_invalid_original_source_context_is_rejected(self):
        records = self._read(self.input_dir, "needs_review.csv")
        records[0]["dynamicProperties"] = json.dumps(
            {
                "sourceData": self.source_data,
                "sourceOriginal": {"headers": [], "values": [42]},
            }
        )
        self._write_csv(self.input_dir / "needs_review.csv", tuple(records[0]), records)
        with self.assertRaisesRegex(ExportError, "sourceOriginal inválido"):
            export_review(self.input_dir, self.output_dir)


if __name__ == "__main__":
    unittest.main()
