export const APP_THEME_KEY = 'javjaeger.theme';

export const loadAppTheme = () => {
    try {
        return window.localStorage.getItem(APP_THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
};

export const applyAppTheme = (mode) => {
    document.documentElement.dataset.theme = mode;
};

export const saveAppTheme = (mode) => {
    try {
        window.localStorage.setItem(APP_THEME_KEY, mode);
    } catch {
        // The current page can still switch themes when browser storage is unavailable.
    }
};

// Read the same CSS palette used by the application, including portaled Ant Design UI.
export const getAppThemeConfig = (mode) => {
    const style = getComputedStyle(document.documentElement);
    const color = name => style.getPropertyValue(`--color-${name}`).trim();
    return {
        algorithm: mode === 'light' ? window.antd.theme.defaultAlgorithm : window.antd.theme.darkAlgorithm,
        token: {
            colorPrimary: color('accent'),
            colorInfo: color('accent'),
            colorSuccess: color('success'),
            colorWarning: color('warning'),
            colorError: color('danger'),
            colorBgBase: color('bg'),
            colorBgLayout: color('bg'),
            colorBgContainer: color('surface'),
            colorBgElevated: color('elevated'),
            colorBorder: color('ring'),
            colorText: color('text'),
            colorTextSecondary: color('muted'),
            borderRadius: 8,
            fontFamily: 'Inter, system-ui, sans-serif',
        },
    };
};
