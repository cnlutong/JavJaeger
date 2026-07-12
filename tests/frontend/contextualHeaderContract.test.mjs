import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../frontend/src/workbench/WorkbenchApp.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../frontend/src/workbench/workbench.css", import.meta.url), "utf8");

test("desktop pages rely on their contextual page intro instead of a shared top bar", () => {
  assert.doesNotMatch(shell, /wb-topbar/);
  assert.doesNotMatch(shell, /wb-runtime/);
  assert.doesNotMatch(styles, /\.wb-topbar/);
  assert.match(styles, /\.wb-main\s*\{[^}]*min-height:\s*100vh/s);
});

test("mobile keeps only a compact navigation header", () => {
  assert.match(shell, /wb-mobile-header/);
  assert.match(styles, /\.wb-mobile-header\s*\{[^}]*display:\s*none/s);
  assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.wb-mobile-header\s*\{[^}]*display:\s*flex/s);
});
