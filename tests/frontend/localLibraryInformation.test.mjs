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
    assert.match(localLibraryPage, /informationDownloadOpen/);
    assert.match(localLibraryPage, /write_nfo: values\.writeNfo !== false/);
    assert.match(localLibraryPage, /download_images: values\.downloadImages !== false/);
    assert.match(localLibraryPage, /download_sample_images: !!values\.downloadSampleImages/);
    assert.match(localLibraryPage, /download_actor_images: !!values\.downloadActorImages/);
    assert.match(localLibraryPage, /download_list_thumbnail: !!values\.downloadListThumbnail/);
    assert.match(localLibraryPage, /overwrite_existing: !!values\.overwriteExisting/);
});
