import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMagnetDataMapFromResults } from "../../frontend/src/utils/magnets.mjs";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");

test("recognized movies without returned magnets are marked as loaded empty results", () => {
    const movies = [{ id: "ABP-123" }, { id: "IPX-456" }];
    const map = buildMagnetDataMapFromResults(
        [
            {
                movie_id: "ABP-123",
                link: "magnet:?xt=urn:btih:abc",
                title: "ABP-123 best",
                size: "2 GB",
                shareDate: "2026-01-02",
                hasSubtitle: true,
            },
        ],
        movies,
    );

    assert.deepEqual(map["ABP-123"], [
        {
            link: "magnet:?xt=urn:btih:abc",
            title: "ABP-123 best",
            size: "2 GB",
            shareDate: "2026-01-02",
            hasSubtitle: true,
        },
    ]);
    assert.deepEqual(map["IPX-456"], []);
});

test("recognition starts frontend magnet lookup when backend returns only movies", () => {
    assert.match(javPage, /const recognizedMovies = Array\.isArray\(data\.movies\) \? data\.movies : \[\];/);
    assert.match(javPage, /if \(Array\.isArray\(data\.magnet_results\)\) \{/);
    assert.match(javPage, /loadMovieResources\(recognizedMovies\);/);
});
