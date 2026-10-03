# Test a taxon match before importing

The DwC importer and `POST /api/taxon/match` both call
`backend.services.taxon_matching.match_taxon`. A lookup takes a scientific name
and optional authorship, independently of CSV parsing. It reads the current
database without creating taxa, occurrences, or identifications.

## HTTP lookup

With the development backend running on port 8001:

```bash
curl -sS http://localhost:8001/api/taxon/match \
  -H 'Content-Type: application/json' \
  --data '{"scientificName":"Solanum glutinosum","scientificNameAuthorship":"Dunal"}'
```

Authorship may be omitted, null, or blank. The name must be nonblank. Surrounding
whitespace is trimmed; maximum lengths are 500 characters for the name and 255
for authorship after trimming. Unknown input fields and invalid values return
HTTP 422. Like taxon search, this endpoint does not require authentication.
It is also available in the running service's `/docs` interface.

Matched, unmatched, and ambiguous results return HTTP 200. For example, when a
name cannot be found:

```json
{
  "status": "not_found",
  "reason": "no_candidates",
  "taxon": null,
  "candidateCount": 0,
  "usedAuthorshipFallback": true,
  "usedCaseInsensitiveFallback": false
}
```

A matched result includes `taxonId`, `wfoTaxonId`, `scientificName`,
`scientificNameAuthorship`, `isCurrent`, `taxonomicStatus`, and
`nomenclaturalStatus` inside `taxon`. The selected ID is the one the importer
would assign to `Identification.taxonId` against the same database state.

## Python lookup

Run from the repository root using the backend's configured environment:

```python
from backend.config.database import SessionLocal
from backend.services.taxon_matching import match_taxon

with SessionLocal() as db:
    result = match_taxon(db, "Solanum glutinosum", "Dunal")
    print(result.status.value, result.reason.value)
    print(result.taxon.taxonId if result.taxon else None)
    print(result.candidateCount, result.usedAuthorshipFallback)
    print(result.usedCaseInsensitiveFallback)
```

The Python function also accepts a missing or blank scientific name, returning
`missing_name` without querying the database. This supports incomplete import
records; the HTTP endpoint requires a name to test. All queries suppress ORM
autoflush, so lookup does not flush pending changes in the supplied session.

## Existing selection rules

1. Query by exact scientific name and authorship. Without authorship, query the
   name with database authorship null or empty.
2. If no candidates exist, repeat that query with case-insensitive comparisons
   for both name and supplied authorship. Blank/null authorship restrictions remain.
3. If still no candidates exist, query by exact scientific name alone.
4. If still no candidates exist, query by case-insensitive scientific name alone.
5. Select a unique candidate from the first nonempty query. Otherwise prefer current candidates, then candidates
   whose statuses are exactly `Accepted` and `Valid`, then candidates with a
   nonempty `tplID`. At each step, a unique preferred candidate is selected;
   multiple preferred candidates narrow the remaining set. An empty preference
   leaves the remaining set unchanged.
6. If several candidates remain, return `ambiguous` with no selected taxon.
   Do not broaden an ambiguous candidate set with another query.

The reasons for a successful selection are `unique_candidate`, `unique_current`,
`unique_accepted_valid`, or `unique_tpl_id`. `candidateCount` is the number found
by the initial or fallback query before preference filtering.
`usedAuthorshipFallback` reports whether the name-only query was attempted,
including lookups that remain unmatched.
`usedCaseInsensitiveFallback` is true when the query supplying candidates was
case-insensitive, including ambiguous results. It is false for missing names and
no candidates, and for exact candidate queries even when an earlier unsuccessful
case-insensitive query was attempted.

Case-insensitive queries compare SQL `lower()` values for equality; they do not
use pattern matching. Accents, punctuation, spelling, and internal whitespace
remain significant, and `%` and `_` are literal characters. Matching does not
resolve synonyms or follow accepted-name links. An authorship
mismatch can still match through the existing name-only fallback. A unique
candidate may be selected even if it is not current or accepted; preferences
apply only when multiple candidates exist. A lookup does not reserve an
association, and import resolves names again against the database at import time.

## Index setup for an existing database

The ORM defines `ix_taxon_scientific_name_lower` on `lower(scientific_name)` for
the case-insensitive equality queries. New tables receive it during normal table
creation. Existing tables need this separate setup; `create_all()` does not add
an index to an already existing table. The older unaccent search index has a
different expression and does not provide this lookup index.

Run the provided idempotent SQL against the target database, outside a transaction:

```bash
psql 'postgresql://USER@HOST:PORT/DATABASE' -v ON_ERROR_STOP=1 \
  --file backend/scripts/sql/create_taxon_matching_index.sql
```

It creates the nonunique index concurrently without changing taxon data. The
index setup has not been applied to the live database as part of this change.
Apply it before broad CSV imports to avoid repeated full-table scans for
case-insensitive lookups.

## Tests

```bash
python -m unittest backend.tests.test_taxon_matching \
  backend.tests.test_taxon_match_endpoint \
  backend.tests.test_dwc_import backend.tests.test_generate_usm_ingestion_csv
```

Matcher tests use an isolated in-memory taxon table to exercise actual queries
and selection rules. Endpoint tests use an isolated FastAPI application with
mocked database sessions, without importing `backend.main` or initializing the
configured database. They require the backend dependencies and `httpx` (for
FastAPI's test client). Neither suite imports records into the configured database.
