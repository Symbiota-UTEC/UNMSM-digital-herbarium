import csv
import os
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, event, select, text
from sqlalchemy.schema import CreateTable
from sqlalchemy.orm import Session

from backend.models.enums import ImportJobStatus
from backend.models.models import Taxon
from backend.services import taxon_flora_import
from backend.services.taxon_flora_import import _merge_staged_taxa


class TaxonFloraMergePostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database_url = os.getenv("TAXON_FLORA_TEST_DATABASE_URL")
        if not database_url:
            raise unittest.SkipTest("Set TAXON_FLORA_TEST_DATABASE_URL to run PostgreSQL tests.")

        cls.engine = create_engine(database_url, future=True)
        if cls.engine.dialect.name != "postgresql":
            cls.engine.dispose()
            raise unittest.SkipTest("Taxon flora merge integration tests require PostgreSQL.")

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "engine"):
            cls.engine.dispose()

    def setUp(self):
        self.schema = f"taxon_flora_test_{uuid4().hex}"
        self.connection = self.engine.connect()
        self.connection.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.connection.commit()
        self.connection.execute(text(f'SET search_path TO "{self.schema}"'))
        self.connection.commit()
        self.connection.execute(CreateTable(Taxon.__table__))
        self.connection.execute(
            text("CREATE UNIQUE INDEX uq_test_taxon_wfo_id ON taxon (wfo_taxon_id)")
        )
        self.connection.commit()
        self.db = Session(self.connection, autoflush=False, future=True)

    def tearDown(self):
        self.db.rollback()
        self.db.close()
        if self.connection.in_transaction():
            self.connection.rollback()
        self.connection.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.connection.commit()
        self.connection.close()

    def add_taxon(self, wfo_id, name, is_current=True):
        taxon = Taxon(
            taxonId=uuid4(),
            wfoTaxonId=wfo_id,
            scientificName=name,
            isCurrent=is_current,
        )
        self.db.add(taxon)
        self.db.flush()
        return taxon

    def create_stage(self, rows):
        self.db.execute(
            text(
                "CREATE TEMP TABLE flora_taxon_stage ("
                "LIKE taxon INCLUDING DEFAULTS, "
                "source_row BIGINT GENERATED ALWAYS AS IDENTITY"
                ") ON COMMIT DROP"
            )
        )
        self.db.execute(text("ALTER TABLE flora_taxon_stage ALTER COLUMN taxon_id DROP NOT NULL"))
        self.db.execute(
            text(
                "INSERT INTO flora_taxon_stage (wfo_taxon_id, scientific_name) "
                "VALUES (:wfo_id, :name)"
            ),
            [{"wfo_id": wfo_id, "name": name} for wfo_id, name in rows],
        )

    def test_merge_batches_keep_last_duplicate_and_count_actual_changes(self):
        existing = self.add_taxon("wfo-existing", "Before")
        unchanged = self.add_taxon("wfo-same", "Same")
        reactivated = self.add_taxon("wfo-reactivate", "Reactivate", is_current=False)
        obsolete = [
            self.add_taxon(f"wfo-obsolete-{index}", "Obsolete") for index in range(3)
        ]
        self.create_stage(
            [
                ("wfo-existing", "First duplicate"),
                ("wfo-existing", "Last duplicate"),
                ("wfo-new", "New taxon"),
                ("wfo-same", "Same"),
                ("wfo-reactivate", "Reactivate"),
            ]
        )
        progress = []

        with patch.object(taxon_flora_import, "TAXON_MERGE_BATCH_SIZE", 2):
            result = _merge_staged_taxa(
                self.db,
                ["wfoTaxonId", "scientificName"],
                on_progress=lambda *values: progress.append(values),
            )

        self.db.expire_all()
        self.assertEqual(result["taxaInserted"], 1)
        self.assertEqual(result["taxaUpdated"], 2)
        self.assertEqual(result["taxaSetCurrent"], 4)
        self.assertEqual(result["taxaMarkedNotCurrent"], 3)

        current_existing = self.db.scalar(
            select(Taxon).where(Taxon.wfoTaxonId == "wfo-existing")
        )
        current_unchanged = self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-same"))
        current_reactivated = self.db.scalar(
            select(Taxon).where(Taxon.wfoTaxonId == "wfo-reactivate")
        )
        new_taxon = self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-new"))
        self.assertEqual(current_existing.taxonId, existing.taxonId)
        self.assertEqual(current_existing.scientificName, "Last duplicate")
        self.assertEqual(current_unchanged.taxonId, unchanged.taxonId)
        self.assertTrue(current_reactivated.isCurrent)
        self.assertEqual(current_reactivated.taxonId, reactivated.taxonId)
        self.assertIsNotNone(new_taxon)
        for old_taxon in obsolete:
            self.assertFalse(
                self.db.scalar(select(Taxon).where(Taxon.taxonId == old_taxon.taxonId)).isCurrent
            )

        merge_updates = [item for item in progress if item[0] == "Actualizando taxones"]
        deactivation_updates = [
            item for item in progress if item[0] == "Desactivando taxones ausentes"
        ]
        self.assertEqual(len(merge_updates), 3)  # initial update plus two merge batches
        self.assertEqual(len(deactivation_updates), 3)  # setup update plus two deactivation batches
        self.assertTrue(all("taxaSetCurrent" not in item[3] for item in progress))
        self.assertEqual(progress[-1][2], 99.0)  # commit completion is reported by the caller

    def test_later_batch_failure_rolls_back_all_taxon_changes(self):
        existing = self.add_taxon("wfo-a-existing", "Before")
        second_existing = self.add_taxon("wfo-c-existing", "Before too")
        self.db.commit()
        self.create_stage(
            [
                ("wfo-a-existing", "Changed"),
                ("wfo-b-new", "New one"),
                ("wfo-c-existing", "Changed too"),
                ("wfo-d-new", "New two"),
                ("wfo-e-new", "New three"),
            ]
        )

        def fail_after_second_merge_batch(stage, detail, *_):
            if stage == "Actualizando taxones" and detail.startswith("Actualizando taxones: 4 de"):
                raise RuntimeError("Injected later-batch failure")

        with patch.object(taxon_flora_import, "TAXON_MERGE_BATCH_SIZE", 2):
            with self.assertRaisesRegex(RuntimeError, "later-batch"):
                _merge_staged_taxa(
                    self.db,
                    ["wfoTaxonId", "scientificName"],
                    on_progress=fail_after_second_merge_batch,
                )
        self.db.rollback()
        self.db.expire_all()

        self.assertEqual(
            self.db.scalar(
                select(Taxon).where(Taxon.wfoTaxonId == "wfo-a-existing")
            ).scientificName,
            "Before",
        )
        self.assertEqual(
            self.db.scalar(
                select(Taxon).where(Taxon.wfoTaxonId == "wfo-c-existing")
            ).scientificName,
            "Before too",
        )
        self.assertEqual(
            self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-a-existing")).taxonId,
            existing.taxonId,
        )
        self.assertEqual(
            self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-c-existing")).taxonId,
            second_existing.taxonId,
        )
        self.assertIsNone(self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-b-new")))
        self.assertIsNone(self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-d-new")))

    def test_background_job_reports_completion_only_after_database_commit(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", delete=False) as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "taxonID",
                    "scientificName",
                    "taxonomicStatus",
                    "nomenclaturalStatus",
                    "namePublishedIn",
                ]
            )
            writer.writerow(["wfo-imported", "Imported taxon", "Accepted", "Valid", "Flora"])
            file_path = f.name

        committed = []
        progress = []
        event.listen(self.db, "after_commit", lambda session: committed.append(True))

        def capture_progress(job_id, **kwargs):
            progress.append(kwargs)
            if kwargs.get("status_value") == ImportJobStatus.COMPLETED:
                self.assertTrue(committed)

        with (
            patch.object(taxon_flora_import, "SessionLocal", return_value=self.db),
            patch.object(taxon_flora_import, "_commit_taxon_flora_job_update", capture_progress),
            patch.object(taxon_flora_import, "TAXON_MERGE_BATCH_SIZE", 2),
        ):
            taxon_flora_import.process_taxon_flora_csv_background(
                file_path,
                "classification.csv",
                uuid4(),
            )

        completed = [
            item for item in progress if item.get("status_value") == ImportJobStatus.COMPLETED
        ]
        self.assertEqual(len(completed), 1)
        self.assertEqual(completed[0]["force_percent"], 100.0)
        self.assertEqual(completed[0]["force_eta_seconds"], 0)
        self.assertEqual(completed[0]["taxa_inserted"], 1)
        self.assertEqual(completed[0]["taxa_set_current"], 1)
        imported = self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-imported"))
        self.assertIsNotNone(imported)

    def test_background_failure_clears_provisional_taxon_counters_after_rollback(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", delete=False) as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "taxonID",
                    "scientificName",
                    "taxonomicStatus",
                    "nomenclaturalStatus",
                    "namePublishedIn",
                ]
            )
            writer.writerow(["wfo-rolled-back", "Temporary taxon", "Accepted", "Valid", "Flora"])
            file_path = f.name

        progress = []
        merge_staged_taxa = taxon_flora_import._merge_staged_taxa

        def fail_after_merge_batch(db, mapped_fields, *, on_progress):
            def fail_after_progress(*values):
                on_progress(*values)
                if values[0] == "Actualizando taxones" and values[1].endswith("1 de 1."):
                    raise RuntimeError("Injected background failure")

            return merge_staged_taxa(db, mapped_fields, on_progress=fail_after_progress)

        with (
            patch.object(taxon_flora_import, "SessionLocal", return_value=self.db),
            patch.object(
                taxon_flora_import,
                "_commit_taxon_flora_job_update",
                side_effect=lambda job_id, **kwargs: progress.append(kwargs),
            ),
            patch.object(taxon_flora_import, "_merge_staged_taxa", fail_after_merge_batch),
        ):
            taxon_flora_import.process_taxon_flora_csv_background(
                file_path,
                "classification.csv",
                uuid4(),
            )

        failed = [item for item in progress if item.get("status_value") == ImportJobStatus.FAILED]
        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0]["taxa_inserted"], 0)
        self.assertEqual(failed[0]["taxa_updated"], 0)
        self.assertEqual(failed[0]["taxa_marked_not_current"], 0)
        self.assertEqual(failed[0]["taxa_set_current"], 0)
        self.assertGreater(failed[0]["rows_processed"], 0)
        rolled_back = self.db.scalar(select(Taxon).where(Taxon.wfoTaxonId == "wfo-rolled-back"))
        self.assertIsNone(rolled_back)


if __name__ == "__main__":
    unittest.main()
