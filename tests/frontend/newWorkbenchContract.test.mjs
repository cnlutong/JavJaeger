import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../frontend/src/App.jsx", import.meta.url), "utf8");

test("App mounts only the new workbench component tree", () => {
  assert.match(app, /workbench\/WorkbenchApp\.jsx/);
  assert.doesNotMatch(app, /components\/JavPage/);
  assert.equal(existsSync(new URL("../../frontend/src/workbench/WorkbenchApp.jsx", import.meta.url)), true);
});

test("new workbench owns all seven product surfaces", () => {
  const shell = readFileSync(new URL("../../frontend/src/workbench/WorkbenchApp.jsx", import.meta.url), "utf8");
  for (const page of ["DiscoverPage", "OrganizePage", "LibraryPage", "AutomationPage", "CloudPage", "DownloadsPage", "SettingsPage"]) {
    assert.match(shell, new RegExp(`import ${page} from "\\./pages/${page}\\.jsx"`));
  }
  assert.doesNotMatch(shell, /\.\.\/components\//);
});

test("new pages expose the real workflow endpoints", () => {
  const files = ["DiscoverPage", "OrganizePage", "LibraryPage", "AutomationPage", "CloudPage", "DownloadsPage", "SettingsPage"]
    .map(name => readFileSync(new URL(`../../frontend/src/workbench/pages/${name}.jsx`, import.meta.url), "utf8"))
    .join("\n");
  for (const endpoint of ["/api/movies", "/api/magnets/", "/api/movies/local-scrape/preview", "/api/movies/local-library", "/api/automation/tasks", "/api/webdav/files", "/api/aria2/downloads", "/api/system/settings"]) {
    assert.match(files, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});
