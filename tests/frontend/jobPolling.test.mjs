import assert from "node:assert/strict";
import test from "node:test";

import { waitForJob } from "../../frontend/src/utils/jobPolling.mjs";

test("waitForJob reports progress and returns the completed result", async () => {
  const states = [
    { status: "queued", percent: 0 },
    { status: "running", percent: 25 },
    { status: "success", percent: 100, result: { success: true, items: [1] } },
  ];
  const updates = [];
  const result = await waitForJob(async () => states.shift(), "/jobs/1", value => updates.push(value.percent), 0);
  assert.deepEqual(updates, [0, 25, 100]);
  assert.deepEqual(result, { success: true, items: [1] });
});

test("waitForJob rejects failed jobs with the service message", async () => {
  await assert.rejects(
    waitForJob(async () => ({ status: "failed", message: "scan failed" }), "/jobs/2", undefined, 0),
    /scan failed/,
  );
});
