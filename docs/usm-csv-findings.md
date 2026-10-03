# USM CSV findings and decisions

## 2026-10-02: first combined cleaning pass

This records the findings from specimen CSVs `1_0.csv` through `37_360.csv` in
`data/XLSX/Registros USM 0-300+_csv`. Sheets 38–40 contain metadata and were
excluded. These counts describe the first batch run, before any repair of
recurring cell misalignment. Future runs may change them.

The cleaning commands, implemented rules and output formats are documented in
[usm-csv-cleaning.md](usm-csv-cleaning.md). Generated reports live in
`data/cleaned/usm_all` and `data/expert_review/usm_all`; the data directory is
ignored by Git, so this log preserves the main findings alongside the code.

### Structure and supported layouts

- There are 37 specimen files with 243,019 data records, including 31,798 entirely
  blank records. All source records match their own file's header width.
- Sixteen files match the original cleaner's 26-column header exactly. Twenty-one
  use variants: missing author or infraspecific columns, capitalization and
  whitespace differences, or extra columns.
- Header-based mapping, optional-column handling and verified file-specific
  rules are implemented. Additional cells and exact source headers and values
  are preserved in provenance.
- Matching headers and row widths does **not** establish that cell contents are
  semantically aligned. The structural audit initially underestimated how
  widespread this problem was.

### Batch results

| Classification | Records |
| --- | ---: |
| Cleaned, without review flags | 85,306 |
| Needs review | 123,346 |
| Held | 2,569 |
| Entirely blank, skipped | 31,798 |
| Total source records | 243,019 |

The four partitions reconcile exactly. Cleaned records have unique catalog
numbers. There are 1,208 duplicate groups containing 2,456 held records;
eight groups span multiple files. The expert packet contains 288,543 field
decisions for 123,346 specimens and all 2,456 duplicate records.

"Cleaned" means no current review flags; it does not mean all fields are complete
or taxa have been matched to the application database.

### Why review rates rose

Review rates below exclude held and blank records, using
`reviewRows / (cleanedRows + reviewRows)`:

| File | Review rate |
| --- | ---: |
| `32_310.csv`, the initial test file | 7.4% |
| `33_ 320.csv` | 5.5% |
| `22_210.csv` | 96.5% |
| `26_250.csv` | 99.4% |
| `30_290.csv` | 99.9% |

The combined review rate is approximately 59.1%. Several sheets, particularly
22–30, repeatedly contain departments under country, localities under province,
collectors under collection date, and collection dates under digitization date.
The cleaner followed the literal headers and flagged the resulting invalid
countries and dates.

Unique reviewed specimens with these particular issues:

| Issue | Specimens |
| --- | ---: |
| Unrecognized country | 74,502 |
| Collection date without a recognized format | 78,678 |
| Both issues | 65,925 |
| Either issue | 87,255 |

The union is about 71% of the reviewed specimens. Together with the sampled
source records, this strongly suggests that recurring misalignment is the main
cause of the increase. These flags alone do not prove that every affected record
is misaligned or that all can be repaired automatically.

### Representative source evidence

Catalog `250000` in `26_250.csv`:

| Source header | Actual source value | Apparent meaning; not yet an implemented remapping |
| --- | --- | --- |
| País | Ayacucho | Department |
| Departamento | La Mar | Province |
| Provincia | Tapuna, cumbre entre Tambo y Ayna. | Locality |
| Fecha colecta | Tovar, O. | Collector |
| Registrador | 6075 | Collector number |
| Fecha digitalización | 1969-05-01 00:00:00 | Collection date |

Other sampled records show the same pattern:

- `22_210.csv`, catalog `210000`: `Madre de Dios` under country, `Tambopata`
  under department, `Aguilar, M.` under collection date, and `May. 1996` under
  digitization date.
- `30_290.csv`, catalog `290000`: `Cusco` under country, `Urubamab` under
  department, `Dreyfus, C.;` under collection date, and `1941-07-01 00:00:00`
  under digitization date. The apparent spelling error is a separate concern.
- `32_310.csv`, catalog `310000`: collector, collector number, collection date
  and locality appear under the expected headers, illustrating why the initial
  file produced a much lower review rate.

Unnamed columns also contain actual data, including `ISOTIPO`, `Colombia`,
names, dates and `Consultar a especialista`. These cannot simply be discarded.

### Decisions and remaining work

Implemented:

