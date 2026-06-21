import WebDavPage from "./WebDavPage.jsx";
import LocalScrapePage from "./LocalScrapePage.jsx";
import LocalLibraryPage from "./LocalLibraryPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import AutomationPage from "./AutomationPage.jsx";
import { fetchClientConfig, fetchWithRetry } from "../utils/api.js";
import {
    clearPikPakSession,
    loadAria2Settings,
    loadPikPakSession,
    loadWebDavSettings,
    persistPikPakSession,
    saveAria2Settings,
    saveWebDavSettings,
} from "../utils/storage.js";

const React = window.React;
const antd = window.antd;
const icons = window.icons || {};

const {
    Layout,
    Button,
    Drawer,
    Input,
    Form,
    Select,
    Card,
    Spin,
    message,
    Typography,
    Space,
    Divider,
    List,
    Tag,
    ConfigProvider,
    Segmented,
    Popconfirm,
} = antd;
const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const {
    ArrowLeftOutlined,
    ArrowRightOutlined,
    DatabaseOutlined,
    DownloadOutlined,
    FilterOutlined,
    GithubOutlined,
    HistoryOutlined,
    LinkOutlined,
    LoginOutlined,
    LogoutOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    SettingOutlined,
    ThunderboltOutlined,
} = icons;

const Icon = ({ as: Component }) => Component ? <Component /> : null;

const HEADER_BRAND_NAME = 'JavJaeger';
const HEADER_SLOGAN = '"人类的一切痛苦，都是因为性欲得不到满足" --弗洛伊德 峰';
const HEADER_SLOGAN_QUOTE = '"人类的一切痛苦，都是因为性欲得不到满足"';
const HEADER_SLOGAN_AUTHOR = ' --弗洛伊德 峰';
const RESOURCE_REQUEST_CONCURRENCY = 4;
const FILTER_TYPE_LABELS = {
    star: '演员',
    genre: '类别',
    director: '导演',
    studio: '制作商',
    label: '发行商',
    series: '系列',
};

const runWithConcurrency = async (items, limit, worker) => {
    if (!Array.isArray(items) || items.length === 0) {
        return;
    }

    let nextIndex = 0;
    const workerCount = Math.min(limit, items.length);
    const runners = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const item = items[nextIndex];
            nextIndex += 1;
            await worker(item);
        }
    });
    await Promise.all(runners);
};

