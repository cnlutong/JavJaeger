import assert from "node:assert/strict";
import test from "node:test";
import { getDeletableNonConformingLocalScrapeKeys, getVisibleLocalScrapeItems, isConformingLocalScrapeItem } from "../../frontend/src/utils/localScrapeResults.mjs";

const rows = [
  { source_path: "found.mp4", scrape_status: "found" },
  { source_path: "recognized.mp4", scrape_status: "recognized" },
  { source_path: "not-found.mp4", scrape_status: "not_found" },
  { source_path: "", scrape_status: "unrecognized" },
];

test("only fully scraped rows conform", () => {
  assert.equal(isConformingLocalScrapeItem(rows[0]), true);
  assert.equal(isConformingLocalScrapeItem(rows[1]), false);
});

test("result visibility separates conforming and non-conforming rows", () => {
  assert.deepEqual(getVisibleLocalScrapeItems(rows, false).map(item => item.source_path), ["found.mp4"]);
  assert.deepEqual(getVisibleLocalScrapeItems(rows, true).map(item => item.source_path), ["recognized.mp4", "not-found.mp4", ""]);
});

test("delete selection excludes conforming rows and blank paths", () => {
  assert.deepEqual(getDeletableNonConformingLocalScrapeKeys(rows), ["recognized.mp4", "not-found.mp4"]);
});
