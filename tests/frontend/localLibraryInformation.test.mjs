import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localLibraryPage = readFileSync(
    new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url),
    "utf8",
);

test("local library page exposes information check and scrape-aligned download actions", () => {
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/information\/check/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/information\/download/);
    assert.match(localLibraryPage, /informationCheckOpen/);
    assert.doesNotMatch(localLibraryPage, /informationDownloadOpen/);
    assert.match(localLibraryPage, /INFORMATION_CHECK_FIELD_OPTIONS/);
    assert.match(localLibraryPage, /保存标准/);
    assert.match(localLibraryPage, /fields: informationCheckFields/);
    assert.match(localLibraryPage, /queryParams\.set\("fields", selectedFields\.join\(","\)\)/);
    assert.match(localLibraryPage, /write_nfo: values\.writeNfo !== false/);
    assert.match(localLibraryPage, /download_images: values\.downloadImages !== false/);
    assert.match(localLibraryPage, /download_sample_images: !!values\.downloadSampleImages/);
    assert.match(localLibraryPage, /download_actor_images: !!values\.downloadActorImages/);
    assert.match(localLibraryPage, /download_list_thumbnail: !!values\.downloadListThumbnail/);
    assert.match(localLibraryPage, /overwrite_existing: !!values\.overwriteExisting/);
    assert.match(localLibraryPage, /const failedCount = data\.failed_count \|\| 0/);
    assert.match(localLibraryPage, /message\.warning\(`已更新 \$\{updatedCount\} 部，\$\{failedCount\} 部下载失败/);
});

test("local library page can remove individual movies without deleting files", () => {
    assert.match(localLibraryPage, /const \[deletingMovieId, setDeletingMovieId\] = React\.useState\(""\)/);
    assert.match(localLibraryPage, /const handleDeleteMovie = async \(record\) =>/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/\$\{encodeURIComponent\(movieId\)\}/);
    assert.match(localLibraryPage, /method: "DELETE"/);
    assert.match(localLibraryPage, /只删除数据库记录，不删除本地视频文件。/);
    assert.match(localLibraryPage, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(localLibraryPage, /Icon as=\{DeleteOutlined\}/);
});
