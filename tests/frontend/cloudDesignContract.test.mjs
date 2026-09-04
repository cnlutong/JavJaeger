import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const libraryPage = readFileSync(new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url), "utf8");
const template = readFileSync(new URL("../../templates/index.html", import.meta.url), "utf8");
const nocturneUrl = new URL("../../frontend/src/nocturne.css", import.meta.url);

test("Cloud Design shell exposes all nine production routes", () => {
    assert.match(javPage, /const PRIMARY_NAV_ITEMS = \[/);
    for (const [label, value] of [
        ["影院模式", "cinema"],
        ["影片检索", "jav"],
        ["下载派发", "dispatch"],
        ["本地刮削", "localScrape"],
        ["影视库", "localLibrary"],
        ["自动模式", "automation"],
        ["转码", "transcoding"],
        ["网盘与下载", "storage"],
        ["设置", "settings"],
    ]) {
        assert.match(javPage, new RegExp(`label: '${label}', value: '${value}'`));
    }
    assert.match(javPage, /className="jav-primary-nav"/);
});

test("cinema and library routes reuse the real local-library workflow", () => {
    assert.match(javPage, /cinema:\s*\(\s*<LocalLibraryPage[^>]*cinemaMode/);
    assert.match(javPage, /localLibrary:\s*<LocalLibraryPage/);
    assert.match(libraryPage, /cinemaMode = false/);
    assert.match(libraryPage, /onExitCinema/);
    assert.match(libraryPage, /cinemaMode \|\| libraryTheme === "dark"/);
});

test("the storage route keeps both legacy net-disk and Aria2 managers", () => {
    assert.match(javPage, /storageView/);
    assert.match(javPage, /<WebDavPage/);
    assert.match(javPage, /<DownloadManagementPage/);
    assert.match(javPage, /网盘浏览/);
    assert.match(javPage, /Aria2 任务/);
});

test("search and dispatch keep their existing request workflows", () => {
    assert.match(javPage, /activePage === 'jav' \|\| activePage === 'dispatch'/);
    assert.match(javPage, /activePage === 'dispatch'/);
    assert.match(javPage, /onFinish=\{handleCodeDownload\}/);
    assert.match(javPage, /onClick=\{fetchHistory\}/);
    assert.match(javPage, /onFinish=\{searchMovie\}/);
    assert.match(javPage, /onFinish=\{filterMovies\}/);
    assert.match(javPage, /onFinish=\{searchMagnet\}/);
    assert.match(javPage, /onFinish=\{handleRecognizeMovie\}/);
});

test("Nocturne is the final responsive visual layer", () => {
    assert.equal(existsSync(nocturneUrl), true);
    const css = readFileSync(nocturneUrl, "utf8");
    assert.match(template, /\/static\/app\.css/);
    assert.match(readFileSync(new URL("../../frontend/src/main.jsx", import.meta.url), "utf8"), /import "\.\/nocturne\.css"/);
    assert.match(readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8"), /COPY --from=frontend-builder \/frontend\/static\/app\.css \/app\/static\/app\.css/);
    assert.ok(template.indexOf("/static/app.css") > template.indexOf("/static/webdav.css"));
    assert.match(css, /--color-bg:\s*#161826/);
    assert.match(css, /--color-surface:\s*#232532/);
    assert.match(css, /--color-accent:\s*#9184d9/);
    assert.match(css, /\.jav-primary-nav/);
    assert.match(css, /@media \(max-width:\s*760px\)/);
});
