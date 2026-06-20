export const LOCAL_SCRAPE_NAMING_FIELDS = [
    { id: "code", label: "番号", placeholder: "{code}", sample: "ABP-123" },
    { id: "title", label: "标题", placeholder: "{title}", sample: "影片标题" },
    { id: "actor", label: "首位演员", placeholder: "{actor}", sample: "演员A" },
    { id: "actors", label: "全部演员", placeholder: "{actors}", sample: "演员A 演员B" },
    { id: "year", label: "年份", placeholder: "{year}", sample: "2024" },
    { id: "date", label: "发行日期", placeholder: "{date}", sample: "2024-05-17" },
    { id: "studio", label: "制作商", placeholder: "{studio}", sample: "Studio" },
    { id: "maker", label: "制作商别名", placeholder: "{maker}", sample: "Studio" },
    { id: "publisher", label: "发行商", placeholder: "{publisher}", sample: "Publisher" },
    { id: "series", label: "系列", placeholder: "{series}", sample: "Series" },
    { id: "director", label: "导演", placeholder: "{director}", sample: "Director" },
    { id: "original", label: "原文件名", placeholder: "{original}", sample: "ABP-123" },
];

export const LOCAL_SCRAPE_NAMING_SEPARATORS = [
    { id: "space", label: "空格", value: " " },
    { id: "slash", label: "文件夹层级", value: "/" },
    { id: "dash", label: "短横线", value: " - " },
    { id: "underscore", label: "下划线", value: "_" },
    { id: "dot", label: "点号", value: "." },
];

const DEFAULT_TEMPLATE_PARTS = [
    { type: "field", id: "code" },
    { type: "separator", id: "space" },
    { type: "field", id: "title" },
];

const fieldById = new Map(LOCAL_SCRAPE_NAMING_FIELDS.map((field) => [field.id, field]));
const separatorById = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.id, separator]));
const separatorByValue = new Map(LOCAL_SCRAPE_NAMING_SEPARATORS.map((separator) => [separator.value, separator]));
const placeholderPattern = /\{([a-z]+)\}/g;

export const getNamingField = (id) => fieldById.get(String(id || ""));

export const getNamingSeparator = (id) => separatorById.get(String(id || ""));

const normalizePart = (part) => {
    if (!part || typeof part !== "object") {
        return null;
    }
    if (part.type === "field" && fieldById.has(part.id)) {
        return { type: "field", id: part.id };
    }
    if (part.type === "separator" && separatorById.has(part.id)) {
        return { type: "separator", id: part.id };
    }
    if (part.type === "literal") {
        const value = String(part.value || "");
        return value ? { type: "literal", value } : null;
    }
    return null;
};

export const normalizeTemplateParts = (parts, { allowEmpty = false } = {}) => {
    if (!Array.isArray(parts)) {
        return allowEmpty ? [] : [...DEFAULT_TEMPLATE_PARTS];
    }
    const normalized = parts.map(normalizePart).filter(Boolean);
    return normalized.length || allowEmpty ? normalized : [...DEFAULT_TEMPLATE_PARTS];
};

export const buildTemplateFromParts = (parts, { allowEmpty = false } = {}) => {
    const rendered = normalizeTemplateParts(parts, { allowEmpty })
        .map((part) => {
            if (part.type === "field") {
                return fieldById.get(part.id).placeholder;
            }
            if (part.type === "separator") {
                return separatorById.get(part.id).value;
            }
            return part.value;
        })
        .join("")
        .trim();
    return rendered || (allowEmpty ? "" : "{code} {title}");
};

const pushLiteralParts = (parts, literal) => {
    if (!literal) {
        return;
    }
    const exactSeparator = separatorByValue.get(literal);
    if (exactSeparator) {
        parts.push({ type: "separator", id: exactSeparator.id });
        return;
    }

    let remaining = literal;
    while (remaining.length > 0) {
        const separator = LOCAL_SCRAPE_NAMING_SEPARATORS.find((item) => remaining.startsWith(item.value));
        if (separator) {
            parts.push({ type: "separator", id: separator.id });
            remaining = remaining.slice(separator.value.length);
            continue;
        }
        const nextSeparatorIndex = LOCAL_SCRAPE_NAMING_SEPARATORS
            .map((item) => remaining.indexOf(item.value))
            .filter((index) => index > 0)
            .sort((a, b) => a - b)[0];
        const literalValue = nextSeparatorIndex ? remaining.slice(0, nextSeparatorIndex) : remaining;
        parts.push({ type: "literal", value: literalValue });
        remaining = remaining.slice(literalValue.length);
    }
};

export const parseTemplateToParts = (template, { allowEmpty = false } = {}) => {
    const source = String(template || "").trim();
    if (!source) {
        return allowEmpty ? [] : [...DEFAULT_TEMPLATE_PARTS];
    }

    const parts = [];
    let lastIndex = 0;
    for (const match of source.matchAll(placeholderPattern)) {
        pushLiteralParts(parts, source.slice(lastIndex, match.index));
        const fieldId = match[1];
        if (fieldById.has(fieldId)) {
            parts.push({ type: "field", id: fieldId });
        } else {
            parts.push({ type: "literal", value: match[0] });
        }
        lastIndex = match.index + match[0].length;
    }
    pushLiteralParts(parts, source.slice(lastIndex));
    return normalizeTemplateParts(parts, { allowEmpty });
};

export const moveTemplatePart = (parts, fromIndex, toIndex) => {
    const normalized = normalizeTemplateParts(parts, { allowEmpty: true });
    const sourceIndex = Number.parseInt(fromIndex, 10);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= normalized.length) {
        return normalized;
    }
    const targetIndex = Math.max(0, Math.min(normalized.length - 1, Number.parseInt(toIndex, 10)));
    const nextParts = normalized.slice();
    const [moved] = nextParts.splice(sourceIndex, 1);
    nextParts.splice(targetIndex, 0, moved);
    return nextParts;
};
