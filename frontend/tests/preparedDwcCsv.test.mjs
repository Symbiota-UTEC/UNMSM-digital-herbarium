import assert from "node:assert/strict";
import test from "node:test";
import { isPreparedDwcCsv, preparedDwcTarget, preparedDwcText } from "../src/utils/preparedDwcCsv.ts";

const catalog = "dwc:Occurrence:catalogNumber";

test("prepared headers are recognized before source-header heuristics", () => {
  assert.equal(preparedDwcTarget(catalog), "Occurrence.catalogNumber");
  assert.equal(preparedDwcTarget("dwc:Taxon:scientificNameAuthorship"), "Taxon.scientificNameAuthorship");
  assert.equal(preparedDwcTarget("Código USM"), null);
});

test("prepared files preserve nested JSON and identifier arrays without rebuilding cells", () => {
  const headers = [catalog, "dwc:Occurrence:dynamicProperties", "dwc:Identification:identifiedBy"];
  const escape = (value) => `"${value.replaceAll('"', '""')}"`;
  const properties = JSON.stringify({ sourceOriginal: { values: ["Cáceres, F.", "line\nbreak"] } });
  const names = JSON.stringify(["Rexnel, C."]);
  const csv = `${headers.join(",")}\r\n0001,${escape(properties)},${escape(names)}\r\n`;
  assert.equal(isPreparedDwcCsv(headers), true);
  assert.equal(preparedDwcText(headers, csv), csv);
});

test("mixed source headers and incomplete or duplicate headers use the ordinary mapper", () => {
  for (const headers of [[catalog, "Otros"], ["dwc:Taxon:scientificName"], [catalog, ` ${catalog} `], []]) {
    assert.equal(isPreparedDwcCsv(headers), false);
    assert.equal(preparedDwcText(headers, "source text"), null);
  }
});

test("unsupported prepared fields reach API validation rather than being silently dropped", () => {
  const headers = [catalog, "dwc:Taxon:unknownField"];
  const csv = `${headers.join(",")}\n0001,preserved`;
  assert.equal(preparedDwcText(headers, csv), csv);
});
