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
    assert.match(localLibraryPage, /className=\{`jav-library-preview \$\{previewRatioClass\}`\}/);
});

test("local library preview uses enlarged poster and right-side details", () => {
    assert.match(localLibraryPage, /className="jav-library-preview-poster"/);
    assert.match(localLibraryPage, /className="jav-library-preview-details"/);
    assert.match(localLibraryPage, /detailRows\.map/);
    assert.match(css, /\.jav-library-preview\s*\{[\s\S]*grid-template-columns:\s*minmax\(420px,\s*1\.85fr\)\s+minmax\(280px,\s*0\.65fr\)/);
    assert.match(css, /\.jav-library-preview-poster\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*18px;/);
    assert.match(css, /\.jav-library-preview-details\s*\{[\s\S]*display:\s*grid;/);
    assert.match(css, /\.jav-library-preview-meta\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
});

test("local library immersive preview adapts layout to poster aspect ratio", () => {
    assert.match(localLibraryPage, /posterAspectRatioMap/);
    assert.match(localLibraryPage, /handlePosterAspectRatio/);
    assert.match(localLibraryPage, /naturalWidth/);
    assert.match(localLibraryPage, /previewRatioClass/);
    assert.match(localLibraryPage, /--jav-library-preview-poster-ratio/);
    assert.match(localLibraryPage, /<MoviePoster record=\{selectedRecord\} onRatio=\{handlePosterAspectRatio\} \/>/);
    assert.match(css, /\.jav-library-preview-poster \.jav-library-poster\s*\{[\s\S]*aspect-ratio:\s*var\(--jav-library-preview-poster-ratio,\s*2 \/ 3\)/);
    assert.match(css, /\.jav-library-preview\.is-landscape\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2\.15fr\)\s+minmax\(280px,\s*0\.6fr\)/);
    const desktopLandscapeRule = css.match(/\.jav-library-preview\.is-landscape\s*\{[^}]*\}/)?.[0] || "";
    assert.doesNotMatch(desktopLandscapeRule, /grid-template-columns:\s*1fr;/);
});

test("local library list and card posters prefer local images before remote thumbnails", () => {
    assert.match(localLibraryPage, /const thumbnailSource = \(record\) =>/);
    assert.match(localLibraryPage, /if \(thumbnailUrl\.startsWith\("\/api\/"\)\) \{[\s\S]*return thumbnailUrl;[\s\S]*if \(record\?\.poster_url\) \{[\s\S]*return record\.poster_url;/);
    assert.match(localLibraryPage, /return proxiedImageSource\(thumbnailUrl \|\| record\?\.metadata\?\.list_thumbnail_url \|\| ""\)/);
    assert.match(localLibraryPage, /variant === "thumbnail"\s*\?\s*thumbnailSource\(record\)/);
    assert.match(localLibraryPage, /<MoviePoster record=\{record\} compact width=\{listPosterSize\} variant="thumbnail" \/>/);
    assert.match(localLibraryPage, /cover=\{<MoviePoster record=\{record\} variant="thumbnail" \/>\}/);
    assert.match(localLibraryPage, /<MoviePoster record=\{selectedRecord\} onRatio=\{handlePosterAspectRatio\} \/>/);
});

test("local library KPI cards use a compact single-line layout", () => {
    assert.match(localLibraryPage, /className="jav-kpi-grid jav-local-kpis jav-library-kpis"/);
    assert.match(css, /\.jav-library-kpis\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(118px,\s*1fr\)\)/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-card\s*\{[\s\S]*min-height:\s*42px;[\s\S]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\) max-content;/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-card strong\s*\{[\s\S]*font-size:\s*20px;[\s\S]*white-space:\s*nowrap;/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-label,[\s\S]*\.jav-library-kpis \.jav-kpi-note\s*\{[\s\S]*white-space:\s*nowrap;/);
});

test("local library preview exposes a click-to-play video player", () => {
    assert.match(localLibraryPage, /PlayCircleOutlined/);
    assert.match(localLibraryPage, /playingRecordKey/);
    assert.match(localLibraryPage, /handlePlaySelectedRecord/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/\$\{encodeURIComponent\(selectedRecord\.movie_id\)\}\/play\?file_index=\$\{selectedPlayFileIndex\}/);
    assert.match(localLibraryPage, /<video[\s\S]*controls[\s\S]*className="jav-library-preview-player"/);
    assert.match(css, /\.jav-library-preview-player\s*\{[\s\S]*width:\s*100%;/);
});

test("local library actor and genre tags filter from list, grid, and preview", () => {
    assert.match(localLibraryPage, /handleFilterTagClick/);
    assert.match(localLibraryPage, /event\?\.stopPropagation\?\.\(\)/);
    assert.match(localLibraryPage, /setSelectedRecord\(null\)/);
    assert.match(localLibraryPage, /renderFilterTag\("stars",\s*star,\s*"magenta"\)/);
    assert.match(localLibraryPage, /renderFilterTag\("genres",\s*genre,\s*"cyan"\)/);
    assert.match(localLibraryPage, /renderActorList\(selectedRecord\)/);
    assert.match(localLibraryPage, /renderTagList\(selectedRecord\.genres,\s*"cyan",\s*"genres"\)/);
    assert.match(css, /\.jav-library-filter-tag\.ant-tag\s*\{[\s\S]*cursor:\s*pointer;/);
});

test("local library preview shows actors with avatars below the poster", () => {
    assert.match(localLibraryPage, /normalizeActors/);
    assert.match(localLibraryPage, /ActorPill/);
    assert.match(localLibraryPage, /actorAvatarSources/);
    assert.match(localLibraryPage, /sources\.push\(`\/api\/movies\/local-library\/actor-avatar\/\$\{encodeURIComponent\(record\.movie_id\)\}\/\$\{encodeURIComponent\(actor\.name\)\}`\)/);
    assert.match(localLibraryPage, /sources\.push\(remoteAvatar\)/);
    assert.match(localLibraryPage, /onError=\{\(\) => setSourceIndex\(\(index\) => index \+ 1\)\}/);
    assert.match(localLibraryPage, /className="jav-library-preview-poster-extras"/);
    assert.match(localLibraryPage, /className="jav-library-preview-section jav-library-preview-cast"/);
    assert.match(localLibraryPage, /renderActorList\(selectedRecord,\s*"cast"\)/);
    assert.match(localLibraryPage, /className="jav-library-actor-avatar"/);
    assert.match(css, /\.jav-library-preview-poster-extras\s*\{[\s\S]*display:\s*grid;/);
    assert.match(css, /\.jav-library-actor-pill\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0,\s*1fr\);/);
    assert.match(css, /\.jav-library-actor-list\.is-cast \.jav-library-actor-pill\s*\{[\s\S]*grid-template-columns:\s*56px minmax\(0,\s*1fr\);/);
    assert.match(css, /\.jav-library-actor-list\.is-cast \.jav-library-actor-avatar\s*\{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/);
});

test("local library immersive preview uses dark backdrop and closes from background clicks", () => {
    assert.match(localLibraryPage, /className="jav-local-scrape jav-library-page is-previewing"/);
    assert.match(localLibraryPage, /className="jav-library-preview-backdrop"/);
    assert.match(localLibraryPage, /previewBackdropStyle/);
    assert.match(localLibraryPage, /--jav-library-preview-backdrop/);
    assert.match(localLibraryPage, /role="dialog"/);
    assert.match(localLibraryPage, /aria-modal="true"/);
    assert.match(localLibraryPage, /onClick=\{closeRecordPreview\}/);
    assert.match(localLibraryPage, /event\.stopPropagation\(\)/);
    assert.match(css, /\.jav-library-preview-backdrop\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;/);
    assert.match(css, /\.jav-library-preview-backdrop::before\s*\{[\s\S]*background-image:\s*var\(--jav-library-preview-backdrop\);[\s\S]*filter:\s*blur\(30px\);/);
    assert.match(css, /\.jav-library-preview-backdrop::after\s*\{[\s\S]*background:[\s\S]*linear-gradient\(90deg,\s*rgba\(24,\s*24,\s*24,\s*0\.94\)/);
    assert.match(css, /\.jav-library-preview-surface\s*\{[\s\S]*width:\s*min\(1560px,\s*calc\(100vw - 56px\)\);/);
    assert.match(css, /\.jav-library-preview-surface\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
    assert.match(css, /\.jav-library-page\.is-previewing\s*\{[\s\S]*background:\s*#2f2f2f;/);
});
