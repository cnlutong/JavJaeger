import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localLibraryPage = readFileSync(
    new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url),
    "utf8",
);

test("local library page exposes information check and missing-info download actions", () => {
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/information\/check/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/information\/download/);
    assert.match(localLibraryPage, /检查信息/);
    assert.match(localLibraryPage, /下载缺失信息/);
    assert.match(localLibraryPage, /缺信息/);
});