- Preserve original source files and exact original cells in reports.
- Separate reviewed records from the cleaned CSV and hold complete duplicate
  groups, including groups spanning files.
- Apply the narrow, documented header and extra-column rules. Do not guess
  shifts in ambiguous rows.
- Keep spelling corrections for expert review. Keep accession suffixes such as
  `330791A` unchanged in held records; the current importer requires digits.
- Produce editable expert packets without applying expert decisions or importing
  records into the database.

Next investigation, not yet implemented:

1. Inspect recurring semantic layouts in the high-review files and determine
   whether each pattern applies to a whole sheet or only subsets of rows.
2. Establish evidence for every proposed field remapping, including missing
   fields and rows that already have correct alignment. Do not assume a single
   global shift or infer a country solely from one displaced value.
3. Add verified layout rules and representative regression cases, keeping
   ambiguous cases under review and preserving the original source snapshot.
4. Rerun cleaning and expert exports, record the reduction and remaining causes,
   and then assess the expert workload. Do not treat all current review records
   as independent biological or taxonomic ambiguities.

Taxon reconciliation, expert typo correction and database import remain pending.

## 2026-10-02: comparison with Campos DwC.xlsx

Read all five worksheets: Taxon, Identification, Occurrence, Event and Location.
The workbook primarily specifies field priorities, intended form labels and form
inclusion, rather than an explicit mapping from each source CSV column.

The basic mappings agree: `Código USM` to `catalogNumber`, `N° Colector` to
`recordNumber`, `Colector` to `recordedBy`, `Provincia` to `county`, and the source
family, genus, epithet, authorship and identification fields to their corresponding
DwC terms. The significant differences and gaps are:

| Area | Expert workbook | Current cleaner | Follow-up |
| --- | --- | --- | --- |
| Locality | `locality` is official; `verbatimLocality` is informal/dynamic. | Copies the source `Dtto./Localidad` text into both; sets `municipality` only on a verified district match. | Keep raw text in `verbatimLocality`; populate official locality only when its identity is established. This is a proposed correction, not implemented here. |
| Required fields | Nineteen fields are marked mandatory across four sheets. | Reads these priorities and reports missing values, but does not reject otherwise unflagged incomplete records. | Decide separately how legacy import completeness differs from requirements for new forms. |
| Date precision | `year`, `month` and `day` are all mandatory. | Preserves partial source dates without inventing a day or month. | Retain known precision; define an incomplete-date policy rather than fabricate values. |
| Taxon enrichment | Order, basionym, publication, publication year and taxonomic status are mandatory. | Exports the columns but leaves these five fields empty; taxon reconciliation has not occurred. | Enrich from an authoritative taxon source after matching, or retain as unavailable. |
| Collector order | `recordedBy` should be ordered by hierarchy. | Preserves the supplied collector order without establishing hierarchy. | Do not infer or reorder collector importance without evidence. |
| Optional information | Includes field notes, taxon/location remarks, verification statuses, phenology and other terms. | Many are not emitted as separate fields; `Descripción` goes to occurrence remarks, `Otros` is preserved in provenance, and habitat is currently empty. | Establish source evidence before splitting free text into specialized fields. Habitat is itself marked for review in the workbook. |

For the current 85,306 cleaned records, the summary reports all five enrichment
fields missing in every record, `scientificNameAuthorship` missing in 85,183,
and `day` missing in 41,008. These are completeness counts, not additional
review-record counts, and are affected by the unresolved source layouts.

The Identification sheet lists `identificationVerificationStatus`, which is not
currently emitted by the cleaner; it provides no explicit mandatory/optional
priority for its listed fields. No verification status should be invented.

Two further distinctions matter:

- The workbook describes `otherCatalogNumbers` as accession numbers in other
  institutions. The source distributed-herbaria list is not evidence of those
  accession numbers; it remains preserved as source information.
- At the application interface level, the workbook names `degreeOfEstablishment`,
  while the current occurrence CSV allowlist names `establishmentMeans`. These
  must not silently be treated as interchangeable; their intended use needs a
  separate decision before adding a mapping.

The workbook also contains unresolved form-priority contradictions:
`associatedReferences` and `georeferencedBy` are marked `no va` in priority but
`si` for form inclusion. Habitat is marked `REVISAR`, optional and to be defined.
These are clarification items, not permission to discard existing source data.

No cleaning or application mapping was changed during this comparison.

## 2026-10-02: ingestion adapter and upload compatibility

