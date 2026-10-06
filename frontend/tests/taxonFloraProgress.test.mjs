import assert from "node:assert/strict";
import test from "node:test";
import {
  etaBaselineStorageKey,
  formatImportEta,
  restoreEtaBaseline,
} from "../src/utils/taxonFloraProgress.ts";

const baseline = {
  jobId: "job-1",
  stage: "Actualizando taxones",
  seconds: 90,
  progressPercent: 45,
  startedAt: 1_000,
};

test("ETA display describes stage estimates and counts down from the last update", () => {
  assert.equal(
    formatImportEta("running", 90, 31_000, "job-1", baseline.stage, 45, baseline),
    "≈ 1m",
  );
  assert.equal(
    formatImportEta("running", 90, 31_000, "job-1", "Desactivando taxones", 45, baseline),
    "Calculando…",
  );
  assert.equal(formatImportEta("running", 90, 31_000, "job-1", baseline.stage, 45, null), "Calculando…");
  assert.equal(
    formatImportEta("running", null, 31_000, "job-1", baseline.stage, 45, baseline),
    "Calculando…",
  );
  assert.equal(
    formatImportEta("running", 10, 31_000, "job-1", baseline.stage, 45, {
      ...baseline,
      seconds: 10,
    }),
    "Calculando…",
  );
});

test("ETA display reflects queued, failed, and completed job status", () => {
  assert.equal(formatImportEta("queued", null, 0, "job-1", null, null, null), "En cola");
  assert.equal(formatImportEta("failed", null, 0, "job-1", null, null, null), "—");
  assert.equal(formatImportEta("completed", 0, 0, "job-1", null, null, null), "Completado");
});

test("the same ETA sample retains its age after reload, while changed samples get a new baseline", () => {
  const stored = JSON.stringify(baseline);
  const restored = restoreEtaBaseline(baselineWithoutTimestamp(baseline), stored, 31_000);

  assert.equal(restored.startedAt, baseline.startedAt);
  assert.equal(
    formatImportEta("running", 90, 31_000, "job-1", baseline.stage, 45, restored),
    "≈ 1m",
  );

  const updated = restoreEtaBaseline(
    { ...baselineWithoutTimestamp(baseline), progressPercent: 46 },
    stored,
    31_000,
  );
  assert.equal(updated.startedAt, 31_000);
  assert.equal(
    formatImportEta("running", 90, 31_000, "job-1", baseline.stage, 46, updated),
    "≈ 1m 30s",
  );
  assert.equal(etaBaselineStorageKey("job-1"), "taxon-flora-eta:job-1");
});

function baselineWithoutTimestamp(sample) {
  return {
    jobId: sample.jobId,
    stage: sample.stage,
    seconds: sample.seconds,
    progressPercent: sample.progressPercent,
  };
}
