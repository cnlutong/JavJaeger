import assert from "node:assert/strict";
import test from "node:test";
import { buildMagnetDataMapFromResults } from "../../frontend/src/utils/magnets.mjs";

test("movies without returned magnets are marked as loaded empty results", () => {
  const movies = [{ id: "ABP-123" }, { id: "IPX-456" }];
  const map = buildMagnetDataMapFromResults([{ movie_id: "ABP-123", link: "magnet:abc", source: "cilisousuo" }], movies);
  assert.equal(map["ABP-123"][0].source, "cilisousuo");
  assert.deepEqual(map["IPX-456"], []);
});
