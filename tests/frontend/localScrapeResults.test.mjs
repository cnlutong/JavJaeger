import assert from "node:assert/strict";
import test from "node:test";

import {
    getDeletableNonConformingLocalScrapeKeys,
    getVisibleLocalScrapeItems,
    isConformingLocalScrapeItem,
} from "../../frontend/src/utils/localScrapeResults.mjs";
import { readFileSync } from "node:fs";

const localScrapePage = readFileSync(new URL("../../frontend/src/components/LocalScrapePage.jsx", import.meta.url), "utf8");

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

test("local scrape table page size selection is controlled by component state", () => {
    assert.match(localScrapePage, /const \[tablePageSize, setTablePageSize\] = React\.useState\(12\)/);
    assert.match(localScrapePage, /pagination=\{\{[\s\S]*pageSize: tablePageSize[\s\S]*showSizeChanger: true[\s\S]*onShowSizeChange: \(_, size\) => setTablePageSize\(size\)[\s\S]*onChange: \(_, size\) => setTablePageSize\(size\)/);
    assert.doesNotMatch(localScrapePage, /pagination=\{\{ pageSize: 12, showSizeChanger: true \}\}/);
});

test("local scrape page starts scrape work as background jobs and polls progress", () => {
    assert.match(localScrapePage, /\/api\/movies\/local-scrape\/preview\/jobs/);
    assert.match(localScrapePage, /\/api\/movies\/local-scrape\/apply\/jobs/);
    assert.match(localScrapePage, /\/api\/movies\/local-scrape\/jobs\/\$\{encodeURIComponent\(activeTask\.taskId\)\}/);
    assert.match(localScrapePage, /<Progress[\s\S]*percent=\{activeTask\.percent/);
    assert.match(localScrapePage, /sessionStorage\.setItem\(LOCAL_SCRAPE_ACTIVE_TASK_KEY/);
});
