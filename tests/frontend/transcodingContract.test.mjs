import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const javPage = fs.readFileSync("frontend/src/components/JavPage.jsx", "utf8");
const libraryPage = fs.readFileSync("frontend/src/components/LocalLibraryPage.jsx", "utf8");
const panel = fs.readFileSync("frontend/src/components/TranscodingPage.jsx", "utf8");
const dialog = fs.readFileSync("frontend/src/components/TranscodingDialog.jsx", "utf8");
const styles = fs.readFileSync("static/style.css", "utf8");

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
    assert.match(dialog, /adaptive_h265/);
    assert.match(dialog, /参数由源文件自动分析/);
    assert.match(dialog, /只在输出文件更小时覆盖/);
    assert.match(dialog, /gpu_available/);
    assert.match(dialog, /GPU 硬件编码/);
    assert.match(dialog, /未检测到可用 GPU/);
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
    assert.doesNotMatch(panel, /GPU 转码已启用/);
    assert.doesNotMatch(panel, /体积保护已启用/);
    assert.match(panel, /GPU 转码不可用/);
    assert.match(panel, /hardware_acceleration_required/);
    assert.match(panel, /hardware_backend/);
    assert.match(panel, /adaptive_analysis/);
    assert.match(panel, /自适应分析/);
});

test("transcoding task rows contain long titles and GPU names without crossing columns", () => {
    assert.match(panel, /className="transcoding-task-table"/);
    assert.match(panel, /tableLayout="fixed"/);
    assert.match(panel, /transcoding-task-movie-title/);
    assert.match(panel, /transcoding-task-file-name/);
    assert.match(panel, /transcoding-task-gpu/);
    assert.match(panel, /task\.gpu_vendor/);
    assert.match(panel, /task\.hardware_backend/);
    assert.match(styles, /\.transcoding-task-movie-title[\s\S]*?overflow:\s*hidden/);
    assert.match(styles, /\.transcoding-task-gpu[\s\S]*?text-overflow:\s*ellipsis/);
    assert.match(styles, /\.transcoding-task-table[\s\S]*?overflow-wrap:\s*anywhere/);
});
