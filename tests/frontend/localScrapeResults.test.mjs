import assert from "node:assert/strict";
import test from "node:test";

import {
    getDeletableNonConformingLocalScrapeKeys,
    getVisibleLocalScrapeItems,
    isConformingLocalScrapeItem,
} from "../../frontend/src/utils/localScrapeResults.mjs";

const rows = [
    { source_path: "found.mp4", scrape_status: "found" },
    { source_path: "recognized.mp4", scrape_status: "recognized" },
    { source_path: "not-found.mp4", scrape_status: "not_found" },
    { source_path: "failed.mp4", scrape_status: "failed" },
    { source_path: "", scrape_status: "unrecognized" },
];

test("local scrape results treat only found rows as conforming scraped movies", () => {
    assert.equal(isConformingLocalScrapeItem(rows[0]), true);
    assert.equal(isConformingLocalScrapeItem(rows[1]), false);
});

test("local scrape results hide non-conforming rows by default", () => {
    assert.deepEqual(
        getVisibleLocalScrapeItems(rows, false).map((item) => item.source_path),
        ["found.mp4"],
    );
    assert.deepEqual(
        getVisibleLocalScrapeItems(rows, true).map((item) => item.source_path),
        ["found.mp4", "recognized.mp4", "not-found.mp4", "failed.mp4", ""],
    );
});

test("local scrape delete selection includes only non-conforming rows with source paths", () => {
    assert.deepEqual(getDeletableNonConformingLocalScrapeKeys(rows), [
        "recognized.mp4",
        "not-found.mp4",
        "failed.mp4",
    ]);
});
