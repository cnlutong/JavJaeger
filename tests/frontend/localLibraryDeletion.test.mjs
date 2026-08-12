import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localLibraryPage = readFileSync(
    new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url),
    "utf8",
);

test("local library keeps index removal and adds a permanent disk deletion action", () => {
    assert.match(localLibraryPage, /handleDeleteMovieFiles/);
    assert.match(
        localLibraryPage,
        /\/api\/movies\/local-library\/\$\{encodeURIComponent\(movieId\)\}\/files/,
    );
    assert.match(localLibraryPage, /彻底删除/);
    assert.match(localLibraryPage, /永久删除本地视频及关联文件/);
    assert.match(localLibraryPage, /只删除数据库记录，不删除本地视频文件/);
});
