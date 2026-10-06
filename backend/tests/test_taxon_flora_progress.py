import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from backend.services.taxon_flora_import import (
    CSV_PROGRESS_WEIGHT,
    _csv_progress_percent,
    _estimate_stage_remaining_seconds,
    _phase_progress_percent,
)


class TaxonFloraProgressTests(unittest.TestCase):
    def test_csv_reading_uses_its_share_of_total_progress(self):
        self.assertEqual(_csv_progress_percent(100, 0), 0)
        self.assertEqual(_csv_progress_percent(100, 25), 10)
        self.assertEqual(_csv_progress_percent(100, 100), CSV_PROGRESS_WEIGHT)
        self.assertEqual(_csv_progress_percent(100, 150), CSV_PROGRESS_WEIGHT)
        self.assertEqual(_csv_progress_percent(0, 50), 0)
        self.assertEqual(_csv_progress_percent(100, None), 0)

    def test_phase_progress_is_bounded_and_reaches_phase_end(self):
        self.assertEqual(_phase_progress_percent(45, 88, 0, 100), 45)
        self.assertEqual(_phase_progress_percent(45, 88, 50, 100), 66.5)
        self.assertEqual(_phase_progress_percent(45, 88, 100, 100), 88)
        self.assertEqual(_phase_progress_percent(45, 88, 150, 100), 88)
        self.assertEqual(_phase_progress_percent(45, 88, 0, 0), 88)

    def test_eta_uses_throughput_measured_within_the_current_stage(self):
        started_at = datetime(2026, 1, 1)
        with patch(
            "backend.services.taxon_flora_import._utcnow",
            return_value=started_at + timedelta(seconds=90),
        ):
            self.assertEqual(_estimate_stage_remaining_seconds(30, 100, started_at), 210)
            self.assertEqual(_estimate_stage_remaining_seconds(100, 100, started_at), 0)
            self.assertIsNone(_estimate_stage_remaining_seconds(0, 100, started_at))
            self.assertIsNone(_estimate_stage_remaining_seconds(30, 100, None))

    def test_stage_eta_is_unknown_before_a_stage_has_measurable_work(self):
        self.assertIsNone(_estimate_stage_remaining_seconds(10, None, datetime(2026, 1, 1)))
        self.assertIsNone(_estimate_stage_remaining_seconds(10, 0, datetime(2026, 1, 1)))


if __name__ == "__main__":
    unittest.main()
