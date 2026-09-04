export const withSecretPlaceholders = (payload = {}) => ({
    javbus: payload.javbus || {},
    scrapers: {
        ...(payload.scrapers || {}),
        javstash: { ...(payload.scrapers?.javstash || {}), api_key: "" },
    },
    webdav: { ...(payload.webdav || {}), password: "" },
    aria2: { ...(payload.aria2 || {}), secret: "" },
    pikpak: { ...(payload.pikpak || {}), password: "" },
    pan115: { ...(payload.pan115 || {}), cookie: "" },
    magnet_health: payload.magnet_health || {},
});

export const buildSettingsPayload = (values = {}) => {
    const payload = {
        javbus: { ...(values.javbus || {}) },
        scrapers: { ...(values.scrapers || {}) },
        webdav: { ...(values.webdav || {}) },
        aria2: { ...(values.aria2 || {}) },
        pikpak: { ...(values.pikpak || {}) },
        pan115: { ...(values.pan115 || {}) },
        magnet_health: { ...(values.magnet_health || {}) },
    };

    if (!payload.webdav.password) {
        delete payload.webdav.password;
    }
    if (!payload.aria2.secret) {
        delete payload.aria2.secret;
    }
    if (!payload.pikpak.password) {
        delete payload.pikpak.password;
    }
    if (!payload.pan115.cookie) {
        delete payload.pan115.cookie;
    }
    payload.scrapers.javstash = { ...(payload.scrapers.javstash || {}) };
    if (!payload.scrapers.javstash.api_key) {
        delete payload.scrapers.javstash.api_key;
    }

    return payload;
};

