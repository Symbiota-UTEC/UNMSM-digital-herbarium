import csv
import io
import unittest
from datetime import datetime
from unittest.mock import Mock
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.models import Collection, Occurrence, User
from backend.schemas.occurrence import OccurrenceOut
from backend.services.dwc_import import _process_dwc_csv


class DynamicPropertiesImportTests(unittest.TestCase):
    def setUp(self):
        self.collection = Collection(collectionId=uuid4(), institutionId=uuid4())
        self.user = User(userId=uuid4())

    def import_values(self, db, *values):
        text_file = io.StringIO()
        writer = csv.writer(text_file)
        writer.writerow(["dwc:Occurrence:catalogNumber", "dwc:Occurrence:dynamicProperties"])
        for number, value in enumerate(values, start=1):
            writer.writerow([str(number), value])
        text_file.seek(0)
        return _process_dwc_csv(db, self.collection, text_file, self.user)

    @staticmethod
    def occurrences(db):
        return [
            call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], Occurrence)
        ]

    def test_objects_and_null_import_and_validate_as_occurrence_responses(self):
        cases = [
            ('{"color":"green"}', {"color": "green"}),
            ("{}", {}),
            (
                '{"details":{"colors":["green"],"count":2,"verified":true,"note":null}}',
                {"details": {"colors": ["green"], "count": 2, "verified": True, "note": None}},
            ),
            ("null", None),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                db = Mock(spec=Session)
                result = self.import_values(db, value)
                occurrence = self.occurrences(db)[0]
                self.assertEqual(occurrence.dynamicProperties, expected)
                self.assertEqual(result["occurrencesInserted"], 1)
                db.commit.assert_called_once_with()
                db.rollback.assert_not_called()

                # Supply database-generated values to validate the imported response.
                occurrence.occurrenceId = uuid4()
                occurrence.createdAt = occurrence.updatedAt = datetime(2026, 1, 1)
                response = OccurrenceOut.model_validate(occurrence, from_attributes=True)
                self.assertEqual(response.dynamicProperties, expected)

    def test_empty_cells_preserve_existing_optional_handling(self):
        for value in ("", "   "):
            with self.subTest(value=value):
                db = Mock(spec=Session)
                self.import_values(db, value)
                occurrence = self.occurrences(db)[0]
                self.assertNotIn("dynamicProperties", occurrence.__dict__)
                db.commit.assert_called_once_with()
                db.rollback.assert_not_called()

    def test_malformed_json_returns_field_and_line_error(self):
        for value in ("not-json", '{"color":', '{"color":"green",}'):
            with self.subTest(value=value):
                db = Mock(spec=Session)
                with self.assertRaises(HTTPException) as raised:
                    self.import_values(db, value)
                self.assertEqual(raised.exception.status_code, 400)
                self.assertEqual(
                    raised.exception.detail,
                    "Error procesando CSV (línea 2): dynamicProperties no es un JSON válido",
                )
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_non_object_json_is_rejected(self):
        for value in ('["green"]', "[]", '"green"', "42", "1.5", "true", "false"):
            with self.subTest(value=value):
                db = Mock(spec=Session)
                with self.assertRaises(HTTPException) as raised:
                    self.import_values(db, value)
                self.assertEqual(raised.exception.status_code, 400)
                self.assertEqual(
                    raised.exception.detail,
                    "Error procesando CSV (línea 2): dynamicProperties debe ser un objeto JSON o null",
                )
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_invalid_later_row_rolls_back_previously_flushed_rows(self):
        for value in ("not-json", "[]"):
            with self.subTest(value=value):
                db = Mock(spec=Session)
                with self.assertRaises(HTTPException) as raised:
                    self.import_values(db, '{"color":"green"}', value)
                self.assertEqual(raised.exception.status_code, 400)
                self.assertIn("línea 3", raised.exception.detail)
                self.assertIn("dynamicProperties", raised.exception.detail)
                self.assertTrue(self.occurrences(db))
                self.assertTrue(all(occ.catalogNumber == "1" for occ in self.occurrences(db)))
                db.flush.assert_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
