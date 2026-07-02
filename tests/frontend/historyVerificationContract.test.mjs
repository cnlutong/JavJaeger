import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    buildHistoryRedispatchPayload,
    selectHistoryRedispatchResource,
} from "../../frontend/src/utils/historyRedispatch.mjs";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");

test("history view can verify attempted downloads and automatically redispatch missing movies", () => {
    assert.match(javPage, /const handleCheckHistoryLocalLibrary = async \(\) => \{/);
    assert.match(javPage, /\/api\/history\/check-local-library/);
    assert.match(javPage, /const checkedRecords = result\.records \|\| \[\];/);
    assert.match(javPage, /setHistoryData\(checkedRecords\)/);
    assert.match(javPage, /核对并重新下载/);
    assert.match(javPage, /buildHistoryRedispatchPayload/);
    assert.match(javPage, /fetchHistoryFallbackMagnet/);
    assert.match(javPage, /dispatchMagnetDownloads\(redispatchPayload,\s*downloadTool\)/);
    assert.match(javPage, /dataIndex:\s*'download_status'/);
    assert.match(javPage, /record\.needs_reselect/);
    assert.match(javPage, /未入库，需重新下载/);
    assert.match(javPage, /scroll=\{\{\s*x:\s*1100\s*\}\}/);
    assert.match(javPage, /key:\s*'movie_id'[\s\S]*width:\s*170/);
});

test("history redispatch payload uses the latest attempted resource per missing movie", () => {
    const records = [
        {
            movie_id: "ABP-123",
            needs_reselect: true,
            download_resources: [
                { link: "magnet:old", source: "javbus" },
                { link: "magnet:newer", source: "cilisousuo" },
            ],
        },
        {
            movie_id: "ABP-124",
            needs_reselect: false,
            download_resources: [{ link: "magnet:skip", source: "javbus" }],
        },
        {
            movie_id: "ABP-125",
            needs_reselect: true,
            download_links: ["magnet:legacy"],
        },
    ];

    assert.deepEqual(selectHistoryRedispatchResource(records[0], "yhg007"), {
        link: "magnet:newer",
        source: "cilisousuo",
    });
    assert.deepEqual(buildHistoryRedispatchPayload(records, "yhg007"), [
        { link: "magnet:newer", movie_id: "ABP-123", source: "cilisousuo" },
        { link: "magnet:legacy", movie_id: "ABP-125", source: "yhg007" },
    ]);
});
