import assert from "node:assert/strict";
import test from "node:test";

import {
    deleteLocalScrapeTaskTemplate,
    loadLocalScrapeTaskTemplates,
    saveLocalScrapeTaskTemplate,
} from "../../frontend/src/utils/localScrapeTemplates.mjs";

class MemoryStorage {
    constructor(initial = {}) {
        this.values = { ...initial };
    }

    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null;
    }

    setItem(key, value) {
        this.values[key] = String(value);
    }

    removeItem(key) {
        delete this.values[key];
    }
}

test("local scrape templates persist only normalized task fields", () => {
    const storage = new MemoryStorage();
    const saved = saveLocalScrapeTaskTemplate(
        storage,
        "Incoming folder",
        {
            directory: "D:\\Downloads\\JAV",
            recursive: undefined,
            maxDepth: "",
            scrape: true,
            concurrent: 9,
            organize: false,
            targetDirectory: "D:\\Media\\JAV",
            folderTemplate: "{actor}/{year}/{title}",
            namingTemplate: "",
            writeNfo: false,
            downloadImages: true,
            downloadActorImages: true,
            downloadListThumbnail: true,
            overwriteExisting: true,
            ignoredSecret: "should-not-persist",
        },
        {
            idFactory: () => "tpl-1",
            now: () => "2026-06-18T12:00:00.000Z",
        },
    );

    assert.equal(saved.name, "Incoming folder");
    assert.deepEqual(saved.values, {
        directory: "D:\\Downloads\\JAV",
        recursive: true,
        maxDepth: null,
        scrape: true,
        concurrent: 5,
        organize: false,
        targetDirectory: "D:\\Media\\JAV",
        folderTemplate: "{actor}/{year}/{title}",
        namingTemplate: "{code} {title}",
        writeNfo: false,
        downloadImages: true,
        downloadActorImages: true,
        downloadListThumbnail: true,
        overwriteExisting: true,
    });
    assert.equal(loadLocalScrapeTaskTemplates(storage).length, 1);
});

test("saving an existing local scrape template updates it in place", () => {
    const storage = new MemoryStorage();
    saveLocalScrapeTaskTemplate(storage, "First", { directory: "D:\\A" }, { idFactory: () => "tpl-1", now: () => "t1" });

    const updated = saveLocalScrapeTaskTemplate(
        storage,
        "Renamed",
        { directory: "D:\\B", concurrent: 2 },
        { existingId: "tpl-1", idFactory: () => "unused", now: () => "t2" },
    );

    const templates = loadLocalScrapeTaskTemplates(storage);
    assert.equal(templates.length, 1);
    assert.equal(updated.id, "tpl-1");
    assert.equal(templates[0].name, "Renamed");
    assert.equal(templates[0].createdAt, "t1");
    assert.equal(templates[0].updatedAt, "t2");
    assert.equal(templates[0].values.directory, "D:\\B");
    assert.equal(templates[0].values.concurrent, 2);
});

test("local scrape template loading recovers from invalid storage", () => {
    const storage = new MemoryStorage({ localScrapeTaskTemplates: "{not json" });

    assert.deepEqual(loadLocalScrapeTaskTemplates(storage), []);
});

test("local scrape template deletion removes only the selected id", () => {
    const storage = new MemoryStorage();
    saveLocalScrapeTaskTemplate(storage, "A", { directory: "D:\\A" }, { idFactory: () => "a", now: () => "t1" });
    saveLocalScrapeTaskTemplate(storage, "B", { directory: "D:\\B" }, { idFactory: () => "b", now: () => "t2" });

    const templates = deleteLocalScrapeTaskTemplate(storage, "a");

    assert.deepEqual(templates.map((template) => template.id), ["b"]);
});

test("local scrape task templates preserve an intentionally empty folder template", () => {
    const storage = new MemoryStorage();
    const saved = saveLocalScrapeTaskTemplate(
        storage,
        "Root folder",
        {
            directory: "D:\\Downloads\\JAV",
            folderTemplate: "",
            namingTemplate: "{code}",
        },
        {
            idFactory: () => "tpl-root",
            now: () => "2026-06-20T12:00:00.000Z",
        },
    );

    assert.equal(saved.values.folderTemplate, "");
    assert.equal(saved.values.namingTemplate, "{code}");
});
