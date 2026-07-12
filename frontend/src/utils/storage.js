const parseJson = (value, fallback = {}) => {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
};

export const loadPikPakSession = () => {
    const credentials = parseJson(window.sessionStorage.getItem("pikpakCredentials"), null);
    const isLoggedIn = window.sessionStorage.getItem("pikpakLoginStatus") === "true";
    const profile = parseJson(window.localStorage.getItem("pikpakProfile"), {});
    return {
        credentials,
        isLoggedIn: Boolean(credentials && isLoggedIn),
        profile,
    };
};

export const persistPikPakSession = (credentials) => {
    window.localStorage.setItem("pikpakProfile", JSON.stringify({ username: credentials.username || "" }));
    window.sessionStorage.setItem("pikpakCredentials", JSON.stringify(credentials));
    window.sessionStorage.setItem("pikpakLoginStatus", "true");
};

export const clearPikPakSession = () => {
    window.sessionStorage.removeItem("pikpakCredentials");
    window.sessionStorage.removeItem("pikpakLoginStatus");
};

export const loadWebDavSettings = () => ({
    ...parseJson(window.localStorage.getItem("webdavSettingsPublic"), {}),
    ...parseJson(window.sessionStorage.getItem("webdavSettingsSecret"), {}),
});

export const saveWebDavSettings = (values) => {
    window.localStorage.setItem(
        "webdavSettingsPublic",
        JSON.stringify({
            url: values.url || "",
            username: values.username || "",
        }),
    );
    window.sessionStorage.setItem(
        "webdavSettingsSecret",
        JSON.stringify({
            password: values.password || "",
        }),
    );
};

export const loadAria2Settings = () => ({
    ...parseJson(window.localStorage.getItem("aria2SettingsPublic"), {}),
    ...parseJson(window.sessionStorage.getItem("aria2SettingsSecret"), {}),
});

export const saveAria2Settings = (values) => {
    window.localStorage.setItem(
        "aria2SettingsPublic",
        JSON.stringify({
            url: values.url || "",
        }),
    );
    window.sessionStorage.setItem(
        "aria2SettingsSecret",
        JSON.stringify({
            secret: values.secret || "",
        }),
    );
};
