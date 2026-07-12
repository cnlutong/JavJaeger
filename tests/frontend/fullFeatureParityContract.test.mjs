import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = name => readFile(new URL(`../../frontend/src/workbench/pages/${name}.jsx`, import.meta.url), "utf8");

test("discover includes recognition, account access, batch dispatch, and history maintenance", async () => {
  const source = await page("DiscoverPage");
  for (const endpoint of [
    "/api/movies/recognize",
    "/api/downloaded-movies",
    "/api/history/check-local-library",
    "/api/pikpak/login",
    "/api/pikpak/login-config",
    "/api/115/qrcode/start",
    "/api/115/qrcode/",
    "/api/115/status",
    "/api/115/cookie",
    "/api/115/download-jobs",
  ]) assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(source, /method:\s*"DELETE"/);
  assert.match(source, /selectedMagnets|selectedMovieKeys/);
});

test("organize includes directory browsing, saved templates, async jobs, and safe cleanup", async () => {
  const source = await page("OrganizePage");
  for (const endpoint of [
    "/api/system/directories",
    "/api/movies/local-scrape/preview/jobs",
    "/api/movies/local-scrape/apply/jobs",
    "/api/movies/local-scrape/jobs/",
    "/api/movies/local-scrape/delete",
  ]) assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(source, /loadLocalScrapeTaskTemplates/);
  assert.match(source, /download_sample_images/);
  assert.match(source, /download_list_thumbnail/);
  assert.match(source, /overwrite_existing/);
});

test("library includes settings, asynchronous scanning, repair, actors, and destructive maintenance", async () => {
  const source = await page("LibraryPage");
  for (const endpoint of [
    "/api/movies/local-library/settings",
    "/api/movies/local-library/scan/jobs",
    "/api/movies/local-library/information/check",
    "/api/movies/local-library/information/download",
    "/api/movies/local-library/clean-invalid",
    "/api/movies/local-library/actors",
  ]) assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(source, /method:\s*"DELETE"/);
  assert.match(source, /actor_key|actorKey/);
});

test("cloud and downloads include 115 login, pagination, dispatch results, Aria2 status, and manual magnets", async () => {
  const cloud = await page("CloudPage");
  const downloads = await page("DownloadsPage");
  assert.match(cloud, /\/api\/115\/status/);
  assert.match(cloud, /\/api\/115\/qrcode\/start/);
  assert.match(cloud, /\/api\/115\/cookie/);
  assert.match(cloud, /offset=/);
  assert.match(cloud, /dispatchResults/);
  assert.match(downloads, /\/api\/aria2\/status/);
  assert.match(downloads, /\/api\/aria2\/download-magnets/);
});

test("settings includes diagnostics, full persisted fields, and scraper verification", async () => {
  const source = await page("SettingsPage");
  assert.match(source, /\/api\/system\/info/);
  assert.match(source, /\/api\/movies\/metadata-scrapers\/test/);
  assert.match(source, /\/api\/movies\/metadata-scrapers\/apply-test-results/);
  for (const field of [
    "image_retry_attempts",
    "image_retry_backoff_seconds",
    "batch_interval_seconds",
    "jitter_seconds",
    "min_score",
    "probe_timeout_seconds",
  ]) assert.match(source, new RegExp(field));
});

test("automation run history exposes individual outcomes", async () => {
  const source = await page("AutomationPage");
  assert.match(source, /run\.items|record\.items/);
  assert.match(source, /message/);
  assert.match(source, /magnet_link/);
});
