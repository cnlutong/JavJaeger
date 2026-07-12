import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../../frontend/src/main.jsx", import.meta.url), "utf8");
const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const automationPage = readFileSync(new URL("../../frontend/src/components/AutomationPage.jsx", import.meta.url), "utf8");
const localLibraryPage = readFileSync(new URL("../../frontend/src/components/LocalLibraryPage.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../frontend/src/styles/apple.css", import.meta.url), "utf8");
const template = readFileSync(new URL("../../templates/index.html", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
const responsiveCss = css.slice(css.indexOf("@media (max-width: 1068px)"), css.indexOf("@media (max-width: 480px)"));

test("frontend builds the Apple design layer as cacheable CSS without runtime injection", () => {
    assert.match(main, /import "\.\/styles\/apple\.css"/);
    assert.doesNotMatch(main, /document\.createElement\("style"\)/);
    assert.match(template, /\/static\/app\.css\?v=/);
    assert.doesNotMatch(packageJson, /--loader:\.css=text/);
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
    assert.match(javPage, /const APP_THEME = \{/);
    assert.match(javPage, /const PAGE_NAV_OPTIONS = \[/);
    assert.match(javPage, /<ConfigProvider\s+theme=\{APP_THEME\}/);
    assert.match(javPage, /options=\{PAGE_NAV_OPTIONS\}/);
    assert.match(javPage, /aria-controls="jav-filter-rail"/);
    assert.match(javPage, /aria-controls="jav-download-rail"/);
    assert.match(javPage, /id="jav-filter-rail"/);
    assert.match(javPage, /id="jav-download-rail"/);
    assert.match(javPage, /matchMedia\('\(max-width: 1068px\)'\)/);
    assert.match(javPage, /label:\s*'影片检索',\s*value:\s*'jav',\s*icon:/);
    assert.match(javPage, /label:\s*'网盘管理',\s*value:\s*'webdav',\s*icon:/);
    assert.match(css, /\.jav-product-strip[\s\S]*backdrop-filter:\s*saturate\(180%\) blur\(20px\)/);
    assert.match(css, /@media \(max-width:\s*1068px\)[\s\S]*\.jav-header-nav[\s\S]*position:\s*fixed/);
    assert.match(css, /@media \(max-width:\s*1068px\)[\s\S]*\.jav-mobile-quick-search[\s\S]*display:\s*block/);
    assert.match(css, /@media \(max-width:\s*1068px\)[\s\S]*\.jav-sidebar:not\(\.ant-layout-sider-collapsed\)/);
    assert.doesNotMatch(css, /@media \(max-width:\s*833px\)/);
    assert.doesNotMatch(css, /@media \(max-width:\s*900px\)/);
    assert.match(responsiveCss, /\.jav-header-nav\s*\{[^}]*width:\s*100%;/);
    assert.match(responsiveCss, /\.jav-mobile-workspace-controls\s*\{[^}]*position:\s*sticky;[^}]*top:\s*104px;/);
    assert.match(css, /\.jav-workspace:not\(\.jav-page-workspace\)[\s\S]*flex-direction:\s*row\s*!important/);
    assert.match(css, /\.jav-page-tabs\s+\.ant-segmented-thumb\s*\{[^}]*display:\s*none;/);
    assert.match(css, /@media \(max-width:\s*1068px\)[\s\S]*\.jav-mobile-workspace-controls[\s\S]*display:\s*flex/);
});

test("content images retain the only authored elevation", () => {
    assert.match(css, /\.jav-movie-cover,[\s\S]*\.jav-library-poster img[\s\S]*box-shadow:\s*3px 5px 30px rgba\(0, 0, 0, \.22\)/);
    assert.match(css, /\.jav-tool-card\.ant-card[\s\S]*box-shadow:\s*none/);
});

test("dense library and automation workspaces contain horizontal overflow on mobile", () => {
    assert.match(localLibraryPage, /const LIBRARY_TABLE_SCROLL = \{ x: "max-content" \};/);
    assert.match(localLibraryPage, /scroll=\{LIBRARY_TABLE_SCROLL\}/);
    assert.match(automationPage, /className="automation-canvas-scroll"/);
    assert.match(automationPage, /<Space wrap>/);
    assert.match(automationPage, /const AUTOMATION_RUN_TABLE_SCROLL = \{ x: "max-content" \};/);
    assert.match(automationPage, /scroll=\{AUTOMATION_RUN_TABLE_SCROLL\}/);
    assert.match(responsiveCss, /\.jav-content\.jav-page-content\s*\{[^}]*overflow-x:\s*hidden;/);
    assert.match(responsiveCss, /\.automation-canvas-scroll\s*\{[^}]*overflow-x:\s*auto;/);
    assert.match(responsiveCss, /\.automation-canvas\s*\{[^}]*overflow-x:\s*auto;/);
    assert.match(responsiveCss, /\.automation-workbench\s*\{[^}]*min-width:\s*0;/);
});

test("secondary pages keep deliberate composition from desktop through phone", () => {
    assert.match(css, /\.jav-app\s+\.ant-input-affix-wrapper\s*>\s*input\.ant-input\s*\{[^}]*min-height:\s*0;[^}]*padding:\s*0;/);
    assert.match(css, /\.jav-app\s+\.ant-input-affix-wrapper\s*\{[^}]*height:\s*44px;/);
    assert.match(css, /\.jav-library-toolbar\s*\{[^}]*grid-template-columns:\s*repeat\(12,/);
    assert.match(css, /\.jav-library-search-row\s*\{[^}]*grid-column:\s*span\s+4;/);
    assert.match(css, /\.automation-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    assert.match(css, /\.automation-inspector\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*720px;/);
    assert.match(responsiveCss, /\.jav-page-panel\s*>\s*\.jav-local-scrape\s*\{[^}]*padding:\s*0\s*!important;/);
    assert.match(responsiveCss, /\.automation-sidebar\s*\{[^}]*max-height:\s*160px\s*!important;/);
    assert.match(responsiveCss, /\.automation-toolbar\s*>\s*\.ant-space:last-child\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,/);
    assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.jav-library-search-row\s+\.ant-input-affix-wrapper\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/);
    assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.webdav-page-header-compact\s*>\s*\.ant-space\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,/);
});
