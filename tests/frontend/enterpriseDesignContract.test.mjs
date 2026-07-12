import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../../frontend/src/workbench/${path}`, import.meta.url), "utf8");
const app = read("WorkbenchApp.jsx");
const styles = read("workbench.css");
const ui = read("ui.jsx");

test("workbench uses a cool enterprise palette instead of the warm red theme", () => {
  assert.match(app, /colorPrimary:\s*"#2563eb"/);
  assert.match(app, /colorBgLayout:\s*"#f3f6fa"/);
  assert.match(styles, /--wb-accent:\s*#2563eb/);
  assert.doesNotMatch(`${app}\n${styles}`, /#f04438|#f7f4ee|#fffdf9/i);
});

test("page actions have a dedicated hierarchy surface", () => {
  assert.match(ui, /className="wb-page-actions"/);
  assert.match(styles, /\.wb-page-actions/);
  assert.match(styles, /\.wb-row-action/);
  assert.match(styles, /@media \(max-width:\s*640px\)[\s\S]*\.wb-page-actions\s*\{[^}]*max-width:\s*none/s);
});

test("repeated and low-frequency actions do not compete with the primary task", () => {
  const discover = read("pages/DiscoverPage.jsx");
  const automation = read("pages/AutomationPage.jsx");
  const downloads = read("pages/DownloadsPage.jsx");
  const cloud = read("pages/CloudPage.jsx");
  const library = read("pages/LibraryPage.jsx");
  const settings = read("pages/SettingsPage.jsx");

  assert.match(discover, /className="wb-row-action"/);
  assert.match(automation, /key="run" className="wb-row-action"/);
  assert.match(automation, /key="edit" type="text"/);
  assert.match(downloads, /key="magnet" type="primary"/);
  assert.match(downloads, /key="refresh" type="text"/);
  assert.match(cloud, /key="downloads" type="text"/);
  assert.match(library, /loading=\{loading\} type="text">刷新/);
  assert.match(settings, /key="reload" type="text"/);
});
