import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const javPage = readFileSync(new URL("../../frontend/src/components/JavPage.jsx", import.meta.url), "utf8");
const automationPage = readFileSync(new URL("../../frontend/src/components/AutomationPage.jsx", import.meta.url), "utf8");

test("jav page exposes yhg007 as a direct-search magnet source", () => {
    assert.match(javPage, /yhg007: 'YHG007'/);
    assert.match(javPage, /const magnetSourceRequiresMovieParams = \(source\) => source === 'javbus'/);
    assert.match(javPage, /<Option value="yhg007">YHG007<\/Option>/);
});

test("jav page exposes exclude VR movie search option", () => {
    assert.match(javPage, /initialValues=\{\{ magnet: 'exist', type: 'normal', fetchMode: 'page', excludeVr: false \}\}/);
    assert.match(javPage, /if \(normalizedValues\.excludeVr\) queryParams\.append\('excludeVr', 'true'\);/);
    assert.match(javPage, /排除VR/);
});

test("automation page exposes yhg007 as a magnet node source", () => {
    assert.match(automationPage, /yhg007: "YHG007"/);
    assert.match(automationPage, /MAGNET_SOURCE_LABELS\[node\.config\?\.source \|\| "javbus"\]/);
    assert.match(automationPage, /<Select\.Option value="yhg007">YHG007<\/Select\.Option>/);
});
