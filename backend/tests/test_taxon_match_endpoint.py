import os
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.config.database import get_db
from backend.models.models import Taxon

# Import only the router: backend.main initializes the production database.
with patch.dict(os.environ, {"SECRET_KEY": "isolated-taxon-match-test-key"}):
    from backend.routers.taxon import router


class TaxonMatchEndpointTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock(spec=Session)
        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def tearDown(self):
        for method in ("add", "add_all", "delete", "flush", "commit"):
            getattr(self.db, method).assert_not_called()

    def test_matched_response_and_shared_matcher_delegation(self):
        taxon = Taxon(
            taxonId=uuid4(),
            wfoTaxonId="wfo-test",
            scientificName="Solanum glutinosum",
            scientificNameAuthorship="Dunal",
            isCurrent=True,
            taxonomicStatus="Accepted",
            nomenclaturalStatus="Valid",
        )
        self.db.execute.return_value.scalars.return_value.all.return_value = [taxon]
        from backend.services import taxon_matching

        with patch.object(
            taxon_matching, "match_taxon", wraps=taxon_matching.match_taxon
        ) as matcher:
            response = self.client.post(
                "/api/taxon/match",
                json={
                    "scientificName": " Solanum glutinosum ",
                    "scientificNameAuthorship": " Dunal ",
                },
            )
        matcher.assert_called_once_with(self.db, "Solanum glutinosum", "Dunal")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "matched",
                "reason": "unique_candidate",
                "candidateCount": 1,
                "usedAuthorshipFallback": False,
                "usedCaseInsensitiveFallback": False,
                "taxon": {
                    "taxonId": str(taxon.taxonId),
                    "wfoTaxonId": "wfo-test",
                    "scientificName": "Solanum glutinosum",
                    "scientificNameAuthorship": "Dunal",
                    "isCurrent": True,
                    "taxonomicStatus": "Accepted",
                    "nomenclaturalStatus": "Valid",
                },
            },
        )

    def test_unmatched_returns_200_with_null_taxon(self):
        self.db.execute.return_value.scalars.return_value.all.return_value = []
        response = self.client.post("/api/taxon/match", json={"scientificName": "Unknown"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "not_found")
        self.assertEqual(response.json()["candidateCount"], 0)
        self.assertIsNone(response.json()["taxon"])
        self.assertTrue(response.json()["usedAuthorshipFallback"])
        self.assertFalse(response.json()["usedCaseInsensitiveFallback"])

    def test_case_insensitive_result_is_exposed(self):
        taxon = Taxon(
            taxonId=uuid4(),
            scientificName="Euphorbia",
            scientificNameAuthorship="L.",
            isCurrent=True,
        )
        self.db.execute.return_value.scalars.return_value.all.side_effect = [[], [taxon]]
        response = self.client.post(
            "/api/taxon/match",
            json={"scientificName": "EUPHORBIA", "scientificNameAuthorship": "l."},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["taxon"]["scientificName"], "Euphorbia")
        self.assertTrue(response.json()["usedCaseInsensitiveFallback"])
        self.assertFalse(response.json()["usedAuthorshipFallback"])

    def test_case_insensitive_ambiguity_is_exposed(self):
        self.db.execute.return_value.scalars.return_value.all.side_effect = [
            [],
            [
                Taxon(scientificName="Test", isCurrent=True),
                Taxon(scientificName="TEST", isCurrent=True),
            ],
        ]
        response = self.client.post("/api/taxon/match", json={"scientificName": "test"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ambiguous")
        self.assertIsNone(response.json()["taxon"])
        self.assertTrue(response.json()["usedCaseInsensitiveFallback"])

    def test_ambiguous_returns_200_with_null_taxon(self):
        self.db.execute.return_value.scalars.return_value.all.return_value = [
            Taxon(scientificName="Ambiguous", isCurrent=True),
            Taxon(scientificName="Ambiguous", isCurrent=True),
        ]
        response = self.client.post("/api/taxon/match", json={"scientificName": "Ambiguous"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ambiguous")
        self.assertEqual(response.json()["candidateCount"], 2)
        self.assertIsNone(response.json()["taxon"])

    def test_authorship_is_optional_null_or_blank(self):
        self.db.execute.return_value.scalars.return_value.all.return_value = []
        for extra in ({}, {"scientificNameAuthorship": None}, {"scientificNameAuthorship": " "}):
            response = self.client.post(
                "/api/taxon/match", json={"scientificName": "Unknown", **extra}
            )
            self.assertEqual(response.status_code, 200)

    def test_invalid_inputs_return_422_without_querying(self):
        cases = [
            {},
            {"scientificName": ""},
            {"scientificName": "  "},
            {"scientificName": None},
            {"scientificName": 123},
            {"scientificName": "x" * 501},
            {"scientificName": "Valid", "scientificNameAuthorship": "x" * 256},
            {"scientificName": "Valid", "unexpected": True},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                response = self.client.post("/api/taxon/match", json=payload)
                self.assertEqual(response.status_code, 422)
        self.db.execute.assert_not_called()

    def test_field_length_boundaries_are_accepted(self):
        self.db.execute.return_value.scalars.return_value.all.return_value = []
        response = self.client.post(
            "/api/taxon/match",
            json={"scientificName": "x" * 500, "scientificNameAuthorship": "x" * 255},
        )
        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
