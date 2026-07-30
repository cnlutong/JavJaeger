import assert from "node:assert/strict";
import test from "node:test";

import { matchesVrFilter } from "../../frontend/src/utils/localLibraryFilters.mjs";

const vrMovie = { movie_id: "VR-001", is_vr: true };
const regularMovie = { movie_id: "ABC-001", is_vr: false };

test("local library VR filter supports all, hidden VR, and VR-only modes", () => {
    assert.equal(matchesVrFilter(vrMovie, "all"), true);
    assert.equal(matchesVrFilter(regularMovie, "all"), true);
    assert.equal(matchesVrFilter(vrMovie, "exclude"), false);
    assert.equal(matchesVrFilter(regularMovie, "exclude"), true);
    assert.equal(matchesVrFilter(vrMovie, "only"), true);
    assert.equal(matchesVrFilter(regularMovie, "only"), false);
});

