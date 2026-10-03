# USM CSV cleaning and expert review

The offline cleaner converts the exported specimen sheets to Darwin Core fields.
It preserves uncertain values for expert review and does not edit the source files,
resolve taxa against the database, or import records into the application.

Batch findings, source examples and unresolved layout issues are recorded in
[usm-csv-findings.md](usm-csv-findings.md).

## Run a batch

From the repository root:

```bash
python -m backend.scripts.clean_usm_csv \
  --input-dir 'data/XLSX/Registros USM 0-300+_csv'
python -m backend.scripts.export_usm_expert_review \
  --input-dir data/cleaned/usm_all
```

Batch mode requires exactly one CSV for each filename prefix from `1_` to `37_`.
Files are processed in numeric order, including the actual filename `33_ 320.csv`.
Other CSVs, including metadata sheets 38–40, are excluded and listed in the summary.
Catalog-number duplicates are checked across all selected files before cleaning;
every member of a duplicate group is held for review.

The defaults are `data/cleaned/usm_all` for cleaning reports and
`data/expert_review/usm_all` for the expert packet. Use `--output-dir` to choose
another directory. Existing reports require an explicit `--overwrite`; the batch
is fully processed in temporary files before the final reports are published.
Data artifacts are ignored by Git.

## Run one file

```bash
python -m backend.scripts.clean_usm_csv \
  --input 'data/XLSX/Registros USM 0-300+_csv/36_350.csv' \
  --output-dir data/cleaned/36_350
```

Without input options, the cleaner still uses `32_310.csv` and
`data/cleaned/32_310`. `--input` and `--input-dir` are mutually exclusive.
Single-file mode can detect only duplicates within that file.

## Layout rules

Canonical source columns are defined in `SOURCE_COLUMNS` in
`backend/scripts/clean_usm_csv.py`. They are source spreadsheet names, separate
from the generated DwC headers. Mapping uses names rather than positions and
normalizes Unicode, whitespace and capitalization. Colliding normalized names
are rejected. Only `Autor` and `Clasificación subespecífica` may be absent; their
canonical values are filled with empty strings.

| File or layout | Rule |
| --- | --- |
| `CÓDIGO USM`, including surrounding spaces | Map to `Código USM`. |
| `8_70.csv` | Map the first `Unnamed: 0` column to `Código USM` only when the remaining headers match the verified layout without the infraspecific column. |
| `6_50.csv` | Preserve the extra `Autor.1` column; empty content does not trigger review. |
| `27_260.csv` | Recover exact `ISOTIPO`/`Isotipo` in `Unnamed: 29` as `typeStatus=isotype` when `Tipo` is empty. Record the recovery and retain review for the extra cells and potentially displaced values. |
| `35_340.csv` | An extra `Unnamed: 26` value identical after whitespace normalization to `Fecha de revisión` is redundant information. |
| Any other additional column | Preserve it; meaningful content triggers review without guessing its mapping. |

Existing missing-value markers, such as `-`, do not trigger extra-column review,
but remain in the original snapshot. A completely blank record means every cell
is empty or whitespace-only; these records are skipped and counted separately.
Rows containing placeholders, `LIBRE`, or any other content are not blank records.
Malformed row widths are assessed against the actual file header, not against
the canonical column count.

Spelling changes and automatic shifts of ambiguous source cells are not applied.
Nonnumeric accession codes, including possible subdivisions such as `330791A`,
are held unchanged because the current application importer requires digits.

## Reports and provenance

| Output | Contents |
| --- | --- |
| `cleaned.csv` | DwC records without review flags; incomplete unflagged records may remain. |
| `needs_review.csv` | The same DwC schema, containing records with review flags. |
| `held.csv` | Duplicates, invalid codes, `LIBRE` and malformed records with their hold reasons. |
| `review.csv` | Field-level informational and review issues. |
| `summary.json` | Aggregate and per-file counts, header adaptations, excluded files, duplicate groups and required-field completeness for `cleaned.csv`. |

Each record carries `sourceFile` and `sourceRow`. As in the original cleaner,
`sourceRow` is the physical CSV line where the record ends; quoted multiline
cells may therefore make row references differ from spreadsheet row numbers.

For mapped records, `dynamicProperties.sourceData` retains all canonical source
fields. `dynamicProperties.sourceOriginal` contains the exact original `headers`
and `values` arrays, preserving aliases, extra columns and whitespace. Additional
cells are also recorded in `sourceExtraColumns` with the original column name,
zero-based position and value. Held rows contain the same original snapshot in
their JSON `sourceOriginal` column, including malformed cells beyond the header.

