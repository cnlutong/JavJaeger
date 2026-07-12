import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = [
  "WorkbenchApp.jsx", "api.js", "pages/DiscoverPage.jsx", "pages/OrganizePage.jsx",
  "pages/LibraryPage.jsx", "pages/AutomationPage.jsx", "pages/CloudPage.jsx",
  "pages/DownloadsPage.jsx", "pages/SettingsPage.jsx",
];

test("every concrete backend capability has a frontend path", async () => {
  const source = (await Promise.all(files.map(file => readFile(new URL(`../../frontend/src/workbench/${file}`, import.meta.url), "utf8")))).join("\n");
  const capabilities = [
    "/api/system/info", "/api/client-config", "/api/system/directories", "/api/system/files",
    "/api/system/settings", "/api/system/settings/javbus",
    "/api/history", "/api/history/check-local-library", "/api/downloaded-movies",
    "/api/movies/all", "/api/movies/search", "/api/movies/local-library/settings",
    "/api/movies/local-library/scan", "/api/movies/local-library/scan/jobs",
    "/api/movies/local-library/information/check", "/api/movies/local-library/information/download",
    "/api/movies/local-library/clean-invalid", "/api/movies/local-library/actors",
    "/api/movies/local-library/poster/", "/api/movies/local-library/thumbnail/",
    "/api/movies/local-library/actor-avatar/", "/play", "/api/movies/local-scrape/preview/jobs",
    "/api/movies/local-scrape/apply/jobs", "/api/movies/local-scrape/jobs/",
    "/api/movies/metadata-scrapers/test", "/api/movies/metadata-scrapers/apply-test-results",
    "/api/movies/batch", "/api/movies/batch-stream", "/api/movies/recognize",
    "/api/movies/download-by-codes", "/api/movies/local-scrape/preview",
    "/api/movies/local-scrape/delete", "/api/movies/local-scrape/apply",
    "/api/magnets/", "/api/stars/", "/api/pikpak/login", "/api/pikpak/login-config",
    "/api/pikpak/download", "/api/115/qrcode/start", "/api/115/qrcode/", "/api/115/status",
    "/api/115/cookie", "/api/115/download", "/api/115/download-jobs", "/api/115/files",
    "/api/webdav/connect", "/api/webdav/connect-config", "/api/aria2/connect",
    "/api/aria2/connect-config", "/api/webdav/status", "/api/webdav/files",
    "/api/webdav/download", "/api/aria2/status", "/api/aria2/downloads",
    "/api/aria2/download-magnets", "/api/aria2/pause/", "/api/aria2/resume/",
    "/api/aria2/remove/", "/api/automation/tasks", "/run", "/runs", "/api/image-proxy",
  ];
  for (const capability of capabilities) assert.ok(source.includes(capability), `missing frontend capability: ${capability}`);
});
