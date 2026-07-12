import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const javPageSource = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../../static/style.css", import.meta.url), "utf8");

test("header logo opens a darkened full-size preview", () => {
    assert.match(javPageSource, /logoPreviewOpen/);
    assert.match(javPageSource, /className="jav-brand-logo-button"/);
    assert.match(javPageSource, /aria-label="查看 JavJaeger logo 大图"/);
    assert.match(javPageSource, /className="jav-logo-preview-overlay"/);
    assert.match(javPageSource, /src="\/static\/logo\.jpg"/);
    assert.match(styleSource, /\.jav-logo-preview-overlay/);
    assert.match(styleSource, /background:\s*rgba\(15,\s*23,\s*42,\s*0\.86\)/);
});

test("logo preview has explicit close affordances", () => {
    assert.match(javPageSource, /handleLogoPreviewClose/);
    assert.match(javPageSource, /key === 'Escape'/);
    assert.match(javPageSource, /className="jav-logo-preview-close"/);
    assert.match(javPageSource, /aria-label="关闭 logo 大图"/);
});

test("header keeps navigation centered and shows brand name plus slogan beside the logo", () => {
    assert.match(javPageSource, /const HEADER_BRAND_NAME = 'JavJaeger'/);
    assert.match(javPageSource, /const HEADER_SLOGAN = /);
    assert.match(javPageSource, /人类的一切痛苦，都是因为性欲得不到满足/);
    assert.match(javPageSource, /弗洛伊德 峰/);
    assert.match(javPageSource, /className="jav-brand-name"/);
    assert.match(javPageSource, /className="jav-brand-slogan"/);
    assert.match(javPageSource, /className="jav-brand-copy"/);
    assert.match(javPageSource, /<div className="jav-header-nav">/);
    assert.match(styleSource, /\.jav-header\s*{[^}]*display:\s*grid/s);
    assert.match(styleSource, /\.jav-header-nav\s*{[^}]*justify-self:\s*center/s);
    assert.match(styleSource, /\.jav-header-actions\s*{[^}]*justify-self:\s*end/s);
});
