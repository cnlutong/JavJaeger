export const buildDefaultTask = () => ({
    name: "新的自动任务",
    enabled: false,
    trigger: { type: "auto", scheduled_time: null, interval_minutes: 60 },
    nodes: [
        { id: "trigger", type: "trigger", position: { x: 48, y: 110 }, config: {} },
        {
            id: "search",
            type: "search",
            position: { x: 296, y: 110 },
            config: { mode: "keyword", keyword: "", max_results: 10, filters: [], magnet: "exist", type: "normal", skip_existing: true },
        },
        {
            id: "magnet",
            type: "magnet",
            position: { x: 544, y: 110 },
            config: { source: "javbus", has_subtitle: undefined, exclude_4k: false, allow_chinese_subtitles: true },
        },
        { id: "download", type: "download", position: { x: 792, y: 110 }, config: { tool: "pikpak" } },
    ],
    edges: [
        { id: "edge-trigger-search", source: "trigger", target: "search" },
        { id: "edge-search-magnet", source: "search", target: "magnet" },
        { id: "edge-magnet-download", source: "magnet", target: "download" },
    ],
    runs: [],
});

