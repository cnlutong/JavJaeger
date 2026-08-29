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

test("local library preview keeps the underlying page mounted", () => {
    assert.match(localLibraryPage, /const renderRecordPreviewOverlay = \(\) =>/);
    assert.match(localLibraryPage, /if \(!selectedRecord\) \{[\s\S]*?return null;[\s\S]*?\}/);
    assert.equal((localLibraryPage.match(/\{renderRecordPreviewOverlay\(\)\}/g) || []).length, 2);
    assert.doesNotMatch(localLibraryPage, /if \(selectedRecord\) \{/);

    const openPreviewBlock = localLibraryPage.match(/const openRecordPreview = \(record\) => \{[\s\S]*?\n    \};/)?.[0] || "";
    assert.doesNotMatch(openPreviewBlock, /window\.scrollTo/);
});

test("local library preview uses browser history and restores the captured page position", () => {
    assert.match(localLibraryPage, /const libraryPageStateRef = React\.useRef\(null\)/);
    assert.match(localLibraryPage, /const previewHistoryActiveRef = React\.useRef\(false\)/);
    assert.match(localLibraryPage, /scrollY:\s*window\.scrollY/);
    assert.match(localLibraryPage, /window\.history\.pushState\(/);
    assert.match(localLibraryPage, /window\.addEventListener\("popstate", handlePreviewPopState\)/);
    assert.match(localLibraryPage, /window\.history\.back\(\)/);
    assert.match(localLibraryPage, /window\.scrollTo\(\{[\s\S]*top:\s*pageState\.scrollY[\s\S]*behavior:\s*"auto"/);
});

test("local library preview keeps return controls reachable for long details", () => {
    const previewBackdropRule = css.match(/\.jav-library-preview-backdrop\s*\{[^}]*\}/)?.[0] || "";
    assert.match(previewBackdropRule, /align-items:\s*flex-start;/);
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

test("local library list and card modes paginate visible records", () => {
    assert.match(localLibraryPage, /const LOCAL_LIBRARY_GRID_PAGE_SIZE = 30;/);
    assert.match(localLibraryPage, /const LOCAL_LIBRARY_LIST_DEFAULT_PAGE_SIZE = 20;/);
    assert.match(localLibraryPage, /const \[gridPage, setGridPage\] = React\.useState\(1\)/);
    assert.match(localLibraryPage, /const \[listPage, setListPage\] = React\.useState\(1\)/);
    assert.match(localLibraryPage, /const \[listPageSize, setListPageSize\] = React\.useState\(LOCAL_LIBRARY_LIST_DEFAULT_PAGE_SIZE\)/);
    assert.match(localLibraryPage, /const visibleGridRecords = React\.useMemo\(\(\) => sortedRecords\.slice\(0, gridVisibleCount\)/);
    assert.match(localLibraryPage, /const visibleListRecords = React\.useMemo\(\(\) => sortedRecords\.slice\(0, listVisibleCount\)/);
    assert.match(localLibraryPage, /<Pagination[\s\S]*current=\{gridPage\}[\s\S]*pageSize=\{LOCAL_LIBRARY_GRID_PAGE_SIZE\}[\s\S]*showSizeChanger=\{false\}/);
    assert.match(localLibraryPage, /className="jav-library-grid-loading"/);
    assert.match(localLibraryPage, /dataSource=\{visibleListRecords\}[\s\S]*pagination=\{false\}/);
    assert.match(localLibraryPage, /className="jav-library-list-pagination-bottom"[\s\S]*current=\{listPage\}[\s\S]*pageSize=\{listPageSize\}[\s\S]*showSizeChanger[\s\S]*onShowSizeChange=\{handleListPageSizeChange\}[\s\S]*onChange=\{handleListPageChange\}/);
    assert.doesNotMatch(localLibraryPage, /filteredRecords\.map\(\(record\) => \(/);
    assert.doesNotMatch(localLibraryPage, /pagination=\{\{ pageSize: 12, showSizeChanger: true \}\}/);
});

test("local library list and poster modes auto-load more records near the page bottom", () => {
    assert.match(localLibraryPage, /const \[listPageLoading, setListPageLoading\] = React\.useState\(false\)/);
    assert.match(localLibraryPage, /const gridAutoLoadSentinelRef = React\.useRef\(null\)/);
    assert.match(localLibraryPage, /const listAutoLoadSentinelRef = React\.useRef\(null\)/);
    assert.match(localLibraryPage, /new window\.IntersectionObserver/);
    assert.match(localLibraryPage, /rootMargin:\s*"420px 0px"/);
    assert.match(localLibraryPage, /const visibleGridRecords = React\.useMemo\(\(\) => sortedRecords\.slice\(0, gridVisibleCount\)/);
    assert.match(localLibraryPage, /const visibleListRecords = React\.useMemo\(\(\) => sortedRecords\.slice\(0, listVisibleCount\)/);
    assert.match(localLibraryPage, /dataSource=\{visibleListRecords\}/);
    assert.match(localLibraryPage, /pagination=\{false\}/);
    assert.match(localLibraryPage, /renderAutoLoadFooter\(\{[\s\S]*sentinelRef: gridAutoLoadSentinelRef/);
    assert.match(localLibraryPage, /renderAutoLoadFooter\(\{[\s\S]*sentinelRef: listAutoLoadSentinelRef/);
    assert.match(css, /\.jav-library-auto-load-footer\s*\{/);
});

test("local library list and card modes support multiple sort rules", () => {
    assert.match(localLibraryPage, /const LOCAL_LIBRARY_SORT_OPTIONS = \[/);
    assert.match(localLibraryPage, /value: "date_desc"/);
    assert.match(localLibraryPage, /value: "updated_desc"/);
    assert.match(localLibraryPage, /value: "size_desc"/);
    assert.match(localLibraryPage, /value: "resolution_desc"/);
    assert.match(localLibraryPage, /const sortLocalLibraryRecords = \(records, sortRule\) =>/);
    assert.match(localLibraryPage, /const \[sortRule, setSortRule\] = React\.useState\("date_desc"\)/);
    assert.match(localLibraryPage, /const sortedRecords = React\.useMemo\(\(\) => sortLocalLibraryRecords\(filteredRecords, sortRule\), \[filteredRecords, sortRule\]\)/);
    assert.match(localLibraryPage, /const visibleGridRecords = React\.useMemo\(\(\) => sortedRecords\.slice\(0, gridVisibleCount\)/);
    assert.match(localLibraryPage, /<Select[\s\S]*value=\{sortRule\}[\s\S]*onChange=\{setSortRule\}[\s\S]*options=\{LOCAL_LIBRARY_SORT_OPTIONS\}/);
    assert.match(localLibraryPage, /dataSource=\{visibleListRecords\}/);
    assert.match(localLibraryPage, /total=\{sortedRecords\.length\}/);
});

test("local library search box keeps search and clear actions in the same row", () => {
    assert.match(localLibraryPage, /const \[keywordDraft, setKeywordDraft\] = React\.useState\(""\)/);
    assert.match(localLibraryPage, /const handleKeywordSearch = \(\) =>/);
    assert.match(localLibraryPage, /const handleKeywordClear = \(\) =>/);
    assert.match(localLibraryPage, /className="jav-library-search-row"/);
    assert.match(localLibraryPage, /value=\{keywordDraft\}/);
    assert.match(localLibraryPage, /onPressEnter=\{handleKeywordSearch\}/);
    assert.match(localLibraryPage, /onClick=\{handleKeywordSearch\}[\s\S]*搜索/);
    assert.match(localLibraryPage, /onClick=\{handleKeywordClear\}[\s\S]*清空/);
    assert.match(css, /\.jav-library-search-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/);
});

test("local library toolbar separates routine, display, and destructive actions", () => {
    assert.match(localLibraryPage, /className="jav-library-toolbar-row is-primary"/);
    assert.match(localLibraryPage, /className="jav-library-toolbar-row is-secondary"/);
    assert.match(localLibraryPage, /className="jav-library-toolbar-group is-danger-actions"/);
    assert.match(css, /\.jav-library-toolbar-row\.is-primary\s*\{[\s\S]*border-bottom:/);
    assert.match(css, /\.jav-library-toolbar-group\.is-danger-actions\s*\{[\s\S]*border-left:/);
});

test("local library exposes a three-state VR quick filter", () => {
    assert.match(localLibraryPage, /const \[vrFilter, setVrFilter\] = React\.useState\("all"\)/);
    assert.match(localLibraryPage, /matchesVrFilter\(record, vrFilter\)/);
    assert.match(localLibraryPage, /aria-label="VR影片筛选"/);
    assert.match(localLibraryPage, /label: "全部", value: "all"/);
    assert.match(localLibraryPage, /label: "隐藏VR", value: "exclude"/);
    assert.match(localLibraryPage, /label: "仅VR", value: "only"/);
});

test("clearing the library still requires explicit confirmation", () => {
    assert.match(localLibraryPage, /<Popconfirm[\s\S]*title="确认清空影视库数据库？"[\s\S]*onConfirm=\{handleClear\}[\s\S]*okText="清空"/);
});

test("local library page exposes multi-path scan import controls", () => {
    assert.match(localLibraryPage, /import DirectoryInput from "\.\/DirectoryInput\.jsx"/);
    assert.match(localLibraryPage, /const \[librarySettings, setLibrarySettings\] = React\.useState/);
    assert.match(localLibraryPage, /const \[savingLibrarySettings, setSavingLibrarySettings\] = React\.useState\(false\)/);
    assert.match(localLibraryPage, /const \[scanOpen, setScanOpen\] = React\.useState\(false\)/);
    assert.match(localLibraryPage, /const \[scanningLibrary, setScanningLibrary\] = React\.useState\(false\)/);
    assert.match(localLibraryPage, /const \[scanResult, setScanResult\] = React\.useState\(null\)/);
    assert.match(localLibraryPage, /const \[scanTask, setScanTask\] = React\.useState\(null\)/);
    assert.match(localLibraryPage, /scanPollTimerRef/);
    assert.match(localLibraryPage, /const normalizeScanDirectories = \(values\) =>/);
    assert.match(localLibraryPage, /const buildLocalLibrarySettingsPayload = \(values\) =>/);
    assert.match(localLibraryPage, /fetch\("\/api\/movies\/local-library\/settings"\)/);
    assert.match(localLibraryPage, /fetch\("\/api\/movies\/local-library\/settings", \{/);
    assert.match(localLibraryPage, /ignored_paths: normalizedIgnoredPaths,/);
    assert.match(localLibraryPage, /directories: normalizedDirectories,/);
    assert.match(localLibraryPage, /scrape: false,/);
    assert.match(localLibraryPage, /probe_media: values\.probeMedia === true,/);
    assert.match(localLibraryPage, /regularize_files: values\.regularizeFiles === true,/);
    assert.match(localLibraryPage, /postJson\("\/api\/movies\/local-library\/scan\/jobs", payload\)/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/scan\/jobs\/\$\{encodeURIComponent\(taskId\)\}/);
    assert.match(localLibraryPage, /await loadLibrary\(\)/);
    assert.match(localLibraryPage, /<Form\.List name="directories">/);
    assert.match(localLibraryPage, /<Form\.List name="ignoredPaths">/);
    assert.match(localLibraryPage, /<DirectoryInput[\s\S]*placeholder="\/app\/data\/JAV/);
    assert.match(localLibraryPage, /placeholder="\/app\/data\/cache/);
    assert.match(localLibraryPage, /scanDirectoryPath/);
    assert.match(localLibraryPage, /ignoredDirectoryPath/);
    assert.match(localLibraryPage, /FolderOpenOutlined/);
    assert.match(localLibraryPage, /SaveOutlined/);
    assert.doesNotMatch(localLibraryPage, /刮削元数据/);
    assert.doesNotMatch(localLibraryPage, /<Form\.Item name="scrape"/);
    assert.match(localLibraryPage, /<Form\.Item name="regularizeFiles" valuePropName="checked">/);
    assert.match(localLibraryPage, /整理文件/);
    assert.match(localLibraryPage, /<Form\.Item name="probeMedia" valuePropName="checked">/);
    assert.match(localLibraryPage, /探测媒体信息/);
    assert.match(css, /\.jav-library-scan-paths\s*\{/);
    assert.match(css, /\.jav-library-scan-path-section\s*\{/);
    assert.match(css, /\.jav-library-scan-result-list\s*\{/);
});

test("local library list mode shows every genre tag in movie information", () => {
    assert.match(localLibraryPage, /\(record\.genres \|\| \[\]\)\.map\(\(genre\) => renderFilterTag\("genres", genre, "cyan"\)\)/);
    assert.doesNotMatch(localLibraryPage, /\(record\.genres \|\| \[\]\)\.slice\(0,\s*8\)\.map\(\(genre\) => renderFilterTag\("genres", genre, "cyan"\)\)/);
    assert.doesNotMatch(localLibraryPage, /\(record\.genres \|\| \[\]\)\.length > 8 && <Tag>\+\{record\.genres\.length - 8\}<\/Tag>/);
});

test("local library poster images show a loading animation while local artwork is read", () => {
    assert.match(localLibraryPage, /const \[imageLoading, setImageLoading\] = React\.useState\(!!src\)/);
    assert.match(localLibraryPage, /setImageLoading\(false\)/);
    assert.match(localLibraryPage, /className="jav-library-poster-loader"/);
    assert.match(css, /\.jav-library-poster-loader\s*\{[\s\S]*animation:\s*poster-loader-pulse/);
    assert.match(css, /@keyframes poster-loader-pulse/);
});

test("local library KPI cards use a compact single-line layout", () => {
    assert.match(localLibraryPage, /className="jav-kpi-grid jav-local-kpis jav-library-kpis"/);
    assert.match(css, /\.jav-library-kpis\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(118px,\s*1fr\)\)/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-card\s*\{[\s\S]*min-height:\s*42px;[\s\S]*grid-template-columns:\s*max-content minmax\(0,\s*1fr\) max-content;/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-card strong\s*\{[\s\S]*font-size:\s*20px;[\s\S]*white-space:\s*nowrap;/);
    assert.match(css, /\.jav-library-kpis \.jav-kpi-label,[\s\S]*\.jav-library-kpis \.jav-kpi-note\s*\{[\s\S]*white-space:\s*nowrap;/);
});

test("local library immersive mode offers three switchable cinema layouts", () => {
    assert.match(localLibraryPage, /LOCAL_LIBRARY_IMMERSIVE_LAYOUT_STORAGE_KEY = "javjaeger\.localLibrary\.immersiveLayout"/);
    assert.match(localLibraryPage, /const \[immersiveLayout, setImmersiveLayout\] = React\.useState\(\(\) => loadImmersiveLayout\(\)\)/);
    assert.match(localLibraryPage, /aria-label="沉浸布局"/);
    assert.match(localLibraryPage, /海报墙/);
    assert.match(localLibraryPage, /焦点剧场/);
    assert.match(localLibraryPage, /封面走廊/);
    assert.match(localLibraryPage, /className="jav-library-immersive-grid"/);
    assert.match(localLibraryPage, /className="jav-library-immersive-shelf"/);
    assert.match(localLibraryPage, /className="jav-library-immersive-corridor"/);
    assert.match(localLibraryPage, /saveImmersiveLayout\(nextLayout\)/);
    assert.match(css, /\.jav-app:has\(\.jav-library-page\.is-dark\) \.jav-header\s*\{[\s\S]*display:\s*none;/);
    assert.match(css, /\.jav-library-page\.is-dark\s*\{[\s\S]*min-height:\s*100vh;[\s\S]*background:\s*#050608;/);
    assert.match(css, /\.jav-library-immersive-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, /\.jav-library-immersive-shelf-hero\s*\{[\s\S]*min-height:\s*min\(60vh,\s*620px\)/);
    assert.match(css, /\.jav-library-immersive-corridor-stage\s*\{[\s\S]*perspective:\s*1200px;/);
    assert.match(css, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.jav-library-immersive-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("local library preview exposes a click-to-play video player", () => {
    assert.match(localLibraryPage, /PlayCircleOutlined/);
    assert.match(localLibraryPage, /playingRecordKey/);
    assert.match(localLibraryPage, /handlePlaySelectedRecord/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/\$\{encodeURIComponent\(selectedRecord\.movie_id\)\}\/play\?file_index=\$\{selectedPlayFileIndex\}/);
    assert.match(localLibraryPage, /<video[\s\S]*controls[\s\S]*className="jav-library-preview-player"/);
    assert.match(css, /\.jav-library-preview-player\s*\{[\s\S]*width:\s*100%;/);
});

test("local library shows probed video resolution, bitrate, codec, and container", () => {
    assert.match(localLibraryPage, /const formatBitrate = \(bitrate\) =>/);
    assert.match(localLibraryPage, /const formatResolution = \(mediaInfo\) =>/);
    assert.match(localLibraryPage, /const formatCodec = \(codec\) =>/);
    assert.match(localLibraryPage, /const formatContainer = \(container\) =>/);
    assert.match(localLibraryPage, /const primaryMediaInfo = \(record\) =>/);
    assert.match(localLibraryPage, /const renderMediaTags = \(mediaInfo\) =>/);
    assert.match(localLibraryPage, /\["分辨率", selectedMediaInfo\.width && selectedMediaInfo\.height \? formatResolution\(selectedMediaInfo\) : ""\]/);
    assert.match(localLibraryPage, /\["码率", selectedMediaInfo\.bitrate \? formatBitrate\(selectedMediaInfo\.bitrate\) : ""\]/);
    assert.match(localLibraryPage, /selectedMediaInfo\.codec \? formatCodec\(selectedMediaInfo\.codec\) : ""/);
    assert.match(localLibraryPage, /selectedMediaInfo\.container \? formatContainer\(selectedMediaInfo\.container\) : ""/);
    assert.match(localLibraryPage, /\{renderMediaTags\(file\)\}/);
    assert.match(localLibraryPage, /\{renderMediaTags\(primaryMediaInfo\(record\)\)\}/);
    assert.match(localLibraryPage, /\{renderMediaTags\(mediaInfo\)\}/);
});

test("local library exposes invalid file cleanup from probed media metadata", () => {
    assert.match(localLibraryPage, /cleaningInvalidFiles/);
    assert.match(localLibraryPage, /handleCleanInvalidFiles/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/clean-invalid/);
    assert.match(localLibraryPage, /checked_file_count/);
    assert.match(localLibraryPage, /deleted_file_count/);
    assert.match(localLibraryPage, /removed_movie_count/);
    assert.match(localLibraryPage, /Popconfirm[\s\S]*handleCleanInvalidFiles/);
});

test("local library list mode renders media metadata as separate columns", () => {
    const columnsBlock = localLibraryPage.match(/const columns = \[[\s\S]*?\n    \];/)?.[0] || "";
    assert.match(columnsBlock, /title:\s*"分辨率"[\s\S]*key:\s*"resolution"[\s\S]*formatResolution\(primaryMediaInfo\(record\)\)/);
    assert.match(columnsBlock, /title:\s*"码率"[\s\S]*key:\s*"bitrate"[\s\S]*formatBitrate\(primaryMediaInfo\(record\)\?\.bitrate\)/);
    assert.match(columnsBlock, /key:\s*"codec"[\s\S]*formatCodec\(primaryMediaInfo\(record\)\?\.codec\)/);
    assert.match(columnsBlock, /key:\s*"container"[\s\S]*formatContainer\(primaryMediaInfo\(record\)\?\.container\)/);

    const infoColumnBlock = columnsBlock.match(/title:\s*"影片信息"[\s\S]*?title:\s*"分辨率"/)?.[0] || "";
    assert.doesNotMatch(infoColumnBlock, /renderMediaTags\(primaryMediaInfo\(record\)\)/);
});

test("local library file column only lists file count, size, and names", () => {
    const columnsBlock = localLibraryPage.match(/const columns = \[[\s\S]*?\n    \];/)?.[0] || "";
    const fileColumnBlock = columnsBlock.match(/title:\s*"文件"[\s\S]*?title:\s*"操作"/)?.[0] || "";

    assert.match(fileColumnBlock, /record\.file_count \|\| 0/);
    assert.match(fileColumnBlock, /formatBytes\(record\.total_size\)/);
    assert.match(fileColumnBlock, /file\.file_name/);
    assert.doesNotMatch(fileColumnBlock, /renderMediaTags\(file\)/);
    assert.doesNotMatch(fileColumnBlock, /formatResolution|formatBitrate|formatCodec/);
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

test("local library exposes a persistent scoped dark mode", () => {
    assert.match(localLibraryPage, /LOCAL_LIBRARY_THEME_STORAGE_KEY = "javjaeger\.localLibrary\.theme"/);
    assert.match(localLibraryPage, /const \[libraryTheme, setLibraryTheme\] = React\.useState\(\(\) => loadLocalLibraryTheme\(\)\)/);
    assert.match(localLibraryPage, /const isDarkMode = libraryTheme === "dark";/);
    assert.match(localLibraryPage, /const libraryThemeConfig = React\.useMemo/);
    assert.match(localLibraryPage, /<ConfigProvider theme=\{libraryThemeConfig\}>/);
    assert.match(localLibraryPage, /className=\{`jav-local-scrape jav-library-page is-dark is-immersive-\$\{immersiveLayout\}`\}/);
    assert.match(localLibraryPage, /className="jav-library-theme-toggle"/);
    assert.match(localLibraryPage, /saveLocalLibraryTheme\(nextTheme\)/);
    assert.match(css, /\.jav-library-page\.is-dark\s*\{[\s\S]*--color-background-body:\s*#111112;/);
    assert.match(css, /\.jav-library-page\.is-dark \.jav-library-results\s*\{[\s\S]*background:\s*linear-gradient\(180deg,\s*rgba\(31,\s*31,\s*34,\s*0\.82\)/);
    assert.match(css, /\.jav-page-workspace:has\(\.jav-library-page\.is-dark\)/);
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

test("local library exposes an actor-indexed browsing view", () => {
    assert.match(localLibraryPage, /actorLibrary/);
    assert.match(localLibraryPage, /loadActorLibrary/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/actors/);
    assert.match(localLibraryPage, /value: "actors"/);
    assert.match(localLibraryPage, /renderActorLibraryView/);
    assert.match(localLibraryPage, /setFilters\(\(prev\) => \(\{[\s\S]*stars: \[actor\.name\]/);
    assert.match(localLibraryPage, /\/api\/movies\/local-library\/actors\/\$\{encodeURIComponent\(actor\.key\)\}\/avatar/);
    assert.match(css, /\.jav-library-actor-grid\s*\{/);
    assert.match(css, /\.jav-library-actor-card\s*\{/);
});

test("local library immersive preview uses dark backdrop and closes from background clicks", () => {
    assert.match(localLibraryPage, /className=\{`jav-local-scrape jav-library-page is-previewing \$\{isDarkMode \? "is-dark" : ""\}`\}/);
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
