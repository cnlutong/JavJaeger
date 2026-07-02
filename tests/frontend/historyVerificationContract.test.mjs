import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");

test("history view can verify attempted downloads against the local library", () => {
    assert.match(javPage, /const handleCheckHistoryLocalLibrary = async \(\) => \{/);
    assert.match(javPage, /\/api\/history\/check-local-library/);
    assert.match(javPage, /setHistoryData\(result\.records \|\| \[\]\)/);
    assert.match(javPage, /核对入库状态/);
    assert.match(javPage, /dataIndex:\s*'download_status'/);
    assert.match(javPage, /record\.needs_reselect/);
    assert.match(javPage, /未入库，需重选链接/);
    assert.match(javPage, /scroll=\{\{\s*x:\s*1100\s*\}\}/);
    assert.match(javPage, /key:\s*'movie_id'[\s\S]*width:\s*170/);
});
