export const SUBTITLE_APPEARANCE_KEY = 'javjaeger.subtitleAppearance';
export const SUBTITLE_FONTS = [
    { value: 'sans', label: '黑体' },
    { value: 'serif', label: '衬线体' },
    { value: 'mono', label: '等宽字体' },
];
export const SUBTITLE_SIZES = [
    { value: 'small', label: '小' }, { value: 'normal', label: '标准' },
    { value: 'large', label: '大' }, { value: 'huge', label: '特大' },
];
export const SUBTITLE_BOTTOMS = [2, 4, 6, 8, 12];
export const DEFAULT_SUBTITLE_APPEARANCE = { font: 'sans', size: 'normal', bottom: 4 };

export function normalizeSubtitleAppearance(value) {
    return {
        font: SUBTITLE_FONTS.some(item => item.value === value?.font) ? value.font : 'sans',
        size: SUBTITLE_SIZES.some(item => item.value === value?.size) ? value.size : 'normal',
        bottom: SUBTITLE_BOTTOMS.includes(value?.bottom) ? value.bottom : 4,
    };
}

export function loadSubtitleAppearance() {
    try { return normalizeSubtitleAppearance(JSON.parse(window.localStorage.getItem(SUBTITLE_APPEARANCE_KEY))); }
    catch { return { ...DEFAULT_SUBTITLE_APPEARANCE }; }
}

export function saveSubtitleAppearance(value) {
    try { window.localStorage.setItem(SUBTITLE_APPEARANCE_KEY, JSON.stringify(normalizeSubtitleAppearance(value))); }
    catch { /* Keep the setting for this session when browser storage is unavailable. */ }
}
