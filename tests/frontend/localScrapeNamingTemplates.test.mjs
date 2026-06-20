import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTemplateFromParts,
    moveTemplatePart,
    parseTemplateToParts,
} from "../../frontend/src/utils/localScrapeNamingTemplates.mjs";

test("builds naming templates from Chinese card parts", () => {
    const template = buildTemplateFromParts([
        { type: "field", id: "actor" },
        { type: "separator", id: "slash" },
        { type: "field", id: "year" },
        { type: "separator", id: "slash" },
        { type: "field", id: "code" },
        { type: "separator", id: "space" },
        { type: "field", id: "title" },
    ]);

    assert.equal(template, "{actor}/{year}/{code} {title}");
});

test("parses existing template strings back into draggable parts", () => {
    assert.deepEqual(parseTemplateToParts("{studio}/{code} - {title}"), [
        { type: "field", id: "studio" },
        { type: "separator", id: "slash" },
        { type: "field", id: "code" },
        { type: "separator", id: "dash" },
        { type: "field", id: "title" },
    ]);
});

test("preserves custom literal fragments when parsing templates", () => {
    const parts = parseTemplateToParts("{code} [中字] {title}");

    assert.deepEqual(parts, [
        { type: "field", id: "code" },
        { type: "separator", id: "space" },
        { type: "literal", value: "[中字]" },
        { type: "separator", id: "space" },
        { type: "field", id: "title" },
    ]);
    assert.equal(buildTemplateFromParts(parts), "{code} [中字] {title}");
});

test("moving template cards is immutable and clamps drop indexes", () => {
    const parts = [
        { type: "field", id: "code" },
        { type: "separator", id: "space" },
        { type: "field", id: "title" },
    ];

    assert.deepEqual(moveTemplatePart(parts, 2, 0), [
        { type: "field", id: "title" },
        { type: "field", id: "code" },
        { type: "separator", id: "space" },
    ]);
    assert.deepEqual(parts, [
        { type: "field", id: "code" },
        { type: "separator", id: "space" },
        { type: "field", id: "title" },
    ]);
});

test("template builder can intentionally return an empty template", () => {
    assert.equal(buildTemplateFromParts([], { allowEmpty: true }), "");
    assert.deepEqual(parseTemplateToParts("", { allowEmpty: true }), []);
});
