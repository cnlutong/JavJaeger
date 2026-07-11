import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../../frontend/src/main.jsx", import.meta.url), "utf8");
const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../frontend/src/styles/apple.css", import.meta.url), "utf8");

test("frontend loads the Apple design layer from editable source", () => {
    assert.match(main, /import appleDesignCss from "\.\/styles\/apple\.css"/);
    assert.match(main, /style\.dataset\.design = "apple"/);
    assert.match(main, /document\.head\.appendChild\(style\)/);
});

test("Apple design tokens keep one interaction accent and flat chrome", () => {
    assert.match(css, /--apple-blue:\s*#0066cc/);
    assert.match(css, /--apple-canvas:\s*#ffffff/);
    assert.match(css, /--apple-parchment:\s*#f5f5f7/);
    assert.match(css, /--apple-ink:\s*#1d1d1f/);
    assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/);
    assert.match(css, /\.jav-app \.ant-btn:active[\s\S]*transform:\s*scale\(\.95\)/);
});

test("application shell exposes a frosted product strip and responsive rail controls", () => {
    assert.match(javPage, /className="jav-product-strip"/);
    assert.match(javPage, /className="jav-mobile-workspace-controls"/);
    assert.match(javPage, /className="jav-mobile-quick-search"/);
    assert.match(javPage, /className="jav-mobile-quick-search"[\s\S]*onFinish=\{searchMovie\}/);
    assert.match(javPage, /collapsedWidth=\{0\}/);
    assert.match(javPage, /label:\s*'影片检索',\s*value:\s*'jav',\s*icon:/);
    assert.match(javPage, /label:\s*'网盘管理',\s*value:\s*'webdav',\s*icon:/);
    assert.match(css, /\.jav-product-strip[\s\S]*backdrop-filter:\s*saturate\(180%\) blur\(20px\)/);
    assert.match(css, /@media \(max-width:\s*833px\)[\s\S]*\.jav-mobile-workspace-controls[\s\S]*display:\s*flex/);
    assert.match(css, /@media \(max-width:\s*833px\)[\s\S]*\.jav-sidebar:not\(\.ant-layout-sider-collapsed\)/);
});

test("content images retain the only authored elevation", () => {
    assert.match(css, /\.jav-movie-cover,[\s\S]*\.jav-library-poster img[\s\S]*box-shadow:\s*3px 5px 30px rgba\(0, 0, 0, \.22\)/);
    assert.match(css, /\.jav-tool-card\.ant-card[\s\S]*box-shadow:\s*none/);
});
