export const LOCAL_SCRAPE_TASK_TEMPLATE_KEY = "localScrapeTaskTemplates";

const MAX_TEMPLATES = 30;

const parseJson = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
};

const clampInteger = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
};

const normalizeOptionalInteger = (value, min = 0) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.max(min, parsed);
};

const defaultNow = () => new Date().toISOString();

const defaultIdFactory = () => {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `local-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const normalizeLocalScrapeTaskValues = (values = {}) => ({
    directory: String(values.directory || "").trim(),
    recursive: values.recursive !== false,
    maxDepth: normalizeOptionalInteger(values.maxDepth),
    scrape: values.scrape !== false,
    concurrent: clampInteger(values.concurrent, 1, 5, 3),
    organize: values.organize !== false,
    targetDirectory: String(values.targetDirectory || "").trim(),
    folderTemplate: String(values.folderTemplate || "{code} {title}").trim() || "{code} {title}",
    namingTemplate: String(values.namingTemplate || "{code} {title}").trim() || "{code} {title}",
    writeNfo: values.writeNfo !== false,
    downloadImages: values.downloadImages !== false,
    overwriteExisting: !!values.overwriteExisting,
});

export const normalizeLocalScrapeTaskTemplateName = (name) => {
    const normalized = String(name || "").trim().replace(/\s+/g, " ");
    return normalized || "Local scrape task";
};

const normalizeTemplate = (template) => {
    if (!template || typeof template !== "object") {
        return null;
    }
    const id = String(template.id || "").trim();
    if (!id) {
        return null;
    }
    return {
        id,
        name: normalizeLocalScrapeTaskTemplateName(template.name),
        values: normalizeLocalScrapeTaskValues(template.values),
        createdAt: String(template.createdAt || ""),
        updatedAt: String(template.updatedAt || template.createdAt || ""),
    };
};

export const loadLocalScrapeTaskTemplates = (storage = globalThis.window?.localStorage) => {
    if (!storage) {
        return [];
    }
    const parsed = parseJson(storage.getItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY), []);
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed
        .map(normalizeTemplate)
        .filter(Boolean)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, MAX_TEMPLATES);
};

const persistTemplates = (storage, templates) => {
    storage.setItem(LOCAL_SCRAPE_TASK_TEMPLATE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
};

export const saveLocalScrapeTaskTemplate = (
    storage = globalThis.window?.localStorage,
    name,
    values,
    { existingId = "", idFactory = defaultIdFactory, now = defaultNow } = {},
) => {
    if (!storage) {
        throw new Error("local storage is unavailable");
    }

    const templates = loadLocalScrapeTaskTemplates(storage);
    const timestamp = now();
    const normalizedName = normalizeLocalScrapeTaskTemplateName(name);
    const normalizedValues = normalizeLocalScrapeTaskValues(values);
    const targetId = String(existingId || "").trim();
    const existing = templates.find((template) => template.id === targetId);
    const saved = {
        id: existing?.id || idFactory(),
        name: normalizedName,
        values: normalizedValues,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
    };
    const nextTemplates = [saved, ...templates.filter((template) => template.id !== saved.id)];
    persistTemplates(storage, nextTemplates);
    return saved;
};

export const deleteLocalScrapeTaskTemplate = (storage = globalThis.window?.localStorage, id) => {
    if (!storage) {
        return [];
    }
    const targetId = String(id || "").trim();
    const nextTemplates = loadLocalScrapeTaskTemplates(storage).filter((template) => template.id !== targetId);
    persistTemplates(storage, nextTemplates);
    return nextTemplates;
};
