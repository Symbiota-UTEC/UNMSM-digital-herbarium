import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateTable

from backend.models.enums import TaxonMatchReason, TaxonMatchStatus
from backend.models.models import Collection, Identification, Taxon, User
from backend.services.dwc_import import _process_dwc_csv
from backend.services.taxon_matching import match_taxon


class TaxonMatchingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        # The lookup uses scalar columns only; PostgreSQL search indexes and
        # GeoAlchemy DDL hooks are irrelevant to this isolated in-memory table.
        with self.engine.begin() as connection:
            connection.execute(CreateTable(Taxon.__table__))
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

    def add_taxon(self, name="Solanum glutinosum", author="Dunal", **kwargs):
        taxon = Taxon(
            taxonId=uuid4(), scientificName=name, scientificNameAuthorship=author, **kwargs
        )
        self.db.add(taxon)
        self.db.commit()
        self.db.refresh(taxon)
        return taxon

    def lookup(self, name="Solanum glutinosum", author="Dunal"):
        statements = []

        def capture(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(self.engine, "before_cursor_execute", capture)
        try:
            result = match_taxon(self.db, name, author)
        finally:
            event.remove(self.engine, "before_cursor_execute", capture)
        self.assertTrue(all(sql.lstrip().upper().startswith("SELECT") for sql in statements))
        self.assertEqual(
            len(statements),
            0
            if result.status == TaxonMatchStatus.MISSING_NAME
            else (
                4
                if result.status == TaxonMatchStatus.NOT_FOUND
                else 1 + 2 * result.usedAuthorshipFallback + result.usedCaseInsensitiveFallback
            ),
        )
        return result

    def test_exact_authorship_and_surrounding_whitespace(self):
        expected = self.add_taxon()
        self.add_taxon(author="Other")
        result = self.lookup("  Solanum glutinosum  ", " Dunal ")
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_CANDIDATE)
        self.assertEqual(result.candidateCount, 1)
        self.assertFalse(result.usedAuthorshipFallback)
        self.assertFalse(result.usedCaseInsensitiveFallback)

    def test_no_authorship_prefers_blank_or_null_authorship(self):
        for stored, supplied in ((None, None), ("", "   ")):
            with self.subTest(stored=stored):
                name = "Test null" if stored is None else "Test blank"
                expected = self.add_taxon(name=name, author=stored)
                self.add_taxon(name=name, author="Other")
                self.assertEqual(self.lookup(name, supplied).taxon.taxonId, expected.taxonId)

    def test_absent_or_mismatched_authorship_falls_back_to_name(self):
        expected = self.add_taxon()
        for author in (None, "", "Incorrect"):
            with self.subTest(author=author):
                result = self.lookup(author=author)
                self.assertEqual(result.taxon.taxonId, expected.taxonId)
                self.assertTrue(result.usedAuthorshipFallback)

    def test_missing_name_does_not_query(self):
        for name in (None, "", "   "):
            result = self.lookup(name)
            self.assertEqual(result.status, TaxonMatchStatus.MISSING_NAME)
            self.assertEqual(result.candidateCount, 0)
            self.assertIsNone(result.taxon)
            self.assertFalse(result.usedCaseInsensitiveFallback)

    def test_no_candidates(self):
        result = self.lookup()
        self.assertEqual(result.status, TaxonMatchStatus.NOT_FOUND)
        self.assertEqual(result.reason, TaxonMatchReason.NO_CANDIDATES)
        self.assertIsNone(result.taxon)
        self.assertFalse(result.usedCaseInsensitiveFallback)

    def test_unique_current_has_priority(self):
        expected = self.add_taxon(isCurrent=True)
        self.add_taxon(isCurrent=False, taxonomicStatus="Accepted", nomenclaturalStatus="Valid")
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_CURRENT)
        self.assertEqual(result.candidateCount, 2)

    def test_unique_accepted_valid_after_narrowing_to_current(self):
        expected = self.add_taxon(
            isCurrent=True, taxonomicStatus="Accepted", nomenclaturalStatus="Valid"
        )
        self.add_taxon(isCurrent=True, tplID="other")
        self.add_taxon(isCurrent=False, taxonomicStatus="Accepted", nomenclaturalStatus="Valid")
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_ACCEPTED_VALID)
        self.assertEqual(result.candidateCount, 3)

    def test_tpl_id_after_current_and_accepted_valid_narrowing(self):
        common = dict(isCurrent=True, taxonomicStatus="Accepted", nomenclaturalStatus="Valid")
        expected = self.add_taxon(tplID="tpl-1", **common)
        self.add_taxon(**common)
        self.add_taxon(isCurrent=True, tplID="outside-accepted")
        self.add_taxon(isCurrent=False, tplID="outside-current")
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_TPL_ID)

    def test_empty_preference_subsets_do_not_discard_candidates(self):
        expected = self.add_taxon(isCurrent=False, tplID="tpl-1")
        self.add_taxon(isCurrent=False)
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_TPL_ID)

    def test_ambiguity_does_not_fall_back_or_choose_arbitrarily(self):
        self.add_taxon(tplID="one")
        self.add_taxon(tplID="two")
        self.add_taxon(author="Other", isCurrent=False)
        result = self.lookup()
        self.assertEqual(result.status, TaxonMatchStatus.AMBIGUOUS)
        self.assertEqual(result.reason, TaxonMatchReason.MULTIPLE_CANDIDATES)
        self.assertIsNone(result.taxon)
        self.assertEqual(result.candidateCount, 2)
        self.assertFalse(result.usedAuthorshipFallback)

    def test_case_only_scientific_name_differences(self):
        for stored, supplied in (
            ("Euphorbia", "EUPHORBIA"),
            ("Cactaceae", "CACTACEAE"),
            ("Cheilanthes bonariensis", "Cheilanthes Bonariensis"),
        ):
            with self.subTest(name=supplied):
                expected = self.add_taxon(name=stored)
                result = self.lookup(supplied)
                self.assertEqual(result.taxon.taxonId, expected.taxonId)
                self.assertTrue(result.usedCaseInsensitiveFallback)
                self.assertFalse(result.usedAuthorshipFallback)

    def test_case_insensitive_authorship_precedes_dropping_authorship(self):
        expected = self.add_taxon()
        self.add_taxon(author="Other", taxonomicStatus="Accepted", nomenclaturalStatus="Valid")
        for name in ("Solanum glutinosum", "SOLANUM GLUTINOSUM"):
            result = self.lookup(name, "DUNAL")
            self.assertEqual(result.taxon.taxonId, expected.taxonId)
            self.assertTrue(result.usedCaseInsensitiveFallback)
            self.assertFalse(result.usedAuthorshipFallback)

    def test_exact_matches_keep_priority_over_case_variants(self):
        expected = self.add_taxon()
        self.add_taxon(name="SOLANUM GLUTINOSUM", author="DUNAL")
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertFalse(result.usedCaseInsensitiveFallback)
        self.assertEqual(result.candidateCount, 1)

    def test_exact_name_only_match_keeps_priority_over_case_variants(self):
        expected = self.add_taxon()
        self.add_taxon(name="SOLANUM GLUTINOSUM", author="Other")
        result = self.lookup(author="Incorrect")
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertTrue(result.usedAuthorshipFallback)
        self.assertFalse(result.usedCaseInsensitiveFallback)

    def test_case_insensitive_name_only_fallback(self):
        expected = self.add_taxon()
        result = self.lookup("SOLANUM GLUTINOSUM", "Incorrect")
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertTrue(result.usedAuthorshipFallback)
        self.assertTrue(result.usedCaseInsensitiveFallback)

    def test_case_insensitive_blank_authorship(self):
        for stored in (None, ""):
            name = "Test null" if stored is None else "Test blank"
            expected = self.add_taxon(name=name, author=stored)
            self.add_taxon(name=name.upper(), author="Other")
            result = self.lookup(name.lower(), None)
            self.assertEqual(result.taxon.taxonId, expected.taxonId)
            self.assertTrue(result.usedCaseInsensitiveFallback)
            self.assertFalse(result.usedAuthorshipFallback)

    def test_case_only_duplicates_can_remain_ambiguous(self):
        self.add_taxon()
        self.add_taxon(name="SOLANUM GLUTINOSUM")
        result = self.lookup("solanum glutinosum")
        self.assertEqual(result.status, TaxonMatchStatus.AMBIGUOUS)
        self.assertEqual(result.candidateCount, 2)
        self.assertTrue(result.usedCaseInsensitiveFallback)
        self.assertFalse(result.usedAuthorshipFallback)

    def test_case_only_duplicates_use_existing_preferences(self):
        expected = self.add_taxon(taxonomicStatus="Accepted", nomenclaturalStatus="Valid")
        self.add_taxon(name="SOLANUM GLUTINOSUM")
        result = self.lookup("solanum glutinosum")
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertEqual(result.reason, TaxonMatchReason.UNIQUE_ACCEPTED_VALID)
        self.assertTrue(result.usedCaseInsensitiveFallback)

    def test_exact_ambiguity_does_not_broaden_to_case_variants(self):
        self.add_taxon(isCurrent=False)
        self.add_taxon(isCurrent=False)
        self.add_taxon(name="SOLANUM GLUTINOSUM", isCurrent=True)
        result = self.lookup()
        self.assertEqual(result.status, TaxonMatchStatus.AMBIGUOUS)
        self.assertFalse(result.usedCaseInsensitiveFallback)
        self.assertEqual(result.candidateCount, 2)

    def test_spelling_qualifiers_accents_and_internal_whitespace_are_preserved(self):
        self.add_taxon()
        for name in (
            "Solanum glutinosun",
            "Solanum  glutinosum",
            "Solanum glutinosum spec.",
            "Solanum glutinósum",
            "Solanum glutinosum.",
            "Solanum %",
            "Solanum glutinosu_",
        ):
            self.assertEqual(self.lookup(name).status, TaxonMatchStatus.NOT_FOUND)

    def test_lookup_does_not_autoflush_pending_changes(self):
        expected = self.add_taxon()
        pending = Taxon(scientificName="Pending")
        self.db.add(pending)
        expected.taxonomicStatus = "Modified"
        result = self.lookup()
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertIn(pending, self.db.new)
        self.assertIn(expected, self.db.dirty)
        self.assertIsNone(pending.taxonId)
        result = self.lookup("SOLANUM GLUTINOSUM", "Incorrect")
        self.assertEqual(result.taxon.taxonId, expected.taxonId)
        self.assertIn(pending, self.db.new)
        self.assertIn(expected, self.db.dirty)

    def test_importer_uses_same_matcher_and_retains_unmatched_identifications(self):
        import io

        self.add_taxon()
        self.add_taxon(name="Ambiguous")
        self.add_taxon(name="Ambiguous")
        lookup_db = self.db
        db = Mock(spec=Session)
        collection = Collection(collectionId=uuid4(), institutionId=uuid4())
        user = User(userId=uuid4())
        text = io.StringIO(
            "dwc:Occurrence:catalogNumber,dwc:Taxon:scientificName,dwc:Taxon:scientificNameAuthorship\n"
            "1,SOLANUM GLUTINOSUM,DUNAL\n2,Ambiguous,Dunal\n3,Unknown,Dunal\n4,,\n"
            "5,SOLANUM GLUTINOSUM,DUNAL\n"
        )
        original_matcher = match_taxon

        def resolve(import_db, name, author):
            return original_matcher(lookup_db, name, author)

        with patch("backend.services.taxon_matching.match_taxon", side_effect=resolve) as matcher:
            stats = _process_dwc_csv(db, collection, text, user)
        self.assertEqual(matcher.call_count, 4)  # Repeated lookup uses the import cache.
        identifications = [
            call.args[0]
            for call in db.add.call_args_list
            if isinstance(call.args[0], Identification)
        ]
        self.assertEqual(identifications[0].taxonId, self.lookup().taxon.taxonId)
        self.assertEqual(identifications[-1].taxonId, identifications[0].taxonId)
        self.assertEqual(identifications[0].scientificName, "SOLANUM GLUTINOSUM")
        self.assertEqual(identifications[0].scientificNameAuthorship, "DUNAL")
        self.assertTrue(all(item.taxonId is None for item in identifications[1:4]))
        self.assertEqual(identifications[1].scientificName, "Ambiguous")
        self.assertEqual(stats["taxaMatched"], 2)
        self.assertEqual(stats["taxaUnmatched"], 3)


if __name__ == "__main__":
    unittest.main()