Implemented the separate ingestion-generation stage using only `cleaned.csv`.
The application accepts 26 of the cleaner's 41 DwC fields as native CSV columns;
the other 15 are preserved under `dynamicProperties.usmIngestion.unsupportedDwcFields`.
Source snapshots and existing properties remain intact. Expert mapping changes
and source-layout repair are still deferred.

The first ingestion export accounted for all 85,306 eligible input records:

| Result | Records |
| --- | ---: |
| Exported | 85,306 |
| Rejected for technical incompatibility | 0 |
| Exported without a scientific name | 20,148 |
| Exported with deferred determiner credits | 223 |

Deferred credits are nonblocking warnings included among the exported records.
The generator writes no database records. Taxon matches are not known until
import; the 20,148 nameless identifications necessarily cannot match through the
current scientific-name lookup, and additional names may be absent or ambiguous
in the database.

Two compatibility issues were addressed:

- The cleaner sometimes appends authorship to `scientificName`, whereas sampled
  `classification.csv` records store name and authorship separately. The adapter
  removes only the exact known trailing authorship suffix, preserving the original.
- The importer formerly split every comma in `identifiedBy`, fragmenting names
  such as `Rexnel, C.`. Explicit JSON name arrays now preserve complete names;
  legacy comma-list uploads still work. Ambiguous source credits retain their
  entire text without guessed person links.

Prepared-file handling on the upload page bypasses the mapper's JSON rebuilding,
preventing an existing `dynamicProperties` object from being wrapped as a string.
Imports now report unmatched taxon counts alongside matched counts. No database
migration or unmatched-record review page was added.

A row-by-row audit verified all 85,306 exports against the cleaned input,
including preservation of existing properties and source references. Exact
authorship suffixes were separated in 123 records. The 39 backend tests and
four prepared-CSV frontend tests pass, as do Ruff checks and the frontend
production build. Full frontend lint and type checking remain blocked by
existing errors in the untracked `ImageUploadPage.tsx`; checks excluding that
unrelated page pass, with existing lint warnings.

## 2026-10-02: independent taxon matching lookup

Extracted the existing import resolver into a shared Python matcher and added
`POST /api/taxon/match` for individual JSON requests with scientific name and
optional authorship. Both paths use the same exact matching and preference
rules as the importer. The result reports the selected taxon, status, reason,
candidate count before filtering, and whether the name-only fallback was used.
The lookup does not import records or modify database data, including pending
ORM changes. Usage and the preserved selection rules are documented in
[Taxon matching](taxon-matching.md).

The 19 new matcher/endpoint tests and 39 existing cleaning/import tests pass.
Ruff, targeted frontend lint, Prettier, and the frontend build pass. Frontend
type checking passes when excluding the existing unrelated `ImageUploadPage.tsx`
error (`sonner@2.0.3`). Matching tests use an in-memory table and endpoint tests
use mocked database sessions; no associations against the configured database
have been attempted.

## 2026-10-02: live matching smoke test on the ready CSV

Ran read-only calls against the running `/api/taxon/match` endpoint using 200
distinct name/authorship pairs from `data/ingestion/usm_all/occurrences.dwc.csv`.
Selection included all 28 authored pairs, the 25 most frequent pairs, and a
reproducible random sample of the remaining pairs (seed 20261002). This curated
sample is not an estimate of the whole file's matching rate. No import endpoint
was called and no records were written to the database.

The full CSV contains 14,370 distinct named pairs across 65,158 records, plus
20,148 records with no scientific name. Nameless records were not submitted to
the HTTP endpoint, which requires a name; the import matcher would leave them
unlinked.

| Outcome | Tested pairs | CSV records represented by those pairs |
| --- | ---: | ---: |
| Matched | 125 | 8,826 |
| Not found | 69 | 366 |
| Ambiguous | 6 | 287 |
| Request or response-validation errors | 0 | 0 |

The 28 authored pairs yielded 19 matches, 8 not found, and 1 ambiguous. Eight of
those matches used the name-only fallback, including `Solanum asperolanatum`
(supplied authorship `Pers.`, matched database authorship `Ruiz & Pav.`). Some
other author differences are formatting or abbreviation differences; the smoke
test does not establish their taxonomic equivalence. This verifies existing
behavior and identifies the fallback policy for review, rather than authorizing
changes to it.

