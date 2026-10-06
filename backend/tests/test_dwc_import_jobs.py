import io
import os
import tempfile
import unittest
from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models.enums import ImportJobStatus
from backend.models.models import Collection, DwcImportJob, User
from backend.schemas.upload import DwcImportJobOut
from backend.services import dwc_import


class DwcImportJobTimestampTests(unittest.TestCase):
    @staticmethod
    def output(**timestamps):
        return DwcImportJobOut(
            jobId=uuid4(),
            collectionId=uuid4(),
            filename="specimens.csv",
            status="running",
            stage="Importando ocurrencias",
            rowsProcessed=0,
            occurrencesInserted=0,
            taxaMatched=0,
            taxaUnmatched=0,
            identificationsInserted=0,
            identifiersInserted=0,
            **timestamps,
        )

    def test_naive_database_timestamps_are_serialized_as_utc(self):
        created = datetime(2026, 10, 6, 15)
        output = self.output(createdAt=created, startedAt=created, finishedAt=created)
        serialized = output.model_dump(mode="json")
        for field in ("createdAt", "startedAt", "finishedAt"):
            self.assertEqual(serialized[field], "2026-10-06T15:00:00Z")
        self.assertIsNone(output.createdAt.tzinfo)

    def test_aware_timestamps_preserve_the_instant_and_normalize_to_utc(self):
        local_time = datetime(2026, 10, 6, 10, tzinfo=timezone(timedelta(hours=-5)))
        output = self.output(createdAt=local_time, startedAt=local_time, finishedAt=local_time)
        for field in ("createdAt", "startedAt", "finishedAt"):
            timestamp = output.model_dump(mode="json")[field]
            self.assertEqual(timestamp, "2026-10-06T15:00:00Z")
            self.assertEqual(datetime.fromisoformat(timestamp), local_time.astimezone(UTC))

    def test_optional_timestamps_remain_null(self):
        output = self.output(createdAt=datetime(2026, 10, 6, 15))
        serialized = output.model_dump(mode="json")
        self.assertIsNone(serialized["startedAt"])
        self.assertIsNone(serialized["finishedAt"])


