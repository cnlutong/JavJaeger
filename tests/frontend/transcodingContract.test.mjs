import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const javPage = fs.readFileSync("frontend/src/components/JavPage.jsx", "utf8");
const libraryPage = fs.readFileSync("frontend/src/components/LocalLibraryPage.jsx", "utf8");
const panel = fs.readFileSync("frontend/src/components/TranscodingPage.jsx", "utf8");
const dialog = fs.readFileSync("frontend/src/components/TranscodingDialog.jsx", "utf8");

test("top navigation exposes the transcoding task panel", () => {
    assert.match(javPage, /import TranscodingPage from "\.\/TranscodingPage\.jsx"/);
    assert.match(javPage, /transcoding: <TranscodingPage/);
    assert.match(javPage, /label: '转码'/);
    assert.match(javPage, /value: 'transcoding'/);
});

test("local library opens a per-file transcoding menu", () => {
    assert.match(libraryPage, /import TranscodingDialog from "\.\/TranscodingDialog\.jsx"/);
    assert.match(libraryPage, /openTranscodingDialog/);
    assert.match(libraryPage, />\s*转码\s*</);
    assert.match(libraryPage, /<TranscodingDialog/);
});

test("transcoding dialog provides presets and professional overrides", () => {
    assert.match(dialog, /\/api\/movies\/transcoding\/presets/);
    assert.match(dialog, /preset_id/);
    assert.match(dialog, /video_codec/);
    assert.match(dialog, /quality_mode/);
    assert.match(dialog, /video_bitrate_kbps/);
    assert.match(dialog, /max_height/);
    assert.match(dialog, /frame_rate/);
    assert.match(dialog, /audio_codec/);
    assert.match(dialog, /copy_subtitles/);
    assert.match(dialog, /deinterlace/);
    assert.match(dialog, /quality_h265/);
    assert.match(dialog, /只在输出文件更小时覆盖/);
});

test("transcoding panel polls and manages background tasks", () => {
    assert.match(panel, /\/api\/movies\/transcoding\/tasks/);
    assert.match(panel, /setInterval/);
    assert.match(panel, /Progress/);
    assert.match(panel, /cancel/);
    assert.match(panel, /retry/);
    assert.match(panel, /DELETE/);
    assert.match(panel, /并发上限/);
    assert.match(panel, /只保留更小的转码结果/);
});
