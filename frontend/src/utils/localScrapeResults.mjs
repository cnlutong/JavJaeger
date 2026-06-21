export const isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";

const FALLBACK_SCRAPE_REASONS = {
    recognized: "已识别番号，但当前预览未启用元数据刮削",
    unrecognized: "文件名未匹配到支持的番号格式",
    not_found: "已识别番号，但元数据源未返回影片信息",
    failed: "刮削过程中发生异常",
};

export const getNonConformingLocalScrapeItems = (items = []) => {
    const source = Array.isArray(items) ? items : [];
    return source.filter((item) => !isConformingLocalScrapeItem(item));
};

export const getVisibleLocalScrapeItems = (items = [], showNonConforming = false) => {
    const source = Array.isArray(items) ? items : [];
    if (showNonConforming) {
        return getNonConformingLocalScrapeItems(source);
    }
    return source.filter(isConformingLocalScrapeItem);
};

export const getDeletableNonConformingLocalScrapeKeys = (items = []) => {
    return getNonConformingLocalScrapeItems(items)
        .filter((item) => item?.source_path)
        .map((item) => item.source_path);
};

export const getLocalScrapeIssueReason = (item) => {
    if (!item || isConformingLocalScrapeItem(item)) {
        return "";
    }

    const explicitReason = String(item.scrape_reason || item.scrape_error || item.error || "").trim();
    if (explicitReason) {
        return explicitReason;
    }

    return FALLBACK_SCRAPE_REASONS[item.scrape_status] || "该文件未满足可刮削条件";
};

export const getLocalScrapeDiagnosticLogs = (item) => {
    const logs = Array.isArray(item?.scrape_logs) ? item.scrape_logs : [];
    return logs
        .map((entry) => {
            if (typeof entry === "string") {
                return { time: "", level: "info", message: entry };
            }
            if (!entry || typeof entry !== "object") {
                return null;
            }
            const message = String(entry.message || "").trim();
            if (!message) {
                return null;
            }
            const normalized = {
                time: String(entry.time || ""),
                message,
            };
            if (entry.level) {
                normalized.level = String(entry.level);
            }
            return normalized;
        })
        .filter(Boolean);
};