Of the 125 selected taxa, 114 are Accepted, 9 Synonym, and 2 Unchecked; all are
current. The current matcher links unique candidates without requiring Accepted
status and does not redirect synonyms to their accepted taxa. Whether to keep
these associations is a separate policy decision before broad import.

Ambiguous names are `Arenaria palustris`, `Bambusa kumasasa`, `Clidemia dispar`,
`Elaphoglossum`, `Liabum ovatum`, and `Senecio adenophylloides`. Each query found
two candidates and remained unresolved after preference filtering. Not-found
results only establish the absence of an exact matching database name; no typo,
synonym, or missing-backbone diagnosis was inferred.

Detailed JSON, reviewable CSV, and the summary are saved under
`data/ingestion/usm_all/taxon_smoke_20261002T222146Z/`. The earlier
`taxon_smoke_20261002T222134Z/` report records a sandbox-blocked attempt with five
connection errors; the successful run supersedes it.

Follow-up inspection compared selected not-found names with the live taxon
search using `only_current=false`. It confirmed these textual discrepancies:

| Exported name | Database name found by broader search | Interpretation |
| --- | --- | --- |
| `EUPHORBIA` | `Euphorbia` | Capitalization differs. |
| `CACTACEAE` | `Cactaceae` | Capitalization differs; the supplied text is a family-level identification. |
| `Cheilanthes Bonariensis` | `Cheilanthes bonariensis` | Epithet capitalization differs; the database entry is a Synonym. |
| `Bomarea spec.` | `Bomarea` | Extra `spec.` text prevents exact matching; species remains unspecified. |
| `Beilschmedia` | `Beilschmiedia` | Possible spelling difference; identity requires expert confirmation. |
| `Adelobotrys boissierianus` + `Cogn.` | `Adelobotrys boissieriana` + `Cogn.` | Different epithet ending; identity requires expert confirmation. |
| `Calytranthes` | `Calyptranthes` | Possible missing letter; the database entry is a Synonym. |

The displayed differences occur in the original CSV rows as well; the adapter
did not introduce them. `Adelobotrys boissierianus` and
`Cheilanthes Bonariensis` were composed from separate original genus/epithet
cells; the others above were already supplied as single source strings. These
checks identify possible explanations for lookup failure, not approved taxonomic
corrections. A missing exact name may also reflect an alternate name or a gap in
the loaded database; the smoke test alone cannot distinguish those causes.

## 2026-10-02: case-insensitive matching fallback

The shared matcher now tries exact name/authorship, case-insensitive
name/authorship, exact name alone, and case-insensitive name alone, in that
order. Each query runs only if the preceding query found no candidates;
ambiguity is not broadened. Missing authorship retains the null/empty-author
restriction in the first two queries. Existing candidate preferences and
authorship-mismatch fallback remain unchanged.

The API adds `usedCaseInsensitiveFallback`, true when a case-insensitive query
supplied the result's candidates, including ambiguous results. It is false for
missing names or no candidates. Original name/authorship values remain intact
in imported identifications. Spelling, punctuation, accents, qualifiers, and
internal whitespace are not normalized. The 69 backend tests pass; scoped
frontend lint, formatting, and type checking pass (type checking excludes the
existing unrelated `ImageUploadPage.tsx` error).

Repeated the identical 200-pair smoke sample against the running endpoint:

| Outcome | Before | After |
| --- | ---: | ---: |
| Matched pairs | 125 | 136 |
| Not-found pairs | 69 | 58 |
| Ambiguous pairs | 6 | 6 |
| Request or response-validation errors | 0 | 0 |

Eleven capitalization-only pairs gained matches, representing 278 CSV records.
Examples include `CACTACEAE`, `EUPHORBIA`, `Cheilanthes Bonariensis`, and
`RUBIACEAE`. All previous matches retained their taxon IDs. The new sample
represents 9,104 matched records, 88 not-found records, and 287 ambiguous
records; these are sample coverage counts, not whole-file estimates. Authorship
conflict and Synonym/Unchecked policies are unchanged and remain separate review
topics.

Results and a before/after comparison are saved under
`data/ingestion/usm_all/taxon_smoke_20261002T224031Z/`. The 200 requests took about
71 seconds in total. A functional index on `lower(scientific_name)` is declared
in the ORM and an idempotent concurrent setup statement is provided in
`backend/scripts/sql/create_taxon_matching_index.sql`; it has not been applied
to the live database. Existing deployments should apply that setup before broad
imports to support the new equality queries efficiently. No import was run.