The row-count invariant is:

```text
sourceRows = cleanedRows + reviewRows + heldRows + skippedBlankRows
```

## Expert packet

`expert_review.csv` groups review issues by source file, source row and field,
includes the current mapped value, source context and blank expert response
fields. `expert_duplicates.csv` includes complete duplicate groups across files
with blank response fields. Both include the JSON `sourceOriginal` snapshot so
experts can inspect unnamed cells. Invalid identifiers and other nonduplicate
holds remain in `held.csv` for review.

Older cleaner reports without `sourceOriginal` still work: the exporter builds
a snapshot from their available canonical source data. Whitespace-equivalent
issue originals can be grouped, but genuinely different originals still cause
an error rather than silently choosing one. The packet does not apply expert
decisions back to the cleaned data.

## Generate the ingestion CSV

The cleaned data is an intermediate checkpoint. Generate the application upload
file as a separate step:

```bash
python -m backend.scripts.generate_usm_ingestion_csv \
  --input-dir data/cleaned/usm_all
```

The output defaults to `data/ingestion/<input-directory-name>`. Use `--output-dir`
or `--overwrite` as needed. Only `cleaned.csv` is read; pending expert records and
held records are not included. Files are staged before publication, and an input
schema error or duplicate catalog number aborts publication.

| Output | Contents |
| --- | --- |
| `occurrences.dwc.csv` | One combined CSV with 26 supported `dwc:Entity:field` headers, ready for the collection upload page. |
| `rejected.csv` | Input records failing technical validation, including source context and reasons; values are never truncated. |
| `ingestion_review.csv` | Nonblocking determiner-credit decisions: ambiguous credits are preserved, but no individual Identifier is guessed. |
| `summary.json` | Export/rejection counts, deferred credits, missing scientific names and output paths. |

The original `dynamicProperties` object is preserved. The reserved `usmIngestion`
object adds the source file, source row, cleaning status and nonempty DwC fields
that the importer cannot accept as native columns, including taxon details and
elevation endpoints. An existing conflicting `usmIngestion` object is rejected.

The adapter removes only an exact trailing authorship suffix supplied separately
by the cleaner, retaining the original combined scientific name in provenance.
It does not correct spelling, repair layouts or substitute accepted names.

Technical checks cover catalog syntax, schema, row width, JSON objects, source
references, finite coordinate pairs and bounds, numeric date components and
database string lengths. Missing optional values and partial dates remain valid.
The count invariant is `inputRows = exportedRows + rejectedRows`.

### Identifier credits

The application importer now accepts an explicit JSON array of names in
`dwc:Identification:identifiedBy`, such as `["Rexnel, C."]`. This is an application
CSV convention that preserves commas inside names. Legacy comma-separated lists
remain supported for older upload files.

The generator recognizes clear single credits, including surname/comma/dotted
initials, and explicit semicolon or pipe lists whose members are individually
clear. Ambiguous comma lists, conjunctions, slashes and `et al.` credits are
retained under `usmIngestion.deferredIdentifiedBy` and recorded in the ingestion
review CSV. The identification is still imported; individual people are deferred.

### Upload and taxon matching

Select the generated CSV on the collection's existing CSV upload page. Prepared
DwC files bypass column remapping and preserve JSON cells; ordinary source CSVs
keep the existing mapping workflow. The server remains authoritative for accepted
headers, collection permissions and catalog conflicts with existing records in
the institution. Each upload remains transactional.

Taxon lookup happens against the current database during import, not during
offline generation. Unmatched identifications retain their names and provenance
with an empty taxon link. The response and upload notification report
`taxaMatched` and `taxaUnmatched` as occurrence counts, not counts of distinct taxa.

To test an individual name before importing, use the shared Python matcher or
`POST /api/taxon/match`; see [Taxon matching](taxon-matching.md). No CSV input is
needed for these lookups.
The future unmatched-occurrence review page is not implemented in this step.

## Verification

```bash
python -m unittest backend.tests.test_clean_usm_csv \
  backend.tests.test_export_usm_expert_review \
  backend.tests.test_generate_usm_ingestion_csv backend.tests.test_dwc_import
node frontend/tests/preparedDwcCsv.test.mjs
```

Tests exercise the observed layouts, narrow file-specific rules, preservation of
extra and multiline cells, blank records, held identifiers, malformed widths,
global duplicates, report preflight and exporter compatibility.
