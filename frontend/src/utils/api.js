export const fetchWithRetry = async (url, options = {}, retries = 3, delay = 1000) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            let detail = "";
            try {
                detail = await response.text();
            } catch (error) {
                detail = "";
            }
            throw new Error(`HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
        }
        return await response.json();
    } catch (error) {
        if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
};

export const fetchClientConfig = async () => fetchWithRetry("/api/client-config");

export const fetchSystemSettings = async () => fetchWithRetry("/api/system/settings");

export const updateSystemSettings = async (settings) => fetchWithRetry(
    "/api/system/settings",
    {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
    },
    0
);

export const updateJavBusSettings = async (javbus) => fetchWithRetry(
    "/api/system/settings/javbus",
    {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ javbus }),
    },
    0
);

export const testMetadataScrapers = async (payload = {}) => fetchWithRetry(
    "/api/movies/metadata-scrapers/test",
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    },
    0
);

export const applyMetadataScraperTestResults = async (results = []) => fetchWithRetry(
    "/api/movies/metadata-scrapers/apply-test-results",
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
    },
    0
);

export const fetchAutomationTasks = async () => fetchWithRetry("/api/automation/tasks", {}, 0);

export const createAutomationTask = async (payload) => fetchWithRetry(
    "/api/automation/tasks",
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    },
    0
);

export const updateAutomationTask = async (taskId, payload) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}`,
    {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    },
    0
);

export const deleteAutomationTask = async (taskId) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
    0
);

export const runAutomationTask = async (taskId) => fetchWithRetry(
    `/api/automation/tasks/${encodeURIComponent(taskId)}/run`,
    { method: "POST" },
    0
);
