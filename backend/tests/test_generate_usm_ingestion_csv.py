import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.models import Collection, Identification, Identifier, Occurrence, Taxon, User
from backend.scripts.generate_usm_ingestion_csv import (
    DIRECT_FIELDS,
    INGESTION_HEADERS,
    INPUT_COLUMNS,
    STRING_LIMITS,
    ExportError,
    generate_ingestion,
    parse_determiners,
)
from backend.services.dwc_import import _process_dwc_csv, _strict_parse_headers


class GenerateUsmIngestionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.input_dir = self.root / "cleaner"
        self.input_dir.mkdir()
        self.output_dir = self.root / "ingestion"
        self.properties = {
            "sourceOriginal": {"headers": ["Código USM"], "values": ["0001"]},
            "sourceOther": "a\nb",
            "nested": {"count": 2, "verified": True},
        }

    def tearDown(self):
        self.temp.cleanup()

    def row(self, **updates):
        row = dict.fromkeys(INPUT_COLUMNS, "")
        row.update(
            {
                "catalogNumber": "0001",
                "sourceFile": "32_310.csv",
                "sourceRow": "2",
                "cleaningStatus": "cleaned",
                "scientificName": "Solanum glutinosum Dunal",
                "scientificNameAuthorship": "Dunal",
                "family": "SOLANACEAE",
                "genus": "Solanum",
                "specificEpithet": "glutinosum",
                "identifiedBy": "Rexnel, C.",
                "verbatimEventDate": "May. 1996",
                "eventDate": "1996-05",
                "year": "1996",
                "month": "5",
                "dynamicProperties": json.dumps(self.properties, ensure_ascii=False),
            }
        )
        row.update(updates)
        return row

    def write(self, rows, headers=INPUT_COLUMNS):
        with (self.input_dir / "cleaned.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    def read(self, name):
        with (self.output_dir / name).open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))

    def test_headers_preserve_values_provenance_and_partial_dates(self):
        self.write(
            [
                self.row(
                    occurrenceRemarks='Text, "quoted"\nnext line',
                    minimumElevationInMeters="100",
                    maximumElevationInMeters="200",
                )
            ]
        )
        summary = generate_ingestion(self.input_dir, self.output_dir)
        self.assertEqual(
            (summary["inputRows"], summary["exportedRows"], summary["rejectedRows"]), (1, 1, 0)
        )
        row = self.read("occurrences.dwc.csv")[0]
        self.assertEqual(tuple(row), INGESTION_HEADERS)
        self.assertEqual(len(_strict_parse_headers(list(row))), 26)
        self.assertEqual(row["dwc:Taxon:scientificName"], "Solanum glutinosum")
        self.assertEqual(row["dwc:Taxon:scientificNameAuthorship"], "Dunal")
        self.assertEqual(row["dwc:Event:eventDate"], "1996-05")
        self.assertEqual(row["dwc:Event:day"], "")
        self.assertEqual(row["dwc:Occurrence:occurrenceRemarks"], 'Text, "quoted"\nnext line')
        self.assertEqual(json.loads(row["dwc:Identification:identifiedBy"]), ["Rexnel, C."])
        properties = json.loads(row["dwc:Occurrence:dynamicProperties"])
        self.assertEqual({k: properties[k] for k in self.properties}, self.properties)
        unsupported = properties["usmIngestion"]["unsupportedDwcFields"]
        self.assertEqual(unsupported["family"], "SOLANACEAE")
        self.assertEqual(unsupported["minimumElevationInMeters"], "100")
        self.assertEqual(
            properties["usmIngestion"]["originalScientificName"], "Solanum glutinosum Dunal"
        )
        self.assertTrue(
            (self.output_dir / "occurrences.dwc.csv").read_bytes().startswith(b"\xef\xbb\xbf")
        )

    def test_name_parser_recognizes_only_clear_credits(self):
        self.assertEqual(parse_determiners("Rexnel, C."), ["Rexnel, C."])
        self.assertEqual(parse_determiners("van der Werff, H. C."), ["van der Werff, H. C."])
        self.assertEqual(
            parse_determiners("Cáceres, F.; Severo|M. Daza"), ["Cáceres, F.", "Severo", "M. Daza"]
        )
        for text in ("Hochr, Krap", "A & B", "A y B", "A and B", "Campos et al.", "A/B", "A;"):
            with self.subTest(text=text):
                self.assertIsNone(parse_determiners(text))
        self.assertEqual(parse_determiners(""), [])

    def test_ambiguous_credits_are_nonblocking_and_retained_for_review(self):
        self.write([self.row(identifiedBy="V. Alvarado, B. Melchor & M. Bejarano.")])
        summary = generate_ingestion(self.input_dir, self.output_dir)
        self.assertEqual(summary["deferredIdentifierRows"], 1)
        row = self.read("occurrences.dwc.csv")[0]
        self.assertEqual(row["dwc:Identification:identifiedBy"], "")
        properties = json.loads(row["dwc:Occurrence:dynamicProperties"])
        self.assertEqual(
            properties["usmIngestion"]["deferredIdentifiedBy"]["verbatim"],
            "V. Alvarado, B. Melchor & M. Bejarano.",
        )
        self.assertEqual(self.read("ingestion_review.csv")[0]["catalogNumber"], "0001")

    def test_invalid_values_are_quarantined_without_truncation(self):
        updates = [
            {"catalogNumber": "12A"},
            {"cleaningStatus": "review"},
            {"dynamicProperties": "not-json"},
            {"dynamicProperties": "[]"},
            {"dynamicProperties": '{"bad":NaN}'},
            {"dynamicProperties": '{"bad":1e400}'},
            {"dynamicProperties": '{"usmIngestion":{}}'},
            {"recordedBy": "a" * 256},
            {"decimalLatitude": "nan", "decimalLongitude": "0"},
            {"decimalLatitude": "-12"},
            {"decimalLatitude": "91", "decimalLongitude": "0"},
            {"year": "1996.5"},
            {"month": "13"},
            {"year": "1996", "month": "2", "day": "30"},
            {"sourceRow": "0"},
            {"identifiedBy": "a" * 256},
        ]
        rows = []
        for index, update in enumerate(updates, 2):
            rows.append(
                self.row(
                    catalogNumber=str(index),
                    **{k: v for k, v in update.items() if k != "catalogNumber"},
                )
            )
            if "catalogNumber" in update:
                rows[-1]["catalogNumber"] = update["catalogNumber"]
        self.write([self.row(), *rows])
        summary = generate_ingestion(self.input_dir, self.output_dir)
        self.assertEqual(summary["exportedRows"], 1)
        self.assertEqual(summary["rejectedRows"], len(updates))
        rejected = self.read("rejected.csv")
        self.assertEqual(
            next(r for r in rejected if len(r["recordedBy"]) == 256)["recordedBy"], "a" * 256
        )
        self.assertTrue(all(row["ingestionReason"] for row in rejected))

    def test_missing_names_null_properties_and_unaltered_authorship(self):
        self.write(
            [
                self.row(scientificName="", scientificNameAuthorship="", dynamicProperties="null"),
                self.row(
                    catalogNumber="1", scientificName="Solanum glutinosum", dynamicProperties=""
                ),
            ]
        )
        summary = generate_ingestion(self.input_dir, self.output_dir)
        self.assertEqual(summary["rowsWithoutScientificName"], 1)
        exported = self.read("occurrences.dwc.csv")
        self.assertEqual([r["dwc:Occurrence:catalogNumber"] for r in exported], ["0001", "1"])
        self.assertEqual(exported[1]["dwc:Taxon:scientificName"], "Solanum glutinosum")
        self.assertNotIn(
            "originalScientificName",
            json.loads(exported[1]["dwc:Occurrence:dynamicProperties"])["usmIngestion"],
        )

    def test_structural_errors_and_collisions_preserve_outputs(self):
        self.write([self.row()])
        generate_ingestion(self.input_dir, self.output_dir)
        before = {p.name: p.read_bytes() for p in self.output_dir.iterdir()}
        with self.assertRaisesRegex(ExportError, "overwrite"):
            generate_ingestion(self.input_dir, self.output_dir)
        self.write([self.row(), self.row()])
        with self.assertRaisesRegex(ExportError, "duplicados"):
            generate_ingestion(self.input_dir, self.output_dir, True)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output_dir.iterdir()})
        self.write([], INPUT_COLUMNS[:-1])
        with self.assertRaises(ExportError):
            generate_ingestion(self.input_dir, self.output_dir, True)
        self.write([self.row()])
        generate_ingestion(self.input_dir, self.output_dir, True)

    def test_malformed_rows_preserve_missing_and_extra_cells(self):
        self.write([self.row()])
        with (self.input_dir / "cleaned.csv").open("a", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["bad", "short"])
            writer.writerow([*self.row(catalogNumber="2").values(), "extra"])
        summary = generate_ingestion(self.input_dir, self.output_dir)
        self.assertEqual(summary["rejectedRows"], 2)
        self.assertEqual(json.loads(self.read("rejected.csv")[1]["extraColumns"]), ["extra"])

    def test_string_limits_agree_with_database_models(self):
        for _, term in DIRECT_FIELDS:
            if term not in STRING_LIMITS:
                continue
            model = (
                Identification
                if term
                in ("scientificName", "scientificNameAuthorship", "dateIdentified", "typeStatus")
                else Occurrence
            )
            self.assertEqual(
                model.__table__.columns[getattr(model, term).property.columns[0].name].type.length,
                STRING_LIMITS[term],
            )

    def import_csv(self, db, text):
        collection = Collection(collectionId=uuid4(), institutionId=uuid4())
        user = User(userId=uuid4())
        return _process_dwc_csv(db, collection, io.StringIO(text), user)

    def test_generated_csv_imports_matched_unmatched_and_deferred_identifications(self):
        self.write(
            [
                self.row(),
                self.row(
                    catalogNumber="2",
                    scientificName="",
                    scientificNameAuthorship="",
                    identifiedBy="A & B",
                ),
            ]
        )
        generate_ingestion(self.input_dir, self.output_dir)
        taxon = Taxon(
            taxonId=uuid4(), scientificName="Solanum glutinosum", scientificNameAuthorship="Dunal"
        )
        db = Mock(spec=Session)
        db.execute.return_value.scalars.return_value.all.return_value = [taxon]
        result = self.import_csv(
            db, (self.output_dir / "occurrences.dwc.csv").read_text(encoding="utf-8-sig")
        )
        self.assertEqual((result["taxaMatched"], result["taxaUnmatched"]), (1, 1))
        identifications = [
            c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Identification)
        ]
        self.assertEqual(identifications[0].taxonId, taxon.taxonId)
        self.assertIsNone(identifications[1].taxonId)
        identifiers = [
            c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Identifier)
        ]
        self.assertEqual([i.fullName for i in identifiers], ["Rexnel, C."])
        occurrences = [
            c.args[0] for c in db.add.call_args_list if isinstance(c.args[0], Occurrence)
        ]
        self.assertEqual(
            occurrences[0].dynamicProperties["sourceOriginal"], self.properties["sourceOriginal"]
        )
        self.assertEqual(occurrences[0].month, 5)
        self.assertIsNone(occurrences[0].day)
        db.commit.assert_called_once()

    def test_import_rejects_bad_name_arrays_and_rolls_back_later_rows(self):
        for value in ("[bad", "[1]", '[""]', "[null]", '[["A"]]'):
            db = Mock(spec=Session)
            db.execute.return_value.scalars.return_value.all.return_value = []
            csv_text = io.StringIO()
            writer = csv.writer(csv_text)
            writer.writerow(["dwc:Occurrence:catalogNumber", "dwc:Identification:identifiedBy"])
            writer.writerow(["1", '["Rexnel, C."]'])
            writer.writerow(["2", value])
            with self.subTest(value=value), self.assertRaises(HTTPException) as raised:
                self.import_csv(db, csv_text.getvalue())
            self.assertIn("identifiedBy", raised.exception.detail)
            self.assertIn("línea 3", raised.exception.detail)
            db.rollback.assert_called_once()
            db.commit.assert_not_called()

    def test_import_name_arrays_preserve_order_and_legacy_lists_still_work(self):
        for value, expected in (
            (json.dumps(["Rexnel, C.", "M. Daza"]), ["Rexnel, C.", "M. Daza"]),
            ("M. Daza,Severo", ["M. Daza", "Severo"]),
            ("[]", []),
        ):
            db = Mock(spec=Session)
            db.execute.return_value.scalars.return_value.all.return_value = []
            text = io.StringIO()
            writer = csv.writer(text)
            writer.writerow(["dwc:Occurrence:catalogNumber", "dwc:Identification:identifiedBy"])
            writer.writerow(["1", value])
            self.import_csv(db, text.getvalue())
            self.assertEqual(
                [
                    c.args[0].fullName
                    for c in db.add.call_args_list
                    if isinstance(c.args[0], Identifier)
                ],
                expected,
            )


if __name__ == "__main__":
    unittest.main()
