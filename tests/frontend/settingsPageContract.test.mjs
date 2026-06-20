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
    assert.match(settingsPage, /session_secret/);
});

test("settings page strips blank sensitive fields before saving", () => {
    assert.match(settingsPage, /buildSettingsPayload/);
    assert.match(settingsPage, /delete payload\.webdav\.password/);
    assert.match(settingsPage, /delete payload\.aria2\.secret/);
    assert.match(settingsPage, /delete payload\.pikpak\.password/);
});

test("settings API has a grouped update helper", () => {
    assert.match(apiUtils, /export const updateSystemSettings = async/);
    assert.match(apiUtils, /"\/api\/system\/settings"/);
});
