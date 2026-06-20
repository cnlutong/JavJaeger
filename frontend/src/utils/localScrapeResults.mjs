export const isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";

export const getVisibleLocalScrapeItems = (items = [], showNonConforming = false) => {
    const source = Array.isArray(items) ? items : [];
    if (showNonConforming) {
        return source;
    }
    return source.filter(isConformingLocalScrapeItem);
};

export const getDeletableNonConformingLocalScrapeKeys = (items = []) => {
    const source = Array.isArray(items) ? items : [];
    return source
        .filter((item) => !isConformingLocalScrapeItem(item) && item?.source_path)
        .map((item) => item.source_path);
};
