import csv
import json
import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path

from openpyxl import Workbook

from backend.scripts.clean_usm_csv import (
    OUTPUT_DWC_FIELDS,
    SOURCE_COLUMNS,
    InputError,
    build_parser,
    load_ubigeo,
    map_geography,
    parse_coordinate,
    parse_date,
    parse_taxon,
    read_layout,
    run_batch_cleaner,
    run_cleaner,
    select_batch_sources,
)


class CleanUsmCsvTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.input_path = self.root / "source.csv"
        self.fields_path = self.root / "fields.xlsx"
        self.ubigeo_dir = self.root / "ubigeo"
        self.output_dir = self.root / "out"
        self.ubigeo_dir.mkdir()
        self._write_ubigeo()
        self._write_fields()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _write_ubigeo(self):
        tables = {
            "departamentos": [{"id": "21", "name": "Puno"}, {"id": "16", "name": "Loreto"}],
            "provincias": [
                {"id": "2101", "name": "Puno", "department_id": "21"},
                {"id": "2102", "name": "Carabaya", "department_id": "21"},
                {"id": "1601", "name": "Maynas", "department_id": "16"},
            ],
            "distritos": [
                {"id": "210201", "name": "Macusani", "province_id": "2102", "department_id": "21"}
            ],
        }
        for filename, value in tables.items():
            path = self.ubigeo_dir / f"ubigeo_peru_2016_{filename}.json"
            path.write_text(json.dumps(value), encoding="utf-8")

    def _write_fields(self):
        workbook = Workbook()
        first = workbook.active
        first.title = "Occurrence"
        first.append(["Campo en DwC", "Prioridad del Campo"])
        first.append(["catalogNumber", "Obligatorio"])
        second = workbook.create_sheet("Taxon")
        second.append(["Notas", "Prioridad del Campo", "Campo en DwC"])
        second.append(["", "Obligatorio", "family"])
        workbook.save(self.fields_path)

    @staticmethod
    def row(**values):
        row = {column: "" for column in SOURCE_COLUMNS}
        row.update(values)
        return [row[column] for column in SOURCE_COLUMNS]

    def _write_source(self, rows):
        with self.input_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(SOURCE_COLUMNS)
            writer.writerows(rows)

    def test_coordinate_parser_handles_decimal_dms_and_rejects_projected_values(self):
        self.assertEqual(parse_coordinate("-12.5", "latitude"), (-12.5, None))
        value, error = parse_coordinate("10.22.30.S", "latitude")
        self.assertIsNone(error)
        self.assertAlmostEqual(value, -(10 + 22 / 60 + 30 / 3600))
        value, error = parse_coordinate("10.38.48.7S", "latitude")
        self.assertIsNone(error)
        self.assertAlmostEqual(value, -(10 + 38 / 60 + 48.7 / 3600))
        value, error = parse_coordinate("8°52'49''S", "latitude")
        self.assertIsNone(error)
        self.assertAlmostEqual(value, -(8 + 52 / 60 + 49 / 3600))
        value, error = parse_coordinate("75°40'28''O", "longitude")
        self.assertIsNone(error)
        self.assertAlmostEqual(value, -(75 + 40 / 60 + 28 / 3600))
        value, error = parse_coordinate("429583", "latitude")
        self.assertIsNone(value)
        self.assertIn("excede", error)
        value, error = parse_coordinate("-91", "latitude")
        self.assertIsNone(value)
        self.assertIn("excede", error)
        value, error = parse_coordinate("-12 N", "latitude")
        self.assertIsNone(value)
        self.assertIn("contradice", error)

    def test_country_inference_requires_a_consistent_verified_pair(self):
        geography = load_ubigeo(self.ubigeo_dir)
        row = {column: "" for column in SOURCE_COLUMNS}
        row["Departamento"] = "Puno"
        row["Provincia"] = "Carabaya"
        fields, _ = map_geography(row, geography)
        self.assertEqual(fields["countryCode"], "PE")

        row["País"] = "Atlantis"
        fields, notes = map_geography(row, geography)
        self.assertNotIn("country", fields)
        self.assertNotIn("stateProvince", fields)
        self.assertNotIn("county", fields)
        self.assertTrue(any("no reconocido" in reason for _, _, _, reason in notes))

        row["País"] = ""
        row["Departamento"] = "Bolivia"
        row["Provincia"] = "Santa Cruz"
        fields, notes = map_geography(row, geography)
        self.assertEqual(fields["countryCode"], "BO")
        self.assertNotIn("stateProvince", fields)
        self.assertNotIn("county", fields)
        self.assertTrue(any("No se aplicó el catálogo INEI" in reason for _, _, _, reason in notes))

    def test_date_parser_preserves_precision_and_does_not_repair_suspicious_values(self):
        month_date, error = parse_date("Ago. 2017")
        self.assertIsNone(error)
        self.assertEqual(
            (month_date.event_date, month_date.year, month_date.month, month_date.day),
            ("2017-08", 2017, 8, None),
        )
        day_date, error = parse_date("12 Feb. 2019")
        self.assertIsNone(error)
        self.assertEqual(day_date.event_date, "2019-02-12")
        timestamp, error = parse_date("2019-02-12T14:30:00")
        self.assertIsNone(error)
        self.assertEqual(timestamp.event_date, "2019-02-12T14:30:00")
        self.assertEqual(parse_date("May, 2017")[0].event_date, "2017-05")
        self.assertEqual(parse_date("04.Jul.2013")[0].event_date, "2013-07-04")
        self.assertEqual(parse_date("Abr. 21 2019")[0].event_date, "2019-04-21")
        self.assertEqual(parse_date("13. 12.1992")[0].event_date, "1992-12-13")
        self.assertTrue(parse_date("Abr. 2104")[1])
        unknown, error = parse_date("unknown 2018")
        self.assertIsNone(unknown)
        self.assertTrue(error)

    def test_taxon_parser_separates_clear_infraspecific_rank_and_qualifier(self):
        row = {column: "" for column in SOURCE_COLUMNS}
        row.update(
            {
                "Familia": "POACEAE",
                "Género": "Jarava",
                "Especie": "cf. ichu subsp. malyanus",
                "Autor": "J. Presl",
            }
        )
        fields, notes = parse_taxon(row)
        self.assertEqual(fields["specificEpithet"], "ichu")
        self.assertEqual(fields["infraspecificEpithet"], "malyanus")
        self.assertEqual(fields["taxonRank"], "subspecies")
        self.assertEqual(fields["identificationQualifier"], "cf.")
        self.assertEqual(fields["scientificName"], "Jarava ichu subsp. malyanus J. Presl")
        self.assertTrue(notes)

    def test_clear_taxon_cleanup_and_uncertain_infraspecific_review(self):
        self._write_source(
            [
                self.row(
                    **{
                        "Código USM": "001",
                        "Género": "Everniopsis",
                        "Especie": "Everniopsis trulla",
                    }
                ),
                self.row(**{"Código USM": "002", "Género": "Ficus", "Especie": "Ficus macbridei"}),
                self.row(**{"Código USM": "003", "Género": "Cf. Gynoxys"}),
                self.row(
                    **{
                        "Código USM": "004",
                        "Género": "Ficus",
                        "Especie": "pertusa",
                        "Clasificación subespecífica": "Lf",
                    }
                ),
                self.row(**{"Código USM": "005", "Género": "Ficus", "Especie": "Pinus nigra"}),
            ]
        )
        summary = run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["cleanedRows"], 3)
        self.assertEqual(summary["reviewRows"], 2)
        self.assertEqual(summary["recordsNeedingReview"], 2)

        with (self.output_dir / "cleaned.csv").open(encoding="utf-8-sig", newline="") as handle:
            cleaned = {row["catalogNumber"]: row for row in csv.DictReader(handle)}
        with (self.output_dir / "needs_review.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            needs_review = {row["catalogNumber"]: row for row in csv.DictReader(handle)}
        self.assertEqual(set(cleaned), {"001", "002", "003"})
        self.assertEqual(set(needs_review), {"004", "005"})
        self.assertEqual(cleaned["001"]["scientificName"], "Everniopsis trulla")
        self.assertEqual(cleaned["001"]["specificEpithet"], "trulla")
        self.assertEqual(cleaned["002"]["scientificName"], "Ficus macbridei")
        self.assertEqual(cleaned["002"]["specificEpithet"], "macbridei")
        self.assertEqual(cleaned["003"]["genus"], "Gynoxys")
        self.assertEqual(cleaned["003"]["identificationQualifier"], "cf.")
        self.assertEqual(needs_review["004"]["scientificName"], "Ficus pertusa")
        self.assertEqual(needs_review["004"]["infraspecificEpithet"], "")
        self.assertEqual(
            json.loads(needs_review["004"]["dynamicProperties"])["sourceData"][
                "Clasificación subespecífica"
            ],
            "Lf",
        )
        self.assertEqual(needs_review["005"]["specificEpithet"], "")

        with (self.output_dir / "review.csv").open(encoding="utf-8-sig", newline="") as handle:
            issues = list(csv.DictReader(handle))
        review_catalogs = {row["catalogNumber"] for row in issues if row["severity"] == "review"}
        self.assertEqual(review_catalogs, {"004", "005"})
        self.assertTrue(
            any(row["catalogNumber"] == "003" and row["resultingValue"] == "cf." for row in issues)
        )

    def test_full_clean_keeps_partial_rows_holds_duplicate_and_libre(self):
        rows = [
            self.row(
                **{
                    "Código USM": "0001",
                    "Familia": "POACEAE",
                    "Género": "Jarava",
                    "Especie": "ichu",
                    "Departamento": "Puno",
                    "Provincia": "Carabaya",
                    "Dtto./Localidad": "Macusani, laguna",
                    "Latitud / Northing": "15° 50' 10\"S",
                    "Longitud / Easting": "70° 01' 20\"W",
                    "Colector": "Baldeón, S.",
                    "Fecha colecta": "Ago. 2017",
                }
            ),
            self.row(**{"Código USM": "0002", "Familia": "ASTERACEAE"}),
            self.row(**{"Código USM": "0002", "Familia": "ASTERACEAE"}),
            self.row(**{"Código USM": "LIBRE"}),
            self.row(**{"Código USM": "0005", "Familia": "LIBRE"}),
            self.row(**{"Código USM": "invalid"}),
            self.row(
                **{
                    "Código USM": "0003",
                    "Latitud / Northing": "429583",
                    "Longitud / Easting": "8683846",
                }
            ),
        ]
        self._write_source(rows)
        # Add a wrong-width row to verify it is retained in held.csv.
        with self.input_path.open("a", encoding="utf-8", newline="") as handle:
            handle.write("0004,extra\n")

        summary = run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["sourceRows"], 8)
        self.assertEqual(summary["cleanedRows"], 1)
        self.assertEqual(summary["reviewRows"], 1)
        self.assertEqual(summary["heldRows"], 6)
        self.assertEqual(summary["requiredFields"]["rowScope"], "cleaned.csv")
        self.assertEqual(summary["requiredFields"]["byTermMissingRows"]["family"], 0)

        with (self.output_dir / "cleaned.csv").open(encoding="utf-8-sig", newline="") as handle:
            cleaned = list(csv.DictReader(handle))
        with (self.output_dir / "needs_review.csv").open(
            encoding="utf-8-sig", newline=""
        ) as handle:
            needs_review = list(csv.DictReader(handle))
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(len(needs_review), 1)
        self.assertEqual(tuple(cleaned[0].keys()), tuple(needs_review[0].keys()))
        self.assertEqual(tuple(cleaned[0].keys())[:-3], OUTPUT_DWC_FIELDS)
        specimen = cleaned[0]
        self.assertEqual(specimen["catalogNumber"], "0001")
        self.assertEqual(specimen["scientificName"], "Jarava ichu")
        self.assertEqual(specimen["countryCode"], "PE")
        self.assertEqual(specimen["stateProvince"], "Puno")
        self.assertEqual(specimen["county"], "Carabaya")
        self.assertEqual(specimen["eventDate"], "2017-08")
        self.assertEqual(specimen["year"], "2017")
        self.assertAlmostEqual(float(specimen["decimalLatitude"]), -(15 + 50 / 60 + 10 / 3600))
        self.assertEqual(
            json.loads(specimen["dynamicProperties"])["sourceData"]["Familia"], "POACEAE"
        )
        self.assertEqual(specimen["cleaningStatus"], "cleaned")
        self.assertEqual(needs_review[0]["catalogNumber"], "0003")
        self.assertEqual(needs_review[0]["cleaningStatus"], "review")
        with (self.output_dir / "held.csv").open(encoding="utf-8-sig", newline="") as handle:
            held = list(csv.DictReader(handle))
        self.assertEqual(sum("duplicado" in row["holdReason"] for row in held), 2)
        self.assertEqual(
            sum("Código USM marcado como LIBRE" in row["holdReason"] for row in held), 1
        )
        self.assertEqual(sum("reserva" in row["holdReason"] for row in held), 1)
        self.assertEqual(sum("inválido" in row["holdReason"] for row in held), 1)
        self.assertEqual(sum("columnas" in row["holdReason"] for row in held), 1)

    def test_output_collision_requires_explicit_overwrite(self):
        self._write_source([self.row(**{"Código USM": "001"})])
        run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        with self.assertRaises(InputError):
            run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        run_cleaner(
            self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir, overwrite=True
        )

    @staticmethod
    def _write_layout(path, headers, rows):
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(headers)
            writer.writerows(rows)

    def _read_output(self, name):
        with (self.output_dir / name).open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))

    def test_observed_layouts_and_reordered_columns_map_by_name(self):
        cases = [
            ("1_0.csv", {"Autor", "Clasificación subespecífica"}, None, []),
            ("2_10.csv", {"Clasificación subespecífica"}, None, []),
            ("5_40.csv", {"Clasificación subespecífica"}, "CÓDIGO USM", []),
            ("6_50.csv", {"Clasificación subespecífica"}, None, ["Autor.1"]),
            ("8_70.csv", {"Clasificación subespecífica"}, "Unnamed: 0", []),
            ("17_160.csv", set(), None, []),
            ("22_210.csv", {"Autor"}, None, []),
            ("23_220.csv", set(), " CÓDIGO USM", [f"Unnamed: {n}" for n in range(26, 32)]),
            ("27_260.csv", set(), None, [f"Unnamed: {n}" for n in range(26, 32)]),
            ("35_340.csv", set(), None, [f"Unnamed: {n}" for n in range(26, 31)]),
            ("36_350.csv", {"Autor"}, None, [f"Unnamed: {n}" for n in range(25, 29)]),
        ]
        raw = dict(
            zip(
                SOURCE_COLUMNS,
                self.row(
                    **{
                        "Código USM": "0001",
                        "Familia": "POACEAE",
                        "Género": "Jarava",
                        "Especie": "ichu",
                    }
                ),
            )
        )
        for filename, missing, alias, extras in cases:
            with self.subTest(filename=filename):
                headers = [name for name in SOURCE_COLUMNS if name not in missing]
                values = [raw[name] for name in headers]
                if alias:
                    headers[0] = alias
                if filename == "6_50.csv":
                    index = headers.index("Nombre vernáculo") + 1
                    headers.insert(index, extras[0])
                    values.insert(index, "")
                else:
                    headers.extend(extras)
                    values.extend([""] * len(extras))
                path = self.root / filename
                self._write_layout(path, headers, [values])
                summary = run_cleaner(
                    path, self.fields_path, self.ubigeo_dir, self.output_dir, True
                )
                self.assertEqual(summary["cleanedRows"], 1)
                row = self._read_output("cleaned.csv")[0]
                self.assertEqual(row["catalogNumber"], "0001")
                self.assertEqual(row["scientificName"], "Jarava ichu")
                properties = json.loads(row["dynamicProperties"])
                self.assertEqual(
                    properties["sourceOriginal"], {"headers": headers, "values": values}
                )
                self.assertEqual(set(properties["sourceData"]), set(SOURCE_COLUMNS))
        headers = list(reversed(SOURCE_COLUMNS))
        self._write_layout(self.input_path, headers, [[raw[name] for name in headers]])
        run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir, True)
        self.assertEqual(self._read_output("cleaned.csv")[0]["catalogNumber"], "0001")

    def test_header_collisions_missing_required_and_unnamed_alias_are_rejected(self):
        for headers in (
            [*SOURCE_COLUMNS, " CÓDIGO USM "],
            [name for name in SOURCE_COLUMNS if name != "Colector"],
            ["Unnamed: 0", *SOURCE_COLUMNS[1:]],
        ):
            self._write_layout(self.input_path, headers, [])
            with self.assertRaises(InputError):
                read_layout(self.input_path)
        self.assertFalse(self.output_dir.exists())
        path = self.root / "8_70.csv"
        self._write_layout(path, ["Unnamed: 0", *SOURCE_COLUMNS[1:]], [])
        with self.assertRaises(InputError):
            read_layout(path)  # Filename alone is insufficient for the ad-hoc alias.

    def test_extra_values_trigger_review_and_empty_markers_preserve_originals(self):
        headers = [*SOURCE_COLUMNS, "Unnamed: 26"]
        rows = [
            [*self.row(**{"Código USM": "001"}), "Consultar a especialista"],
            [*self.row(**{"Código USM": "002"}), "-"],
            [*self.row(**{"Código USM": "003"}), ""],
            [*self.row(**{"Código USM": "004"}), "Marcelo Daza"],
        ]
        self._write_layout(self.input_path, headers, rows)
        summary = run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual((summary["cleanedRows"], summary["reviewRows"]), (2, 2))
        self.assertEqual(
            {r["catalogNumber"] for r in self._read_output("cleaned.csv")}, {"002", "003"}
        )
        review = self._read_output("needs_review.csv")
        properties = json.loads(review[0]["dynamicProperties"])
        self.assertEqual(properties["sourceOriginal"]["values"][-1], "Consultar a especialista")
        self.assertTrue(
            all(r["field"] == "sourceExtraColumns" for r in self._read_output("review.csv"))
        )

    def test_narrow_type_recovery_and_redundant_review_date(self):
        path = self.root / "27_260.csv"
        headers = [*SOURCE_COLUMNS, "Unnamed: 29"]
        rows = [
            [*self.row(**{"Código USM": "001"}), "ISOTIPO"],
            [*self.row(**{"Código USM": "002", "Tipo": "HOLOTIPO"}), "ISOTIPO"],
            [*self.row(**{"Código USM": "003"}), "P"],
        ]
        self._write_layout(path, headers, rows)
        summary = run_cleaner(path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["reviewRows"], 3)
        records = {r["catalogNumber"]: r for r in self._read_output("needs_review.csv")}
        self.assertEqual(records["001"]["typeStatus"], "isotype")
        self.assertEqual(records["002"]["typeStatus"], "holotype")
        self.assertEqual(records["003"]["typeStatus"], "")
        self.assertEqual(json.loads(records["001"]["dynamicProperties"])["sourceData"]["Tipo"], "")
        path = self.root / "35_340.csv"
        rows = [
            [
                *self.row(**{"Código USM": "004", "Fecha de revisión": "2026-05-12 00:00:00"}),
                " 2026-05-12 00:00:00 ",
            ],
            [
                *self.row(**{"Código USM": "005", "Fecha de revisión": "2026-05-12 00:00:00"}),
                "2026-05-13 00:00:00",
            ],
        ]
        self._write_layout(path, [*SOURCE_COLUMNS, "Unnamed: 26"], rows)
        summary = run_cleaner(path, self.fields_path, self.ubigeo_dir, self.output_dir, True)
        self.assertEqual((summary["cleanedRows"], summary["reviewRows"]), (1, 1))
        self.assertEqual(self._read_output("cleaned.csv")[0]["catalogNumber"], "004")

    def test_actual_width_blanks_suffixes_and_multiline_provenance(self):
        headers = [name for name in SOURCE_COLUMNS if name != "Autor"]
        raw = dict(zip(SOURCE_COLUMNS, self.row(**{"Código USM": "001", "Descripción": "a\nb"})))
        values = [raw[name] for name in headers]
        self._write_layout(
            self.input_path,
            headers,
            [
                [" "] * len(headers),
                [],
                values,
                ["330791A", *([""] * (len(headers) - 1))],
                ["005", "bad width"],
                ["006", *([""] * len(headers)), "tail"],
                ["007", *([""] * (len(headers) - 1))],
            ],
        )
        summary = run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["sourceRows"], 7)
        self.assertEqual(summary["skippedBlankRows"], 2)
        self.assertEqual(summary["cleanedRows"], 2)
        self.assertEqual(summary["heldRows"], 3)
        self.assertEqual(summary["malformedWidthRows"], 2)
        cleaned = self._read_output("cleaned.csv")
        self.assertEqual(cleaned[0]["sourceRow"], "5")
        self.assertEqual(
            json.loads(cleaned[0]["dynamicProperties"])["sourceOriginal"]["values"], values
        )
        held = self._read_output("held.csv")
        self.assertEqual(held[0]["Código USM"], "330791A")
        self.assertEqual(json.loads(held[1]["sourceOriginal"])["values"], ["005", "bad width"])
        self.assertEqual(json.loads(held[2]["sourceOriginal"])["values"][-1], "tail")

    def _write_batch(self):
        directory = self.root / "batch"
        directory.mkdir()
        for number in range(1, 38):
            catalog = "0001" if number in (1, 37) else str(number)
            rows = [self.row(**{"Código USM": catalog})]
            if number == 1:
                rows.append([""] * len(SOURCE_COLUMNS))
            if number == 8:
                rows.append(self.row(**{"Código USM": "0008A"}))
            self._write_layout(
                directory / f"{number}_{(number - 1) * 10}.csv", SOURCE_COLUMNS, rows
            )
        self._write_layout(directory / "38_metadata.csv", ["metadata"], [["ignored"]])
        return directory

    def test_batch_holds_complete_cross_file_groups_and_excludes_metadata(self):
        directory = self._write_batch()
        summary = run_batch_cleaner(directory, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["sourceRows"], 39)
        self.assertEqual(summary["cleanedRows"], 35)
        self.assertEqual(summary["heldRows"], 3)
        self.assertEqual(summary["skippedBlankRows"], 1)
        self.assertEqual(summary["crossFileDuplicateGroupCount"], 1)
        self.assertEqual(summary["duplicateRows"], 2)
        self.assertEqual(summary["excludedFiles"], ["38_metadata.csv"])
        self.assertEqual(len(summary["perFile"]), 37)
        self.assertEqual(summary["perFile"][0]["heldRows"], 1)
        self.assertEqual(summary["perFile"][-1]["heldRows"], 1)
        cleaned = self._read_output("cleaned.csv")
        self.assertEqual(len({row["catalogNumber"] for row in cleaned}), len(cleaned))
        self.assertEqual([r["sourceFile"] for r in cleaned][:2], ["2_10.csv", "3_20.csv"])
        with self.assertRaisesRegex(InputError, "overwrite"):
            run_batch_cleaner(directory, self.fields_path, self.ubigeo_dir, self.output_dir)
        run_batch_cleaner(directory, self.fields_path, self.ubigeo_dir, self.output_dir, True)

    def test_batch_selection_and_preflight_failure_preserve_existing_outputs(self):
        directory = self._write_batch()
        duplicate = directory / "1_other.csv"
        self._write_layout(duplicate, SOURCE_COLUMNS, [])
        with self.assertRaisesRegex(InputError, "ambiguo: 1"):
            select_batch_sources(directory)
        duplicate.unlink()
        self._write_source([self.row(**{"Código USM": "001"})])
        run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        before = {p.name: p.read_bytes() for p in self.output_dir.iterdir()}
        (directory / "37_360.csv").write_text(
            ",".join(SOURCE_COLUMNS) + '\n"unclosed', encoding="utf-8"
        )
        with self.assertRaises(InputError):
            run_batch_cleaner(directory, self.fields_path, self.ubigeo_dir, self.output_dir, True)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.output_dir.iterdir()})
        (directory / "37_360.csv").unlink()
        with self.assertRaisesRegex(InputError, "ambiguo: 37"):
            select_batch_sources(directory)

    def test_cli_input_modes_are_mutually_exclusive(self):
        with self.assertRaises(SystemExit), redirect_stderr(StringIO()):
            build_parser().parse_args(["--input", "file.csv", "--input-dir", "batch"])
        args = build_parser().parse_args([])
        self.assertIsNone(args.input)
        self.assertIsNone(args.input_dir)

    def test_catalog_numbers_preserve_leading_zeros_and_remain_distinct(self):
        self._write_source(
            [
                self.row(**{"Código USM": "0001"}),
                self.row(**{"Código USM": "1"}),
            ]
        )
        summary = run_cleaner(self.input_path, self.fields_path, self.ubigeo_dir, self.output_dir)
        self.assertEqual(summary["cleanedRows"], 2)
        self.assertEqual(summary["duplicateGroupCount"], 0)
        self.assertEqual(
            {r["catalogNumber"] for r in self._read_output("cleaned.csv")}, {"0001", "1"}
        )


if __name__ == "__main__":
    unittest.main()
