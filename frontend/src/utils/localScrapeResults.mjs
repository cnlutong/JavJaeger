export const isConformingLocalScrapeItem = (item) => item?.scrape_status === "found";

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