class DwcImportJobTests(unittest.TestCase):
    def setUp(self):
        self.collection = Collection(collectionId=uuid4(), institutionId=uuid4())
        self.user = User(userId=uuid4())

    def inspect_bytes(self, contents):
        with tempfile.NamedTemporaryFile() as csv_file:
            csv_file.write(contents)
            csv_file.flush()
            return dwc_import._inspect_dwc_csv(csv_file.name)

    def test_inspection_counts_quoted_multiline_records_and_accepts_utf8_bom(self):
        csv_bytes = (
            "\ufeffdwc:Occurrence:catalogNumber,dwc:Occurrence:recordedBy\r\n"
            '0001,"García, María\r\nLópez"\r\n'
            "0002,José\r\n"
        ).encode("utf-8")

        encoding, total_rows = self.inspect_bytes(csv_bytes)

        self.assertEqual(encoding, "utf-8-sig")
        self.assertEqual(total_rows, 2)

    def test_inspection_uses_latin1_fallback(self):
        csv_bytes = ("dwc:Occurrence:catalogNumber,dwc:Occurrence:recordedBy\n0001,José\n").encode(
            "latin-1"
        )

        encoding, total_rows = self.inspect_bytes(csv_bytes)

        self.assertEqual(encoding, "latin-1")
        self.assertEqual(total_rows, 1)

    def test_inspection_rejects_malformed_csv_before_import(self):
        with self.assertRaises(HTTPException) as raised:
            self.inspect_bytes(
                b'dwc:Occurrence:catalogNumber,dwc:Occurrence:recordedBy\n0001,"unterminated\n'
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Error procesando CSV", raised.exception.detail)

    def test_completed_job_update_is_in_the_same_transaction_as_occurrences(self):
        db = Mock(spec=Session)
        progress_updates = []
        job_id = uuid4()
        csv_file = io.StringIO("dwc:Occurrence:catalogNumber\n0001\n")

        with patch(
            "backend.services.dwc_import._resolve_unique_taxon_for_identification",
            return_value=None,
        ):
            result = dwc_import._process_dwc_csv(
                db,
                self.collection,
                csv_file,
                self.user,
                job_id=job_id,
                total_rows=1,
                progress_callback=lambda stats, force, stage: progress_updates.append(
                    (stats["rows"], force, stage)
                ),
            )

        self.assertEqual(result["occurrencesInserted"], 1)
        self.assertEqual(progress_updates[-1], (1, True, "Guardando cambios"))
        self.assertTrue(
            any(
                update[0] == 1 and update[2] == "Importando ocurrencias"
                for update in progress_updates
            )
        )
        update_statement = db.execute.call_args.args[0]
        self.assertEqual(update_statement.table.name, DwcImportJob.__tablename__)
        self.assertEqual(db.method_calls[-1][0], "commit")
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    @patch("backend.services.dwc_import.SessionLocal")
    def test_startup_marks_active_job_interrupted_and_removes_its_temp_file(self, session_factory):
        db = Mock(spec=Session)
        session_factory.return_value = db
        with tempfile.NamedTemporaryFile(delete=False) as csv_file:
            file_path = csv_file.name

        job = DwcImportJob(
            activeInstitutionId=uuid4(),
            temporaryFilePath=file_path,
            status=ImportJobStatus.RUNNING,
            stage="Importando ocurrencias",
        )
        db.scalars.return_value.all.return_value = [job]

        dwc_import.recover_interrupted_dwc_import_jobs()

        self.assertEqual(job.status, ImportJobStatus.FAILED)
        self.assertEqual(job.stage, "Interrumpida")
        self.assertIsNone(job.activeInstitutionId)
        self.assertIsNone(job.temporaryFilePath)
        self.assertEqual(job.occurrencesInserted, 0)
        self.assertEqual(job.identificationsInserted, 0)
        self.assertFalse(os.path.exists(file_path))
        db.commit.assert_called_once_with()
        db.close.assert_called_once_with()

    def test_database_index_allows_one_active_import_per_institution(self):
        active_index = next(
            index
            for index in DwcImportJob.__table__.indexes
            if index.name == "uq_dwc_import_one_active_per_institution"
        )

        self.assertTrue(active_index.unique)
        self.assertEqual(
            [column.name for column in active_index.columns], ["active_institution_id"]
        )

    @patch("backend.services.dwc_import._commit_dwc_job_update")
    def test_failed_job_clears_tentative_counts_after_transaction_rollback(self, update_job):
        job_id = uuid4()

        dwc_import._finish_dwc_job_failed(job_id, "duplicate catalog number")

        self.assertEqual(update_job.call_args.args[0], job_id)
        self.assertEqual(update_job.call_args.kwargs["status"], ImportJobStatus.FAILED)
        self.assertIsNone(update_job.call_args.kwargs["activeInstitutionId"])
        self.assertEqual(update_job.call_args.kwargs["occurrencesInserted"], 0)
        self.assertEqual(update_job.call_args.kwargs["taxaMatched"], 0)

    def test_job_status_requires_collection_edit_permission(self):
        db = Mock(spec=Session)
        job = DwcImportJob(collectionId=self.collection.collectionId)
        db.get.side_effect = [job, self.collection]

        with (
            patch("backend.services.dwc_import.user_can_edit_collection", return_value=False),
            self.assertRaises(HTTPException) as raised,
        ):
            dwc_import.get_dwc_import_job(db, uuid4(), self.user)

        self.assertEqual(raised.exception.status_code, 403)

    def test_collection_job_history_requires_collection_edit_permission(self):
        db = Mock(spec=Session)
        db.get.return_value = self.collection

        with (
            patch("backend.services.dwc_import.user_can_edit_collection", return_value=False),
            self.assertRaises(HTTPException) as raised,
        ):
            dwc_import.list_dwc_import_jobs(db, self.collection.collectionId, 1, 10, self.user)

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
