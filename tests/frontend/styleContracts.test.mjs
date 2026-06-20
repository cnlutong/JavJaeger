import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../static/style.css", import.meta.url), "utf8");
const webdavCss = readFileSync(new URL("../../static/webdav.css", import.meta.url), "utf8");
const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const automationPage = readFileSync(new URL("../../frontend/src/components/AutomationPage.jsx", import.meta.url), "utf8");
const currentWorkspaceCss = css.slice(css.indexOf("/* Current React workspace shell */"));

test("global button rules do not target Ant Design buttons or switches", () => {
  assert.equal(/\nbutton\s*\{/.test(css), false);
  assert.equal(/\nbutton:hover/.test(css), false);
  assert.match(css, /button:not\(\.ant-btn\):not\(\.ant-switch\)/);
});

test("top navigation has a centered menu and brand slogan", () => {
  assert.match(javPage, /HEADER_SLOGAN/);
  assert.match(javPage, /className="jav-brand-slogan"/);
  assert.match(javPage, /className="jav-header-nav"/);
  assert.match(css, /\.jav-header\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s+auto\s+minmax\(180px,\s*1fr\)/);
  assert.match(css, /\.jav-header-nav\s*\{[\s\S]*justify-self:\s*center;/);
});

test("secondary pages share the same connected workspace shell as search", () => {
  assert.match(javPage, /const renderStandalonePage = /);
  assert.match(javPage, /<Layout className="jav-workspace jav-page-workspace">/);
  assert.match(javPage, /<Content className="jav-content jav-page-content">/);
  assert.match(javPage, /<section className="jav-results-panel jav-page-panel">/);
  assert.match(css, /\.jav-page-workspace\s*\{[\s\S]*min-height:\s*calc\(100vh - 68px\);[\s\S]*background:\s*#f5f5f5;[\s\S]*overflow:\s*visible;/);
  assert.match(css, /\.jav-page-content\s*\{[\s\S]*height:\s*auto;[\s\S]*overflow:\s*visible;[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*padding:\s*14px 0 0;[\s\S]*scrollbar-gutter:\s*auto;/);
  assert.match(css, /\.jav-page-panel\s*\{[\s\S]*min-height:\s*100%;/);
  assert.match(webdavCss, /\.jav-page-panel > \.webdav-page\s*\{[\s\S]*padding:\s*0 !important;[\s\S]*background:\s*transparent !important;/);
});

test("current React workspace keeps readable enterprise typography floors", () => {
  assert.equal(/font-size:\s*(?:10|11)px/.test(currentWorkspaceCss), false);
  assert.equal(/fontSize:\s*(?:10|11)\b/.test(javPage), false);
  assert.equal(/fontSize:\s*(?:10|11)\b/.test(automationPage), false);
  assert.match(currentWorkspaceCss, /\.jav-app\s*\{[\s\S]*font-size:\s*14px;[\s\S]*line-height:\s*1\.5;/);
  assert.match(currentWorkspaceCss, /\.jav-app \.ant-typography,[\s\S]*\.jav-app \.ant-table,[\s\S]*\.jav-app \.ant-segmented\s*\{[\s\S]*font-size:\s*14px;/);
  assert.match(currentWorkspaceCss, /\.jav-app \.ant-tag,[\s\S]*\.jav-app \.ant-form-item-explain\s*\{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*1\.45;/);
});

test("automation canvas exposes deterministic auto layout", () => {
  assert.match(automationPage, /const NODE_WIDTH = 196/);
  assert.match(automationPage, /const getAutoLayoutOrder = /);
  assert.match(automationPage, /const handleAutoLayout = /);
  assert.match(automationPage, />自动排版</);
  assert.match(automationPage, /className="automation-layout-button"/);
});

test("automation filter search previews actors and genres with multiple conditions", () => {
  assert.match(automationPage, /categoryGroups/);
  assert.match(automationPage, /actorGroups/);
  assert.match(automationPage, /类别预览与选择/);
  assert.match(automationPage, /演员预览与选择/);
  assert.match(automationPage, /mode="multiple"/);
  assert.match(automationPage, /filters:/);
  assert.match(automationPage, /value="all">全部/);
});
