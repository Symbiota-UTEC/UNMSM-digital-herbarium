import assert from "node:assert/strict";
import test from "node:test";
import { dwcImportElapsedSeconds } from "../src/utils/dwcImportProgress.ts";

const started = {
  createdAt: "2026-10-06T15:00:00Z",
  startedAt: "2026-10-06T15:00:05Z",
  finishedAt: null,
};

test("UTC timestamps produce the same elapsed time across browser timezones", () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of ["America/Lima", "UTC", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      assert.equal(dwcImportElapsedSeconds(started, Date.parse("2026-10-06T15:00:15Z")), 10);
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("finished jobs retain their duration after reopening", () => {
  const finished = { ...started, finishedAt: "2026-10-06T15:01:35Z" };
  assert.equal(dwcImportElapsedSeconds(finished, Date.parse("2026-10-06T15:01:40Z")), 90);
  assert.equal(dwcImportElapsedSeconds(finished, Date.parse("2026-10-07T15:00:00Z")), 90);
});

test("queued jobs use creation time and uploads use the client clock", () => {
  const queued = { ...started, startedAt: null };
  assert.equal(dwcImportElapsedSeconds(queued, Date.parse("2026-10-06T15:00:10Z")), 10);
  assert.equal(dwcImportElapsedSeconds(null, 12_000, 2_000), 10);
  assert.equal(dwcImportElapsedSeconds({ ...started, finishedAt: started.startedAt }, 12_000, 2_000), 10);
});

test("missing or invalid timestamps and backwards clock changes produce zero", () => {
  assert.equal(dwcImportElapsedSeconds(null, Date.now()), 0);
  assert.equal(dwcImportElapsedSeconds({ ...started, startedAt: "invalid" }, Date.now()), 0);
  assert.equal(dwcImportElapsedSeconds({ ...started, finishedAt: "invalid" }, Date.now()), 0);
  assert.equal(dwcImportElapsedSeconds(started, Date.parse(started.createdAt)), 0);
});
