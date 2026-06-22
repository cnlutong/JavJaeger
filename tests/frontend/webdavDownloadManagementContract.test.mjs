import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const webDavPage = readFileSync(new URL("../../frontend/src/components/WebDavPage.jsx", import.meta.url), "utf8");
const downloadManagementPage = readFileSync(
    new URL("../../frontend/src/components/DownloadManagementPage.jsx", import.meta.url),
    "utf8",
);

test("top navigation separates net disk management from download management", () => {
    assert.match(javPage, /import DownloadManagementPage/);
    assert.match(javPage, /downloadManagement:\s*<DownloadManagementPage/);
    assert.match(javPage, /label:\s*'网盘管理',\s*value:\s*'webdav'/);
    assert.match(javPage, /label:\s*'下载管理',\s*value:\s*'downloadManagement'/);
});

test("webdav page is a net disk manager without the aria2 task table", () => {
    assert.match(webDavPage, /网盘管理/);
    assert.match(webDavPage, /资源管理器/);
    assert.match(webDavPage, /handleDownloadSelected/);
    assert.doesNotMatch(webDavPage, /const downloadColumns = /);
    assert.doesNotMatch(webDavPage, /\/api\/aria2\/downloads/);
    assert.doesNotMatch(webDavPage, /暂停/);
});

test("webdav page keeps connection setup out of the primary explorer surface", () => {
    assert.match(webDavPage, /<Modal/);
    assert.match(webDavPage, /新增网盘/);
    assert.match(webDavPage, /搜索当前目录/);
    assert.match(webDavPage, /handleRemoveProfile/);
    assert.doesNotMatch(webDavPage, /打开下载管理/);
    assert.doesNotMatch(webDavPage, /密码只保存在/);
    assert.doesNotMatch(webDavPage, /<Text>Aria2:<\/Text><Badge/);
});

test("webdav resource manager supports local folders without dispatching local paths", () => {
    assert.match(webDavPage, /localFolder/);
    assert.match(webDavPage, /\/api\/system\/files/);
    assert.match(webDavPage, /新增本地文件夹/);
    assert.match(webDavPage, /本地文件夹/);
    assert.match(webDavPage, /record\.source_type === "local"/);
    assert.match(webDavPage, /本地文件不能发送到 Aria2/);
});

test("webdav resource manager can browse configured 115 net disk safely", () => {
    assert.match(webDavPage, /pan115/);
    assert.match(webDavPage, /\/api\/115\/files/);
    assert.match(webDavPage, /115网盘/);
    assert.match(webDavPage, /sourceType !== "pan115"/);
    assert.match(webDavPage, /pick_code: item\.pick_code \|\| ""/);
    assert.doesNotMatch(webDavPage, /115 网盘文件暂不支持直接派发到 Aria2/);
});

test("webdav resource manager allows selecting 115 rows for aria2 dispatch", () => {
    assert.match(webDavPage, /const isFileRowSelectable = \(record\) => !record\.isParent && record\.source_type !== "local";/);
    assert.match(webDavPage, /const isAria2Dispatchable = \(record\) => record\.source_type !== "local";/);
    assert.match(webDavPage, /getCheckboxProps: \(record\) => \({ disabled: !isFileRowSelectable\(record\) }\)/);
    assert.match(webDavPage, /const hasSelectedRows = selectedRows\.length > 0;/);
    assert.match(webDavPage, /disabled=\{!hasSelectedRows\}/);
    assert.doesNotMatch(webDavPage, /getCheckboxProps:[\s\S]*record\.source_type === "pan115"/);
});

test("download management page owns aria2 connection and task controls", () => {
    assert.match(downloadManagementPage, /下载管理/);
    assert.match(downloadManagementPage, /Aria2下载器/);
    assert.match(downloadManagementPage, /\/api\/aria2\/downloads/);
    assert.match(downloadManagementPage, /doDownloadAction/);
    assert.match(downloadManagementPage, /暂停/);
    assert.match(downloadManagementPage, /继续/);
});
