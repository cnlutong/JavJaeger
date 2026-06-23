import assert from "node:assert/strict";
import test from "node:test";

import {
    getDeletableNonConformingLocalScrapeKeys,
    getLocalScrapeDiagnosticLogs,
    getLocalScrapeIssueReason,
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
    assert.match(localScrapePage, /conflict_resolution: overrideConflictResolution \|\| getConflictResolution\(item\) \|\| null/);
    assert.match(localScrapePage, /item\?\.target_exists/);
    assert.match(localScrapePage, /const duplicateTargetConflicts = selectedItems\.filter\(\(item\) => item\.target_duplicate\)/);
    assert.match(localScrapePage, /请先调整命名模板或移除目标重复项/);
    assert.match(localScrapePage, /isResolvableConflict\(item\)[\s\S]*&& !overwriteExisting[\s\S]*&& !getConflictResolution\(item\)/);
    assert.match(localScrapePage, /分辨率：\{formatResolution\(file\)\}/);
    assert.match(localScrapePage, /码率：\{formatBitrate\(file\?\.bitrate\)\}/);
});

test("local scrape conflict actions are visible in their own table column", () => {
    assert.match(localScrapePage, /title: "冲突处理"/);
    assert.match(localScrapePage, /选择策略/);
    assert.match(localScrapePage, /getConflictSourceFile\(conflictCompareItem\)/);
    assert.match(localScrapePage, /getConflictTargetFile\(conflictCompareItem\)/);
});

test("local scrape supports batch conflict execution for selected rows", () => {
    assert.match(localScrapePage, /const \[bulkConflictResolution, setBulkConflictResolution\] = React\.useState\(""\)/);
    assert.match(localScrapePage, /const selectedConflictItems = selectedVisibleItems\.filter/);
    assert.match(localScrapePage, /selectedConflictItems = selectedVisibleItems\.filter\(\(item\) => item\.source_path && item\.target_exists && !item\.target_duplicate\)/);
    assert.match(localScrapePage, /const handleBulkConflictApply = async \(\) =>/);
    assert.match(localScrapePage, /placeholder="批量冲突策略"/);
    assert.match(localScrapePage, /批量处理冲突/);
    assert.match(localScrapePage, /startApplyForItems\([\s\S]*selectedConflictItems[\s\S]*bulkConflictResolution/);
    assert.match(localScrapePage, /getCheckboxProps: \(\) => \(\{ disabled: false \}\)/);
});

test("local scrape page can auto-resolve all conflicts without manual row selection", () => {
    assert.match(localScrapePage, /value: "auto_best"/);
    assert.match(localScrapePage, /const allConflictItems = allItems\.filter/);
    assert.match(localScrapePage, /!item\.target_duplicate && isConformingLocalScrapeItem\(item\)/);
    assert.match(localScrapePage, /const handleAutoResolveAllConflicts = async \(\) =>/);
    assert.match(localScrapePage, /allConflictItems\.forEach/);
    assert.match(localScrapePage, /startApplyForItems\([\s\S]*allConflictItems[\s\S]*"auto_best"/);
    assert.match(localScrapePage, /一键处理冲突/);
});

test("local scrape page can delete all non-conforming rows without a manual selection step", () => {
    assert.match(localScrapePage, /const deleteNonConformingByKeys = async \(sourcePaths\) =>/);
    assert.match(localScrapePage, /const handleDeleteAllNonConforming = async \(\) =>/);
    assert.match(localScrapePage, /handleDeleteAllNonConforming/);
    assert.match(localScrapePage, /getDeletableNonConformingLocalScrapeKeys\(allItems\)/);
});

test("local scrape abnormal rows expose clickable diagnostic details", () => {
    const failed = {
        scrape_status: "failed",
        error: "metadata_fetch_failed",
        scrape_reason: "JavBus request timed out",
        scrape_logs: [{ time: "2026-06-21T10:00:00", message: "metadata request failed" }],
    };

    assert.equal(getLocalScrapeIssueReason(failed), "JavBus request timed out");
    assert.deepEqual(getLocalScrapeDiagnosticLogs(failed), [
        { time: "2026-06-21T10:00:00", message: "metadata request failed" },
    ]);
    assert.deepEqual(getLocalScrapeDiagnosticLogs({ scrape_logs: [{ level: "error", message: "failed" }] }), [
        { time: "", level: "error", message: "failed" },
    ]);
    assert.match(localScrapePage, /const \[scrapeDetailItem, setScrapeDetailItem\] = React\.useState\(null\)/);
    assert.match(localScrapePage, /getLocalScrapeIssueReason\(item\)/);
    assert.match(localScrapePage, /onClick=\{\(\) => onInspect\(item\)\}/);
    assert.match(localScrapePage, /statusTag\(item, setScrapeDetailItem\)/);
    assert.match(localScrapePage, /查看原因/);
    assert.match(localScrapePage, /title="刮削异常详情"/);
    assert.match(localScrapePage, /getLocalScrapeDiagnosticLogs\(scrapeDetailItem\)/);
});
