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
});

test("local scrape results show only non-conforming rows when requested", () => {
    assert.deepEqual(
        getVisibleLocalScrapeItems(rows, true).map((item) => item.source_path),
        ["recognized.mp4", "not-found.mp4", "failed.mp4", ""],
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

test("local scrape conflict compare sends per-item resolution", () => {
    assert.match(localScrapePage, /const \[conflictCompareItem, setConflictCompareItem\] = React\.useState\(null\)/);
    assert.match(localScrapePage, /const \[conflictResolutions, setConflictResolutions\] = React\.useState\(\{\}\)/);
    assert.match(localScrapePage, /source_file/);
    assert.match(localScrapePage, /target_file/);
    assert.match(localScrapePage, /value: "skip", label: "跳过"/);
    assert.match(localScrapePage, /value: "keep_newer", label: "保留新的"/);
    assert.match(localScrapePage, /value: "keep_older", label: "保留老的"/);
    assert.match(localScrapePage, /value: "keep_larger", label: "保留文件体积大的"/);
    assert.match(localScrapePage, /value: "keep_higher_resolution", label: "保留分辨率高的"/);
    assert.match(localScrapePage, /value: "keep_higher_bitrate", label: "保留码率高的"/);
    assert.match(localScrapePage, /updateConflictResolution\(conflictCompareItem, option\.value\)/);
    assert.match(localScrapePage, /conflict_resolution: getConflictResolution\(item\) \|\| null/);
    assert.match(localScrapePage, /isResolvableConflict\(item\)[\s\S]*&& !overwriteExisting[\s\S]*&& !getConflictResolution\(item\)/);
    assert.match(localScrapePage, /分辨率：\{formatResolution\(file\)\}/);
    assert.match(localScrapePage, /码率：\{formatBitrate\(file\?\.bitrate\)\}/);
});

test("local scrape page can delete all non-conforming rows without a manual selection step", () => {
    assert.match(localScrapePage, /const deleteNonConformingByKeys = async \(sourcePaths\) =>/);
    assert.match(localScrapePage, /const handleDeleteAllNonConforming = async \(\) =>/);
    assert.match(localScrapePage, /handleDeleteAllNonConforming/);
    assert.match(localScrapePage, /getDeletableNonConformingLocalScrapeKeys\(allItems\)/);
});
