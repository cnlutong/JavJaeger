import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPage = readFileSync(new URL("../../frontend/src/components/SettingsPage.jsx", import.meta.url), "utf8");
const apiUtils = readFileSync(new URL("../../frontend/src/utils/api.js", import.meta.url), "utf8");

test("settings page exposes categorized user configuration sections", () => {
    assert.match(settingsPage, /JavBus API/);
    assert.match(settingsPage, /WebDAV/);
    assert.match(settingsPage, /Aria2/);
    assert.match(settingsPage, /PikPak/);
    assert.match(settingsPage, /115网盘/);
    assert.match(settingsPage, /刮削源/);
    assert.match(settingsPage, /session_secret/);
});

test("settings page exposes image retry controls for scrape asset downloads", () => {
    assert.match(settingsPage, /image_retry_attempts/);
    assert.match(settingsPage, /image_retry_backoff_seconds/);
    assert.match(settingsPage, /图片下载重试次数/);
    assert.match(settingsPage, /图片重试退避/);
});

test("settings page strips blank sensitive fields before saving", () => {
    assert.match(settingsPage, /buildSettingsPayload/);
    assert.match(settingsPage, /delete payload\.webdav\.password/);
    assert.match(settingsPage, /delete payload\.aria2\.secret/);
    assert.match(settingsPage, /delete payload\.pikpak\.password/);
    assert.match(settingsPage, /delete payload\.pan115\.cookie/);
    assert.match(settingsPage, /delete payload\.scrapers\.javstash\.api_key/);
});

test("settings page exposes configurable scraper providers inspired by javinizer-go", () => {
    assert.match(settingsPage, /name=\{\["scrapers", "priority"\]\}/);
    assert.match(settingsPage, /r18dev/);
    assert.match(settingsPage, /dmm/);
    assert.match(settingsPage, /libredmm/);
    assert.match(settingsPage, /javlibrary/);
    assert.match(settingsPage, /javdb/);
    assert.match(settingsPage, /javbus/);
    assert.match(settingsPage, /jav321/);
    assert.match(settingsPage, /mgstage/);
    assert.match(settingsPage, /tokyohot/);
    assert.match(settingsPage, /aventertainment/);
    assert.match(settingsPage, /dlgetchu/);
    assert.match(settingsPage, /caribbeancom/);
    assert.match(settingsPage, /fc2/);
    assert.match(settingsPage, /javstash/);
    assert.match(settingsPage, /has_api_key/);
});

test("settings API has a grouped update helper", () => {
    assert.match(apiUtils, /export const updateSystemSettings = async/);
    assert.match(apiUtils, /"\/api\/system\/settings"/);
});
