import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const localLibraryPage = readFileSync(new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../static/style.css", import.meta.url), "utf8");

test("local library records open an immersive preview page", () => {
    assert.match(localLibraryPage, /selectedRecord/);
    assert.match(localLibraryPage, /openRecordPreview/);
    assert.match(localLibraryPage, /renderRecordPreview/);
    assert.match(localLibraryPage, /onRow=\{\(record\) => \(\{/);
    assert.match(localLibraryPage, /onClick:\s*\(\)\s*=>\s*openRecordPreview\(record\)/);
    assert.match(localLibraryPage, /className="jav-library-preview"/);
});

test("local library preview uses enlarged poster and right-side details", () => {
    assert.match(localLibraryPage, /className="jav-library-preview-poster"/);
    assert.match(localLibraryPage, /className="jav-library-preview-details"/);
    assert.match(localLibraryPage, /detailRows\.map/);
    assert.match(css, /\.jav-library-preview\s*\{[\s\S]*grid-template-columns:\s*minmax\(300px,\s*520px\)\s+minmax\(0,\s*1fr\)/);
    assert.match(css, /\.jav-library-preview-poster\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*18px;/);
    assert.match(css, /\.jav-library-preview-details\s*\{[\s\S]*display:\s*grid;/);
});

test("local library preview exposes a click-to-play video player", () => {
    assert.match(localLibraryPage, /PlayCircleOutlined/);
    assert.match(localLibraryPage, /playingRecordKey/);
    assert.match(localLibraryPage, /handlePlaySelectedRecord/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/\$\{encodeURIComponent\(selectedRecord\.movie_id\)\}\/play\?file_index=\$\{selectedPlayFileIndex\}/);
    assert.match(localLibraryPage, /<video[\s\S]*controls[\s\S]*className="jav-library-preview-player"/);
    assert.match(css, /\.jav-library-preview-player\s*\{[\s\S]*width:\s*100%;/);
});
