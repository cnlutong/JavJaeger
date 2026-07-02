const normalizeSource = (source, fallbackSource = "") => {
    const value = String(source || "").trim().toLowerCase();
    return value || String(fallbackSource || "").trim().toLowerCase();
};

const normalizeLink = (link) => String(link || "").trim();

export const selectHistoryRedispatchResource = (record, fallbackSource = "") => {
    const resources = Array.isArray(record?.download_resources) ? record.download_resources : [];
    for (let index = resources.length - 1; index >= 0; index -= 1) {
        const resource = resources[index];
        const link = normalizeLink(resource?.link || resource?.magnet || resource?.download_link || resource?.magnet_link);
        if (link) {
            return {
                link,
                source: normalizeSource(resource?.source || resource?.magnet_source || resource?.download_source, fallbackSource),
            };
        }
    }

    const links = Array.isArray(record?.download_links) ? record.download_links : [];
    for (let index = links.length - 1; index >= 0; index -= 1) {
        const link = normalizeLink(links[index]);
        if (link) {
            return {
                link,
                source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource),
            };
        }
    }

    const singleLink = normalizeLink(record?.download_link || record?.magnet_link || record?.link || record?.magnet);
    if (singleLink) {
        return {
            link: singleLink,
            source: normalizeSource(record?.source || record?.magnet_source || record?.download_source, fallbackSource),
        };
    }

    return null;
};

export const buildHistoryRedispatchPayload = (records, fallbackSource = "") => {
    return (Array.isArray(records) ? records : [])
        .filter((record) => record?.needs_reselect && record?.movie_id)
        .map((record) => {
            const resource = selectHistoryRedispatchResource(record, fallbackSource);
            if (!resource?.link) {
                return null;
            }
            return {
                link: resource.link,
                movie_id: String(record.movie_id || "").trim(),
                source: resource.source || normalizeSource("", fallbackSource),
            };
        })
        .filter(Boolean);
};
