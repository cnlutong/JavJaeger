import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoryRedispatchPayload, selectHistoryRedispatchResource } from "../../frontend/src/utils/historyRedispatch.mjs";

test("history redispatch payload uses the latest attempted resource per missing movie", () => {
  const records = [
    { movie_id: "ABP-123", needs_reselect: true, download_resources: [{ link: "magnet:old", source: "javbus" }, { link: "magnet:newer", source: "cilisousuo" }] },
    { movie_id: "ABP-124", needs_reselect: false, download_resources: [{ link: "magnet:skip", source: "javbus" }] },
    { movie_id: "ABP-125", needs_reselect: true, download_links: ["magnet:legacy"] },
  ];
  assert.deepEqual(selectHistoryRedispatchResource(records[0], "yhg007"), { link: "magnet:newer", source: "cilisousuo" });
  assert.deepEqual(buildHistoryRedispatchPayload(records, "yhg007"), [
    { link: "magnet:newer", movie_id: "ABP-123", source: "cilisousuo" },
    { link: "magnet:legacy", movie_id: "ABP-125", source: "yhg007" },
  ]);
});