// Main Application Component
export default function JavPage() {
    // ---- State ----
    const [collapsedLeft, setCollapsedLeft] = React.useState(false);
    const [collapsedRight, setCollapsedRight] = React.useState(false);
    const [versionInfo, setVersionInfo] = React.useState({
        version: "v1.0.0",
        build_date: "Unknown",
        asset_version: "",
        auto_reload_frontend: false,
    });
    const [activePage, setActivePage] = React.useState('jav');
    const [logoPreviewOpen, setLogoPreviewOpen] = React.useState(false);

    // UI State
    const [loading, setLoading] = React.useState(false);
    const [downloadingMovieIds, setDownloadingMovieIds] = React.useState({});
    const [moviesData, setMoviesData] = React.useState(null);
    const [magnetDataMap, setMagnetDataMap] = React.useState({});
    const [movieImageLoadErrorMap, setMovieImageLoadErrorMap] = React.useState({});
    const [movieDetailMap, setMovieDetailMap] = React.useState({});
    const [webdavConnected, setWebdavConnected] = React.useState(false);
    const [historyData, setHistoryData] = React.useState(null);
    const [currentPage, setCurrentPage] = React.useState(1);
    const [lastFilterValues, setLastFilterValues] = React.useState(null);
    const [lastMagnetSearchValues, setLastMagnetSearchValues] = React.useState(null);
    const [selectedFilters, setSelectedFilters] = React.useState([]);
    const [downloadTool, setDownloadTool] = React.useState(() => {
        try {
            return window.localStorage.getItem("downloadTool") || "pikpak";
        } catch (error) {
            return "pikpak";
        }
    });
    const [downloadToolConfigOpen, setDownloadToolConfigOpen] = React.useState(false);
    const [aria2Connected, setAria2Connected] = React.useState(false);

    // Filter Data State
    const [categories, setCategories] = React.useState({});
    const [actors, setActors] = React.useState({});

    // Main View Mode
    const [viewMode, setViewMode] = React.useState('search'); // 'search' | 'browseCategory' | 'browseActor'
    const [filterForm] = Form.useForm();
    const [magnetSettingsForm] = Form.useForm();
    const [webdavForm] = Form.useForm();
    const [aria2Form] = Form.useForm();
    const magnetRequestVersionRef = React.useRef({});
    const resourceLoadVersionRef = React.useRef(0);

    // Auth State
    const [isLoggedIn, setIsLoggedIn] = React.useState(false);
    const [pikpakCredentials, setPikpakCredentials] = React.useState(null);
    const [aria2Loading, setAria2Loading] = React.useState(false);
    const [webdavLoading, setWebdavLoading] = React.useState(false);
    const [clientConfig, setClientConfig] = React.useState({
        pikpak: { configured: false, enabled: false, username: "", auto_login: false },
        pan115: { configured: false, enabled: false, save_dir_id: "0", has_access_token: false, has_refresh_token: false },
    });
    const autoLoginTriggeredRef = React.useRef(false);

    React.useEffect(() => {
        if (window.versionInfo) {
            setVersionInfo(window.versionInfo);
        }
        // Load initial filter data
        fetch('/static/categories.json').then(res => res.json()).then(data => setCategories(data)).catch(console.error);
        fetch('/static/actors.json').then(res => res.json()).then(data => setActors(data)).catch(console.error);

        // Restore PikPak Login
        const savedSession = loadPikPakSession();
        if (savedSession.isLoggedIn && savedSession.credentials) {
            setPikpakCredentials(savedSession.credentials);
            setIsLoggedIn(true);
        }
        const savedWebDavSettings = loadWebDavSettings();
        const savedAria2Settings = loadAria2Settings();
        if (Object.keys(savedWebDavSettings || {}).length > 0) {
            webdavForm.setFieldsValue(savedWebDavSettings);
        }
        if (Object.keys(savedAria2Settings || {}).length > 0) {
            aria2Form.setFieldsValue(savedAria2Settings);
        }
        loadClientSideConfig();
        void loadDownloadToolStatus();
    }, []);

    React.useEffect(() => {
        if (!versionInfo.auto_reload_frontend || !versionInfo.asset_version) {
            return;
        }

        const timer = window.setInterval(async () => {
            try {
                const response = await fetch('/api/system/info', { cache: 'no-store' });
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                const latestAssetVersion = data?.version?.asset_version;
                if (latestAssetVersion && latestAssetVersion !== versionInfo.asset_version) {
                    window.location.reload();
                }
            } catch (error) {
                // Ignore polling errors to avoid noisy fallback behavior.
            }
        }, 5000);

        return () => {
            window.clearInterval(timer);
        };
    }, [versionInfo.auto_reload_frontend, versionInfo.asset_version]);

    React.useEffect(() => {
        if (
            clientConfig.pikpak.auto_login &&
            clientConfig.pikpak.configured &&
            !isLoggedIn &&
            !autoLoginTriggeredRef.current
        ) {
            autoLoginTriggeredRef.current = true;
            handlePikPakLoginFromConfig({ silent: true });
        }
    }, [clientConfig.pikpak.auto_login, clientConfig.pikpak.configured, isLoggedIn]);

    React.useEffect(() => {
        if (downloadTool !== 'aria2') {
            return undefined;
        }
        const timer = window.setInterval(() => {
            void loadDownloadToolStatus();
        }, 10000);
        return () => window.clearInterval(timer);
    }, [downloadTool]);

    React.useEffect(() => {
        if (!logoPreviewOpen) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                handleLogoPreviewClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [logoPreviewOpen]);

    const displayVersion = versionInfo.version && versionInfo.version.startsWith('v')
        ? versionInfo.version
        : `v${versionInfo.version}`;

    const resultMovies = moviesData && Array.isArray(moviesData.movies) ? moviesData.movies : [];
    const resultCount = resultMovies.length;
    const magnetsLoadedCount = resultMovies.filter(movie => Array.isArray(magnetDataMap[movie.id])).length;
    const magnetsReadyCount = resultMovies.filter(movie => {
        const magnets = magnetDataMap[movie.id];
        return Array.isArray(magnets) && magnets.length > 0;
    }).length;
    const currentMagnetSource = magnetSettingsForm.getFieldValue('magnetSource') || 'javbus';
    const isDownloadToolCurrentlyReady = (tool = downloadTool) => {
        if (tool === 'aria2') {
            return aria2Connected;
        }
        if (tool === '115') {
            return !!clientConfig.pan115?.configured;
        }
        return isLoggedIn || clientConfig.pikpak.configured;
    };
    const isCurrentDownloadToolReady = isDownloadToolCurrentlyReady(downloadTool);

    const handleLogoPreviewOpen = () => {
        setLogoPreviewOpen(true);
    };

    const handleLogoPreviewClose = () => {
        setLogoPreviewOpen(false);
    };

    const buildFilterCondition = (type, value, label) => {
        const normalizedType = String(type || '').trim();
        const normalizedValue = String(value || '').trim();
        if (!normalizedType || !normalizedValue) {
            return null;
        }
        return {
            type: normalizedType,
            value: normalizedValue,
            label: String(label || normalizedValue).trim(),
        };
    };

    const addSelectedFilter = (type, value, label) => {
        const nextFilter = buildFilterCondition(type, value, label);
        if (!nextFilter) {
            message.warning('请选择筛选类型并填写标签');
            return;
        }

        setSelectedFilters(prev => {
            const exists = prev.some(item => item.type === nextFilter.type && item.value === nextFilter.value);
            return exists ? prev : [...prev, nextFilter];
        });
    };

    const removeSelectedFilter = (type, value) => {
        setSelectedFilters(prev => prev.filter(item => item.type !== type || item.value !== value));
    };

    const buildFilterConditionsForSubmit = (values) => {
        if (selectedFilters.length > 0) {
            return selectedFilters;
        }
        const manualValue = values.filterValue || values.filterValueName;
        const manualLabel = values.filterValueName || values.filterValue;
        const manualFilter = buildFilterCondition(values.filterType, manualValue, manualLabel);
        return manualFilter ? [manualFilter] : [];
    };

    const buildNormalizedFilterValues = (values, page = 1) => {
        const activeFilters = Array.isArray(values.filters) ? values.filters : buildFilterConditionsForSubmit(values);
        const normalized = {
            ...values,
            filters: activeFilters,
        };
        if (page > 1) {
            normalized.page = page;
        } else {
            delete normalized.page;
        }
        return normalized;
    };

    const handleAddCurrentFilter = () => {
        const values = filterForm.getFieldsValue(['filterType', 'filterValue', 'filterValueName']);
        addSelectedFilter(values.filterType, values.filterValue || values.filterValueName, values.filterValueName);
    };

    const loadClientSideConfig = async () => {
        try {
            const config = await fetchClientConfig();
            setClientConfig(config);
            if (config?.webdav?.configured) {
                if (!webdavForm.getFieldValue("url") && config.webdav.url) {
                    webdavForm.setFieldsValue({ url: config.webdav.url });
                }
                if (!webdavForm.getFieldValue("username") && config.webdav.username) {
                    webdavForm.setFieldsValue({ username: config.webdav.username });
                }
            }
            if (config?.aria2?.configured && config.aria2.url && !aria2Form.getFieldValue("url")) {
                aria2Form.setFieldsValue({ url: config.aria2.url });
            }
        } catch (error) {
            console.error("Load client config error:", error);
        }
    };

    const loadDownloadToolStatus = async () => {
        try {
            const status = await fetchWithRetry('/api/webdav/status');
            setAria2Connected(!!status.aria2_connected);
            setWebdavConnected(!!status.webdav_connected);
            return status.aria2_connected;
        } catch (error) {
            setAria2Connected(false);
            setWebdavConnected(false);
            return false;
        }
    };

    const buildPikPakAuthPayload = () => {
        if (!isLoggedIn || !pikpakCredentials) {
            return {};
        }

        const payload = {};
        if (pikpakCredentials.username) {
            payload.username = pikpakCredentials.username;
        }
        if (pikpakCredentials.password) {
            payload.password = pikpakCredentials.password;
        }
        return payload;
    };

    const getDownloadToolConfig = (tool = downloadTool) => {
        const normalizedTool = tool === 'aria2' ? 'aria2' : tool === '115' ? '115' : 'pikpak';
        return {
            tool: normalizedTool,
            label: normalizedTool === 'aria2' ? 'Aria2' : normalizedTool === '115' ? '115网盘' : 'PikPak',
            requiresLogin: normalizedTool === 'pikpak',
            requiresConnection: normalizedTool === 'aria2',
            requiresConfig: normalizedTool === '115',
        };
    };

    const isDownloadToolReady = async (tool = downloadTool) => {
        const config = getDownloadToolConfig(tool);
        if (config.requiresLogin) {
            if (!isLoggedIn && !clientConfig.pikpak.configured) {
                message.warning('请先登录 PikPak 或在 config.json 中配置账号');
                return false;
            }
            return true;
        }
        if (config.requiresConnection) {
            const connected = await loadDownloadToolStatus();
            if (!connected) {
                message.warning('请先连接 Aria2 或检查配置');
                return false;
            }
            return true;
        }
        if (config.requiresConfig) {
            if (!clientConfig.pan115?.configured) {
                message.warning('请先在设置中配置 115 Open API access token');
                return false;
            }
            return true;
        }
        return true;
    };

    const dispatchMagnetDownloads = async (payload, tool = downloadTool) => {
        const magnetLinks = Array.isArray(payload) ? payload.map(item => item.link).filter(Boolean) : [];
        const movieIds = Array.isArray(payload)
            ? payload.map(item => item.movie_id).filter(Boolean)
            : [];
        if (magnetLinks.length === 0) {
            message.warning('没有可用的磁力链接');
            return { success: false, message: 'no_magnet' };
        }

        const config = getDownloadToolConfig(tool);
        if (config.requiresLogin) {
            if (!isLoggedIn && !clientConfig.pikpak.configured) {
                message.warning('请先登录 PikPak 或在 config.json 中配置账号');
                return { success: false };
            }
        } else if (config.requiresConnection && !aria2Connected) {
            const connected = await loadDownloadToolStatus();
            if (!connected) {
                message.warning('请先在 WebDAV 下载页面连接 Aria2');
                return { success: false };
            }
        } else if (config.requiresConfig && !clientConfig.pan115?.configured) {
            message.warning('请先在设置中配置 115 Open API access token');
            return { success: false };
        }

        const endpointMap = {
            aria2: '/api/aria2/download-magnets',
            '115': '/api/115/download',
            pikpak: '/api/pikpak/download',
        };
        const response = await fetch(
            endpointMap[config.tool] || endpointMap.pikpak,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    magnet_links: magnetLinks,
                    movie_ids: movieIds,
                    ...(config.tool === 'pikpak' ? buildPikPakAuthPayload() : {}),
                }),
            }
        );
        return await response.json();
    };

    const handleDownloadToolChange = (toolValue) => {
        const nextTool = toolValue === 'aria2' ? 'aria2' : toolValue === '115' ? '115' : 'pikpak';
        setDownloadTool(nextTool);
        try {
            window.localStorage.setItem("downloadTool", nextTool);
        } catch (error) {
            /* ignore */
        }
    };

    const openDownloadToolConfig = () => {
        setDownloadToolConfigOpen(true);
    };

    const closeDownloadToolConfig = () => {
        setDownloadToolConfigOpen(false);
    };

    // ---- API Calls ----
    const fetchMovieDetail = async (id, resourceVersion = null) => {
        try {
            const detail = await fetchWithRetry(`/api/movies/${encodeURIComponent(id)}`);
            if (detail && detail.id) {
                if (resourceVersion !== null && resourceLoadVersionRef.current !== resourceVersion) {
                    return;
                }
                setMovieDetailMap(prev => ({ ...prev, [id]: detail }));
            }
        } catch (e) { /* silent */ }
    };

    const getMagnetSettings = () => {
        const magnetSource = magnetSettingsForm.getFieldValue('magnetSource') || 'javbus';
        const exclude4k = !!magnetSettingsForm.getFieldValue('globalExclude4k');
        return { magnetSource, exclude4k };
    };

    const nextMagnetRequestVersion = (key) => {
        const nextVersion = (magnetRequestVersionRef.current[key] || 0) + 1;
        magnetRequestVersionRef.current[key] = nextVersion;
        return nextVersion;
    };

    const isLatestMagnetRequestVersion = (key, version) => magnetRequestVersionRef.current[key] === version;

    const buildMagnetDataMapFromResults = (magnetResults = []) => {
        const nextMap = {};
        magnetResults.forEach((result) => {
            if (!result || !result.movie_id || !result.link) {
                return;
            }
            nextMap[result.movie_id] = [{
                link: result.link,
                title: result.title || `${result.movie_id} - 最佳资源`,
                size: result.size || '未知',
                shareDate: result.shareDate || null,
                hasSubtitle: !!result.hasSubtitle
            }];
        });
        return nextMap;
    };

    const searchMovie = async (values) => {
        setLoading(true);
        setLastMagnetSearchValues(null);
        setMagnetDataMap({});
        setMovieDetailMap({});
        try {
            const data = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.keyword)}`);
            setMoviesData(data.movies ? data : { movies: [data] }); // Adapt payload
            if (data.movies) {
                loadMovieResources(data.movies);
            } else if (data.id) {
                loadMovieResources([data]);
            }
        } catch (error) {
            message.error('搜索失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const filterMovies = async (values, page = 1) => {
        const normalizedValues = buildNormalizedFilterValues(values, page);
        const activeFilters = normalizedValues.filters;
        setLoading(true);
        setLastMagnetSearchValues(null);
        if (page === 1) {
            setMagnetDataMap({});
            setMovieDetailMap({});
        }
        try {
            const queryParams = new URLSearchParams();
            if (activeFilters.length > 0) {
                queryParams.append('filters', JSON.stringify(activeFilters));
            } else if (normalizedValues.filterType) {
                queryParams.append('filterType', normalizedValues.filterType);
                queryParams.append('filterValue', normalizedValues.filterValue);
            }
            if (normalizedValues.magnet) queryParams.append('magnet', normalizedValues.magnet);
            if (normalizedValues.type) queryParams.append('type', normalizedValues.type);
            if (normalizedValues.actorCountFilter) queryParams.append('actorCountFilter', normalizedValues.actorCountFilter);
            if (normalizedValues.hasSubtitle) queryParams.append('hasSubtitle', normalizedValues.hasSubtitle);
            if (page > 1) queryParams.append('page', page);

            const apiUrl = normalizedValues.fetchMode === 'all'
                ? `/api/movies/all?${queryParams.toString()}`
                : `/api/movies?${queryParams.toString()}`;

            const data = await fetchWithRetry(apiUrl);
            setMoviesData(data);
            setCurrentPage(page);
            setLastFilterValues(normalizedValues);
            if (data.movies) {
                loadMovieResources(data.movies);
            }
        } catch (error) {
            message.error('筛选失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const handleFilterPageChange = (nextPage) => {
        if (!lastFilterValues || loading) {
            return;
        }
        if (nextPage < 1) {
            return;
        }

        const formValues = filterForm.getFieldsValue(true);
        const normalizedValues = {
            ...lastFilterValues,
            ...formValues,
        };
        const syncedValues = buildNormalizedFilterValues(normalizedValues, nextPage);
        filterMovies(syncedValues, nextPage);
    };

    const searchMagnet = async (values) => {
        setLoading(true);
        setLastMagnetSearchValues(values);
        const requestVersion = nextMagnetRequestVersion(values.movieId);
        try {
            const { magnetSource, exclude4k } = getMagnetSettings();

            // Set mock moviesData to show the result section
            setMoviesData({ movies: [{ id: values.movieId, title: `查询磁力: ${values.movieId}` }] });
            setMagnetDataMap({});

            const queryParams = new URLSearchParams();
            queryParams.append('source', magnetSource);
            if (exclude4k) queryParams.append('exclude4k', 'true');
            if (values.sortBy) queryParams.append('sortBy', values.sortBy);
            if (values.sortOrder) queryParams.append('sortOrder', values.sortOrder);
            if (values.hasSubtitle) queryParams.append('hasSubtitle', values.hasSubtitle);

            if (magnetSource !== 'cilisousuo') {
                const movieData = await fetchWithRetry(`/api/movies/${encodeURIComponent(values.movieId)}`);
                if (!movieData || !movieData.gid || movieData.uc === undefined) {
                    throw new Error('无法获取影片详情或必要参数');
                }
                queryParams.append('gid', movieData.gid);
                queryParams.append('uc', movieData.uc);
            }

            const magnets = await fetchWithRetry(`/api/magnets/${encodeURIComponent(values.movieId)}?${queryParams.toString()}`);
            if (!isLatestMagnetRequestVersion(values.movieId, requestVersion)) {
                return;
            }
            setMagnetDataMap({ [values.movieId]: magnets || [] });
        } catch (error) {
            if (!isLatestMagnetRequestVersion(values.movieId, requestVersion)) {
                return;
            }
            message.error('获取磁力链接失败');
            setMoviesData(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchBestMagnet = async (id, gid, uc) => {
        const { magnetSource, exclude4k } = getMagnetSettings();
        const requestVersion = nextMagnetRequestVersion(id);
        const queryParams = new URLSearchParams();
        queryParams.append('source', magnetSource);
        if (exclude4k) queryParams.append('exclude4k', 'true');
        if (magnetSource !== 'cilisousuo') {
            if (gid) queryParams.append('gid', gid);
            if (uc !== undefined) queryParams.append('uc', uc);
        }
        queryParams.append('sortBy', 'size');
        queryParams.append('sortOrder', 'desc');

        const hasSubtitle = filterForm.getFieldValue('hasSubtitle');
        if (hasSubtitle) queryParams.append('hasSubtitle', hasSubtitle);

        try {
            const data = await fetchWithRetry(`/api/magnets/${encodeURIComponent(id)}?${queryParams.toString()}`);
            if (!isLatestMagnetRequestVersion(id, requestVersion)) {
                return;
            }
            setMagnetDataMap(prev => ({ ...prev, [id]: data || [] }));
        } catch (error) {
            if (!isLatestMagnetRequestVersion(id, requestVersion)) {
                return;
            }
            setMagnetDataMap(prev => ({ ...prev, [id]: [] }));
        }
    };

    const loadMovieResources = (movies = []) => {
        const resourceVersion = resourceLoadVersionRef.current + 1;
        resourceLoadVersionRef.current = resourceVersion;
        void runWithConcurrency(movies, RESOURCE_REQUEST_CONCURRENCY, async (movie) => {
            await Promise.all([
                fetchBestMagnet(movie.id, movie.gid, movie.uc),
                fetchMovieDetail(movie.id, resourceVersion),
            ]);
        });
    };

    const handleMagnetSettingsChange = () => {
        if (lastMagnetSearchValues && moviesData && moviesData.movies && moviesData.movies.length === 1 && moviesData.movies[0].id === lastMagnetSearchValues.movieId) {
            searchMagnet(lastMagnetSearchValues);
            return;
        }

        if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
            return;
        }

        setMagnetDataMap({});
        void runWithConcurrency(moviesData.movies, RESOURCE_REQUEST_CONCURRENCY, (movie) => fetchBestMagnet(movie.id, movie.gid, movie.uc));
    };

    const handlePikPakLogin = async (values) => {
        setLoading(true);
        try {
            const response = await fetch('/api/pikpak/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const result = await response.json();
            if (result.success) {
                setIsLoggedIn(true);
                setPikpakCredentials(values);
                persistPikPakSession(values);
                message.success('登录成功！');
            } else {
                message.error('登录失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            message.error('登录异常');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        clearPikPakSession();
        setIsLoggedIn(false);
        setPikpakCredentials(null);
        message.info('已退出登录');
    };

    const handleRecognizeMovie = async (values) => {
        setLoading(true);
        setMoviesData(null);
        setMagnetDataMap({});
        try {
            const { magnetSource } = getMagnetSettings();
            const shouldAutoDownload = values.autoDownload || false;
            const usePikPakWorkflowAutoDownload = shouldAutoDownload && downloadTool === 'pikpak';
            const requestBody = {
                html_content: values.htmlContent,
                auto_download: usePikPakWorkflowAutoDownload,
                magnet_source: magnetSource,
                has_subtitle_filter: values.hasSubtitle || null,
                exclude_4k: values.exclude4k || false
            };
            if (usePikPakWorkflowAutoDownload && isLoggedIn && pikpakCredentials) {
                Object.assign(requestBody, buildPikPakAuthPayload());
            }

            const response = await fetch('/api/movies/recognize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();

            if (data.error) {
                message.error(`错误: ${data.error}`);
            } else {
                setMoviesData(data); // Expecting data.movies, data.magnet_results, data.download_result
                if (data.magnet_results) {
                    setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
                }
                message.success('识别完成');
                if (shouldAutoDownload && downloadTool !== 'pikpak' && data.magnet_results?.length > 0) {
                    const dispatchResult = await dispatchMagnetDownloads(data.magnet_results);
                    if (dispatchResult && dispatchResult.success) {
                        message.success(dispatchResult.message || `已提交 ${getDownloadToolConfig().label} 下载任务`);
                    } else {
                        message.error(`下载失败: ${dispatchResult?.message || '未知错误'}`);
                    }
                }
            }
        } catch (error) {
            message.error('影片识别失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCodeDownload = async (values) => {
        setLoading(true);
        setMoviesData(null);
        setMagnetDataMap({});
        try {
            const { magnetSource } = getMagnetSettings();
            const shouldAutoDownload = values.autoDownload || false;
            const usePikPakWorkflowAutoDownload = shouldAutoDownload && downloadTool === 'pikpak';
            const requestBody = {
                movie_codes: values.movieCodes,
                auto_download: usePikPakWorkflowAutoDownload,
                magnet_source: magnetSource,
                has_subtitle_filter: values.hasSubtitle || null,
                exclude_4k: values.exclude4k || false
            };
            if (usePikPakWorkflowAutoDownload && isLoggedIn && pikpakCredentials) {
                Object.assign(requestBody, buildPikPakAuthPayload());
            }

            const response = await fetch('/api/movies/download-by-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const data = await response.json();

            if (data.error) {
                message.error(`错误: ${data.error}`);
                return;
            }

            const movies = (data.found_movies || []).map(movie => ({
                id: movie.id,
                title: movie.title,
                date: movie.date,
                img: movie.img,
                status: movie.status
            }));
            setMoviesData({ movies, magnet_results: data.magnet_results || [], download_result: data.download_result, not_found_codes: data.not_found_codes || [] });
            if (data.magnet_results) {
                setMagnetDataMap(buildMagnetDataMapFromResults(data.magnet_results));
            }
            message.success(data.message || '处理完成');
            if (shouldAutoDownload && downloadTool !== 'pikpak' && data.magnet_results?.length > 0) {
                const dispatchResult = await dispatchMagnetDownloads(data.magnet_results);
                if (dispatchResult && dispatchResult.success) {
                    message.success(dispatchResult.message || `已提交 ${getDownloadToolConfig().label} 下载任务`);
                } else {
                    message.error(`下载失败: ${dispatchResult?.message || '未知错误'}`);
                }
            }
        } catch (error) {
            message.error('番号处理失败');
        } finally {
            setLoading(false);
        }
    };

    const handlePikPakLoginFromConfig = async ({ silent = false } = {}) => {
        setLoading(true);
        try {
            const response = await fetch('/api/pikpak/login-config', {
                method: 'POST'
            });
            const result = await response.json();
            if (result.success) {
                const sessionProfile = { username: result.username || clientConfig.pikpak.username || '', fromConfig: true };
                setIsLoggedIn(true);
                setPikpakCredentials(sessionProfile);
                persistPikPakSession(sessionProfile);
                if (!silent) {
                    message.success('已使用配置登录 PikPak');
                }
            } else if (!silent) {
                message.error('登录失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            if (!silent) {
                message.error('配置登录异常');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadAllMovies = async () => {
        if (!await isDownloadToolReady()) {
            return;
        }
        if (!moviesData || !moviesData.movies || moviesData.movies.length === 0) {
            message.warning('没有可下载的影片');
            return;
        }

        const magnetLinks = [];
        const movieIds = [];
        for (const movie of moviesData.movies) {
            if (movie.status === 'local_exists' || movie.status === 'already_downloaded' || movie.is_downloaded || movie.in_local_library) {
                continue;
            }
            const magnets = magnetDataMap[movie.id];
            if (magnets && magnets.length > 0) {
                const best = magnets[0];
                const link = best.link;
                if (link) {
                    magnetLinks.push(link);
                    movieIds.push(movie.id);
                }
            }
        }

        if (magnetLinks.length === 0) {
            message.warning('暂无可用的磁力链接，请等待加载完成');
            return;
        }

        try {
            setLoading(true);
            const result = await dispatchMagnetDownloads(
                magnetLinks.map((link, index) => ({ link, movie_id: movieIds[index] })),
                downloadTool
            );
            if (result.success) {
                message.success(result.message || `已添加 ${magnetLinks.length} 个下载任务`);
            } else {
                message.error('下载失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            message.error('下载请求失败');
        } finally {
            setLoading(false);
        }
    };

    const handleWebdavConnect = async (values) => {
        setWebdavLoading(true);
        const formData = new FormData();
        formData.append("webdav_url", values.url || "");
        formData.append("username", values.username || "");
        formData.append("password", values.password || "");
        try {
            const response = await fetch("/api/webdav/connect", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            if (result.success) {
                saveWebDavSettings(values);
                setWebdavConnected(true);
                loadDownloadToolStatus();
                message.success("WebDAV连接成功");
            } else {
                setWebdavConnected(false);
                message.error(result.message || "WebDAV连接失败");
            }
        } catch (error) {
            setWebdavConnected(false);
            message.error("WebDAV连接异常");
        } finally {
            setWebdavLoading(false);
        }
    };

    const handleAria2Connect = async (values) => {
        setAria2Loading(true);
        const formData = new FormData();
        formData.append("aria2_url", values.url || "");
        formData.append("aria2_secret", values.secret || "");
        try {
            const response = await fetch("/api/aria2/connect", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();
            if (result.success) {
                saveAria2Settings(values);
                setAria2Connected(true);
                loadDownloadToolStatus();
                message.success("Aria2连接成功");
            } else {
                setAria2Connected(false);
                message.error(result.message || "Aria2连接失败");
            }
        } catch (error) {
            setAria2Connected(false);
            message.error("Aria2连接异常");
        } finally {
            setAria2Loading(false);
        }
    };

    const handleWebdavConnectFromConfig = async ({ silent = false } = {}) => {
        setWebdavLoading(true);
        try {
            const response = await fetch("/api/webdav/connect-config", { method: "POST" });
            const result = await response.json();
            if (result.success) {
                if (clientConfig.webdav?.url || clientConfig.webdav?.username) {
                    webdavForm.setFieldsValue({
                        url: clientConfig.webdav.url || "",
                        username: clientConfig.webdav.username || "",
                    });
                }
                setWebdavConnected(true);
                loadDownloadToolStatus();
                if (!silent) {
                    message.success("已使用配置连接 WebDAV");
                }
            } else {
                setWebdavConnected(false);
                if (!silent) {
                    message.error(result.message || "使用配置连接失败");
                }
            }
        } catch (error) {
            setWebdavConnected(false);
            if (!silent) {
                message.error("WebDAV 配置连接异常");
            }
        } finally {
            setWebdavLoading(false);
        }
    };

    const handleAria2ConnectFromConfig = async ({ silent = false } = {}) => {
        setAria2Loading(true);
        try {
            const response = await fetch("/api/aria2/connect-config", { method: "POST" });
            const result = await response.json();
            if (result.success) {
                if (clientConfig.aria2?.url) {
                    aria2Form.setFieldsValue({ url: clientConfig.aria2.url });
                }
                setAria2Connected(true);
                loadDownloadToolStatus();
                if (!silent) {
                    message.success("已使用配置连接 Aria2");
                }
            } else {
                setAria2Connected(false);
                if (!silent) {
                    message.error(result.message || "使用配置连接失败");
                }
            }
        } catch (error) {
            setAria2Connected(false);
            if (!silent) {
                message.error("Aria2 配置连接异常");
            }
        } finally {
            setAria2Loading(false);
        }
    };

    const handleDownloadMovie = async (movie) => {
        if (!await isDownloadToolReady()) {
            return;
        }
        if (!movie || !movie.id) {
            return;
        }
        const magnets = magnetDataMap[movie.id];
        const bestMagnet = magnets && magnets.length > 0 ? magnets[0] : null;
        if (!bestMagnet || !bestMagnet.link) {
            message.warning('该影片暂无可用磁力链接');
            return;
        }

        if (movie.status === 'local_exists' || movie.status === 'already_downloaded' || movie.is_downloaded || movie.in_local_library) {
            message.info('该影片已下载或本地已存在');
            return;
        }

        setDownloadingMovieIds(prev => ({ ...prev, [movie.id]: true }));
        try {
            const result = await dispatchMagnetDownloads([{ link: bestMagnet.link, movie_id: movie.id }], downloadTool);
            if (result.success) {
                message.success(result.message || `${movie.id} 已添加下载任务`);
            } else {
                message.error('下载失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            message.error('下载请求失败');
        } finally {
            setDownloadingMovieIds(prev => ({ ...prev, [movie.id]: false }));
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        setViewMode('history');
        try {
            const data = await fetchWithRetry('/api/history');
            setHistoryData(data);
            message.success('已加载历史记录');
        } catch (error) {
            message.error('获取历史记录失败');
        } finally {
            setLoading(false);
        }
    };

    const handleClearHistory = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/history', { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                message.success('历史记录已清空');
                setHistoryData([]);
            } else {
                message.error('清空历史记录失败: ' + (result.message || '未知错误'));
            }
        } catch (error) {
            message.error('请求清空历史记录失败');
        } finally {
            setLoading(false);
        }
    };

    // ---- Render Helpers ----
    const renderContent = () => {
        if (viewMode === 'history') {
            return renderHistory();
        }
        if (viewMode === 'browseCategory') {
            return renderCategoryGroups();
        }
        if (viewMode === 'browseActor') {
            return renderActorsList();
        }

        if (loading) {
            return (
                <div className="jav-state-panel">
                    <Spin size="large" />
                    <Text type="secondary">正在搜索...</Text>
                </div>
            );
        }

        if (!moviesData) {
            return (
                <div className="jav-state-panel">
                    <Text type="secondary">没有任何结果，请在左侧选择查询功能开始搜索</Text>
                </div>
            );
        }

        // Handle error responses directly from backend
        if (moviesData.error) {
            return (
                <div className="jav-state-panel">
                    <Text type="danger">{moviesData.error}</Text>
                </div>
            );
        }

        // Handle Actor payload
        if (moviesData.id && !moviesData.gid && !moviesData.uc && moviesData.avatar) {
            return (
                <Card style={{ marginBottom: 16, textAlign: 'center' }}>
                    <img src={moviesData.avatar} alt={moviesData.name} style={{ width: 150, height: 150, borderRadius: '50%', objectFit: 'cover' }} />
                    <Title level={4} style={{ marginTop: 16 }}>{moviesData.name}</Title>
                </Card>
            );
        }

        // Handle Array of Movies
        if (moviesData.movies && moviesData.movies.length > 0) {
            const isPageMode = lastFilterValues && lastFilterValues.fetchMode !== 'all';
            const canGoPrev = isPageMode && lastFilterValues && currentPage > 1;
            const canGoNext = isPageMode && lastFilterValues && moviesData.movies.length >= 30;
            const paginationBar = isPageMode && lastFilterValues && (
                <div className="jav-pagination-bar">
                    <Button
                        icon={<Icon as={ArrowLeftOutlined} />}
                        disabled={!canGoPrev || loading}
                        onClick={() => handleFilterPageChange(currentPage - 1)}
                    >上一页</Button>
                    <Text type="secondary">第 {currentPage} 页</Text>
                    <Button
                        icon={<Icon as={ArrowRightOutlined} />}
                        disabled={!canGoNext || loading}
                        onClick={() => handleFilterPageChange(currentPage + 1)}
                    >下一页</Button>
                </div>
            );
            return (
                <div className="jav-results-list">
                    <div className="jav-results-meta">
                        <Text type="secondary">共 {moviesData.movies.length} 部</Text>
                    </div>
                    {paginationBar}
                    {moviesData.movies.map(movie => renderMovieCard(movie))}
                    {paginationBar}
                </div>
            );
        }

        return (
            <div className="jav-state-panel">
                <Text type="secondary">未找到相关数据</Text>
            </div>
        );
    };

    // ---- Browse Handlers ----
    const handleCategorySelect = (code, name) => {
        filterForm.setFieldsValue({ filterType: 'genre', filterValue: code, filterValueName: name });
        addSelectedFilter('genre', code, name);
        setViewMode('search');
    };

    const handleActorSelect = (code, name) => {
        filterForm.setFieldsValue({ filterType: 'star', filterValue: code, filterValueName: name });
        addSelectedFilter('star', code, name);
        setViewMode('search');
    };

    const renderCategoryGroups = () => {
        return (
            <div>
                <div className="jav-section-header">
                    <Title level={4} style={{ margin: 0 }}>浏览类别</Title>
                    <Button icon={<Icon as={ArrowLeftOutlined} />} onClick={() => setViewMode('search')}>返回查询</Button>
                </div>
                <Divider className="jav-section-divider" />
                {Object.keys(categories).map(group => (
                    <div key={group} style={{ marginBottom: 24 }}>
                        <Title level={5}>{group}</Title>
                        <List
                            grid={{ gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
                            dataSource={categories[group]}
                            renderItem={cat => (
                                <List.Item>
                                    <Card
                                        hoverable
                                        size="small"
                                        className="jav-picker-card"
                                        onClick={() => handleCategorySelect(cat.code, cat.name)}
                                    >
                                        <Text strong style={{ fontSize: 16 }}>{cat.name}</Text>
                                    </Card>
                                </List.Item>
                            )}
                        />
                    </div>
                ))}
            </div>
        );
    };

    const renderHistory = () => {
        return (
            <div>
                <div className="jav-section-header">
                    <Title level={4} style={{ margin: 0 }}>历史下载记录</Title>
                    <Space>
                        <Popconfirm
                            title="确定要清空所有历史记录吗？"
                            onConfirm={handleClearHistory}
                            okText="确定"
                            cancelText="取消"
                        >
                            <Button danger disabled={!historyData || historyData.length === 0} loading={loading}>清空历史记录</Button>
                        </Popconfirm>
                        <Button icon={<Icon as={ArrowLeftOutlined} />} onClick={() => setViewMode('search')}>返回查询</Button>
                    </Space>
                </div>
                <Divider className="jav-section-divider" />
                <antd.Table
                    dataSource={historyData || []}
                    rowKey="movie_id"
                    pagination={{ pageSize: 20 }}
                    columns={[
                        {
                            title: '影片番号',
                            dataIndex: 'movie_id',
                            key: 'movie_id',
                            render: text => <Text strong>{text}</Text>
                        },
                        {
                            title: '影片名',
                            dataIndex: 'title',
                            key: 'title',
                            render: text => text ? <Text ellipsis={{ tooltip: text }} style={{ maxWidth: 200 }}>{text}</Text> : '-'
                        },
                        {
                            title: '演员',
                            dataIndex: 'stars',
                            key: 'stars',
                            render: tags => (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {tags && Array.isArray(tags) ? tags.map(tag => (
                                        <Tag color="magenta" key={tag}>
                                            {tag}
                                        </Tag>
                                    )) : '-'}
                                </div>
                            )
                        },
                        {
                            title: '类型',
                            dataIndex: 'genres',
                            key: 'genres',
                            render: tags => (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {tags && Array.isArray(tags) ? tags.map(tag => (
                                        <Tag color="cyan" key={tag}>
                                            {tag}
                                        </Tag>
                                    )) : '-'}
                                </div>
                            )
                        },
                        {
                            title: '发布时间',
                            dataIndex: 'date',
                            key: 'date',
                            render: text => text || '-'
                        },
                        {
                            title: '下载时间',
                            dataIndex: 'download_time',
                            key: 'download_time',
                            render: text => {
                                if (!text) return '未知时间';
                                const d = new Date(text);
                                return isNaN(d.getTime()) ? text : d.toLocaleString();
                            }
                        },
                        {
                            title: '操作',
                            key: 'action',
                            render: (_, record) => (
                                <Button type="primary" size="small" onClick={() => {
                                    setViewMode('search');
                                    searchMovie({ keyword: record.movie_id });
                                }}>
                                    详情搜索
                                </Button>
                            )
                        }
                    ]}
                />
            </div>
        );
    };

    const renderActorsList = () => {
        return (
            <div>
                <div className="jav-section-header">
                    <Title level={4} style={{ margin: 0 }}>浏览演员</Title>
                    <Button icon={<Icon as={ArrowLeftOutlined} />} onClick={() => setViewMode('search')}>返回查询</Button>
                </div>
                <Divider className="jav-section-divider" />
                <List
                    grid={{ gutter: 16, xs: 2, sm: 3, md: 4, lg: 5, xl: 5, xxl: 5 }}
                    dataSource={Array.isArray(actors) ? actors : Object.values(actors).flat()}
                    renderItem={actor => {
                        const actorName = actor.name || actor;
                        const actorCode = actor.code || actor;
                        const fallbackImage = <div className="jav-actor-fallback"><Text type="secondary">无头像</Text></div>;

                        return (
                            <List.Item>
                                <Card
                                    hoverable
                                    className="jav-actor-card"
                                    cover={actor.avatar ? <img alt={actorName} src={actor.avatar} className="jav-actor-cover" /> : fallbackImage}
                                    onClick={() => handleActorSelect(actorCode, actorName)}
                                    size="small"
                                >
                                    <Card.Meta title={actorName} style={{ textAlign: 'center' }} />
                                </Card>
                            </List.Item>
                        )
                    }}
                />
            </div>
        );
    };

    const renderMovieCard = (movie) => {
        const magnets = magnetDataMap[movie.id];
        const hasMagnets = magnets && magnets.length > 0;
        const bestMagnet = hasMagnets ? magnets[0] : null;
        const magnetLoading = !magnets;
        const detail = movieDetailMap[movie.id];
        const isDownloadingMovie = !!downloadingMovieIds[movie.id];
        const isMovieDownloaded = movie.status === 'local_exists' || movie.status === 'already_downloaded' || movie.is_downloaded || movie.in_local_library;
        const rawMovieImage = (movie && movie.img) || (detail && detail.img) || '';
        const movieImage = rawMovieImage && /^https?:/i.test(rawMovieImage)
            ? `/api/image-proxy?url=${encodeURIComponent(rawMovieImage)}`
            : rawMovieImage;
        const showImage = movieImage && !movieImageLoadErrorMap[movie.id];
        const stars = detail && detail.stars ? detail.stars.map(s => s.name || s).filter(Boolean) : [];
        const genres = detail && detail.genres ? detail.genres.map(g => g.name || g).filter(Boolean) : [];

        return (
            <Card
                key={movie.id}
                size="small"
                hoverable
                className="jav-movie-card"
                styles={{ body: { padding: '10px 16px' } }}
            >
                <div className="jav-movie-content-row" style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                    <div
                        style={{
                            flex: '0 0 126px',
                            width: 126,
                            aspectRatio: '2 / 3',
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#f5f5f5',
                            border: '1px solid #e5e7eb'
                        }}
                    >
                        {showImage ? (
                            <img
                                src={movieImage}
                                alt={movie.title || movie.full_title || movie.id}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                onError={() => setMovieImageLoadErrorMap(prev => {
                                    if (prev[movie.id]) {
                                        return prev;
                                    }
                                    return { ...prev, [movie.id]: true };
                                })}
                                loading="lazy"
                            />
                        ) : (
                            <div style={{
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#8c8c8c',
                                fontSize: 12
                            }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>暂无封面</Text>
                            </div>
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        {/* Row 1: ID + date */}
                        <div className="jav-movie-row jav-movie-meta-row">
                            <Tag color="blue" style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{movie.id}</Tag>
                            {(movie.status === 'local_exists' || movie.in_local_library) && <Tag color="purple" style={{ margin: 0, fontSize: 12 }}>本地已有</Tag>}
                            {(movie.status === 'already_downloaded' || movie.is_downloaded) && <Tag color="green" style={{ margin: 0, fontSize: 12 }}>已下载</Tag>}
                            {movie.date && <Text type="secondary" style={{ fontSize: 12 }}>{movie.date}</Text>}
                        </div>

                        {/* Row 2: Title */}
                        <Text strong className="jav-movie-title"
                            title={movie.title || movie.full_title}>
                            {movie.title || movie.full_title}
                        </Text>

                        {/* Row 3: Stars */}
                        {stars.length > 0 && (
                            <div className="jav-movie-row">
                                <Text type="secondary" style={{ fontSize: 12 }}>演员</Text>
                                {stars.map(s => <Tag key={s} color="magenta" style={{ margin: 0, fontSize: 12 }}>{s}</Tag>)}
                            </div>
                        )}

                        {/* Row 4: Genres */}
                        {genres.length > 0 && (
                            <div className="jav-movie-row">
                                <Text type="secondary" style={{ fontSize: 12 }}>类型</Text>
                                {genres.slice(0, 8).map(g => <Tag key={g} color="cyan" style={{ margin: 0, fontSize: 12 }}>{g}</Tag>)}
                                {genres.length > 8 && <Text type="secondary" style={{ fontSize: 12 }}>+{genres.length - 8}</Text>}
                            </div>
                        )}

                        {/* Row 5: Magnet 链接 */}
                        <Divider style={{ margin: '6px 0' }} />
                        <div className="jav-magnet-row">
                            {magnetLoading && <><Spin size="small" /><Text type="secondary" style={{ fontSize: 12 }}>搜索磁力链接...</Text></>}
                            {magnets && magnets.length === 0 && <Text type="danger" style={{ fontSize: 12 }}>暂无可用资源</Text>}
                            {hasMagnets && (
                                <>
                                    <Tag color="gold" style={{ margin: 0, fontSize: 12, flexShrink: 0 }}>最佳</Tag>
                                    {bestMagnet.hasSubtitle && <Tag color="green" style={{ margin: 0, fontSize: 12, flexShrink: 0 }}>字幕</Tag>}
                                    <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{bestMagnet.size}</Text>
                                    {bestMagnet.shareDate && <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>{bestMagnet.shareDate}</Text>}
                                    <a
                                        href={bestMagnet.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="jav-magnet-link"
                                        title={bestMagnet.title}
                                    >
                                        {bestMagnet.title}
                                    </a>
                                </>
                            )}
                        </div>
                            <div style={{ marginTop: 'auto', marginLeft: 'auto' }}>
                                <Button
                                    type="primary"
                                    size="small"
                                    icon={<Icon as={DownloadOutlined} />}
                                    loading={isDownloadingMovie}
                                    disabled={magnetLoading || !bestMagnet || isMovieDownloaded || !isCurrentDownloadToolReady}
                                    onClick={() => handleDownloadMovie(movie)}
                                >
                                    立即下载
                                </Button>
                        </div>
                    </div>
                </div>
            </Card>
        );
    };

    const renderStandalonePage = (page) => {
        const pageContent = {
            localScrape: <LocalScrapePage />,
            localLibrary: <LocalLibraryPage />,
            automation: <AutomationPage />,
            settings: <SettingsPage />,
            webdav: <WebDavPage />,
        }[page] || <WebDavPage />;

        return (
            <Layout className="jav-workspace jav-page-workspace">
                <Content className="jav-content jav-page-content">
                    <section className="jav-results-panel jav-page-panel">
                        {pageContent}
                    </section>
                </Content>
            </Layout>
        );
    };


    // ---- Render ---
    return (
        <ConfigProvider
            theme={{
                token: {
                    colorPrimary: '#1677ff',
                    colorInfo: '#1677ff',
                    colorSuccess: '#52c41a',
                    colorWarning: '#faad14',
                    colorError: '#ff4d4f',
                    colorBgLayout: '#f5f5f5',
                    colorBorder: '#d9d9d9',
                    borderRadius: 6,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                },
            }}
        >
            <div className="jav-app">
                <Layout className="jav-app-layout">
                    <Header className="jav-header">
                        <div className="jav-header-left">
                            <div className="jav-brand">
                                <button
                                    type="button"
                                    className="jav-brand-logo-button"
                                    aria-label="查看 JavJaeger logo 大图"
                                    onClick={handleLogoPreviewOpen}
                                >
                                    <img src="/static/logo.jpg" alt="JavJaeger" className="jav-brand-logo" />
                                </button>
                                <span className="jav-brand-copy">
                                    <Text className="jav-brand-name">{HEADER_BRAND_NAME}</Text>
                                    <Text className="jav-brand-slogan">
                                        <span>{HEADER_SLOGAN_QUOTE}</span>
                                        <span>{HEADER_SLOGAN_AUTHOR}</span>
                                    </Text>
                                </span>
                            </div>
                        </div>
                        <div className="jav-header-nav">
                            <Segmented
                                className="jav-page-tabs"
                                value={activePage}
                                onChange={setActivePage}
                                options={[
                                    { label: '影片检索', value: 'jav' },
                                    { label: '刮削', value: 'localScrape' },
                                    { label: '影视库', value: 'localLibrary' },
                                    { label: '自动模式', value: 'automation' },
                                    { label: 'WebDAV下载', value: 'webdav' },
                                    { label: '设置', value: 'settings' }
                                ]}
                            />
                        </div>
                        <Space size="middle" className="jav-header-actions">
                            <Text type="secondary" className="jav-version">
                                {displayVersion} ({versionInfo.build_date})
                            </Text>
                            <a className="jav-github-link" href="https://github.com/cnlutong/JavJaeger" target="_blank" rel="noreferrer" aria-label="GitHub repository">
                                {GithubOutlined ? <GithubOutlined /> : (
                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                    <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                                </svg>
                                )}
                            </a>
                        </Space>
                    </Header>

                    {logoPreviewOpen && (
                        <div
                            className="jav-logo-preview-overlay"
                            role="dialog"
                            aria-modal="true"
                            aria-label="JavJaeger logo 大图"
                            onClick={handleLogoPreviewClose}
                        >
                            <button
                                type="button"
                                className="jav-logo-preview-close"
                                aria-label="关闭 logo 大图"
                                onClick={handleLogoPreviewClose}
                            >
                                ×
                            </button>
                            <div className="jav-logo-preview-frame" onClick={(event) => event.stopPropagation()}>
                                <img src="/static/logo.jpg" alt="JavJaeger logo 大图" className="jav-logo-preview-image" />
                            </div>
                        </div>
                    )}

                    {activePage === 'jav' ? (
                    <Layout className="jav-workspace">
                        {/* Left Sidebar */}
                        <Sider
                            width={320}
                            theme="light"
                            collapsible
                            collapsed={collapsedLeft}
                            onCollapse={(value) => setCollapsedLeft(value)}
                            className="jav-sidebar jav-sidebar-left"
                        >
                            <div className="jav-sidebar-content">
                                <Title level={5} className="jav-sidebar-title">查询功能</Title>
                                <Divider className="jav-sidebar-divider" />

                                <Card title={<><Icon as={FilterOutlined} /> 影片列表筛选</>} size="small" className="jav-tool-card">
                                    <Form form={filterForm} onFinish={filterMovies} layout="vertical" initialValues={{ magnet: 'exist', type: 'normal', fetchMode: 'page' }}>
                                        <Form.Item name="filterType" style={{ marginBottom: 8 }}>
                                            <Select placeholder="选择筛选类型" allowClear optionLabelProp="label">
                                                <Option value="star" label="演员">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>演员</span>
                                                        <a onClick={(e) => { e.stopPropagation(); filterForm.setFieldsValue({ filterType: 'star' }); setViewMode('browseActor'); }}>浏览</a>
                                                    </div>
                                                </Option>
                                                <Option value="genre" label="类别">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>类别</span>
                                                        <a onClick={(e) => { e.stopPropagation(); filterForm.setFieldsValue({ filterType: 'genre' }); setViewMode('browseCategory'); }}>浏览</a>
                                                    </div>
                                                </Option>
                                                <Option value="director" label="导演">导演</Option>
                                                <Option value="studio" label="制作商">制作商</Option>
                                                <Option value="label" label="发行商">发行商</Option>
                                                <Option value="series" label="系列">系列</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="filterValue" hidden>
                                            <Input />
                                        </Form.Item>
                                        <Form.Item style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', width: '100%' }}>
                                                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                                                    <Form.Item name="filterValueName" noStyle>
                                                        <Input
                                                            placeholder="筛选代码或名称"
                                                            onChange={(e) => filterForm.setFieldsValue({ filterValue: e.target.value })}
                                                            allowClear
                                                            style={{
                                                                width: '100%',
                                                                height: 46,
                                                                minWidth: 0,
                                                                borderTopRightRadius: 0,
                                                                borderBottomRightRadius: 0,
                                                            }}
                                                        />
                                                    </Form.Item>
                                                </div>
                                                <Button
                                                    htmlType="button"
                                                    onClick={handleAddCurrentFilter}
                                                    autoInsertSpace={false}
                                                    style={{
                                                        flex: '0 0 62px',
                                                        width: 62,
                                                        marginLeft: -1,
                                                        borderTopLeftRadius: 0,
                                                        borderBottomLeftRadius: 0,
                                                        height: 46,
                                                        paddingInline: 0,
                                                    }}
                                                >
                                                    <span>加入</span>
                                                </Button>
                                            </div>
                                        </Form.Item>
                                        {selectedFilters.length > 0 && (
                                            <Form.Item style={{ marginBottom: 8 }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {selectedFilters.map(filter => (
                                                        <Tag
                                                            key={`${filter.type}:${filter.value}`}
                                                            closable
                                                            color={filter.type === 'star' ? 'magenta' : 'cyan'}
                                                            onClose={() => removeSelectedFilter(filter.type, filter.value)}
                                                            style={{ margin: 0 }}
                                                        >
                                                            {FILTER_TYPE_LABELS[filter.type] || filter.type}: {filter.label || filter.value}
                                                        </Tag>
                                                    ))}
                                                    <Button type="link" size="small" htmlType="button" onClick={() => setSelectedFilters([])}>
                                                        清空
                                                    </Button>
                                                </div>
                                            </Form.Item>
                                        )}
                                        <Form.Item name="magnet" style={{ marginBottom: 8 }}>
                                            <Select placeholder="磁力链接状态">
                                                <Option value="exist">有磁力链接</Option>
                                                <Option value="all">全部影片</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="type" style={{ marginBottom: 8 }}>
                                            <Select placeholder="影片类型">
                                                <Option value="normal">有码影片</Option>
                                                <Option value="uncensored">无码影片</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="actorCountFilter" label="演员人数" style={{ marginBottom: 8 }}>
                                            <Select placeholder="不限制" allowClear>
                                                <Option value="1">单人作品 (=1)</Option>
                                                <Option value="2">双人作品 (=2)</Option>
                                                <Option value="3">三人作品 (=3)</Option>
                                                <Option value="<=2">少于等于2人</Option>
                                                <Option value="<=3">少于等于3人</Option>
                                                <Option value=">=3">大于等于3人</Option>
                                                <Option value=">=4">大于等于4人</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="hasSubtitle" label="字幕要求" style={{ marginBottom: 8 }}>
                                            <Select placeholder="不限制" allowClear>
                                                <Option value="">包含或不包含都可以</Option>
                                                <Option value="true">包含字幕</Option>
                                                <Option value="false">不含字幕</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="fetchMode" label="获取方式" style={{ marginBottom: 8 }}>
                                            <Select>
                                                <Option value="page">逐页获取 (每页30个)</Option>
                                                <Option value="all">获取全部 (所有页)</Option>
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading} icon={<Icon as={FilterOutlined} />}>筛选</Button>
                                    </Form>
                                </Card>

                                <Card title={<><Icon as={SearchOutlined} /> 影片查询</>} size="small" className="jav-tool-card">
                                    <Form onFinish={searchMovie} layout="vertical">
                                        <Form.Item name="keyword" style={{ marginBottom: 8 }} rules={[{ required: true, message: '请输入番号' }]}>
                                            <Input placeholder="输入影片番号" />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading} icon={<Icon as={SearchOutlined} />}>搜索</Button>
                                    </Form>
                                </Card>

                                <Card title={<><Icon as={LinkOutlined} /> 磁力链接查询</>} size="small" className="jav-tool-card">
                                    <Form onFinish={searchMagnet} layout="vertical">
                                        <Form.Item name="movieId" style={{ marginBottom: 8 }} rules={[{ required: true, message: '请输入番号' }]}>
                                            <Input placeholder="输入影片番号" />
                                        </Form.Item>
                                        <Form.Item name="sortBy" style={{ marginBottom: 8 }}>
                                            <Select placeholder="排序方式" allowClear>
                                                <Option value="date">日期</Option>
                                                <Option value="size">大小</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="sortOrder" style={{ marginBottom: 8 }}>
                                            <Select placeholder="排序顺序" allowClear>
                                                <Option value="asc">升序</Option>
                                                <Option value="desc">降序</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="hasSubtitle" style={{ marginBottom: 8 }}>
                                            <Select placeholder="字幕筛选" allowClear>
                                                <Option value="true">有字幕</Option>
                                                <Option value="false">无字幕</Option>
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading} icon={<Icon as={LinkOutlined} />}>查询磁力链接</Button>
                                    </Form>
                                </Card>

                                <Card title={<><Icon as={DatabaseOutlined} /> 影片识别</>} size="small" className="jav-tool-card">
                                    <Form onFinish={handleRecognizeMovie} layout="vertical" initialValues={{ autoDownload: true }}>
                                        <Form.Item name="htmlContent" rules={[{ required: true, message: '请粘贴HTML源代码' }]} style={{ marginBottom: 8 }}>
                                            <Input.TextArea placeholder="请粘贴JAVLibrary网页源代码..." rows={4} />
                                        </Form.Item>
                                        <Form.Item name="autoDownload" style={{ marginBottom: 12 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '仅识别', value: false },
                                                    { label: '自动下载最佳', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="hasSubtitle" style={{ marginBottom: 8 }}>
                                            <Select placeholder="字幕筛选" allowClear>
                                                <Option value="true">有字幕</Option>
                                                <Option value="false">无字幕</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="exclude4k" style={{ marginBottom: 16 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading} icon={<Icon as={SearchOutlined} />}>识别并下载</Button>
                                    </Form>
                                </Card>

                                <Card title={<><Icon as={DownloadOutlined} /> 番号自动下载</>} size="small" className="jav-tool-card">
                                    <Form onFinish={handleCodeDownload} layout="vertical" initialValues={{ autoDownload: true }}>
                                        <Form.Item name="movieCodes" rules={[{ required: true, message: '请输入番号' }]} style={{ marginBottom: 8 }}>
                                            <Input.TextArea placeholder="支持多行、空格分隔..." rows={4} />
                                        </Form.Item>
                                        <Form.Item name="autoDownload" style={{ marginBottom: 12 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '仅搜索', value: false },
                                                    { label: '自动下载最佳', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item name="hasSubtitle" style={{ marginBottom: 8 }}>
                                            <Select placeholder="字幕筛选" allowClear>
                                                <Option value="true">有字幕</Option>
                                                <Option value="false">无字幕</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="exclude4k" style={{ marginBottom: 16 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                        <Button type="primary" htmlType="submit" block loading={loading} icon={<Icon as={DownloadOutlined} />}>搜索并下载</Button>
                                    </Form>
                                </Card>
                            </div>
                        </Sider>

                        {/* Main Content */}
                        <Content className="jav-content">
                            <section className="jav-results-panel">
                                {viewMode === 'search' && (
                                    <>
                                        <div className="jav-results-header">
                                            <div>
                                                <Title level={4} className="jav-results-title"><span className="jav-section-icon"><Icon as={ThunderboltOutlined} /></span>查询结果</Title>
                                                <Text type="secondary" className="jav-results-subtitle">当前批次资源概览</Text>
                                            </div>
                                        <Button
                                            type="primary"
                                            disabled={!isCurrentDownloadToolReady || !moviesData || !moviesData.movies || moviesData.movies.length === 0}
                                            loading={loading}
                                            icon={<Icon as={DownloadOutlined} />}
                                            onClick={handleDownloadAllMovies}
                                        >下载本页全部影片</Button>
                                        </div>
                                        <div className="jav-kpi-grid">
                                            <div className="jav-kpi-card">
                                                <span className="jav-kpi-label">结果</span>
                                                <strong>{resultCount}</strong>
                                                <span className="jav-kpi-note">影片</span>
                                            </div>
                                            <div className="jav-kpi-card">
                                                <span className="jav-kpi-label">磁力</span>
                                                <strong>{magnetsReadyCount}</strong>
                                                <span className="jav-kpi-note">{magnetsLoadedCount}/{resultCount || 0} 已检索</span>
                                            </div>
                                            <div className="jav-kpi-card">
                                                <span className="jav-kpi-label">{getDownloadToolConfig().label}</span>
                                                <strong>{isCurrentDownloadToolReady ? '就绪' : '未就绪'}</strong>
                                                <span className="jav-kpi-note">
                                                    {downloadTool === '115'
                                                        ? `目录 ${clientConfig.pan115?.save_dir_id || '0'}`
                                                        : downloadTool === 'aria2'
                                                            ? (aria2Connected ? '已连接' : '未连接')
                                                            : (pikpakCredentials?.username || clientConfig.pikpak.username || '未登录')}
                                                </span>
                                            </div>
                                            <div className="jav-kpi-card">
                                                <span className="jav-kpi-label">来源</span>
                                                <strong>{currentMagnetSource === 'cilisousuo' ? 'Cilisousuo' : 'JavBus'}</strong>
                                                <span className="jav-kpi-note">4K过滤：{magnetSettingsForm.getFieldValue('globalExclude4k') ? '开启' : '关闭'}</span>
                                            </div>
                                        </div>
                                        <div className="jav-process-strip">
                                            <div className={`jav-process-item ${resultCount > 0 ? 'is-active' : ''}`}>
                                                <span className="jav-process-icon"><Icon as={SearchOutlined} /></span>
                                                <span>
                                                    <strong>检索</strong>
                                                    <em>{loading ? '进行中' : resultCount > 0 ? '已完成' : '待开始'}</em>
                                                </span>
                                            </div>
                                            <div className={`jav-process-item ${magnetsLoadedCount > 0 ? 'is-active' : ''}`}>
                                                <span className="jav-process-icon"><Icon as={LinkOutlined} /></span>
                                                <span>
                                                    <strong>资源</strong>
                                                    <em>{magnetsReadyCount > 0 ? `${magnetsReadyCount} 可用` : magnetsLoadedCount > 0 ? '无可用' : '待匹配'}</em>
                                                </span>
                                            </div>
                                            <div className={`jav-process-item ${isCurrentDownloadToolReady ? 'is-active' : ''}`}>
                                                <span className="jav-process-icon"><Icon as={SafetyCertificateOutlined} /></span>
                                                <span>
                                                    <strong>派发</strong>
                                                    <em>
                                                        {isCurrentDownloadToolReady
                                                            ? '已就绪'
                                                            : downloadTool === 'aria2'
                                                                ? '未连接Aria2'
                                                                : downloadTool === '115'
                                                                    ? '未配置115'
                                                                    : clientConfig.pikpak.configured ? '可配置' : '未登录'}
                                                    </em>
                                                </span>
                                            </div>
                                        </div>
                                        <Divider className="jav-section-divider" />
                                    </>
                                )}
                                {renderContent()}
                            </section>
                        </Content>

                        {/* Right Sidebar */}
                        <Sider
                            width={300}
                            theme="light"
                            collapsible
                            collapsed={collapsedRight}
                            onCollapse={(value) => setCollapsedRight(value)}
                            className="jav-sidebar jav-sidebar-right"
                            reverseArrow
                        >
                            <div className="jav-sidebar-content">
                                <Title level={5} className="jav-sidebar-title">下载管理</Title>
                                <Divider className="jav-sidebar-divider" />

                                <Card
                                    title={<><Icon as={ThunderboltOutlined} /> 下载工具</>}
                                    extra={
                                        <Button
                                            type="text"
                                            size="small"
                                            title="打开配置"
                                            icon={<Icon as={SettingOutlined} />}
                                            onClick={openDownloadToolConfig}
                                        />
                                    }
                                    size="small"
                                    className="jav-tool-card"
                                >
                                    <div style={{ marginBottom: 8 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            当前选择：
                                            <Text strong style={{ marginLeft: 6, color: '#262626' }}>
                                                {getDownloadToolConfig().label}
                                            </Text>
                                        </Text>
                                    </div>
                                    <div style={{ marginBottom: 10 }}>
                                        <Text type="secondary" style={{ fontSize: 12, color: webdavConnected ? "#52c41a" : "#ff4d4f" }}>
                                            WebDAV（网盘）：{webdavConnected ? '已连接' : '未连接'}
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12, color: aria2Connected ? "#52c41a" : "#ff4d4f" }}>
                                            Aria2：{aria2Connected ? '已连接' : '未连接'}
                                        </Text>
                                        <br />
                                        <Text type="secondary" style={{ fontSize: 12, color: clientConfig.pan115?.configured ? "#52c41a" : "#ff4d4f" }}>
                                            115网盘：{clientConfig.pan115?.configured ? '已配置' : '未配置'}
                                        </Text>
                                    </div>
                                    <Segmented
                                        value={downloadTool}
                                        block
                                        onChange={handleDownloadToolChange}
                                        options={[
                                            { label: 'PikPak', value: 'pikpak' },
                                            { label: '115', value: '115' },
                                            { label: '直接下载', value: 'aria2' },
                                        ]}
                                    />
                                </Card>

                                <Drawer
                                    title={downloadTool === 'aria2' ? '配置 Aria2（直接下载）' : downloadTool === '115' ? '配置 115网盘' : '配置 网盘（PikPak）'}
                                    open={downloadToolConfigOpen}
                                    onClose={closeDownloadToolConfig}
                                    width={360}
                                    placement="right"
                                    destroyOnClose
                                >
                                    {downloadTool === 'aria2' ? (
                                        <Card size="small" title={<><Icon as={ThunderboltOutlined} /> Aria2 配置</>} className="jav-tool-card">
                                            <div style={{ marginBottom: 8 }}>
                                                <Text type="secondary" style={{ fontSize: 12, color: aria2Connected ? "#52c41a" : "#ff4d4f" }}>
                                                    {aria2Connected ? "Aria2 已连接" : "Aria2 未连接"}
                                                </Text>
                                            </div>
                                            <Form form={aria2Form} layout="vertical" onFinish={handleAria2Connect}>
                                                <Form.Item name="url" label="Aria2 RPC 地址" rules={[{ required: true, message: "请输入 Aria2 RPC 地址" }]}>
                                                    <Input placeholder="http://127.0.0.1:6800/jsonrpc" />
                                                </Form.Item>
                                                <Form.Item name="secret" label="RPC Secret">
                                                    <Input.Password placeholder="可选" />
                                                </Form.Item>
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <Button type="primary" htmlType="submit" block loading={aria2Loading}>连接 Aria2</Button>
                                                    {clientConfig.aria2?.configured && (
                                                        <Button block onClick={() => handleAria2ConnectFromConfig()} loading={aria2Loading}>
                                                            使用配置连接
                                                        </Button>
                                                    )}
                                                </Space>
                                            </Form>
                                        </Card>
                                    ) : downloadTool === '115' ? (
                                        <Card size="small" title={<><Icon as={ThunderboltOutlined} /> 115网盘配置</>} className="jav-tool-card">
                                            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                                                <Text type="secondary" style={{ fontSize: 12, color: clientConfig.pan115?.configured ? "#52c41a" : "#ff4d4f" }}>
                                                    {clientConfig.pan115?.configured ? "115 Open API 已配置" : "115 Open API 未配置"}
                                                </Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    保存目录 ID：{clientConfig.pan115?.save_dir_id || '0'}
                                                </Text>
                                                <Button block onClick={() => { closeDownloadToolConfig(); setActivePage('settings'); }}>
                                                    打开设置
                                                </Button>
                                            </Space>
                                        </Card>
                                    ) : (
                                        <Card size="small" title={<><Icon as={ThunderboltOutlined} /> WebDAV 配置</>} className="jav-tool-card">
                                            <div style={{ marginBottom: 8 }}>
                                                <Text type="secondary" style={{ fontSize: 12, color: webdavConnected ? "#52c41a" : "#ff4d4f" }}>
                                                    {webdavConnected ? "WebDAV 已连接" : "WebDAV 未连接"}
                                                </Text>
                                            </div>
                                            <Form form={webdavForm} layout="vertical" onFinish={handleWebdavConnect}>
                                                <Form.Item name="url" label="WebDAV 地址" rules={[{ required: true, message: "请输入 WebDAV 地址" }]}>
                                                    <Input placeholder="https://dav.example.com/" />
                                                </Form.Item>
                                                <Form.Item name="username" label="用户名">
                                                    <Input placeholder="可选" />
                                                </Form.Item>
                                                <Form.Item name="password" label="密码">
                                                    <Input.Password placeholder="可选" />
                                                </Form.Item>
                                                <Space direction="vertical" style={{ width: '100%' }}>
                                                    <Button type="primary" htmlType="submit" block loading={webdavLoading}>连接 WebDAV</Button>
                                                    {clientConfig.webdav?.configured && (
                                                        <Button block onClick={() => handleWebdavConnectFromConfig()} loading={webdavLoading}>
                                                            使用配置连接
                                                        </Button>
                                                    )}
                                                </Space>
                                            </Form>
                                        </Card>
                                    )}
                                </Drawer>

                                <Button
                                    type="default"
                                    block
                                    icon={<Icon as={HistoryOutlined} />}
                                    onClick={fetchHistory}
                                    className="jav-sidebar-action"
                                >
                                    查看历史记录
                                </Button>

                                <Card title={<><Icon as={LoginOutlined} /> PikPak 登录</>} size="small" className="jav-tool-card">
                                    {!isLoggedIn ? (
                                        <Form layout="vertical" onFinish={handlePikPakLogin}>
                                            <Form.Item name="username" style={{ marginBottom: '12px' }} rules={[{ required: true, message: '请输入用户名' }]}>
                                                <Input placeholder="用户名" autoComplete="username" />
                                            </Form.Item>
                                            <Form.Item name="password" style={{ marginBottom: '12px' }} rules={[{ required: true, message: '请输入密码' }]}>
                                                <Input.Password placeholder="密码" autoComplete="current-password" />
                                            </Form.Item>
                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
                                                {clientConfig.pikpak.configured && (
                                                    <Button block onClick={() => handlePikPakLoginFromConfig()} loading={loading}>
                                                        使用配置登录
                                                    </Button>
                                                )}
                                            </Space>
                                        </Form>
                                    ) : (
                                        <div style={{ textAlign: 'center' }}>
                                            <Text type="success" strong>已登录</Text>
                                            <div style={{ marginTop: 8 }}>{pikpakCredentials?.username}</div>
                                            <Button danger style={{ marginTop: 12 }} block onClick={handleLogout} icon={<Icon as={LogoutOutlined} />}>退出登录</Button>
                                        </div>
                                    )}
                                </Card>

                                <Card title={<><Icon as={LinkOutlined} /> 磁力链接来源</>} size="small" className="jav-tool-card">
                                    <Form
                                        form={magnetSettingsForm}
                                        layout="vertical"
                                        initialValues={{ magnetSource: 'javbus', globalExclude4k: false }}
                                        onValuesChange={handleMagnetSettingsChange}
                                    >
                                        <Form.Item name="magnetSource" label="选择来源" style={{ marginBottom: '12px' }}>
                                            <Select>
                                                <Option value="javbus">JavBus API (默认)</Option>
                                                <Option value="cilisousuo">Cilisousuo</Option>
                                            </Select>
                                        </Form.Item>
                                        <Form.Item name="globalExclude4k" style={{ marginBottom: 0 }}>
                                            <Segmented
                                                block
                                                options={[
                                                    { label: '不排除4K', value: false },
                                                    { label: '全局排除4K', value: true }
                                                ]}
                                            />
                                        </Form.Item>
                                    </Form>
                                </Card>
                            </div>
                        </Sider>
                    </Layout>
                    ) : renderStandalonePage(activePage)}
                </Layout>
            </div>
        </ConfigProvider>
    );
}
