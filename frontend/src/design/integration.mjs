import { loadAppTheme, saveAppTheme } from '../utils/theme.js';
import { loadPikPakSession, persistPikPakSession, clearPikPakSession, loadWebDavSettings, saveWebDavSettings, loadAria2Settings, saveAria2Settings } from '../utils/storage.js';
import { isConformingLocalScrapeItem, getLocalScrapeIssueReason } from '../utils/localScrapeResults.mjs';
import { withSecretPlaceholders, buildSettingsPayload } from '../utils/systemSettings.mjs';
import { buildDefaultTask } from '../utils/automationTask.mjs';
import { selectHistoryRedispatchResource } from '../utils/historyRedispatch.mjs';
import { loadLocalScrapeTaskTemplates, saveLocalScrapeTaskTemplate, deleteLocalScrapeTaskTemplate } from '../utils/localScrapeTemplates.mjs';
import { LOCAL_SCRAPE_NAMING_FIELDS } from '../utils/localScrapeNamingTemplates.mjs';

// Reuse the imported component's data and workflows in the API adapter.
// Management views retain the supplied template; cinema has its own presentation.
export const designDataExports = '\nComponent.data = { MOVIES, MAGNETS, LIB, CN_ACTORS, CN_RESUME, FILTER_DIMS, ACTOR_CATALOG, GENRE_CATALOG, BG, HISTORY, TC, PRESETS, SCRAPE_ROWS };';
// Keep the imported design intact; adapt its eager view calculations at startup.
export function adaptDesignScript(script) {
    for (const [key, route, method] of [['cn', 'cinema', 'vCinema'], ['d', 'dispatch', 'vDispatch'], ['tc', 'transcode', 'vTranscode'], ['sc', 'scrape', 'vScrape'], ['lb', 'library', 'vLibrary'], ['au', 'auto', 'vAuto'], ['fs', 'storage', 'vStorage'], ['se', 'settings', 'vSettings']]) {
        script = script.replace(`${key}: this.${method}()`, `${key}: (st.route === '${route}'${key === 'fs' ? ' || st.fsAdd' : ''}) ? this.${method}() : {}`);
    }
    return script.replace("r.res === '720p' : r.res === st.lbRes", "(parseInt(r.res) > 0 && parseInt(r.res) <= 720) : r.res === st.lbRes")
        .replace('const list = this.visible();', "const list = st.route === 'search' ? this.visible() : [];")
        .replace('const rows = list.map((m) => {', "const rows = this.pageItems(list, 'searchPage', []).items.map((m) => {")
        .replace('actors: CN_ACTORS.map((a) => {', 'actors: (showActors ? CN_ACTORS : []).map((a) => {')
        .replace(/const films = LIB.filter\(\(m\) => m.actors.includes\(a.name\)\);\s*const latest = films.slice\(\).sort\(\(x, y\) => y.date.localeCompare\(x.date\)\)\[0\];/, 'const latest = this.latestByActor.get(a.name);')
        .replace('let wallRows = LIB\n', `const cinemaQuery = (st.cnQ || '').trim().toLowerCase();\n    let wallRows = (isWall ? LIB : []).filter(m => !cinemaQuery || [m.code, m.title, ...m.actors].join(' ').toLowerCase().includes(cinemaQuery))\n`)
        .replace('filterGroups: dims.map((d) => ({', 'filterGroups: (isWall ? dims : []).map((d) => ({')
        .replace('const o = st.scOpts;', 'const o = st.scOpts, skipped = new Set(st.scSkip);')
        .replaceAll('st.scSkip.includes(', 'skipped.has(')
        .replace('LIB.filter((m) => (!actorWall || m.actors.includes(st.cnActor)) && d.test(m, o)).length', 'this.cinemaCounts(actorWall ? st.cnActor : null).get(d.key).get(o) || 0')
        .replace("gb(b.size) - gb(a.size)", 'Number(b.raw.total_size || 0) - Number(a.raw.total_size || 0)');
}
const ACC = 'var(--acc)', OK = 'var(--ok)', WARN = 'var(--warn)', BAD = 'var(--bad)', DIM = 'var(--dim)', DIM2 = 'var(--dim2)';
const id = encodeURIComponent;
const sourceKey = value => ({ cili: 'cilisousuo', yhg: 'yhg007' }[value] || value);
const toolName = value => ({ pikpak: 'PikPak', pan115: '115 网盘', aria2: 'Aria2' }[value] || value);
const runStatus = value => ({ running: '运行中', success: '已完成', partial: '部分完成', failed: '失败', noop: '无新下载' }[value] || value);
const toolKey = value => ({ PikPak: 'pikpak', '115 网盘': 'pan115', Aria2: 'aria2' }[value] || value);
const names = values => (Array.isArray(values) ? values : []).map(value => typeof value === 'string' ? value : value.name).filter(Boolean);
const size = bytes => {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '0 B';
    const unit = Math.min(4, Math.floor(Math.log(Number(bytes)) / Math.log(1024)));
    return `${Number((Number(bytes) / 1024 ** unit).toFixed(1))} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
};
const stat = (label, value, note = '', color = 'var(--fg)') => ({ label, value: String(value), note, color });
const safeText = (value, fallback = '操作失败，请检查配置或稍后重试') => {
    const text = String(value || '');
    return !text || /password|secret|token|cookie|authorization|https?:\/\/[^\s]*@/i.test(text) ? fallback : text.slice(0, 240);
};
const imageSource = url => !url ? '' : url.startsWith('/api/') ? url : `/api/image-proxy?url=${id(url)}`;
const jobStorage = { scrapeTask: 'localScrapeActiveTask', scanTask: 'localLibraryActiveTask', dispatchTask: 'pan115ActiveDispatch', informationTask: 'localLibraryInformationTask', cleanupTask: 'localLibraryCleanupTask' };
const jobFinished = task => task && ['success', 'completed', 'failed'].includes(task.status);
const informationSummary = task => {
    if (task.status === 'failed') return safeText(task.message, '资料任务失败，请重新检查');
    if (!jobFinished(task)) return safeText(task.message, '后台运行中，可离开页面');
    const result = task.result || {};
    return task.operation === 'check' ? `资料检查完成：${result.total_movies || 0} 部已检查，${result.incomplete_count || 0} 部待补全`
        : `资料补全完成：${result.updated_count || 0} 成功，${result.failed_count || 0} 失败，剩余 ${result.information_check?.incomplete_count || 0} 部待补全`;
};
const scrapeConfigKeys = ['scScanDir', 'scOutDir', 'scFolderRule', 'scFileRule', 'scMaxDepth', 'scConcurrent', 'scOpts', 'scOverrides'];
const libraryColumns = [['封面', 152, 104], ['番号', 104, 88], ['标题', 256, 160], ['演员', 232, 120], ['媒体参数', 140, 100], ['文件', 80, 64], ['资料完整度', 112, 104], ['操作', 74, 64]];
const libraryWidthsKey = 'javjaeger.libraryColumnWidths';

function movieView(record, local = false) {
    const metadata = record.metadata || {}, media = record.media_info || metadata.media_info || {};
    const tags = names(record.genres || metadata.genres);
    if (record.is_vr && !tags.includes('VR')) tags.push('VR');
    const files = Array.isArray(record.files) ? record.files : [];
    const code = record.movie_id || record.id || record.code || '';
    return {
        raw: record, code, title: record.title || metadata.title || code,
        actors: names(record.stars || metadata.stars), tags,
        date: String(record.date || metadata.date || ''), dur: `${record.duration || record.videoLength || metadata.duration || metadata.videoLength || Math.round((media.duration_seconds || 0) / 60) || '—'} 分`,
        studio: record.producer?.name || record.producer || record.studio?.name || record.studio || metadata.producer?.name || metadata.producer || metadata.studio?.name || metadata.studio || '—',
        label: record.publisher?.name || record.publisher || record.label?.name || metadata.publisher?.name || metadata.publisher || metadata.label?.name || '—',
        series: record.series?.name || record.series || metadata.series?.name || metadata.series || '—', director: record.director?.name || record.director || metadata.director?.name || metadata.director || '—',
        local: local || record.in_local_library ? 'in' : 'none', vr: tags.includes('VR'), sub: tags.includes('中文字幕'), k4: Number(media.height) >= 2160,
        res: media.height ? `${media.height}p` : '—', codec: media.codec || media.video_codec || '—',
        files: record.file_count ?? files.length, size: size(record.total_size || files.reduce((sum, file) => sum + Number(file.size || 0), 0)),
        c: record.information_complete === false ? 0 : 100, added: String(record.updated_at || record.added_at || record.created_at || ''),
        gone: local && ((record.file_count ?? files.length) === 0 || files.some(file => file.exists === false)), mag: '', magCount: 0,
        cover: imageSource((local && (record.thumbnail_url || metadata.list_thumbnail_url)) || record.poster_url || record.cover_url || record.img || metadata.cover_url || metadata.img || ''),
    };
}

export function connectDesign(Base) {
    const data = Base.data;
    for (const table of Object.values(data)) {
        if (Array.isArray(table)) table.splice(0);
        else for (const key of Object.keys(table)) delete table[key];
    }
    return class ConnectedDesign extends Base {
        constructor(props) {
            super(props);
            const session = loadPikPakSession();
            this.auth = session.credentials;
            this.state = { ...this.state, theme: loadAppTheme(), route: 'cinema', cnHero: '', cnPlaying: null, cnDetail: null, cnDetailFile: 0, cnQ: '',
                code: '', sMode: 'code', fValue: '', fLabel: '', fList: [], dCodes: '', dScope: '3',
                pikLogged: session.isLoggedIn, fsAria: 'down', fsPath: [], fsSrc: 'local',
                scPhase: 'idle', scScanDir: '', scOutDir: '', lbSource: '', lbPaths: [], lbExcludes: [], auTask: '',
                settings: {}, settingsDraft: {}, cacheSettings: null, cacheDraft: null, imageCacheSettings: null, imageCacheDraft: null, connections: {}, clientConfig: {}, tasks: [], fileRows: [],
                tcCaps: {}, searchError: '', searchDone: false, loading: false, libraryLoaded: false,
                scanTask: null, scrapeTask: null, scrapeResult: null, checkResult: null, informationTask: null, infoStarting: false, tool: 'PikPak',
                autoDraft: null, directory: '', directories: [], browserTarget: null, qr: null, sourcesResult: [],
                scrapeTemplates: loadLocalScrapeTaskTemplates(), pathEdits: {}, tcOptions: {}, fsMinSize: '不限', fsVideoOnly: false,
                infoFields: ['title', 'date', 'stars', 'genres', 'cover_url', 'nfo', 'poster_file'], lbWidths: [],
            };
            try {
                const widths = JSON.parse(window.localStorage.getItem(libraryWidthsKey));
                if (Array.isArray(widths) && widths.length === libraryColumns.length && widths.every(Number.isFinite)) {
                    this.state.lbWidths = widths.map((width, i) => Math.max(libraryColumns[i][2], Math.min(1200, width)));
                }
            } catch {}
            this.magnets = new Map();
            this.libraryByCode = new Map();
            this.latestByActor = new Map();
            this.pendingRequests = new Map();
            try {
                window.localStorage.removeItem('javjaeger.movieMetadata.v1');
                window.localStorage.removeItem('javjaeger.movieCacheSettings.v1');
            } catch {}
            this._readGeneration = 0;
            this.requestVersion = 0;
            this._disposed = false;
            for (const [key, storageKey] of Object.entries(jobStorage)) {
                try {
                    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || 'null');
                    if (!saved?.taskId) continue;
                    if (key === 'scrapeTask') {
                        for (const field of scrapeConfigKeys) if (saved.config?.[field] !== undefined) this.state[field] = saved.config[field];
                        this.state.scPhase = 'scanning'; this.scrapePreviewConfig = JSON.stringify(this.scrapePayload());
                    } else if (key === 'scanTask') this.state.lbScanning = true;
                    if (key === 'informationTask' && saved.config?.fields?.length) this.state.infoFields = saved.config.fields;
                    this.state[key] = { id: saved.taskId, operation: saved.type, status: 'running', payload: saved.config, preflight: saved.preflight || [] };
                } catch { window.sessionStorage.removeItem(storageKey); }
            }
        }

        setState(update, callback) {
            const patch = typeof update === 'function' ? update(this.state) : { ...update };
            for (const [page, filters] of [
                ['lbPage', ['lbQ', 'lbActor', 'lbStudio', 'lbRes', 'lbM', 'lbSubOnly', 'lbMissing', 'lbSort']],
                ['cnPage', ['cnTab', 'cnActor', 'cnF', 'cnSort', 'cnQ']],
                ['cnShelfPage', ['cnTab']],
                ['catalogPage', ['browse', 'browseQ']],
                ['searchPage', ['sMode', 'code', 'page', 'fList']],
                ['historyPage', ['dHf']], ['tcPage', ['tcF']], ['scPage', ['scF', 'scPhase']],
                ['fsPage', ['fsQ', 'fsSrc', 'directory', 'fsVideoOnly', 'fsMinSize']], ['directoryPage', ['browsePath']],
                ['dlgPage', ['dlg']],
            ]) {
                if (filters.some(key => key in patch && patch[key] !== this.state[key])) patch[page] = null;
            }
            const cinemaNavigation = this.state.route === 'cinema' && ['cnTab', 'cnActor', 'cnQ', 'cnF', 'cnSort', 'cnPage', 'cnShelfPage', 'cnActorPage'].some(key => key in patch && patch[key] !== this.state[key]);
            super.setState(patch, cinemaNavigation ? () => {
                document.querySelector('.jj-cinema-content')?.scrollTo({ top: 0 });
                callback?.();
            } : callback);
        }

        async request(url, method = 'GET', body) {
            const key = JSON.stringify([method, url, body instanceof FormData ? [...body.entries()] : body, method === 'GET' ? this._readGeneration : null]);
            if (this.pendingRequests.has(key)) return this.pendingRequests.get(key);
            if (method !== 'GET') this._readGeneration++;
            const pending = this.fetchJSON(url, method, body);
            this.pendingRequests.set(key, pending);
            try { return await pending; } finally { this.pendingRequests.delete(key); if (method !== 'GET') this._readGeneration++; }
        }

        async fetchJSON(url, method, body) {
            const options = { method };
            if (body !== undefined) {
                if (body instanceof FormData) options.body = body;
                else { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
            }
            const response = await fetch(url, options);
            if (!response.ok) {
                const result = await response.json().catch(() => null), detail = result?.detail;
                const error = new Error(safeText(detail?.message || (typeof detail === 'string' ? detail : '') || result?.message, `请求失败（HTTP ${response.status}）`));
                error.status = response.status; error.result = result; throw error;
            }
            const result = await response.json();
            if (result?.success === false || result?.error && !result.status) {
                const error = new Error(safeText(result.message || result.error));
                error.result = result;
                throw error;
            }
            return result;
        }

        async perform(action, success) {
            try { const result = await action(); if (success && !this._disposed) this.toast(success, OK); return result; }
            catch (error) { if (!this._disposed) this.toast(safeText(error.message), BAD); return null; }
        }

        async copyText(text) {
            if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch {} }
            const previous = document.activeElement, field = document.createElement('textarea');
            field.value = text; field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
            document.body.append(field); field.select();
            try { if (!document.execCommand('copy')) throw new Error('复制失败，请手动选择并复制文本'); }
            finally { field.remove(); previous?.focus({ preventScroll: true }); }
        }

        componentDidMount() {
            this._keyboard = event => {
                if (event.key === 'Escape') {
                    if (this.state.dlg) this.renderVals().dlg.cancel();
                    else for (const key of ['fsAdd', 'toolCfg', 'browse', 'scRepair', 'scDesigner', 'scCmp', 'scInspect', 'lbTc', 'lbCheckCfg', 'lbPathCfg', 'lbDetail', 'detail', 'tcDetail', 'bgOpen', 'cnPlaying', 'cnDetail']) {
                        if (this.state[key]) { this.setState({ [key]: null }); break; }
                    }
                }
                if (['Enter', ' '].includes(event.key) && event.target.matches('[role="button"]')) { event.preventDefault(); event.target.click(); }
                if (event.key === 'Tab' && this._activeDialog) {
                    const controls = [...this._activeDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(control => control.getClientRects().length);
                    const first = controls[0], last = controls.at(-1);
                    if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                }
            };
            document.addEventListener('keydown', this._keyboard);
            this._dialogObserver = new MutationObserver(() => {
                const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(dialog => dialog.getClientRects().length);
                dialogs.sort((a, b) => Number(getComputedStyle(a.closest('.dialog-backdrop') || a).zIndex) - Number(getComputedStyle(b.closest('.dialog-backdrop') || b).zIndex));
                const next = dialogs.at(-1);
                if (next === this._activeDialog) return;
                if (next) {
                    if (!this._activeDialog) this._focusBeforeDialog = document.activeElement;
                    const target = next.querySelector('input:not(:disabled), select:not(:disabled), button:not(:disabled)');
                    target?.focus({ preventScroll: true });
                } else if (this._focusBeforeDialog?.isConnected) {
                    const previous = this._focusBeforeDialog;
                    const target = previous.closest('details:not([open])')?.querySelector('summary') || previous;
                    target?.focus({ preventScroll: true });
                }
                this._activeDialog = next;
            });
            this._dialogObserver.observe(document.body, { childList: true, subtree: true });
            this.perform(async () => {
                await Promise.all([() => this.loadLibrary(), () => this.loadSettings(), () => this.loadConnections(), () => this.loadHistory(), () => this.loadTasks(), () => this.loadTranscodes(), () => this.loadCatalogs()].map(load => this.perform(load)));
                const config = this.state.clientConfig;
                for (const key of ['webdav', 'aria2', 'pikpak']) {
                    if (config[key]?.configured && (config[key].auto_connect || config[key].auto_login)) await this.perform(() => this.connect(key, true));
                }
            });
            this._poll = setInterval(() => this.perform(() => this.poll()), 3000);
        }

        componentWillUnmount() {
            this._disposed = true;
            this._cancelLibraryResize?.();
            clearInterval(this._poll);
            if (this._keyboard) document.removeEventListener('keydown', this._keyboard);
            this._dialogObserver?.disconnect();
            for (const key of ['_tt', '_st', '_sc1', '_sc2', '_bt']) clearTimeout(this[key]);
        }

        allConnected() { return Boolean(this.state.connections.pan115); }
        go(route) { return () => {
            this.setState({ route, bgOpen: false, detail: null, lbDetail: null, cnPlaying: null, cnDetail: null, lbTc: null, lbPathCfg: false, lbCheckCfg: false, toolCfg: null, fsAdd: null });
            this.perform(async () => {
                if (['cinema', 'library'].includes(route) && (!this.state.libraryLoaded || Date.now() - this._libraryLoadedAt >= 30000)) await this.loadLibrary();
                if (route === 'storage') await this.loadFiles(this.state.fsSrc, this.state.directory);
                if (route === 'transcode') await this.loadTranscodes(true);
                if (route === 'auto') await this.loadTasks();
                if (route === 'dispatch') await this.loadHistory();
            });
        }; }

        async loadConnections() {
            const [config, connection, pan115] = await Promise.all([
                this.request('/api/client-config'), this.request('/api/webdav/status'), this.request('/api/115/status'),
            ]);
            this.setState({ clientConfig: config, connections: { ...connection, pan115: Boolean(pan115.connected) }, fsAria: connection.aria2_connected ? 'up' : 'down' });
        }
        async loadSettings() {
            const payload = await this.request('/api/system/settings');
            this.setState({ settings: payload, settingsDraft: withSecretPlaceholders(payload), sourcesResult: [] });
        }
        async loadCacheSettings(images = false) {
            const result = await this.request(images ? '/api/image-cache' : '/api/metadata-cache');
            this.setState({ [images ? 'imageCacheSettings' : 'cacheSettings']: result, [images ? 'imageCacheDraft' : 'cacheDraft']: { ...result.settings } });
        }
        async loadCatalogs() {
            for (const [url, table] of [['/static/actors.json', data.ACTOR_CATALOG], ['/static/categories.json', data.GENRE_CATALOG]]) {
                const groups = await this.request(url);
                table.splice(0, table.length, ...Object.entries(groups).map(([name, items]) => ({ name,
                    items: (Array.isArray(items) ? items : Object.entries(items || {}).map(([code, label]) => ({ id: code, name: label })))
                        .map(item => [String(item.name || item.title || ''), String(item.id || item.code || ''), '', true]),
                })));
            }
            this.forceUpdate?.();
        }
        async loadLibrary() {
            const [library, settings, actors] = await Promise.all([
                this.request('/api/movies/local-library?compact=true'), this.request('/api/movies/local-library/settings'), this.request('/api/movies/local-library/actors?compact=true'),
            ]);
            data.LIB.splice(0, data.LIB.length, ...(library.records || library.movies || []).map(record => movieView(record, true)));
            this.libraryByCode = new Map(data.LIB.map(movie => [movie.code, movie]));
            this.latestByActor.clear();
            this._cinemaCounts = null;
            for (const movie of data.LIB) for (const actor of movie.actors) {
                if (!this.latestByActor.has(actor) || movie.date > this.latestByActor.get(actor).date) this.latestByActor.set(actor, movie);
            }
            data.CN_ACTORS.splice(0, data.CN_ACTORS.length, ...(actors.actors || []).map(actor => ({ ...actor, count: actor.movie_count, size: size(actor.total_size), noAvatar: !actor.avatar_url })));
            const dims = [['actor', '演员', 'actors'], ['series', '系列', 'series'], ['studio', '制作商', 'studio'], ['res', '分辨率', 'res'], ['flag', '标记', 'tags']];
            data.FILTER_DIMS.splice(0, data.FILTER_DIMS.length, ...dims.map(([key, name, field]) => ({ key, name,
                options: [...new Set(data.LIB.flatMap(movie => movie[field]))].filter(value => value && value !== '—'),
                test: (movie, value) => Array.isArray(movie[field]) ? movie[field].includes(value) : movie[field] === value,
            })));
            this.applyLibrarySettings(settings);
            this.setState({ libraryLoaded: true, librarySummary: library,
                cnHero: data.LIB.some(movie => movie.code === this.state.cnHero) ? this.state.cnHero : data.LIB[0]?.code || '' });
            this._libraryLoadedAt = Date.now();
            await this.checkInformation();
        }
        applyLibrarySettings(settings, saved = false) {
            const st = this.state, source = settings.source_directory || '', target = settings.directories?.[0] || '';
            this.setState({ librarySettings: settings,
                ...(saved ? { seSource: undefined, seTarget: undefined } : {}),
                ...(!st.lbPathCfg || saved ? { lbSource: source, lbPaths: settings.directories || [], lbExcludes: settings.ignored_paths || [] } : {}),
                ...(st.scPhase === 'idle' && (!st.scrapeTask || jobFinished(st.scrapeTask)) ? { scScanDir: saved ? source : st.scScanDir || source, scOutDir: saved ? target : st.scOutDir || target } : {}),
            });
        }
        openLibraryPaths() {
            const settings = this.state.librarySettings || {};
            this.setState({ lbPathCfg: true, lbSource: settings.source_directory || '', lbPaths: settings.directories || [], lbExcludes: settings.ignored_paths || [] });
        }
        async saveLibraryPaths(values) {
            const source = (values.source_directory || '').trim(), directories = (values.directories || []).map(path => path.trim()).filter(Boolean);
            if (!source || !directories.length) throw new Error('请选择待刮削目录和影视库目录');
            const settings = await this.request('/api/movies/local-library/settings', 'PUT', { source_directory: source, directories, ignored_paths: (values.ignored_paths || []).map(path => path.trim()).filter(Boolean) });
            this.applyLibrarySettings(settings, true);
            return settings;
        }
        async checkInformation(refreshFiles = false) {
            const result = await this.request('/api/movies/local-library/information/check?fields=' + id(this.state.infoFields.join(',')) + '&refresh_files=' + refreshFiles);
            if (refreshFiles) this._readGeneration++;
            this.applyInformationCheck(result);
        }
        applyInformationCheck(result) {
            const incomplete = new Map((result.incomplete_records || []).map(record => [record.movie_id, record]));
            for (const movie of data.LIB) {
                const missing = incomplete.get(movie.code);
                movie.c = missing ? Math.max(0, Math.round(100 * (1 - (missing.missing_fields?.length || missing.missing_labels?.length || 1) / Math.max(1, result.fields?.length || this.state.infoFields.length)))) : 100;
                movie.missing = missing?.missing_labels;
                movie.unchecked = Boolean(missing?.unchecked_fields?.length);
            }
            this.setState({ checkResult: result });
        }
        async loadHistory() {
            const history = await this.request('/api/history');
            data.HISTORY.splice(0, data.HISTORY.length, ...(Array.isArray(history) ? history : history.records || history.history || []));
            this.forceUpdate?.();
        }
        async loadTasks() {
            const result = await this.request('/api/automation/tasks');
            const tasks = result.tasks || [];
            if (JSON.stringify(tasks) === JSON.stringify(this.state.tasks)) return;
            const running = new Set(this.state.tasks.flatMap(task => (task.runs || []).filter(run => run.status === 'running').map(run => run.id)));
            for (const task of tasks) for (const run of task.runs || []) if (running.has(run.id) && run.status !== 'running') this.toast(`${task.name}：${safeText(run.error || run.message, runStatus(run.status))}`, ['failed', 'partial'].includes(run.status) ? WARN : OK);
            this.setState({ tasks, auTask: tasks.some(task => task.id === this.state.auTask) ? this.state.auTask : tasks[0]?.id || '' });
        }
        async loadTranscodes(capabilities = false) {
            const payload = await this.request('/api/movies/transcoding/tasks');
            const snapshot = JSON.stringify(payload.tasks || []), changed = snapshot !== this._transcodeSnapshot;
            this._transcodeSnapshot = snapshot;
            if (changed) {
                data.TC.splice(0, data.TC.length, ...(payload.tasks || []).map(task => ({ ...task, raw: task,
                    code: task.movie_id, title: task.movie_title, file: task.source_path, preset: task.preset_name,
                    codec: task.options?.video_codec || '', gpu: task.gpu_name || task.hardware_backend,
                    pct: task.progress, eta: task.eta_seconds == null ? '—' : `${Math.ceil(task.eta_seconds / 60)} 分`,
                    elapsed: `${task.elapsed_seconds || 0} 秒`, inSize: size(task.input_size), outSize: size(task.output_size),
                })));
            }
            if (capabilities) { this.setState({ tcCaps: {} }); this.setState({ tcCaps: await this.request('/api/movies/transcoding/presets') }); }
            if (changed) this.forceUpdate?.();
        }

        applyMovieDetails(movie, detail) {
            const raw = { ...movie.raw, ...Object.fromEntries(Object.entries(detail).filter(([, value]) => value != null && value !== '')) };
            Object.assign(movie, movieView(raw), { mag: movie.mag, magCount: movie.magCount, detailsLoaded: true, detailError: '' });
        }
        async loadMovieDetails(movie, version = this.requestVersion) {
            if (movie.detailsLoaded) return;
            movie.detailsLoading = true;
            try {
                const detail = await this.request(`/api/movies/${id(movie.code)}`);
                if (version === this.requestVersion && !this._disposed) { this.applyMovieDetails(movie, detail); }
            } catch (error) {
                if (version === this.requestVersion && !this._disposed) { movie.detailError = safeText(error.message); throw error; }
            } finally {
                if (version === this.requestVersion && !this._disposed) { movie.detailsLoading = false; this.forceUpdate?.(); }
            }
        }
        async getMagnets(movie, source = this.state.src) {
            const query = new URLSearchParams({ source: sourceKey(source), sortBy: this.state.sortBy, sortOrder: this.state.sortOrder, exclude4k: String(this.state.exclude4k) });
            if (this.state.sub !== '0') query.set('hasSubtitle', this.state.sub);
            if (sourceKey(source) === 'javbus') {
                if (movie.raw.gid) query.set('gid', movie.raw.gid);
                if (movie.raw.uc !== undefined) query.set('uc', movie.raw.uc);
            }
            const result = await this.request(`/api/magnets/${id(movie.code)}?${query}`);
            const magnets = Array.isArray(result) ? result : result.magnets || [];
            return magnets.map(magnet => ({ ...magnet, name: magnet.title || magnet.name || movie.code, source: magnet.source || sourceKey(source), movie_id: movie.code }));
        }

        runSearch = async () => {
            const version = ++this.requestVersion, st = { ...this.state };
            data.MOVIES.splice(0); this.magnets.clear();
            this.setState({ loading: true, sel: [], detail: null, searchError: '', searchDone: false, nextPage: false, searchPage: null });
            try {
                let payload;
                if (st.sMode === 'recognize') payload = await this.request('/api/movies/recognize', 'POST', { html_content: st.recogHtml, auto_download: false, magnet_source: sourceKey(st.src), has_subtitle_filter: st.sub === '0' ? null : st.sub, exclude_4k: st.exclude4k });
                else if (st.sMode === 'filter') {
                    const query = new URLSearchParams({ filters: JSON.stringify(st.fList.map(({ type, value }) => ({ type, value }))), magnet: st.magParam, type: st.kind, page: String(st.page), excludeVr: String(st.excludeVr) });
                    if (st.sub !== '0') query.set('hasSubtitle', st.sub);
                    const count = { '1 人': '1', '2 人': '2', '3 人': '3', '≤ 2 人': '<=2', '≤ 3 人': '<=3', '≥ 3 人': '>=3', '≥ 4 人': '>=4' }[st.actorCount];
                    if (count) query.set('actorCountFilter', count);
                    payload = await this.request(`/api/movies${st.fetchMode === 'all' ? '/all' : ''}?${query}`);
                } else {
                    if (!st.code.trim()) throw new Error('请填写番号');
                    payload = { movies: [st.sMode === 'magnet' && sourceKey(st.src) !== 'javbus' ? { id: st.code.trim() } : await this.request(`/api/movies/${id(st.code.trim())}`)] };
                }
                if (version !== this.requestVersion || this._disposed) return;
                const detailsLoaded = st.sMode === 'code' || st.sMode === 'magnet' && sourceKey(st.src) === 'javbus';
                const movies = (payload.movies || []).map(movie => ({ ...movieView(movie), magnetsLoading: true, detailsLoaded, detailsLoading: !detailsLoaded && st.sMode !== 'magnet' }));
                data.MOVIES.splice(0, data.MOVIES.length, ...movies);
                this.magnets.clear();
                this.setState({ loading: false, magnetsLoading: true, searchDone: true, nextPage: Boolean(payload.pagination?.hasNextPage ?? payload.pagination?.nextPage ?? payload.has_next_page ?? movies.length >= 30) });
                // Keep the existing four-request ceiling while loading results in order.
                for (let offset = 0; offset < movies.length; offset += 4) {
                    await Promise.all(movies.slice(offset, offset + 4).map(async movie => {
                        try {
                            if (st.sMode !== 'magnet') {
                                try { await this.loadMovieDetails(movie, version); }
                                catch { /* Keep the summary and magnet lookup available if metadata fails. */ }
                            }
                            if (version !== this.requestVersion || this._disposed) return;
                            const magnets = await this.getMagnets(movie, st.src);
                            if (version !== this.requestVersion || this._disposed) return;
                            this.magnets.set(movie.code, magnets);
                            movie.mag = magnets[0] ? `${magnets[0].name} · ${magnets[0].size}` : '';
                            movie.magCount = magnets.length;
                        } catch (error) { movie.mag = ''; movie.magnetError = safeText(error.message); if (st.sMode === 'magnet') throw error; }
                        finally { movie.magnetsLoading = false; }
                    }));
                    if (version !== this.requestVersion || this._disposed) return;
                    this.forceUpdate?.();
                }
                if (st.autoDownload && st.sMode !== 'magnet') this.confirmDispatch(movies.map(movie => movie.code));
            } catch (error) {
                if (version === this.requestVersion && !this._disposed) { this.setState({ searchError: safeText(error.message), searchDone: true }); this.toast(safeText(error.message), BAD); }
            }
            if (version === this.requestVersion && !this._disposed) this.setState({ loading: false, magnetsLoading: false });
        };
        clearSearch() {
            ++this.requestVersion;
            data.MOVIES.splice(0); this.magnets.clear();
            this.setState({ loading: false, magnetsLoading: false, searchDone: false, searchError: '', nextPage: false, sel: [], detail: null });
        }
        visible() { return this.state.sMode === 'magnet' ? [] : data.MOVIES; }
        setSrc(src) { return () => { this.setState({ src }); if (this.state.searchDone || this.state.loading) void this.runSearch(); }; }
        dispatchOne(movie) { return () => this.confirmDispatch([movie.code]); }
        async finishDispatch(result, tool, preflight = []) {
            const results = [...preflight, ...(result.results || [])];
            this.setState({ dispatchResult: { ...result, results }, dispatchTool: tool });
            await this.perform(() => this.loadHistory());
            const failed = results.filter(item => item.success === false && !item.skipped).length;
            if (failed) throw new Error(`有 ${failed} 项未成功提交，请到下载派发页查看并重试`);
            if (!results.length || results.every(item => item.skipped)) { this.toast('全部资源已跳过，没有新增下载任务', WARN); return; }
            this.toast('下载任务已提交', OK);
        }
        confirmDispatch(codes, magnets, destination) {
            codes = [...new Set(codes.map(code => String(code).trim().toUpperCase()).filter(Boolean))];
            if (!codes.length) { this.toast('请选择影片或填写番号', WARN); return; }
            const st = { ...this.state, tool: destination || this.state.tool }, chosen = magnets || (st.route === 'search' ? codes.flatMap(code => (this.magnets.get(code) || []).slice(0, 1)) : null);
            this.ask({ title: `派发 ${codes.length} 部到 ${st.tool}？`, color: ACC, okText: '开始派发',
                body: '将提交真实下载任务；本地已有影片与已尝试链接由后端检查。', list: codes,
                run: () => this.perform(async () => {
                    const tool = toolKey(st.tool);
                    if (tool === 'pan115' && this.state.dispatchTask && !['completed', 'failed'].includes(this.state.dispatchTask.status)) throw new Error('已有 115 派发任务运行中，请等待完成');
                    let entries = chosen, preflight = [];
                    if (!entries) {
                        const payload = await this.request('/api/movies/batch', 'POST', { movie_ids: codes,
                            magnet_source: sourceKey(st.route === 'dispatch' ? st.dSrc : st.src), has_subtitle_filter: st.route === 'dispatch' ? (st.dSubOnly ? 'true' : null) : st.sub === '0' ? null : st.sub, exclude_4k: st.route === 'dispatch' ? st.dNo4k : st.exclude4k });
                        entries = [];
                        for (const item of payload.results || []) {
                            if (item.in_local_library) preflight.push({ movie_id: item.movie_id, success: false, skipped: true, reason: 'already_exists', message: '影片已在本地库中' });
                            else if (item.best_magnet?.link) entries.push({ ...item.best_magnet, movie_id: item.movie_id });
                            else preflight.push({ movie_id: item.movie_id, success: false, error: item.error || 'no_magnet', message: safeText(item.error, '没有符合条件的磁力，请调整来源或筛选条件') });
                        }
                    }
                    const usable = entries.filter(item => item.link || item.magnet_link);
                    if (!usable.length) {
                        if (!preflight.length) preflight = codes.map(movie_id => ({ movie_id, success: false, error: 'no_magnet', message: '没有符合条件的磁力' }));
                        await this.finishDispatch({ results: [] }, st.tool, preflight); return;
                    }
                    const body = { magnet_links: usable.map(item => item.link || item.magnet_link), movie_ids: usable.map(item => item.movie_id || codes[0]), magnet_sources: usable.map(item => item.source || sourceKey(st.route === 'dispatch' ? st.dSrc : st.src)) };
                    if (tool === 'pikpak' && this.auth && !this.auth.fromConfig) Object.assign(body, { username: this.auth.username, password: this.auth.password });
                    if (tool === 'pan115') {
                        const job = await this.request('/api/115/download-jobs', 'POST', body);
                        window.sessionStorage.setItem(jobStorage.dispatchTask, JSON.stringify({ taskId: job.job_id, type: 'dispatch', preflight }));
                        this.setState({ dispatchTask: { ...job, id: job.job_id, preflight }, dispatchTool: st.tool });
                        this.toast('115 派发已在后台启动，可在后台任务中查看进度', OK); return;
                    }
                    let result;
                    try { result = await this.request(tool === 'pikpak' ? '/api/pikpak/download' : '/api/aria2/download-magnets', 'POST', body); }
                    catch (error) { if (!error.result?.results) throw error; result = error.result; }
                    await this.finishDispatch(result, st.tool, preflight);
                }),
            });
        }

        async poll() {
            if (this._polling || this._disposed) return;
            this._polling = true;
            try {
                if (['transcode', 'library', 'cinema'].includes(this.state.route) || data.TC.some(task => ['running', 'queued'].includes(task.status))) await this.perform(() => this.loadTranscodes());
                if (this.state.route === 'storage' && this.state.connections.aria2_connected) await this.perform(() => this.loadAria());
                if (this.state.route === 'auto' || this.state.tasks.some(task => task.runs?.some(run => run.status === 'running'))) await this.perform(() => this.loadTasks());
                await this.perform(() => this.pollInformation());
                for (const [key, prefix] of [['scanTask', '/api/movies/local-library/scan/jobs/'], ['scrapeTask', '/api/movies/local-scrape/jobs/'], ['dispatchTask', '/api/115/download-jobs/'], ['cleanupTask', '/api/movies/local-library/clean-invalid/jobs/']]) {
                    const current = this.state[key];
                    if (!current || ['success', 'completed', 'failed'].includes(current.status)) continue;
                    await this.perform(async () => {
                        let task;
                        try { task = await this.request(prefix + id(current.id)); }
                        catch (error) {
                            if (error.status === 404) {
                                window.sessionStorage.removeItem(jobStorage[key]);
                                this.setState({ [key]: { ...current, status: 'failed', message: '后台任务已失效，服务可能已重启，请核对结果后重新操作' }, ...(key === 'scrapeTask' ? { scPhase: 'idle' } : key === 'scanTask' ? { lbScanning: false } : {}) });
                                throw new Error(key === 'dispatchTask' ? '115 后台任务已失效，请先核对下载历史和网盘任务，再重试未提交项' : '后台任务已失效，服务可能已重启，请重新扫描或生成预览');
                            }
                            throw error;
                        }
                        this.setState({ [key]: { ...current, ...task, id: current.id, operation: current.operation } });
                        if (key === 'cleanupTask') {
                            if (jobFinished(task)) {
                                await this.perform(() => this.loadLibrary());
                                this.toast(safeText(task.result?.message || task.message, '清洗任务结束，可在后台任务中查看结果'), task.status === 'failed' || task.result?.failed_files?.length ? WARN : OK);
                            }
                            return;
                        }
                        if (key === 'dispatchTask') {
                            if (['completed', 'failed'].includes(task.status)) {
                                if (!task.result) throw new Error('115 派发失败，请检查连接与下载历史');
                                await this.perform(() => this.finishDispatch(task.result, '115 网盘', current.preflight || []));
                            }
                            return;
                        }
                        if (key === 'scanTask' && task.result && ['success', 'completed', 'failed'].includes(task.status)) {
                            this.setState({ lbScanning: false, scanResult: task.result });
                            await this.perform(() => this.loadLibrary());
                            const message = safeText(task.message || task.result.message, '扫描已完成');
                            this.toast(message, task.status === 'failed' ? WARN : OK);
                            return;
                        }
                        if (key === 'scrapeTask' && current.operation === 'apply' && task.result && ['success', 'completed', 'failed'].includes(task.status)) {
                            this.setState({ scPhase: 'idle', scrapeResult: task.result }); data.SCRAPE_ROWS.splice(0);
                            await this.perform(() => this.loadLibrary());
                            this.toast(`刮削执行完成：${task.result.success_count || 0} 成功，${task.result.failed_count || 0} 失败`, task.status === 'failed' ? WARN : OK);
                        } else if (['success', 'completed'].includes(task.status)) {
                            if (key === 'scanTask') { this.setState({ lbScanning: false }); await this.loadLibrary(); }
                            else this.applyScrapeResult(task.result);
                        } else if (task.status === 'failed') { this.setState(key === 'scrapeTask' ? { scPhase: 'idle' } : { lbScanning: false }); throw new Error(safeText(task.message || task.error)); }
                        else if (key === 'scrapeTask') this.setState({ scPct: task.percent || 0 });
                    });
                }
                if (this.state.qr?.session_id) await this.pollQr();
            } finally { this._polling = false; }
        }

        async startJob(key, url, payload, operation = 'preview') {
            this._startingJobs ||= new Set();
            if (this._startingJobs.has(key) || this.state[key] && !jobFinished(this.state[key])) throw new Error('同类后台任务正在运行，请等待完成');
            this._startingJobs.add(key);
            try {
                const config = key === 'scrapeTask' ? Object.fromEntries(scrapeConfigKeys.map(field => [field, this.state[field]])) : payload;
                const task = await this.request(url, 'POST', payload);
                window.sessionStorage.setItem(jobStorage[key], JSON.stringify({ taskId: task.task_id, type: operation, config }));
                this.setState({ [key]: { id: task.task_id, status: 'running', operation, payload: config } });
                return task;
            } finally { this._startingJobs.delete(key); }
        }

        showBackgroundResult(key) {
            const task = this.state[key];
            if (!task) return;
            if (key === 'scrapeTask' && task.result && (task.operation === 'apply' || task.status !== 'failed')) { this.go('scrape')(); return; }
            if (!jobFinished(task)) { this.go(key === 'dispatchTask' ? 'dispatch' : key === 'scrapeTask' ? 'scrape' : 'library')(); return; }
            this.setState({ bgOpen: false });
            const result = task.result || {}, failed = task.status === 'failed';
            const rows = key === 'scanTask' ? result.scans || [result] : key === 'cleanupTask' ? [...(result.deleted_files || []).map(row => ({ ...row, message: '已清洗' })), ...(result.failed_files || [])] : result.results || [];
            this.ask({ title: key === 'scanTask' ? '扫描入库结果' : key === 'cleanupTask' ? '清洗结果' : key === 'dispatchTask' ? '115 派发结果' : '刮削任务失败',
                body: safeText(result.message || task.message, failed ? '任务失败，请修正配置后重试' : '任务已完成'), color: failed ? WARN : ACC,
                list: rows.map(row => `${row.path || row.directory || row.movie_id || ''} ${safeText(row.message || row.error, row.success === false ? '失败' : '已完成')}`),
                okText: '查看对应页面', run: () => { this.dismissBackgroundTask(key); this.go(key === 'dispatchTask' ? 'dispatch' : key === 'scrapeTask' ? 'scrape' : 'library')(); },
            });
        }

        dismissBackgroundTask(key) {
            window.sessionStorage.removeItem(jobStorage[key]);
            this.setState({ [key]: null });
        }

        startInformationJob(operation, payload) { return this.perform(async () => {
            if (this.state.infoStarting || this.state.informationTask && !jobFinished(this.state.informationTask)) {
                this.toast('资料任务正在后台运行，请在后台任务中查看进度', WARN); return;
            }
            if (!payload.fields?.length) throw new Error('请至少选择一项检查内容');
            this.setState({ infoStarting: true });
            try {
                const url = `/api/movies/local-library/information/${operation}/jobs` + (operation === 'check' ? '?fields=' + id(payload.fields.join(',')) : '');
                await this.startJob('informationTask', url, payload, operation);
                this.setState({ lbCheckCfg: false });
                this.toast(`资料${operation === 'check' ? '检查' : '补全'}已在后台启动，可在后台任务中查看进度`, OK);
            } finally { this.setState({ infoStarting: false }); }
        }); }

        async pollInformation() {
            const current = this.state.informationTask;
            if (!current || jobFinished(current)) return;
            let task;
            try { task = await this.request('/api/movies/local-library/information/jobs/' + id(current.id)); }
            catch (error) {
                if (error.status !== 404) throw error;
                task = { status: 'failed', message: '资料任务已失效，服务可能已重启或结果已过期，请重新检查' };
            }
            const next = { ...current, ...task };
            this.setState({ informationTask: next });
            if (!jobFinished(next)) return;
            this.toast(informationSummary(next) + '；可在后台任务中查看结果', next.status === 'failed' || next.result?.failed_count ? WARN : OK);
            if (next.result) {
                this._readGeneration++;
                await this.perform(() => this.loadLibrary());
                const check = next.operation === 'check' ? next.result : next.result.information_check;
                if (check) this.applyInformationCheck(check);
            }
        }

        showInformationResult() {
            const task = this.state.informationTask;
            this.setState({ bgOpen: false });
            if (!jobFinished(task)) { this.setState({ bgOpen: true }); return; }
            const check = task.operation === 'check' ? task.result : task.result?.information_check;
            const missing = check?.incomplete_records || [];
            this.ask({ title: task.operation === 'check' ? '资料检查结果' : '资料补全结果', body: informationSummary(task), color: task.status === 'failed' || task.result?.failed_count ? WARN : ACC,
                list: [...(task.result?.results || []).filter(row => !row.success).map(row => `${row.movie_id}：补全失败，${safeText(row.asset_error || row.error, '请检查刮削源或文件写入权限')}`),
                    ...missing.map(row => `${row.movie_id}：${row.missing_labels?.join('、') || row.missing_fields?.join('、') || '本地文件待核验'}`)],
                okText: task.status === 'failed' ? '重新检查' : missing.length ? task.operation === 'check' ? '开始补全' : '继续补全' : '完成',
                run: () => task.status === 'failed' ? this.startInformationJob('check', { fields: task.payload?.fields || this.state.infoFields })
                    : missing.length ? this.completeInformation(missing.map(row => row.movie_id), true, check.fields)
                    : this.dismissInformationTask(),
            });
        }

        dismissInformationTask() {
            window.sessionStorage.removeItem(jobStorage.informationTask);
            this.setState({ informationTask: null });
        }

        cinemaCounts(actor) {
            if (this._cinemaCounts?.actor === actor) return this._cinemaCounts.counts;
            const counts = new Map(data.FILTER_DIMS.map(dim => [dim.key, new Map()]));
            for (const movie of data.LIB) {
                if (actor && !movie.actors.includes(actor)) continue;
                for (const [key, field] of [['actor', 'actors'], ['series', 'series'], ['studio', 'studio'], ['res', 'res'], ['flag', 'tags']]) {
                    for (const value of new Set(Array.isArray(movie[field]) ? movie[field] : [movie[field]])) {
                        const group = counts.get(key);
                        group.set(value, (group.get(value) || 0) + 1);
                    }
                }
            }
            this._cinemaCounts = { actor, counts };
            return counts;
        }

        pageItems(items, key, filters, limit = 60) {
            const signature = JSON.stringify(filters), saved = this.state[key];
            const pages = Math.max(1, Math.ceil(items.length / limit));
            const index = Math.min(saved?.signature === signature ? saved.index : 0, pages - 1);
            return { items: items.slice(index * limit, (index + 1) * limit), paging: {
                visible: pages > 1, text: `第 ${index + 1} / ${pages} 页 · 共 ${items.length} 项`, first: index === 0, last: index === pages - 1,
                prev: () => this.setState({ [key]: { signature, index: Math.max(0, index - 1) } }),
                next: () => this.setState({ [key]: { signature, index: Math.min(pages - 1, index + 1) } }),
            } };
        }

        playCinema(code, fileIndex) {
            const files = this.libraryByCode.get(code)?.raw.files || [];
            const index = fileIndex ?? files.findIndex(file => file.exists !== false);
            if (!Number.isInteger(index) || !files[index] || files[index].exists === false) { this.toast('本地文件缺失，请重新扫描影视库', WARN); return; }
            this.setState({ cnPlaying: code, playerIndex: index, cnPaused: false, cnBuffering: false });
        }

        vCinema() {
            const st = this.state;
            const clearFacets = () => ({ actor: [], series: [], studio: [], res: [], flag: [] });
            const browse = filters => this.setState({ cnTab: '全部影片', cnActor: null, cnDetail: null, cnQ: '', cnF: { ...clearFacets(), ...filters } });
            const controls = {
                query: st.cnQ, hasQuery: Boolean(st.cnQ), hasLibrary: Boolean(data.LIB.length),
                setQuery: event => this.setState({ cnQ: event.target.value, cnTab: '全部影片', cnActor: null }),
                clearQuery: () => this.setState({ cnQ: '' }), browseAll: () => browse(),
                closeDetail: () => this.setState({ cnDetail: null }), detailOpen: Boolean(st.cnDetail || st.cnPlaying), playing: Boolean(st.cnPlaying),
                exit: this.go('library'), imageError: event => { event.currentTarget.hidden = true; },
                closePlayer: () => this.setState({ cnPlaying: null }),
            };
            if (!data.LIB.length) return { ...controls, tabs: [], showHero: false, showShelves: false, showWall: true, showActors: false, wall: [], wallEmpty: true, wallTitle: '你的影院', wallMeta: '本地影片收藏', emptyTitle: st.libraryLoaded ? '开始建立你的影院' : '正在读取影视库…', emptyBody: '添加媒体路径并扫描入库后，即可在这里浏览和播放。', clearText: '配置影视库', clearFilters: this.go('library'), filterGroups: [], sorts: [], filterCount: 0, hasFilters: false };
            const view = Object.assign(super.vCinema(), controls);
            const open = code => this.setState({ cnHero: code, cnDetail: code, cnDetailFile: Math.max(0, this.libraryByCode.get(code)?.raw.files?.findIndex(file => file.exists !== false) ?? 0) });
            const presentation = movie => ({
                code: movie.code, title: movie.title, cover: movie.cover,
                backdrop: imageSource(movie.raw.backdrop_url || movie.raw.metadata?.backdrop_url || movie.raw.cover_url || movie.raw.metadata?.cover_url || '') || movie.cover,
                meta: [movie.code, movie.date.slice(0, 4), movie.dur.startsWith('—') ? '' : movie.dur, movie.res, movie.codec.toUpperCase()].filter(value => value && value !== '—').join(' · '),
                desc: movie.raw.plot || movie.raw.description || movie.raw.metadata?.plot || movie.raw.metadata?.description || [movie.actors.join(' / '), movie.studio === '—' ? '' : movie.studio, movie.series === '—' ? '' : movie.series].filter(Boolean).join(' · ') || '暂无影片简介，可在影视库中补全资料。',
                unavailable: !(movie.raw.files || []).some(file => file.exists !== false),
            });
            const card = movie => ({ code: movie.code, title: movie.title, cover: movie.cover, res: movie.res === '—' ? '' : movie.res,
                caption: [movie.code, movie.date.slice(0, 4)].filter(Boolean).join(' · '),
                unavailable: !(movie.raw.files || []).some(file => file.exists !== false), open: () => open(movie.code),
            });
            view.tabs = view.tabs.map(tab => ({ ...tab, current: tab.name === st.cnTab ? 'page' : undefined, pick: () => this.setState({ cnTab: tab.name, cnActor: null, cnQ: '' }) }));
            const hero = this.libraryByCode.get(view.hero.code);
            Object.assign(view.hero, presentation(hero));
            view.hero.playText = view.hero.unavailable ? '文件缺失' : '播放';
            view.showHero = st.cnTab === '推荐';
            view.play = () => this.playCinema(hero.code);
            view.info = () => open(hero.code);
            view.transcode = () => this.openTranscode(hero.code);
            view.libMeta = `${data.LIB.length} 部`;
            view.sort = st.cnSort;
            view.setSort = event => this.setState({ cnSort: event.target.value });
            view.wallTitle = view.actorHeader?.name || (st.cnQ.trim() ? '搜索结果' : '全部影片');
            view.wallMeta = st.cnQ.trim() ? `命中 ${view.wall.length} 部 · “${st.cnQ.trim()}”` : view.wallMeta;
            view.emptyTitle = '没有符合条件的影片'; view.emptyBody = '试试其他关键词，或移除筛选条件。'; view.clearText = '清空条件';
            view.clearFilters = () => this.setState({ cnQ: '', cnF: clearFacets() });
            view.activeFilters = data.FILTER_DIMS.flatMap(dim => (view.actorHeader && dim.key === 'actor' ? [] : st.cnF[dim.key]).map(value => ({ text: `${dim.name} · ${value}`, remove: () => this.setState({ cnF: { ...st.cnF, [dim.key]: st.cnF[dim.key].filter(item => item !== value) } }) })));
            for (const group of view.filterGroups) {
                const dim = data.FILTER_DIMS.find(dim => dim.name === group.name);
                for (const item of group.items) item.on = st.cnF[dim.key].includes(item.name);
            }
            if (st.cnDetail && this.libraryByCode.has(st.cnDetail)) {
                const movie = this.libraryByCode.get(st.cnDetail), files = movie.raw.files || [];
                const index = st.cnDetailFile, file = files[index];
                view.detail = { ...presentation(movie), fileIndex: String(index), playText: file && file.exists !== false ? '播放' : '文件缺失', unavailable: !file || file.exists === false,
                    fields: [['发行日期', movie.date], ['制作商', movie.studio], ['系列', movie.series], ['导演', movie.director], ['本地文件', `${files.length} 个 · ${movie.size}`]].filter(([, value]) => value && value !== '—').map(([name, value]) => ({ name, value })),
                    actors: movie.actors.map(name => ({ name, open: () => { this.setState({ cnTab: '演员', cnActor: name, cnDetail: null, cnQ: '', cnF: clearFacets() }); } })),
                    tags: movie.tags.map(name => ({ name, open: () => browse({ flag: [name] }) })), noTags: !movie.actors.length && !movie.tags.length,
                    files: files.map((file, i) => ({ value: String(i), label: `${i + 1}. ${file.file_name || file.path.split(/[\\/]/).pop()}${file.exists === false ? '（文件缺失）' : ''}`, missing: file.exists === false })),
                    fileMeta: file ? [size(file.size), file.media_info?.codec || movie.codec, file.media_info?.height ? `${file.media_info.height}p` : movie.res].join(' · ') : '没有可用文件',
                    selectFile: event => { const index = Number(event.target.value); if (files[index] && files[index].exists !== false) this.setState({ cnDetailFile: index }); },
                    play: () => this.playCinema(movie.code, index), manage: () => this.setState({ route: 'library', lbDetail: movie.code, cnDetail: null }),
                };
            }
            if (view.player) {
                const playing = this.libraryByCode.get(st.cnPlaying), files = playing.raw.files || [];
                view.player.url = `/api/movies/local-library/${id(st.cnPlaying)}/play?file_index=${st.playerIndex || 0}`;
                view.player.error = () => this.toast('浏览器无法播放此文件，可从影片详情创建硬件转码任务', WARN);
                view.player.files = files.map((file, index) => ({ value: String(index), label: `${index + 1}. ${file.path.split(/[\\/]/).pop()}`, missing: file.exists === false }));
                view.player.fileIndex = String(st.playerIndex || 0);
                view.player.selectFile = event => this.playCinema(playing.code, Number(event.target.value));
                view.player.ended = () => { const next = files.findIndex((file, index) => index > (this.state.playerIndex || 0) && file.exists !== false); if (next >= 0) this.playCinema(playing.code, next); };
            }
            const shelf = (name, movies, filters) => ({ name, meta: `${movies.length} 部`, openAll: () => browse(filters), items: movies.slice(0, 12).map(card),
                previous: event => scrollShelf(event, -1), next: event => scrollShelf(event, 1),
            });
            const scrollShelf = (event, direction) => {
                const track = event.currentTarget.closest('.jj-cinema-shelf').querySelector('.jj-cinema-shelf-track');
                track.scrollBy({ left: direction * track.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            };
            if (st.cnTab === '推荐') {
                const recent = [...data.LIB].sort((a, b) => b.added.localeCompare(a.added));
                view.shelves = [shelf('最近入库', recent), shelf('高清收藏', recent.filter(movie => parseInt(movie.res) >= 1080), { res: [...new Set(recent.filter(movie => parseInt(movie.res) >= 1080).map(movie => movie.res))] }), shelf('VR 影厅', recent.filter(movie => movie.vr), { flag: ['VR'] })].filter(shelf => shelf.items.length);
            }
            if (['系列', 'VR'].includes(st.cnTab)) {
                const vr = st.cnTab === 'VR', groups = new Map();
                for (const movie of data.LIB) {
                    if (vr ? !movie.vr : movie.series === '—') continue;
                    const key = vr ? movie.res : movie.series;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(movie);
                }
                view.shelves = [...groups].map(([key, movies]) => shelf(vr ? `VR ${key}` : key, movies, vr ? { res: [key], flag: ['VR'] } : { series: [key] }));
            }
            view.sectionTitle = st.cnTab === '系列' ? '系列收藏' : st.cnTab === 'VR' ? 'VR 影厅' : '';
            view.sectionMeta = `${view.shelves.length} 个分区`;
            view.shelvesEmpty = !view.shelves.length;
            view.sectionEmpty = st.cnTab === 'VR' ? '暂无 VR 影片' : '暂无系列收藏';
            const shelves = this.pageItems(view.shelves, 'cnShelfPage', [st.cnTab], 6);
            view.shelves = shelves.items; view.shelfPaging = shelves.paging;
            const wall = this.pageItems(view.wall, 'cnPage', [st.cnTab, st.cnActor, st.cnF, st.cnSort, st.cnQ]);
            view.wall = wall.items.map(row => card(this.libraryByCode.get(row.code))); view.paging = wall.paging;
            const actors = this.pageItems(view.actors, 'cnActorPage', []);
            view.actors = actors.items; view.actorPaging = actors.paging;
            view.actorsMeta = `${data.CN_ACTORS.length} 位本地演员`; view.actorsEmpty = !data.CN_ACTORS.length;
            const avatars = new Map(data.CN_ACTORS.map(actor => [actor.name, actor.avatar_url]));
            for (const actor of view.actors) actor.avatarUrl = avatars.get(actor.name) || '';
            return view;
        }

        saveLibraryWidths(widths) {
            this.setState({ lbWidths: widths });
            try { window.localStorage.setItem(libraryWidthsKey, JSON.stringify(widths)); } catch {}
        }

        resizeLibraryColumn(event, index) {
            const handle = event.currentTarget, table = handle.closest('table');
            const headers = [...table.querySelectorAll('th')];
            const widths = headers.map(header => header.getBoundingClientRect().width);
            const clamp = width => Math.max(libraryColumns[index][2], Math.min(1200, width));
            if (event.type === 'keydown') {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                widths[index] = clamp(event.key === 'Home' ? 0 : event.key === 'End' ? 1200 : widths[index] + (event.key === 'ArrowRight' ? 16 : -16));
                this.saveLibraryWidths(widths);
                return;
            }
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            this._cancelLibraryResize?.();
            handle.focus({ preventScroll: true });
            const startX = event.clientX, startWidth = widths[index], previousWidth = table.style.width;
            const previousHeaders = headers.map(header => header.style.width), previousValue = handle.getAttribute('aria-valuenow');
            const move = next => {
                widths[index] = clamp(startWidth + next.clientX - startX);
                headers.forEach((header, i) => { header.style.width = `${widths[i]}px`; });
                table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
                handle.setAttribute('aria-valuenow', Math.round(widths[index]));
            };
            const finish = commit => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', done);
                handle.removeEventListener('pointercancel', cancel);
                handle.removeEventListener('lostpointercapture', cancel);
                this._cancelLibraryResize = null;
                if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
                table.classList.remove('jj-resizing');
                if (commit) this.saveLibraryWidths(widths);
                else {
                    table.style.width = previousWidth;
                    headers.forEach((header, i) => { header.style.width = previousHeaders[i]; });
                    handle.setAttribute('aria-valuenow', previousValue);
                }
            };
            const done = () => finish(true), cancel = () => finish(false);
            this._cancelLibraryResize = cancel;
            table.classList.add('jj-resizing');
            handle.setPointerCapture(event.pointerId);
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', done);
            handle.addEventListener('pointercancel', cancel);
            handle.addEventListener('lostpointercapture', cancel);
        }

        vLibrary() {
            const view = super.vLibrary(), st = this.state;
            view.tableWidth = st.lbWidths.length ? `${st.lbWidths.reduce((sum, width) => sum + width, 0)}px` : 'max(100%, 1150px)';
            view.columns = libraryColumns.map(([label, width, min], index) => ({ label, width: st.lbWidths[index] || width, min,
                cssWidth: st.lbWidths.length ? `${st.lbWidths[index]}px` : ({ 2: 'auto', 3: '24%' }[index] || `${width}px`),
                resize: event => this.resizeLibraryColumn(event, index),
            }));
            view.resetWidths = () => this.saveLibraryWidths([]);
            const totalSize = data.LIB.reduce((sum, movie) => sum + Number(movie.raw.total_size || 0), 0);
            view.stats = [stat('影片', data.LIB.length), stat('文件', data.LIB.reduce((sum, movie) => sum + movie.files, 0)), stat('占用容量', size(totalSize), '', ACC), stat('待补资料', st.checkResult?.incomplete_count ?? '待检查', '', WARN)];
            view.paths = st.lbPaths.map(path => ({ path, status: '已配置', fg: 'var(--fg)', stFg: DIM, scan: () => this.scanLibrary([path]) }));
            view.sourceDirectory = st.librarySettings?.source_directory || '尚未配置';
            view.sourcePath = st.lbSource;
            view.setSourcePath = event => this.setState({ lbSource: event.target.value });
            view.browseSource = () => this.perform(() => this.browseDirectory(st.lbSource, { key: 'lbSource' }));
            view.openScrape = this.go('scrape');
            view.openPaths = () => this.openLibraryPaths();
            view.closePaths = () => this.setState({ lbPathCfg: false, lbSource: st.librarySettings?.source_directory || '', lbPaths: st.librarySettings?.directories || [], lbExcludes: st.librarySettings?.ignored_paths || [] });
            view.pathGroups = [['影视库目录（刮削输出）', 'lbPaths', '第一项作为默认输出目录，保存后同步到本地刮削'], ['排除目录', 'lbExcludes', '扫描影视库时跳过这些路径']].map(([name, key, hint]) => ({ name, hint, empty: !st[key].length, emptyText: '尚未添加路径',
                add: () => this.setState({ [key]: [...st[key], ''] }), rows: st[key].map((path, index) => ({ path, status: '', stFg: DIM2,
                    change: event => this.setState({ [key]: st[key].map((value, i) => i === index ? event.target.value : value) }),
                    browse: () => this.perform(() => this.browseDirectory(path, { key, index })), remove: () => this.setState({ [key]: st[key].filter((_, i) => i !== index) }),
                })),
            }));
            view.savePaths = () => this.perform(async () => {
                await this.saveLibraryPaths({ source_directory: st.lbSource, directories: st.lbPaths, ignored_paths: st.lbExcludes });
                this.setState({ lbPathCfg: false });
            }, '路径配置已保存');
            view.scanAll = () => this.scanLibrary(st.librarySettings?.directories || st.lbPaths);
            view.refresh = () => this.perform(() => this.loadLibrary(), '影视库已刷新');
            view.stopScan = () => this.toast('当前扫描由后端运行，完成后会自动更新', WARN);
            view.runSearch = () => this.forceUpdate?.();
            view.checkItems = [['title', '标题'], ['date', '发行日期'], ['stars', '演员'], ['genres', '标签'], ['cover_url', '封面链接'], ['nfo', 'NFO 文件'], ['poster_file', '本地封面']].map(([key, label]) => ({ label, hint: '', on: st.infoFields.includes(key), toggle: () => this.setState({ infoFields: st.infoFields.includes(key) ? st.infoFields.filter(value => value !== key) : [...st.infoFields, key] }) }));
            view.scanMessage = st.scanTask?.message || '扫描任务运行中，完成后自动更新';
            view.scanPercent = st.scanTask?.percent || 0;
            const sortField = st.lbSort.startsWith('发行') ? 'date' : st.lbSort.startsWith('番号') ? 'code' : st.lbSort.includes('体积') ? 'total_size' : 'added';
            view.rows.sort((a, b) => { const left = this.libraryByCode.get(a.code), right = this.libraryByCode.get(b.code); return sortField === 'total_size' ? Number(right.raw.total_size || 0) - Number(left.raw.total_size || 0) : sortField === 'code' ? left.code.localeCompare(right.code) : String(right[sortField]).localeCompare(String(left[sortField])); });
            const page = this.pageItems(view.rows, 'lbPage', [st.lbQ, st.lbActor, st.lbStudio, st.lbRes, st.lbM, st.lbSubOnly, st.lbMissing, st.lbSort]);
            view.rows = page.items; view.paging = page.paging;
            for (const row of view.rows) { const movie = this.libraryByCode.get(row.code); row.cover = movie?.cover; row.cNote = movie?.unchecked ? '本地文件待核验' : st.checkResult ? row.cNote : '待检查'; row.completeness = st.checkResult && !movie?.unchecked ? row.completeness : '—'; }
            view.actorOptions = ['全部演员', ...new Set(data.LIB.flatMap(movie => movie.actors))].map(t => ({ t }));
            view.studioOptions = ['全部制作商', ...new Set(data.LIB.map(movie => movie.studio))].map(t => ({ t }));
            view.checkBusy = st.infoStarting || Boolean(st.informationTask && !jobFinished(st.informationTask));
            view.configureCheck = () => this.setState({ lbCheckCfg: true });
            view.openCheck = view.runCheck = () => this.startInformationJob('check', { fields: [...st.infoFields] });
            view.clean = () => this.ask({ title: '清洗无效媒体文件？', body: '只删除确认为空文件或不含视频流的文件。超时、读取失败等无法确认的文件会保留；删除后同步更新索引。此操作不可撤销。', ackText: '我确认永久删除无效视频文件', color: BAD, okText: '清洗',
                run: () => this.perform(() => this.startJob('cleanupTask', '/api/movies/local-library/clean-invalid/jobs', undefined, 'cleanup'), '清洗已在后台启动，可在后台任务中查看进度'),
            });
            view.purgeDb = () => this.ask({ title: '清空影视库索引？', body: '只清除影视库索引，保留媒体文件。', ackText: '我确认清空全部索引', color: BAD, okText: '清空',
                run: () => this.perform(async () => { await this.request('/api/movies/local-library', 'DELETE'); await this.loadLibrary(); }, '影视库索引已清空'),
            });
            view.actors = data.CN_ACTORS.map(actor => ({ ...actor, avatarUrl: actor.avatar_url || '', initial: actor.name.slice(0, 1), meta: `${actor.count} 部`, avatar: actor.noAvatar ? '暂无头像' : '本地头像', avatarFg: DIM2, open: () => this.setState({ lbActor: actor.name, lbView: 'list' }) }));
            if (view.showActor) { const actors = this.pageItems(view.actors, 'lbActorPage', []); view.actors = actors.items; view.paging = actors.paging; }
            view.empty = !(view.showActor ? view.actors.length : view.rows.length);
            view.showList = view.showList && !view.empty;
            view.showPoster = view.showPoster && !view.empty;
            view.emptyTitle = !st.libraryLoaded ? '正在读取影视库…' : !data.LIB.length ? '开始建立你的影视库' : view.showActor ? '暂无演员信息' : '没有符合条件的影片';
            view.emptyBody = !st.libraryLoaded ? '正在加载影片与媒体信息。' : !data.LIB.length ? '配置待刮削目录和影视库目录，再到本地刮削生成预览并整理入库。已有收藏可直接扫描影视库目录。' : view.showActor ? '扫描或补全影片资料后，演员会出现在这里。' : '试试其他关键词，或清除筛选查看全部影片。';
            view.emptyActionText = data.LIB.length ? '清除筛选' : '配置媒体目录';
            view.emptyAction = data.LIB.length ? view.reset : view.openPaths;
            view.showEmptyAction = st.libraryLoaded && (!view.showActor || !data.LIB.length);
            const record = data.LIB.find(movie => movie.code === st.lbDetail);
            if (view.d && record) {
                view.d.cover = record.cover;
                view.d.fields = [['发行日期', record.date], ['制作商', record.studio], ['发行商', record.label], ['系列', record.series], ['分辨率 / 编码', `${record.res} · ${record.codec}`], ['体积', record.size]].map(([k, v]) => ({ k, v, fg: 'var(--fg)', mono: 'inherit', fs: '12px' }));
                view.d.files = (record.raw.files || []).map((file, index) => ({ idx: index, path: file.path, size: size(file.size), codec: file.media_info?.codec || record.codec, status: file.exists === false ? '文件缺失' : '已索引', stFg: file.exists === false ? BAD : OK, fg: 'var(--fg)', gone: file.exists === false,
                    play: () => this.setState({ cnPlaying: record.code, playerIndex: index, route: 'cinema', lbDetail: null }), transcode: () => this.openTranscode(record.code, index),
                }));
                view.d.complete = () => this.completeInformation([record.code], true);
                view.d.recheck = () => this.completeInformation([record.code], false);
                view.d.remove = () => this.deleteMovie(record, false);
                view.d.purge = () => this.deleteMovie(record, true);
            }
            if (st.lbTc) view.tcDialog = this.transcodeDialog(st.lbTc);
            return view;
        }
        deleteMovie(movie, files) {
            this.ask({ title: `${files ? '彻底删除' : '移除'} ${movie.code}？`, color: files ? BAD : WARN, okText: files ? '永久删除文件' : '移除记录',
                body: files ? '永久删除已登记的媒体及配套文件，并移除索引。此操作不可撤销。' : '仅移除索引，保留硬盘文件。',
                ackText: files ? '我确认永久删除这些文件' : '', list: files ? (movie.raw.files || []).map(file => file.path) : [],
                run: () => this.perform(async () => { await this.request(`/api/movies/local-library/${id(movie.code)}${files ? '/files' : ''}`, 'DELETE'); this.setState({ lbDetail: null }); await this.loadLibrary(); }, files ? '文件已删除' : '记录已移除'),
            });
        }
        completeInformation(codes, onlyMissing, fields = this.state.infoFields) {
            return this.startInformationJob('download', { movie_ids: codes, fields, only_missing: onlyMissing, write_nfo: true, download_images: true, overwrite_existing: !onlyMissing });
        }
        scanLibrary(paths) {
            const directories = paths.map(path => path.trim()).filter(Boolean);
            if (!directories.length) { this.setState({ lbPathCfg: true }); return; }
            this.ask({ title: '扫描入库？', body: '扫描影视库目录并导入媒体与 NFO 信息，跳过待刮削目录。', list: directories, color: ACC, okText: '开始扫描',
                run: () => this.perform(async () => { await this.startJob('scanTask', '/api/movies/local-library/scan/jobs', { directories, ignored_paths: this.state.lbExcludes, recursive: true, probe_media: true }, 'scan'); this.setState({ lbScanning: true }); }, '后台扫描已启动'),
            });
        }
        openTranscode(code, fileIndex = 0) { return this.perform(async () => {
            const selection = { code, fileIndex };
            this.setState({ route: 'library', lbTc: selection, tcCaps: {}, tcOptions: {}, lbTcPreset: '', tcCapsLoading: true });
            try {
                await this.loadTranscodes(true);
                if (this.state.lbTc !== selection || this._disposed) return;
                const preset = this.state.tcCaps.presets?.find(item => item.id === 'adaptive_h265' && item.available !== false) || this.state.tcCaps.presets?.find(item => item.available !== false);
                this.setState({ lbTcPreset: preset?.id || '' });
            } finally { this.setState({ tcCapsLoading: false }); }
        }); }
        transcodeDialog(selection) {
            const movie = data.LIB.find(item => item.code === selection.code);
            if (!movie) return null;
            const caps = this.state.tcCaps, presets = caps.presets || [], st = this.state;
            const preset = presets.find(item => item.id === st.lbTcPreset);
            return { code: movie.code, file: movie.raw.files?.[selection.fileIndex]?.path || '', src: [{ k: '编码', v: movie.codec }, { k: '分辨率', v: movie.res }, { k: '体积', v: movie.size }],
                presets: presets.map(item => ({ name: item.name, tag: item.available === false ? '不可用' : item.options?.video_codec || '', desc: item.description, codec: item.options?.video_codec,
                    estimate: '', on: st.lbTcPreset === item.id, disabled: item.available === false || !caps.gpu_available, cursor: 'pointer', op: item.available === false ? '.5' : '1',
                    bg: st.lbTcPreset === item.id ? 'rgba(145,132,217,.09)' : 'var(--t03)', ring: st.lbTcPreset === item.id ? ACC : 'var(--t09)', tagFg: ACC, tagBg: 'var(--t08)', codecFg: DIM,
                    pick: () => this.setState({ lbTcPreset: item.id, tcOptions: {} }),
                })), custom: Boolean(preset) && !preset.adaptive, canSubmit: !st.tcCapsLoading && caps.gpu_available && preset?.available !== false && Boolean(preset), customFields: [
                    this.formField('编码器', st.tcOptions.video_codec ?? preset?.options?.video_codec ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, video_codec: value } }), 'select', caps.available_encoders || []),
                    this.formField('CQ / CRF', st.tcOptions.crf ?? preset?.options?.crf ?? 24, value => this.setState({ tcOptions: { ...st.tcOptions, crf: Number(value) } })),
                    this.formField('最大高度（留空保持原始）', st.tcOptions.max_height ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, max_height: value ? Number(value) : null } })),
                    ...[['quality_mode', '质量模式', 'select', ['crf', 'bitrate']], ['video_bitrate_kbps', '视频码率 kbps', 'number'], ['speed_preset', '速度预设', 'select', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']], ['frame_rate', '帧率', 'number'], ['pixel_format', '像素格式', 'select', ['auto', 'yuv420p', 'yuv420p10le']], ['audio_codec', '音频编码', 'select', caps.audio_codecs || ['copy', 'aac']], ['audio_bitrate_kbps', '音频码率 kbps', 'number'], ['audio_channels', '音频声道', 'number'], ['copy_subtitles', '保留字幕', 'check'], ['copy_metadata', '保留元数据', 'check'], ['deinterlace', '去隔行', 'check']].map(([key, label, kind, options]) => this.formField(label, st.tcOptions[key] ?? preset?.options?.[key] ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, [key]: value === '' || kind === 'number' && value === 0 ? null : value } }), kind, options)),
                ], note: st.tcCapsLoading ? '正在检测 GPU 和可用转码预设…' : caps.gpu_available ? '仅对当前选中文件创建硬件转码任务，输出更小时才替换。' : '未检测到可用 GPU，无法创建转码任务。',
                openPanel: this.go('transcode'), submit: () => this.perform(async () => {
                    if (!caps.gpu_available || !preset || preset.available === false) throw new Error('没有可用的 GPU 转码预设');
                    await this.request('/api/movies/transcoding/tasks', 'POST', { movie_id: movie.code, file_index: selection.fileIndex, preset_id: st.lbTcPreset, options: preset.adaptive ? {} : st.tcOptions });
                    this.setState({ lbTc: null, lbDetail: null, route: 'transcode' }); await this.loadTranscodes();
                }, '转码任务已创建'),
            };
        }
        transcodeAction(task, action, method = 'POST') { return this.perform(async () => { await this.request(`/api/movies/transcoding/tasks/${id(task.id)}${action ? '/' + action : ''}`, method); await this.loadTranscodes(); }, '转码任务已更新'); }
        vTranscode() {
            const view = super.vTranscode(), caps = this.state.tcCaps;
            const page = this.pageItems(view.rows, 'tcPage', [this.state.tcF]);
            view.rows = page.items; view.paging = page.paging;
            const active = data.TC.filter(task => ['running', 'queued'].includes(task.status)), done = data.TC.filter(task => task.status === 'completed'), bad = data.TC.filter(task => ['failed', 'cancelled'].includes(task.status));
            view.stats = [stat('活动任务', active.length), stat('已完成', done.length, '', OK), stat('异常 / 取消', bad.length, '', WARN), stat('节省空间', size(done.reduce((sum, task) => sum + Math.max(0, task.raw.input_size - task.raw.output_size), 0)), '', ACC)];
            view.nActive = active.length; view.nDone = done.length; view.nBad = bad.length;
            view.maxConcurrent = caps.max_concurrent_tasks ?? '—';
            view.hardwareMessage = caps.gpu_error ? safeText(caps.gpu_error) : caps.gpu_available ? '硬件检测通过；只提供当前设备可用的预设。' : '未检测到可用的 GPU 硬件编码器，请检查 FFmpeg 和显卡驱动。';
            view.caps = [['FFmpeg', caps.ffmpeg_available], ['ffprobe', caps.ffprobe_available], ['GPU', caps.gpu_available]].map(([label, available]) => ({ label, value: available === undefined ? '待检测' : available ? '可用' : '不可用', dot: available ? OK : DIM2, fg: DIM }));
            view.presets = (caps.presets || []).map(preset => ({ name: preset.name, desc: preset.description, codec: preset.options?.video_codec, op: preset.available === false ? '.5' : '1', bg: 'var(--t03)', ring: 'var(--t09)', tagBg: 'var(--t08)', tagFg: ACC, codecFg: DIM, tag: preset.available === false ? '不可用' : '可用' }));
            view.refresh = () => this.perform(() => this.loadTranscodes(true), '转码队列已刷新');
            view.clean = () => this.ask({ title: '清理完成记录？', body: '仅移除已完成任务的记录，保留媒体文件。', color: WARN, okText: '清理', run: () => this.perform(async () => { for (const task of done) await this.request(`/api/movies/transcoding/tasks/${id(task.id)}`, 'DELETE'); await this.loadTranscodes(); }, '完成记录已清理') });
            for (const row of view.rows) {
                const task = data.TC.find(item => item.id === row.id);
                row.canDelete = ['completed', 'failed', 'cancelled'].includes(task.status);
                row.cancel = () => this.ask({ title: `取消 ${task.code} 转码？`, body: '终止编码并保留原文件。', color: WARN, okText: '取消任务', run: () => this.transcodeAction(task, 'cancel') });
                row.retry = () => this.transcodeAction(task, 'retry'); row.del = () => this.transcodeAction(task, '', 'DELETE');
            }
            if (view.d) {
                const task = data.TC.find(item => item.id === this.state.tcDetail);
                view.d.fields = [['文件', task.file], ['编码器', task.codec], ['硬件', task.gpu], ['输入大小', task.inSize], ['输出大小', task.outSize]].map(([k, v]) => ({ k, v, mono: 'inherit', fs: '12px' }));
                view.d.retry = () => this.transcodeAction(task, 'retry');
                view.d.cancel = () => this.transcodeAction(task, 'cancel');
                view.d.copy = () => this.perform(() => this.copyText(JSON.stringify(task.raw.options, null, 2)), '转码参数已复制');
            }
            return view;
        }

        scrapePayload() {
            const st = this.state, opts = { ...st.scOpts };
            for (const key of ['write_nfo', 'download_images', 'download_sample_images', 'download_actor_images', 'download_list_thumbnail']) opts[key] = Boolean(opts[key] && opts.scrape && (['write_nfo', 'download_images'].includes(key) || opts.download_images));
            return { ...opts, directory: st.scScanDir, target_directory: st.scOutDir || null, code_overrides: st.scOverrides || {},
                folder_template: st.scFolderRule, naming_template: st.scFileRule, max_depth: st.scMaxDepth === '' ? null : Number(st.scMaxDepth), concurrent: Number(st.scConcurrent) };
        }
        previewScrape() { return this.perform(async () => {
            if (this.state.scPhase === 'scanning') throw new Error('当前任务运行中，请等待完成');
            if (!this.state.scScanDir.trim()) throw new Error('请填写扫描目录');
            if (this.state.scOpts.organize && !this.state.scOutDir.trim()) throw new Error('请选择影视库目录；如需原地刮削，请关闭“整理到目标目录”');
            const payload = this.scrapePayload();
            if (!Number.isInteger(payload.concurrent) || payload.concurrent < 1 || payload.concurrent > 5) throw new Error('并发数应为 1–5 的整数');
            if (payload.max_depth !== null && (!Number.isInteger(payload.max_depth) || payload.max_depth < 0)) throw new Error('递归深度应为非负整数或留空');
            const task = await this.startJob('scrapeTask', '/api/movies/local-scrape/preview/jobs', payload);
            this.scrapePreviewConfig = JSON.stringify(payload);
            this.setState({ scPhase: 'scanning', scPct: 0, scRepair: null });
            return task;
        }); }
        applyScrapeResult(result) {
            if (!result || result.success === false) { this.setState({ scPhase: 'idle' }); throw new Error('刮削任务失败'); }
            this.setState({ scrapeResult: result, scPhase: 'preview', scPct: 100, scSkip: [], pathEdits: {}, scCmp: null, scInspect: null });
            const side = file => ({ size: size(file?.size), res: file?.height ? `${file.height}p` : '—', codec: file?.codec || '—', bitrate: file?.bitrate || '—', dur: file?.duration_seconds || '—', date: file?.modified_at || '—', path: file?.path || '—' });
            data.SCRAPE_ROWS.splice(0, data.SCRAPE_ROWS.length, ...(result.items || []).map(item => ({ raw: item, src: item.source_path, srcMeta: size(item.size || item.source_file?.size), code: item.code || '未识别', dst: item.target_video_path || item.target_path || '—', dstMeta: '',
                kind: item.target_duplicate || !(isConformingLocalScrapeItem(item) || !this.state.scOpts.scrape && item.scrape_status === 'recognized' && item.code) ? 'error' : item.target_exists ? 'conflict' : 'ok',
                note: item.target_duplicate ? '多个源文件指向同一目标，请修改命名规则' : getLocalScrapeIssueReason(item), existing: side(item.target_file), incoming: side(item.source_file), betterSide: '',
            })));
        }
        executeScrape(organize = this.state.scOpts.organize) {
            if (this.scrapePreviewConfig !== JSON.stringify(this.scrapePayload())) { this.toast('配置已改变，请重新生成预览后执行', WARN); return; }
            const skipped = new Set(this.state.scSkip), rows = data.SCRAPE_ROWS.filter(row => row.kind !== 'error' && !skipped.has(row.src));
            if (!rows.length) { this.toast('请先生成预览并选择可执行文件', WARN); return; }
            this.ask({ title: '执行刮削整理？', color: WARN, okText: '开始执行', ackText: organize ? '我已确认目标路径与冲突处理规则' : '', body: organize ? '会按预览移动或替换文件，请确认冲突处理。' : '在原目录写入元数据与图片，不移动视频。', list: rows.map(row => row.src),
                run: () => this.perform(async () => {
                    const payload = { ...this.scrapePayload(), organize, items: rows.map(row => ({ source_path: row.src, target_video_path: organize ? row.raw.target_video_path : undefined, code: row.raw.code, metadata: row.raw.metadata, conflict_resolution: this.state.pathEdits[row.src] || (row.kind === 'conflict' ? null : undefined) })) };
                    if (organize && rows.some(row => row.kind === 'conflict' && !this.state.pathEdits[row.src])) throw new Error('请先为冲突文件选择保留策略');
                    await this.startJob('scrapeTask', '/api/movies/local-scrape/apply/jobs', payload, 'apply'); this.setState({ scPhase: 'scanning' });
                }, '刮削执行已启动'),
            });
        }
        vScrape() {
            const view = super.vScrape(), st = this.state, rows = data.SCRAPE_ROWS;
            view.namingFields = LOCAL_SCRAPE_NAMING_FIELDS.map(field => field.placeholder).join(' ');
            view.browseSource = () => this.perform(() => this.browseDirectory(st.scScanDir, { key: 'scScanDir' }));
            view.browseTarget = () => this.perform(() => this.browseDirectory(st.scOutDir, { key: 'scOutDir' }));
            view.configurePaths = () => { this.openLibraryPaths(); this.setState({ route: 'library' }); };
            view.outcome = st.scPhase === 'idle' && st.scrapeResult?.results ? {
                summary: `${st.scrapeResult.success_count || 0} 成功，${st.scrapeResult.failed_count || 0} 失败${st.scrapeResult.library_failed_count ? `，${st.scrapeResult.library_failed_count} 个目录入库失败，请到影视库重新扫描` : ''}`,
                rows: st.scrapeResult.results.map(item => ({ path: item.target_video_path || item.source_path, status: item.success ? (item.skipped ? '已跳过' : '已完成') : '失败', note: safeText(item.message || item.error || item.image_error, ''), fg: item.success ? OK : BAD })),
            } : null;
            if (view.outcome) view.idle = false;
            view.setScanDir = event => this.setState({ scScanDir: event.target.value, scOverrides: {} });
            view.repair = st.scRepair ? { src: st.scRepair.src, code: st.scRepair.code, setCode: event => this.setState({ scRepair: { ...st.scRepair, code: event.target.value.toUpperCase() } }),
                cancel: () => this.setState({ scRepair: null }), submit: () => this.perform(async () => {
                    if (!st.scRepair.code.trim()) throw new Error('请填写正确番号');
                    this.setState({ scOverrides: { ...st.scOverrides, [st.scRepair.src]: st.scRepair.code.trim() } });
                    return this.previewScrape();
                }) } : null;
            view.openDesigner = () => this.setState({ scDesigner: true, scParts: st.scFileRule.match(/\{[^}]+\}|[^{}]+/g) || [] });
            if (view.designer) {
                view.designer.vars = [...LOCAL_SCRAPE_NAMING_FIELDS.map(field => field.placeholder), ' ', '-'].map(value => ({ t: value === ' ' ? '空格' : value, add: () => this.setState({ scParts: [...st.scParts, value] }) }));
                view.designer.preview = LOCAL_SCRAPE_NAMING_FIELDS.reduce((text, field) => text.replaceAll(field.placeholder, field.sample), st.scParts.join('')) + '.mkv';
            }
            view.subtitle = st.scPhase === 'preview' ? `扫描 ${st.scScanDir} · ${rows.length} 个文件` : st.scPhase === 'scanning' ? '后台任务运行中' : '配置扫描路径后生成预览';
            view.scanLog = (st.scrapeTask?.logs || []).map(entry => ({ t: safeText(typeof entry === 'string' ? entry : entry.message), fg: DIM }));
            view.stats = [stat('扫描文件', st.scrapeResult?.total_files ?? rows.length), stat('可执行', rows.filter(row => row.kind === 'ok').length, '', OK), stat('文件冲突', rows.filter(row => row.kind === 'conflict').length, '', WARN), stat('异常', rows.filter(row => row.kind === 'error').length, '', BAD)];
            const optionNames = { writeNfo: 'write_nfo', downloadImages: 'download_images', downloadSampleImages: 'download_sample_images', downloadActorImages: 'download_actor_images', downloadListThumbnail: 'download_list_thumbnail', overwriteExisting: 'overwrite_existing', recursive: 'recursive', scrape: 'scrape', organize: 'organize' };
            view.templates = st.scrapeTemplates.map(template => ({ name: template.name, path: `${template.values.directory} → ${template.values.targetDirectory || '原目录'}`, used: '', bg: 'transparent', ring: 'var(--t09)',
                pick: () => this.setState({ scScanDir: template.values.directory, scOutDir: template.values.targetDirectory || '', scFolderRule: template.values.folderTemplate, scFileRule: template.values.namingTemplate, scMaxDepth: template.values.maxDepth ?? '', scConcurrent: template.values.concurrent, scOpts: Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [name, template.values[key]])) }),
                remove: () => this.setState({ scrapeTemplates: deleteLocalScrapeTaskTemplate(window.localStorage, template.id) }),
            }));
            view.saveTpl = () => this.perform(async () => { saveLocalScrapeTaskTemplate(window.localStorage, `刮削模板 ${st.scrapeTemplates.length + 1}`, { directory: st.scScanDir, targetDirectory: st.scOutDir, folderTemplate: st.scFolderRule, namingTemplate: st.scFileRule, maxDepth: st.scMaxDepth, concurrent: st.scConcurrent, ...Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [key, st.scOpts[name]])) }); this.setState({ scrapeTemplates: loadLocalScrapeTaskTemplates() }); }, '模板已保存');
            view.preview = () => this.previewScrape();
            view.reset = () => { if (st.scPhase === 'scanning') { this.toast('后台任务运行中，请等待完成', WARN); return; } this.dismissBackgroundTask('scrapeTask'); data.SCRAPE_ROWS.splice(0); this.scrapePreviewConfig = null; this.setState({ scPhase: 'idle', scrapeResult: null, scSkip: [], scPct: 0, pathEdits: {}, scScanDir: st.librarySettings?.source_directory || st.scScanDir, scOutDir: st.librarySettings?.directories?.[0] || st.scOutDir }); };
            view.applyStrategy = () => { const strategy = st.scStrategy.split(' ')[0]; this.setState({ pathEdits: { ...st.pathEdits, ...Object.fromEntries(rows.filter(row => row.kind === 'conflict').map(row => [row.src, strategy])) } }); this.toast('已为冲突项设置处理策略'); };
            view.execute = () => this.executeScrape(); view.dryRun = () => this.executeScrape(false);
            const skipped = new Set(st.scSkip);
            view.execNote = `${rows.filter(row => row.kind !== 'error' && !skipped.has(row.src)).length} 个待处理文件`;
            if (view.cmp) {
                view.cmp.sides.forEach((side, index) => { side.better = false; side.keep = () => this.setState({ pathEdits: { ...st.pathEdits, [st.scCmp]: index === 0 ? 'keep_target' : 'keep_source' }, scCmp: null }); });
                view.cmp.skip = () => this.setState({ scSkip: [...st.scSkip, st.scCmp], scCmp: null });
            }
            const page = this.pageItems(view.rows, 'scPage', [st.scF, st.scPhase]);
            view.rows = page.items; view.paging = page.paging;
            for (const row of view.rows) {
                if (st.pathEdits[row.src]) row.note = `处理策略：${st.pathEdits[row.src]}`;
                row.inspect = () => this.ask({ title: row.code, body: rows.find(item => item.src === row.src)?.note || row.src, color: DIM, okText: '关闭' });
                row.fix = () => this.setState({ scRepair: { src: row.src, code: rows.find(item => item.src === row.src)?.raw.code || '' } });
            }
            return view;
        }

        vDispatch() {
            const st = this.state, codes = [...new Set((st.dScope === '1' ? data.MOVIES.map(movie => movie.code) : st.dScope === '2' ? st.sel : st.dCodes.split(/[\s,，]+/)).map(code => code.trim().toUpperCase()).filter(Boolean))];
            const failureMap = new Map();
            for (const record of data.HISTORY) for (const resource of record.failed_resources || []) {
                const result = { movie_id: record.movie_id, magnet: resource.link, source: resource.source, tool: toolName(resource.tool), success: false, message: '上次派发未成功提交，可重试此资源' };
                failureMap.set(`${result.movie_id}:${result.magnet}`, result);
            }
            for (const result of st.dispatchResult?.results || []) if (result.success === false && !result.skipped) failureMap.set(`${result.movie_id}:${result.magnet || ''}`, { ...result, tool: st.dispatchTool });
            const failed = [...failureMap.values()].map(result => ({ code: result.movie_id || '', reason: safeText(result.message || result.error), tool: result.tool, time: '', raw: result,
                noRetry: !result.movie_id, retry: () => this.confirmDispatch([result.movie_id], result.magnet ? [{ link: result.magnet, movie_id: result.movie_id, source: result.source }] : undefined, result.tool),
                skip: () => this.perform(async () => {
                    if (result.movie_id && result.magnet) await this.request(`/api/history/${id(result.movie_id)}/dismiss-failure`, 'POST', { link: result.magnet });
                    this.setState({ dispatchResult: { ...st.dispatchResult, results: (st.dispatchResult?.results || []).filter(item => !(item.movie_id === result.movie_id && item.magnet === result.magnet)) } });
                    await this.loadHistory();
                }, '已忽略该失败项'),
            }));
            const history = data.HISTORY.map(record => ({ raw: record, code: record.movie_id || record.id || '', title: record.title || '', res: selectHistoryRedispatchResource(record)?.link || '', src: selectHistoryRedispatchResource(record)?.source || '', tool: record.download_tool || record.tool || '', time: record.timestamp || record.download_time || record.date || '',
                status: ({ submitted: '已提交', failed: '派发失败', ignored: '已忽略' }[record.status] || record.status || '已记录'), local: record.in_local_library ? '已入库' : record.needs_reselect ? '未入库' : '待核对', stBg: 'var(--t08)', stFg: DIM, localFg: DIM2, actText: '重新派发', act: () => { const resource = selectHistoryRedispatchResource(record, sourceKey(st.dSrc)); this.confirmDispatch([record.movie_id || record.id], resource ? [{ ...resource, movie_id: record.movie_id || record.id }] : undefined); },
            }));
            const page = this.pageItems(history.filter(record => st.dHf === '0' || (st.dHf === '1' ? record.raw.needs_reselect : record.raw.status === 'failed')), 'historyPage', [st.dHf]);
            return { tool: st.tool, src: st.dSrc, tools: this.toolStates().map(tool => ({ ...tool, key: tool.name, status: tool.hint, meta: '', active: st.tool === tool.name, bg: st.tool === tool.name ? 'var(--t08)' : 'transparent', ring: 'var(--t09)', needsAction: !tool.connected, actionText: '配置', pick: () => this.setState({ tool: tool.name }), action: () => this.setState({ route: 'settings', seTab: tool.name }) })),
                scope1: st.dScope === '1', scope2: st.dScope === '2', scope3: st.dScope === '3', setScope1: () => this.setState({ dScope: '1' }), setScope2: () => this.setState({ dScope: '2' }), setScope3: () => this.setState({ dScope: '3' }),
                codes: st.dCodes, setCodes: event => this.setState({ dCodes: event.target.value }), setSrc: event => this.setState({ dSrc: event.target.value }),
                subOnly: st.dSubOnly, toggleSub: () => this.setState({ dSubOnly: !st.dSubOnly }), no4k: st.dNo4k, toggle4k: () => this.setState({ dNo4k: !st.dNo4k }),
                skipLocal: true, toggleSkipLocal: () => {}, skipTried: true, toggleSkipTried: () => {}, runCount: codes.length, run: () => this.confirmDispatch(codes),
                stats: [stat('历史记录', history.length), stat('PikPak', st.pikLogged ? '已登录' : '未登录'), stat('Aria2', st.connections.aria2_connected ? '已连接' : '未连接'), stat('115 网盘', this.allConnected() ? '已配置' : '未配置')], failed,
                hasFailed: failed.length > 0, batchSummary: `失败 ${failed.length} 项`, retryAll: () => this.confirmDispatch(failed.map(item => item.code).filter(Boolean), failed.every(item => item.raw.magnet) ? failed.map(item => ({ link: item.raw.magnet, movie_id: item.code, source: item.raw.source })) : undefined),
                historyCount: history.length, missingCount: history.filter(item => item.raw.needs_reselect).length, failureCount: history.filter(item => item.raw.status === 'failed').length,
                hf0: st.dHf === '0', hf1: st.dHf === '1', hf2: st.dHf === '2', setHf0: () => this.setState({ dHf: '0' }), setHf1: () => this.setState({ dHf: '1' }), setHf2: () => this.setState({ dHf: '2' }),
                checkNote: st.dChecked ? '已核对本地库' : '尚未核对本地库', check: () => this.perform(async () => { const result = await this.request('/api/history/check-local-library', 'POST'); data.HISTORY.splice(0, data.HISTORY.length, ...(result.records || [])); this.setState({ dChecked: true }); }, '本地库核对完成'),
                refresh: () => this.perform(() => this.loadHistory(), '历史记录已刷新'),
                clear: () => this.ask({ title: '清空下载历史？', body: '将同时清空已尝试链接，后续派发可能再次尝试旧链接。', ackText: '我确认清空历史记录', color: BAD, okText: '清空', run: () => this.perform(async () => { await this.request('/api/history', 'DELETE'); await this.loadHistory(); }, '下载历史已清空') }),
                history: page.items, paging: page.paging,
            };
        }

        formField(label, value, update, kind = 'text', options = [], hint = '') {
            const revealed = this.state.seReveal.includes(label);
            return { label, value: value ?? '', on: Boolean(value), checkLabel: label, hint, hintFg: DIM2, span: 'auto', mono: 'inherit', ls: 'normal',
                isText: kind === 'text' || kind === 'number', isPath: kind === 'path', isTextarea: kind === 'textarea', isSecret: kind === 'secret', isSelect: kind === 'select', isCheck: kind === 'check', isStatus: kind === 'status',
                inputType: kind === 'secret' && !revealed ? 'password' : kind === 'number' ? 'number' : 'text', statusFg: DIM,
                options: options.map(option => ({ t: String(option) })), set: event => update(kind === 'check' ? event.target.checked : kind === 'number' ? Number(event.target.value) : event.target.value),
                revealText: revealed ? '隐藏' : '显示', reveal: () => this.setState({ seReveal: revealed ? this.state.seReveal.filter(key => key !== label) : [...this.state.seReveal, label] }),
            };
        }

        createAuto(codes = []) {
            const draft = buildDefaultTask();
            if (codes.length) Object.assign(draft.nodes.find(node => node.type === 'search').config, { mode: 'codes', codes: codes.join('\n') });
            this.setState({ route: 'auto', auTask: '', autoDraft: draft, auNode: 'search', autoFiltersText: null, nodeBeforeEdit: structuredClone(draft) });
        }
        editAuto(update) { this.setState({ autoDraft: { ...(this.state.autoDraft || this.state.tasks.find(task => task.id === this.state.auTask)), ...update } }); }
        async saveAuto() {
            this.applyAutoFilters();
            const task = this.state.autoDraft || this.state.tasks.find(task => task.id === this.state.auTask);
            if (!task?.name.trim()) throw new Error('请先创建任务并填写名称');
            if (task.trigger.type === 'scheduled' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.trigger.scheduled_time || '')) throw new Error('请填写有效的执行时间 HH:MM');
            if (task.trigger.type === 'interval' && (!Number.isInteger(task.trigger.interval_minutes) || task.trigger.interval_minutes < 1)) throw new Error('间隔分钟必须为正整数');
            const result = await this.request(`/api/automation/tasks${task.id ? '/' + id(task.id) : ''}`, task.id ? 'PUT' : 'POST', task);
            await this.loadTasks();
            this.setState({ autoDraft: null, auNode: null, autoFiltersText: null, nodeBeforeEdit: null, auTask: result.id || result.task?.id || task.id || this.state.auTask });
            return result.task || result;
        }
        applyAutoFilters() {
            if (this.state.autoFiltersText == null) return;
            let filters;
            try { filters = JSON.parse(this.state.autoFiltersText); } catch { throw new Error('筛选条件 JSON 格式错误'); }
            if (!Array.isArray(filters) || filters.some(item => !item?.type || !item?.value)) throw new Error('筛选条件须为含 type 和 value 的数组');
            const task = this.state.autoDraft || this.state.tasks.find(item => item.id === this.state.auTask);
            if (task) this.editAuto({ nodes: task.nodes.map(item => item.id === this.state.auNode ? { ...item, config: { ...item.config, filters } } : item) });
            this.setState({ autoFiltersText: null });
        }
        vAuto() {
            const st = this.state, task = st.autoDraft || st.tasks.find(item => item.id === st.auTask), titles = { trigger: '触发', search: '检索', magnet: '磁力', download: '下载' };
            const node = task?.nodes.find(item => item.id === st.auNode);
            const triggerText = trigger => trigger?.type === 'scheduled' ? `定时 ${trigger.scheduled_time}` : trigger?.type === 'interval' ? `间隔 ${trigger.interval_minutes} 分钟` : '自动运行';
            const today = new Date().toDateString(), runsToday = st.tasks.flatMap(item => item.runs || []).filter(run => new Date(run.started_at).toDateString() === today);
            const errorCount = run => Math.max(run.error ? 1 : 0, (run.items || []).filter(item => item.status === 'dispatch_failed').length);
            const nodeSummary = item => item.type === 'trigger' ? triggerText(task.trigger) : item.type === 'download' ? ({ pikpak: 'PikPak', pan115: '115 网盘', aria2: 'Aria2' }[item.config.tool] || '选择下载工具') : item.type === 'magnet' ? `${item.config.source || 'javbus'} · ${item.config.exclude_4k ? '排除 4K' : '允许 4K'}` : item.config.mode === 'codes' ? `指定 ${String(item.config.codes || '').split(/[\s,，;；]+/).filter(Boolean).length} 个番号` : item.config.mode === 'filter' ? `${item.config.filters?.length || 0} 个筛选条件` : item.config.keyword || '填写检索关键词';
            const field = (label, key, kind = 'text', options = []) => this.formField(label, node?.type === 'trigger' ? task.trigger[key] : node?.config[key], value => {
                if (node.type === 'trigger') this.editAuto({ trigger: { ...task.trigger, [key]: value || null } });
                else this.editAuto({ nodes: task.nodes.map(item => item.id === node.id ? { ...item, config: { ...item.config, [key]: value } } : item) });
            }, kind, options);
            let fields = [];
            if (node?.type === 'trigger') fields = [field('触发方式', 'type', 'select', ['auto', 'scheduled', 'interval']), field('执行时间 HH:MM', 'scheduled_time'), field('间隔分钟', 'interval_minutes', 'number')];
            if (node?.type === 'search') fields = [field('检索方式', 'mode', 'select', ['keyword', 'filter', 'codes']), field('关键词', 'keyword'), field('番号列表', 'codes', 'textarea'),
                this.formField('筛选条件 JSON', st.autoFiltersText ?? JSON.stringify(node.config.filters || []), value => this.setState({ autoFiltersText: value }), 'textarea'),
                field('结果上限', 'max_results', 'number'), field('磁力', 'magnet', 'select', ['exist', 'all']), field('类型', 'type', 'select', ['normal', 'uncensored']), field('跳过本地已有', 'skip_existing', 'check')];
            if (node?.type === 'magnet') fields = [field('磁力来源', 'source', 'select', ['javbus', 'cilisousuo', 'yhg007']), field('字幕筛选', 'has_subtitle', 'select', ['', 'true', 'false']), field('排除 4K', 'exclude_4k', 'check'), field('允许中文字幕', 'allow_chinese_subtitles', 'check')];
            if (node?.type === 'download') fields = [field('下载工具', 'tool', 'select', ['pikpak', 'pan115', 'aria2'])];
            return {
                tasks: st.tasks.map(item => ({ name: item.name, trigger: triggerText(item.trigger), last: item.last_run_at || '尚未运行', status: item.enabled ? '已启用' : '已停用', dot: item.enabled ? OK : DIM2, stFg: item.enabled ? OK : DIM2,
                    bg: item.id === task?.id ? 'rgba(145,132,217,.08)' : 'transparent', ring: item.id === task?.id ? ACC : 'var(--t09)', pick: () => this.setState({ auTask: item.id, autoDraft: null, auNode: null, autoFiltersText: null }) })),
                create: () => this.createAuto(), hasTask: Boolean(task),
                taskCount: st.tasks.length, enabledCount: st.tasks.filter(item => item.enabled).length,
                dispatchedToday: runsToday.reduce((sum, run) => sum + (run.dispatched_count || 0), 0), skippedToday: runsToday.reduce((sum, run) => sum + (run.skipped_count || 0), 0), errorsToday: runsToday.reduce((sum, run) => sum + errorCount(run), 0),
                cur: { name: task?.name || '创建自动任务', setName: event => this.editAuto({ name: event.target.value }), summary: task ? triggerText(task.trigger) : '点击新建开始配置', last: task?.last_run_at || '尚未运行', status: task?.enabled ? '已启用' : '已停用', tagBg: 'var(--t08)', tagFg: task?.enabled ? OK : DIM2, toggleText: task?.enabled ? '停用任务' : '启用任务', toggleFg: task?.enabled ? WARN : ACC },
                save: () => this.perform(() => this.saveAuto(), '自动任务已保存'),
                remove: () => { if (task?.id) this.ask({ title: `删除 ${task.name}？`, body: '删除任务和运行记录，已派发的下载不受影响。', color: BAD, okText: '删除任务', run: () => this.perform(async () => { await this.request(`/api/automation/tasks/${id(task.id)}`, 'DELETE'); this.setState({ autoDraft: null }); await this.loadTasks(); }, '任务已删除') }); else this.setState({ autoDraft: null }); },
                toggleRun: () => this.perform(async () => { if (!task) throw new Error('请先创建任务'); this.editAuto({ enabled: !task.enabled }); await this.saveAuto(); }, '任务状态已保存'),
                runNow: () => { if (task) this.ask({ title: `运行 ${task.name}？`, body: '将保存当前配置并执行真实检索和下载派发。', color: ACC, okText: '立即运行', run: () => this.perform(async () => { const saved = await this.saveAuto(); this.toast('自动任务正在运行，可在运行记录中查看进度', ACC); const run = await this.request(`/api/automation/tasks/${id(saved.id)}/run?background=true`, 'POST'); await this.loadTasks(); if (['failed', 'partial'].includes(run.status)) throw new Error('运行存在失败项，请展开运行记录查看'); this.toast(run.status === 'noop' ? safeText(run.message, '没有新影片需要下载') : run.status === 'success' ? '运行已完成' : '运行已提交', OK); }) }); },
                pauseAll: st.tasks.length > 0 && st.tasks.every(item => !item.enabled), togglePauseAll: () => this.ask({ title: '停用全部自动任务？', body: '关闭后续自动触发，已运行任务不受影响。恢复时请逐项启用。', color: WARN, okText: '停用全部', run: () => this.perform(async () => { for (const item of st.tasks.filter(item => item.enabled)) await this.request(`/api/automation/tasks/${id(item.id)}`, 'PUT', { enabled: false }); await this.loadTasks(); }, '自动任务已停用') }),
                nodes: (task?.nodes || []).map((item, index) => ({ title: titles[item.type], step: String(index + 1).padStart(2, '0'), desc: titles[item.type], meta: nodeSummary(item), badge: '', hasArrow: index < task.nodes.length - 1, bg: 'var(--t03)', ring: item.id === st.auNode ? ACC : 'var(--t09)', iconBg: 'var(--t08)', iconFg: ACC, stFg: DIM2,
                    pick: () => this.setState({ auNode: item.id, autoFiltersText: null, nodeBeforeEdit: structuredClone(task) }) })),
                node: node ? { title: titles[node.type], fields } : null,
                closeNode: () => this.setState({ auNode: null, autoDraft: st.nodeBeforeEdit || st.autoDraft, autoFiltersText: null }),
                saveNode: () => this.perform(async () => { this.applyAutoFilters(); this.setState({ auNode: null }); }, '节点已更新，保存任务后生效'),
                refresh: () => this.perform(() => this.loadTasks()),
                runs: (task?.runs || []).map(run => ({ time: run.started_at, trigger: runStatus(run.status), found: run.found_count, matched: run.magnet_count, dispatched: run.dispatched_count, skipped: run.skipped_count, errors: errorCount(run), result: safeText(run.error || run.message, runStatus(run.status)), dispatchFg: OK, errFg: BAD, resFg: DIM,
                    open: () => this.ask({ title: `运行 ${run.started_at}`, body: safeText(run.error || run.message, runStatus(run.status)), list: (run.items || []).map(item => `${item.movie_id}: ${item.status} ${safeText(item.message, '')}`), color: ACC, okText: '关闭' }) })),
            };
        }

        async connect(key, fromConfig = false) {
            const values = this.state.settingsDraft[key] || {};
            try {
            if (key === 'pikpak') {
                const result = await this.request(`/api/pikpak/login${fromConfig ? '-config' : ''}`, 'POST', fromConfig ? undefined : { username: values.username, password: values.password });
                this.auth = fromConfig ? { username: result.username, fromConfig: true } : { username: values.username, password: values.password };
                persistPikPakSession(this.auth); this.setState({ pikLogged: true });
            } else if (key === 'pan115') {
                if (values.cookie) await this.request('/api/115/cookie', 'POST', { cookie: values.cookie, enabled: values.enabled !== false });
                const result = await this.request('/api/115/status');
                if (!result.connected) throw new Error('115 连接失败，请重新扫码登录');
            } else {
                const form = new FormData();
                let credentials = values;
                if (!fromConfig) {
                    form.set(`${key}_url`, values.url || '');
                    const saved = key === 'webdav' ? loadWebDavSettings() : loadAria2Settings();
                    const sameAccount = saved.url === values.url && (key !== 'webdav' || saved.username === values.username);
                    if (key === 'webdav') { credentials = { ...values, password: values.password || (sameAccount ? saved.password : '') || '' }; form.set('username', values.username || ''); form.set('password', credentials.password); }
                    else { credentials = { ...values, secret: values.secret || (sameAccount ? saved.secret : '') || '' }; form.set('aria2_secret', credentials.secret); }
                }
                await this.request(`/api/${key}/connect${fromConfig ? '-config' : ''}`, 'POST', fromConfig ? undefined : form);
                if (!fromConfig) (key === 'webdav' ? saveWebDavSettings : saveAria2Settings)(credentials);
            }
            } catch (error) {
                await this.perform(() => this.loadConnections());
                throw error;
            }
            await this.loadConnections();
        }
        async startQr() {
            const qr = await this.request('/api/115/qrcode/start', 'POST', { app: this.state.settingsDraft.pan115?.login_app || 'wechatmini' });
            this.setState({ qr, toolCfg: '115 网盘' });
        }
        async pollQr() {
            const qr = this.state.qr;
            if (!qr || [2, -1, -2].includes(Number(qr.status))) return;
            const result = await this.request(`/api/115/qrcode/${id(qr.session_id)}/status`);
            this.setState({ qr: { ...qr, ...result } });
            if (Number(result.status) === 2) { await this.loadSettings(); await this.loadConnections(); this.toast('115 扫码登录成功', OK); }
        }
        async loadFiles(source = this.state.fsSrc, path = this.state.directory) {
            const version = this.fileRequestVersion = (this.fileRequestVersion || 0) + 1;
            let payload;
            if (source === '115') {
                const items = []; let offset = 0;
                do { payload = await this.request(`/api/115/files?cid=${id(path || '0')}&offset=${offset}&limit=200`); items.push(...(payload.items || [])); offset += (payload.items || []).length; } while ((payload.items || []).length && offset < Number(payload.count || 0));
                payload.entries = items;
            } else payload = await this.request(`/api/${source === 'local' ? 'system' : 'webdav'}/files?path=${id(path || (source === 'local' ? '' : '/'))}`);
            if (version !== this.fileRequestVersion || this._disposed) return;
            this.setState({ fsSrc: source, directory: payload.current_path ?? path, directoryParent: payload.parent_path, fileRows: payload.entries || payload.files || [], fsSel: [] });
            if (this.state.connections.aria2_connected) await this.loadAria();
        }
        async loadAria() {
            const payload = await this.request('/api/aria2/downloads'), tasks = payload.downloads || [];
            if (JSON.stringify(tasks) !== JSON.stringify(this.state.ariaTasks)) this.setState({ ariaTasks: tasks });
        }
        ariaAction(task, action) { return this.perform(async () => { await this.request(`/api/aria2/${action}/${id(task.gid)}`, action === 'remove' ? 'DELETE' : 'POST'); await this.loadAria(); }, '下载任务已更新'); }
        async browseDirectory(path = '', target = null) {
            const result = await this.request(`/api/system/directories?path=${id(path)}`);
            this.setState({ fsAdd: 'browse', browserTarget: target, browsePath: result.current_path || '', directories: result.directories || result.entries || [], browseParent: result.parent_path });
        }
        minFileSize() { return { '不限': 0, '大于 500 MB': 500, '大于 2 GB': 2048, '大于 8 GB': 8192 }[this.state.fsMinSize] || 0; }
        sendFiles(files) {
            if (this.state.fsSrc === 'local') { this.toast('本地目录用于浏览，远程文件可发送到 Aria2', WARN); return; }
            if (!files.length || !this.state.connections.aria2_connected) { this.toast('请连接 Aria2 并选择文件或目录', WARN); return; }
            const source = this.state.fsSrc, videoFilter = this.state.fsVideoOnly, minSize = this.minFileSize();
            this.ask({ title: `发送 ${files.length} 个文件到 Aria2？`, body: '从当前网盘下载到已连接的 Aria2。', list: files.map(file => file.name), color: ACC, okText: '发送', run: () => this.perform(async () => {
                let result;
                try { result = await this.request('/api/webdav/download', 'POST', { files: files.map(file => ({ ...file, path: file.path || file.id, is_directory: file.is_directory || file.kind === 'folder', source_type: source === '115' ? 'pan115' : 'webdav' })), video_filter: videoFilter, min_file_size_mb: minSize }); }
                catch (error) { if (!error.result?.results) throw error; result = error.result; }
                const rows = result.results || [], failed = rows.filter(item => item.success === false && !item.skipped), successful = rows.filter(item => item.success), skipped = rows.filter(item => item.skipped);
                if (!failed.length) this.setState({ fsSel: [] });
                await this.perform(() => this.loadAria());
                if (failed.length || skipped.length) {
                    this.ask({ title: '网盘发送结果', body: `${successful.length} 成功，${failed.length} 失败，${skipped.length} 跳过。` + (failed.length ? '请按明细重试失败文件，避免重复发送整个目录。' : '部分文件不符合筛选条件，请查看明细。'), color: WARN,
                        list: rows.map(item => `${item.filename}：${item.skipped ? '已跳过' : item.success ? '成功' : '失败'} ${safeText(item.message, '')}`),
                        okText: '查看下载任务', run: () => this.go('storage')() });
                    return;
                }
                this.toast(successful.length ? '已发送到 Aria2' : '没有符合条件的文件，没有新增下载任务', successful.length ? OK : WARN);
            }) });
        }
        vStorage() {
            const st = this.state, connected = st.fsSrc === 'local' || (st.fsSrc === '115' ? this.allConnected() : st.connections.webdav_connected);
            const canSend = st.fsSrc !== 'local' && connected && Boolean(st.connections.aria2_connected);
            const rows = st.fileRows.filter(file => (!st.fsQ || file.name.toLowerCase().includes(st.fsQ.toLowerCase())) && (file.is_directory || file.kind === 'folder' || ((!st.fsVideoOnly || /\.(mp4|mkv|avi|wmv|mov|m4v|ts|flv|webm|3gp|3g2|asf|rm|rmvb|vob|mts|m2ts|divx|xvid|ogv|f4v|mpg|mpeg|m1v|m2v|mpe|mpv|mp2|mpa|mpu|mpg2)$/i.test(file.name)) && Number(file.size) >= this.minFileSize() * 1024 ** 2)));
            const selectedKeys = new Set(st.fsSel), selected = rows.filter(file => selectedKeys.has(file.path || file.id)), tasks = st.ariaTasks || [];
            const page = this.pageItems(rows, 'fsPage', [st.fsQ, st.fsSrc, st.directory, st.fsVideoOnly, st.fsMinSize]);
            const taskPage = this.pageItems(tasks, 'fsTaskPage', []);
            const directories = this.pageItems([...(st.browseParent != null ? [{ name: '..', path: st.browseParent }] : []), ...st.directories], 'directoryPage', [st.browsePath]);
            return {
                paging: page.paging, taskPaging: taskPage.paging, directoryPaging: directories.paging,
                sources: [['local', '服务端本地', true], ['webdav', 'WebDAV', st.connections.webdav_connected], ['115', '115 网盘', this.allConnected()]].map(([key, name, up]) => ({ key, name, status: up ? '可用' : '未连接', dot: up ? OK : DIM2, stFg: up ? OK : DIM2, meta: '', op: 1, cursor: 'pointer', needsCfg: key !== 'local', bg: key === st.fsSrc ? 'rgba(145,132,217,.08)' : 'transparent', ring: key === st.fsSrc ? ACC : 'var(--t09)', config: () => this.setState({ route: 'settings', seTab: name }), pick: () => { this.fileRequestVersion = (this.fileRequestVersion || 0) + 1; this.setState({ fsSrc: key, fileRows: [], directory: '', directoryTrail: [] }); if (up) this.perform(() => this.loadFiles(key, '')); } })),
                subtitle: st.fsSrc === 'local' ? '服务端本地目录' : '远程目录 · 可发送到 Aria2', offline: !connected, showFiles: connected, goSettings: () => this.setState({ route: 'settings', seTab: st.fsSrc === '115' ? '115 网盘' : 'WebDAV' }),
                q: st.fsQ, setQ: event => this.setState({ fsQ: event.target.value }), videoOnly: st.fsVideoOnly, toggleVideo: () => this.setState({ fsVideoOnly: !st.fsVideoOnly }), minSize: st.fsMinSize, setMinSize: event => this.setState({ fsMinSize: event.target.value }),
                crumbs: [{ name: '根目录 / ', fg: ACC, go: () => this.perform(() => this.loadFiles(st.fsSrc, '')) }, { name: st.directory || '/', fg: DIM, go: () => this.perform(() => this.loadFiles()) }, { name: '上一级', fg: ACC, go: () => this.perform(() => { const trail = st.directoryTrail || []; const parent = st.fsSrc === '115' ? trail.at(-1) || '' : st.directoryParent ?? (st.directory.replace(/[\\/][^\\/]+[\\/]?$/, '') || '/'); this.setState({ directoryTrail: trail.slice(0, -1) }); return this.loadFiles(st.fsSrc, parent); }) }],
                dirMeta: `${rows.length} 项`, allSel: rows.length > 0 && selected.length === rows.length, toggleAll: () => this.setState({ fsSel: selected.length === rows.length ? [] : rows.map(file => file.path || file.id) }),
                rows: page.items.map(file => { const dir = file.is_directory || file.kind === 'folder', key = file.path || file.id; return { ...file, isDir: dir, canSend, type: dir ? '文件夹' : file.kind || '文件', size: size(file.size), date: file.modified || file.modified_time || file.mtime || '—', icon: dir ? 'ph-folder' : 'ph-file', iconFg: dir ? ACC : DIM, fg: dir ? ACC : 'var(--fg)', cursor: dir ? 'pointer' : 'default', sel: selectedKeys.has(key), toggle: () => this.setState({ fsSel: selectedKeys.has(key) ? st.fsSel.filter(value => value !== key) : [...st.fsSel, key] }),
                    open: () => { if (dir) { this.setState({ directoryTrail: [...(st.directoryTrail || []), st.directory] }); return this.perform(() => this.loadFiles(st.fsSrc, key)); } }, send: () => this.sendFiles([file]) }; }),
                selCount: st.route === 'storage' ? selected.length : 0, selSize: size(selected.reduce((sum, file) => sum + Number(file.size || 0), 0)), clearSel: () => this.setState({ fsSel: [] }), sendSel: () => this.sendFiles(selected), canSend,
                refreshAria: () => this.perform(() => this.loadAria()), ariaConnected: st.connections.aria2_connected, ariaDown: !st.connections.aria2_connected, ariaStatus: st.connections.aria2_connected ? '已连接' : '未连接', ariaDot: st.connections.aria2_connected ? OK : DIM2, ariaFg: DIM, ariaMeta: `${tasks.length} 个任务`, connectAria: () => this.perform(() => this.connect('aria2', true), 'Aria2 已连接'), jobs115: null,
                browsePath: () => this.perform(() => this.browseDirectory()), closeAdd: () => this.setState({ fsAdd: null }),
                addForm: st.fsAdd === 'browse' ? { title: '浏览服务端目录', desc: '选择服务端可访问的目录', path: st.browsePath, entries: directories.items.map(entry => ({ name: entry.name || entry.path, meta: entry.path, open: () => this.perform(() => this.browseDirectory(entry.path, st.browserTarget)) })) } : null,
                pickPath: () => { const target = st.browserTarget; this.setState({ fsAdd: null }); if (target) this.setState({ [target.key]: target.index === undefined ? st.browsePath : st[target.key].map((value, index) => index === target.index ? st.browsePath : value), ...(target.key === 'scScanDir' ? { scOverrides: {} } : {}) }); else this.perform(() => this.loadFiles('local', st.browsePath)); },
                pauseAll: () => this.ask({ title: '暂停全部下载？', body: '暂停当前活动及等待中的 Aria2 任务。', color: WARN, okText: '暂停', run: () => this.perform(async () => { for (const task of tasks.filter(task => ['active', 'waiting'].includes(task.status))) await this.request(`/api/aria2/pause/${id(task.gid)}`, 'POST'); await this.loadAria(); }, '下载已暂停') }),
                tasks: taskPage.items.map(task => ({ name: task.name, dir: task.gid, pct: Number(task.totalLength) ? Math.round(100 * Number(task.completedLength) / Number(task.totalLength)) : 0, speed: `${size(task.downloadSpeed)}/s`, eta: '—', sizeText: `${size(task.completedLength)} / ${size(task.totalLength)}`, status: task.status, stFg: task.status === 'error' ? BAD : DIM, fg: 'var(--fg)', canPause: ['active', 'waiting'].includes(task.status), canResume: task.status === 'paused', pause: () => this.ariaAction(task, 'pause'), resume: () => this.ariaAction(task, 'resume'), del: () => this.ask({ title: '删除 Aria2 任务？', body: `从 Aria2 移除 ${task.name} 下载任务，保留已下载文件。`, color: BAD, okText: '删除', run: () => this.ariaAction(task, 'remove') }) })),
            };
        }

        vSettings() {
            const st = this.state, sectionMap = { 'JavBus API': 'javbus', '刮削源': 'scrapers', WebDAV: 'webdav', Aria2: 'aria2', PikPak: 'pikpak', '115 网盘': 'pan115', 磁力筛选: 'magnet_health' }, key = sectionMap[st.seTab];
            const values = st.settingsDraft[key] || {}, update = (field, value) => this.setState({ settingsDraft: { ...st.settingsDraft, [key]: { ...values, [field]: value } } });
            const labels = { enabled: '启用', base_url: '基地址', url: '服务地址', username: '用户名', password: '密码', secret: 'RPC Secret', cookie: 'Cookie', timeout_seconds: '请求超时（秒）', proxy: '代理', request_interval_seconds: '请求间隔（秒）', cache_expire_seconds: '缓存有效期（秒）', cache_max_size: '缓存条目上限', image_retry_attempts: '图片重试次数', image_retry_backoff_seconds: '图片重试间隔', auto_connect: '自动连接', auto_login: '自动登录', save_dir_id: '离线目录 CID', login_app: '登录 App', batch_size: '批量大小', batch_interval_seconds: '批次间隔（秒）', jitter_seconds: '随机延时（秒）', probe_with_aria2: '使用 Aria2 探测', min_seeders: '最少做种数', min_peers: '最少节点数', min_availability: '最低可用率', min_score: '最低评分', probe_timeout_seconds: '探测超时（秒）', allow_unknown: '允许未知健康度' };
            const isMedia = st.seTab === '媒体目录', media = st.librarySettings || {}, isImages = st.seTab === '图片缓存', isCache = st.seTab === '缓存' || isImages;
            const savedKey = isImages ? 'imageCacheSettings' : 'cacheSettings', draftKey = isImages ? 'imageCacheDraft' : 'cacheDraft', cacheSaved = st[savedKey], cache = st[draftKey] || {};
            const tabs = ['配置概览', '外观', '媒体目录', '缓存', '图片缓存', ...Object.keys(sectionMap), '运行安全'];
            const status = name => name === 'WebDAV' ? (st.connections.webdav_connected ? '已连接' : '未连接') : this.toolStates().find(tool => tool.name === name)?.hint || '';
            let fields = key && key !== 'scrapers' ? Object.entries(values).filter(([field, value]) => labels[field] && typeof value !== 'object').map(([field, value]) => this.formField(labels[field], value, value => update(field, value), ['password', 'secret', 'cookie'].includes(field) ? 'secret' : typeof value === 'boolean' ? 'check' : typeof value === 'number' ? 'number' : 'text', [], ['password', 'secret', 'cookie'].includes(field) ? '留空保留服务端已存值；保存会写入服务端配置。' : '')) : [];
            if (isMedia) fields = [
                ['待刮削目录', 'seSource', media.source_directory || '', '存放尚未整理的原片，扫描影视库时会跳过此目录。'],
                ['影视库目录', 'seTarget', media.directories?.[0] || '', '刮削结果的默认存放位置；其他影视库路径和排除目录保持原配置。'],
            ].map(([label, stateKey, fallback, hint]) => ({
                ...this.formField(label, st[stateKey] ?? fallback, value => this.setState({ [stateKey]: value }), 'path', [], hint), span: '1 / -1',
                browse: () => this.perform(() => this.browseDirectory(st[stateKey] ?? fallback, { key: stateKey })),
            }));
            if (isCache && !isImages) fields = [
                this.formField('缓存清理方式', cache.mode === 'size' ? '按占用空间' : '按缓存天数', value => this.setState({ cacheDraft: { ...cache, mode: value === '按占用空间' ? 'size' : 'days' } }), 'select', ['按缓存天数', '按占用空间']),
                cache.mode === 'size'
                    ? this.formField('最多占用空间（MB）', cache.mb, value => this.setState({ cacheDraft: { ...cache, mb: value } }), 'number', [], '按服务端缓存文件的实际大小计算，超限时优先清理最早缓存的资料。')
                    : this.formField('最多缓存天数', cache.days, value => this.setState({ cacheDraft: { ...cache, days: value } }), 'number', [], '从资料补全时间起计算，超过后在下次搜索时重新获取。'),
                this.formField('当前缓存', `${st.cacheSettings?.count || 0} 部 · ${size(st.cacheSettings?.size_bytes || 0)}`, () => {}, 'status', [], '仅保存公开影片资料和封面地址，不包含封面图片。'),
            ];
            if (isImages) fields = [
                this.formField('图片缓存上限（MB）', cache.mb, value => this.setState({ imageCacheDraft: { mb: value } }), 'number', [], '按图片缓存文件的实际大小计算，超限时优先清理较久未使用的图片。'),
                this.formField('当前图片缓存', `${cacheSaved?.count || 0} 张 · ${size(cacheSaved?.size_bytes || 0)}`, () => {}, 'status', [], '单独计算空间，不占用影片资料缓存的上限。单张图片超过总上限时，仅显示，不缓存。'),
            ];
            if (isCache && !cacheSaved) fields = [this.formField('服务端缓存', '尚未载入', () => {}, 'status', [], '点击重新载入，读取服务器上的缓存设置。')];
            if (st.seTab === '运行安全') fields = [this.formField('会话密钥', st.settings.security?.session_secret_configured ? '已配置' : '未配置', () => {}, 'status'), this.formField('环境变量覆盖', Object.entries(st.settings.environment_overrides?.javbus || {}).filter(([, value]) => value).map(([name]) => name).join(' · ') || '无', () => {}, 'status')];
            const sources = st.settingsDraft.scrapers || {}, priority = sources.priority || [], providers = [...new Set([...priority, ...Object.keys(sources).filter(name => name !== 'priority')])];
            const updateSource = (name, updates) => this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, [name]: { ...sources[name], ...updates } } } });
            const requireSavedSources = () => {
                const stored = withSecretPlaceholders(st.settings);
                if (JSON.stringify(st.settingsDraft.scrapers) !== JSON.stringify(stored.scrapers) || JSON.stringify(st.settingsDraft.javbus) !== JSON.stringify(stored.javbus)) throw new Error('刮削源配置已修改，请先保存，再测试连接');
            };
            const testSources = providers => this.perform(async () => {
                requireSavedSources();
                const result = await this.request('/api/movies/metadata-scrapers/test', 'POST', { providers, concurrent: 3, apply_results: false });
                if (st.settings !== this.state.settings) throw new Error('配置已重新载入，请重新测试刮削源');
                this.setState(current => ({ sourcesResult: [...current.sourcesResult.filter(item => !providers.includes(item.provider || item.name)), ...(result.results || [])] }));
            }, '刮削源测试已完成');
            const openTab = name => () => { this.setState({ seTab: name }); if (['缓存', '图片缓存'].includes(name)) return this.perform(() => this.loadCacheSettings(name === '图片缓存')); };
            return {
                saveDisabled: st.seTab === '配置概览' || isCache && !cacheSaved,
                tabs: tabs.map(name => ({ name, status: status(name), dot: status(name) === '已连接' ? OK : DIM2, stFg: DIM2, bg: name === st.seTab ? 'rgba(145,132,217,.12)' : 'transparent', fg: name === st.seTab ? 'var(--fg)' : DIM, fw: name === st.seTab ? 500 : 400, pick: openTab(name) })),
                isOverview: st.seTab === '配置概览', isAppearance: st.seTab === '外观', isSources: key === 'scrapers', isForm: isCache || isMedia || Boolean(key && key !== 'scrapers') || st.seTab === '运行安全', fields,
                cur: { title: st.seTab, desc: isImages ? '封面图片统一缓存在服务器，所有设备共用。容量独立计算，保存后立即清理超限图片。' : isCache ? '缓存与清理设置统一保存在服务器，所有设备和浏览器共用。保存后立即生效。' : isMedia ? '统一配置刮削输入和影视库输出，保存后同步到影视库与本地刮削。保存不会移动文件或启动扫描。' : st.seTab === '外观' ? '管理界面配色主题' : '配置现有服务与连接', canTest: ['webdav', 'aria2', 'pikpak', 'pan115', 'scrapers', 'javbus'].includes(key), banner: status(st.seTab), bannerFg: DIM, bannerBg: 'var(--t03)', bannerRing: 'var(--t09)', bannerMeta: '' },
                overview: tabs.filter(name => !['配置概览', '外观'].includes(name)).map(name => ({ name, status: status(name) || '查看配置', dot: DIM2, stFg: DIM, ring: 'var(--ring)', meta: '', action: '查看', go: openTab(name) })),
                themes: [{ key: 'dark', name: '深色', desc: '深色主题', bg: '#161826', surf: '#232532', ring: '#3f424d', fg: '#e9e9ed', dim: '#92939b', acc: '#9184d9' }, { key: 'light', name: '浅色', desc: '浅色主题', bg: '#f1f2f7', surf: '#ffffff', ring: '#d7dae4', fg: '#1a1c28', dim: '#676977', acc: '#5b4fa8' }].map(theme => ({ ...theme, active: st.theme === theme.key, ringOuter: st.theme === theme.key ? ACC : 'var(--ring)', badge: st.theme === theme.key ? '当前使用' : '点击切换', badgeFg: ACC, badgeBg: 'var(--t08)', pick: () => { saveAppTheme(theme.key); this.setState({ theme: theme.key }); } })),
                sources: providers.map((name, index) => { const source = sources[name] || {}, result = st.sourcesResult.find(item => item.provider === name || item.name === name); return { name, host: name === 'javbus' ? st.settingsDraft.javbus?.base_url || st.settings.javbus?.base_url || '' : source.base_url || '', status: source.implemented === false ? '未实现' : result ? (result.success ? '测试成功' : '测试失败') : '待测试', latency: result?.duration_ms != null ? `${result.duration_ms} ms` : '', note: [name === 'javbus' ? '共用 JavBus 访问设置；修改后先保存再测试' : '测试使用已保存配置', safeText(result?.error_message, '')].filter(Boolean).join(' · '), on: source.enabled, order: index + 1, op: source.enabled ? 1 : .55, ring: 'var(--t09)', stFg: DIM, dot: DIM2, upDisabled: index === 0, toggleText: source.enabled ? '禁用' : '启用', toggle: () => updateSource(name, { enabled: !source.enabled }), test: () => testSources([name]), up: () => { const next = [...providers]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, priority: next } } }); },
                    fields: Object.entries(name === 'javbus' ? {} : source).filter(([field]) => ['language', 'request_delay', 'base_url', 'api_key'].includes(field)).map(([field, value]) => this.formField(field, value, value => updateSource(name, { [field]: value }), field === 'api_key' ? 'secret' : typeof value === 'number' ? 'number' : 'text')) }; }),
                test: () => key === 'scrapers' || key === 'javbus' ? testSources(key === 'javbus' ? ['javbus'] : providers) : this.perform(() => this.connect(key, !values.password && !values.secret && !values.cookie && Object.entries(values).every(([field, value]) => ['password', 'secret', 'cookie'].includes(field) || st.settings[key]?.[field] === value)), '连接成功'),
                applyTestResults: () => this.perform(async () => { requireSavedSources(); if (!st.sourcesResult.length) throw new Error('请先运行测试'); await this.request('/api/movies/metadata-scrapers/apply-test-results', 'POST', { results: st.sourcesResult }); await this.loadSettings(); }, '已按测试结果更新配置'),
                save: () => this.perform(async () => { if (isCache) { if (!cacheSaved) throw new Error('请先载入服务端缓存设置'); const result = await this.request(isImages ? '/api/image-cache' : '/api/metadata-cache', 'PUT', cache); this.setState({ [savedKey]: result, [draftKey]: { ...result.settings } }); return; } if (isMedia) return this.saveLibraryPaths({ ...media, source_directory: st.seSource ?? media.source_directory, directories: [st.seTarget ?? media.directories?.[0] ?? '', ...(media.directories || []).slice(1)] }); if (st.seTab === '外观') { saveAppTheme(st.theme); return; } await this.request('/api/system/settings', 'PUT', buildSettingsPayload(st.settingsDraft)); await this.loadSettings(); await this.loadConnections(); }, '设置已保存'),
                reload: () => this.perform(async () => { if (isCache) await this.loadCacheSettings(isImages); else if (isMedia) this.applyLibrarySettings(await this.request('/api/movies/local-library/settings'), true); else await this.loadSettings(); }, '配置已重新载入'), reset: () => isCache ? this.setState({ [draftKey]: cacheSaved ? { ...cacheSaved.settings } : null }) : isMedia ? this.setState({ seSource: undefined, seTarget: undefined }) : this.setState({ settingsDraft: withSecretPlaceholders(st.settings), sourcesResult: [] }),
                startQr: () => this.perform(() => this.startQr()), showQrLogin: key === 'pan115', logout: () => { clearPikPakSession(); this.auth = null; this.setState({ pikLogged: false }); }, showLogout: key === 'pikpak' && st.pikLogged,
            };
        }

        renderVals() {
            const view = super.renderVals(), st = this.state;
            view.sysInfo = `JavJaeger ${window.versionInfo?.version || ''}`;
            for (const nav of view.nav) nav.badge = nav.label === '转码' ? String(data.TC.filter(task => ['running', 'queued'].includes(task.status)).length || '') : nav.label === '自动模式' ? String(st.tasks.filter(task => task.enabled).length || '') : '';
            view.tools = this.toolStates();
            view.bg.items = data.TC.filter(task => ['running', 'queued'].includes(task.status)).map(task => ({ kind: '转码', name: task.code, pct: task.pct, pctText: `${task.pct}%`, meta: task.stage, fg: ACC, go: this.go('transcode') }));
            for (const [key, kind] of [['scanTask', '扫描入库'], ['scrapeTask', '刮削'], ['cleanupTask', '清洗无效文件']]) if (st[key]) {
                const task = st[key], finished = jobFinished(task);
                view.bg.items.push({ kind, name: safeText(task.message, finished ? '任务已结束，点击查看结果' : '后台运行中'), pct: task.percent || 0,
                    pctText: finished ? task.status === 'failed' ? '失败' : '已完成' : '', meta: finished ? '结果保留，点击查看下一步' : '服务端后台执行', fg: task.status === 'failed' ? WARN : finished ? OK : ACC, finished,
                    go: () => this.showBackgroundResult(key) });
            }
            if (st.dispatchTask) {
                const job = st.dispatchTask, pct = Math.round(100 * (job.completed_count || 0) / Math.max(1, job.total_count || 1));
                view.bg.items.push({ kind: '115 派发', name: `批次 ${job.current_batch || 0}/${job.total_batches || '待计算'}`, pct, pctText: jobFinished(job) ? '查看结果' : `${pct}%`, meta: `${job.completed_count || 0}/${job.total_count || 0} 项已处理`, fg: job.status === 'failed' ? WARN : ACC, finished: jobFinished(job), go: () => this.showBackgroundResult('dispatchTask') });
            }
            for (const task of st.tasks) for (const run of task.runs || []) if (run.status === 'running') view.bg.items.push({ kind: '自动任务', name: task.name, pct: 0, pctText: '', meta: run.message || '运行中', fg: ACC, go: this.go('auto') });
            const activeCount = view.bg.items.filter(item => !item.finished).length + Number(Boolean(st.informationTask && !jobFinished(st.informationTask)));
            if (st.informationTask) {
                const task = st.informationTask, finished = jobFinished(task);
                view.bg.items.unshift({ kind: task.operation === 'check' ? '资料检查' : '资料补全', name: informationSummary(task), pct: task.percent || 0,
                    pctText: finished ? task.status === 'failed' ? '失败' : task.result?.failed_count ? '部分完成' : '已完成' : '',
                    meta: finished ? '点击查看结果，继续补全或处理失败项' : '服务端后台执行，可离开或刷新页面', fg: task.status === 'failed' || task.result?.failed_count ? WARN : finished ? OK : ACC,
                    go: () => this.showInformationResult() });
            }
            view.bg.count = view.bg.items.length;
            view.bg.animation = activeCount ? 'jjspin 900ms linear infinite' : 'none';
            const background = this.pageItems(view.bg.items, 'bgPage', [], 6);
            view.bg.items = background.items; view.bg.paging = background.paging;
            const confirmation = this.pageItems(view.dlg.list, 'dlgPage', []);
            view.dlg.list = confirmation.items; view.dlg.paging = confirmation.paging;
            const search = view.s, movies = st.route === 'search' ? this.visible() : [];
            const movieIndex = new Map(movies.map(movie => [movie.code, movie]));
            search.paging = this.pageItems(movies, 'searchPage', []).paging;
            search.selectPage = () => this.setState({ sel: [...new Set([...st.sel, ...search.rows.map(row => row.code)])] });
            Object.assign(search, { offline: Boolean(st.searchError), error: st.searchError, srcText: st.searchError ? '查询失败' : st.searchDone ? '已获取结果' : '待查询', srcDot: st.searchError ? BAD : DIM2, srcFg: DIM,
                showGrid: !st.loading && movies.length > 0 && st.view === 'grid', showList: !st.loading && movies.length > 0 && st.view === 'list',
                empty: !st.loading && !st.searchError && movies.length === 0 && st.sMode !== 'magnet', emptyTitle: st.searchDone ? '没有匹配的影片' : '开始检索', emptyBody: '填写条件后查询真实影片数据。',
                showPager: !st.loading && !st.searchError && st.searchDone && st.sMode === 'filter' && st.fetchMode === 'page',
                pagerText: `本页 ${movies.length} 部 · 是否有下一页以来源返回结果为准`,
                magnetProgress: st.searchDone ? `已查询 ${this.magnets.size} / ${data.MOVIES.length} 部影片的磁力` : '',
                nextDisabled: !st.nextPage, noResults: !movies.length, summary: `${movies.length} 部`, recogCount: movies.length, recogSkipped: '', selSize: '', selNote: '',
                fCatalogNote: '可输入代码或从目录选择', magQueryNote: `${this.magnets.get(st.code)?.length || 0} 条磁力`,
                downloadAll: () => this.confirmDispatch(movies.map(movie => movie.code)), batchDispatch: () => this.confirmDispatch(st.sel),
                batchAuto: () => this.createAuto(st.sel), toggleExclude4k: () => { this.setState({ exclude4k: !st.exclude4k }); if (st.searchDone || st.loading) void this.runSearch(); },
                toolStatus: this.toolStates().find(tool => tool.name === st.tool)?.hint || '未连接',
                toolCfg: this.toolConfig(st.toolCfg),
            });
            const reset = search.reset;
            search.reset = () => { reset(); this.clearSearch(); this.setState({ recogHtml: '' }); };
            for (const mode of search.modes) { const pick = mode.pick; mode.pick = () => { pick(); this.clearSearch(); }; }
            for (const key of ['setSortSize', 'setSortDate', 'setOrderDesc', 'setOrderAsc', 'setSub0', 'setSubTrue', 'setSubFalse']) {
                const change = search[key]; search[key] = () => { change(); if (st.searchDone || st.loading) void this.runSearch(); };
            }
            search.magRows = this.magnetRows(st.code);
            const activeTool = this.toolStates().find(tool => tool.name === st.tool);
            search.toolDot = activeTool?.dot; search.toolFg = activeTool?.fg;
            for (const row of search.rows) {
                const movie = movieIndex.get(row.code);
                row.cover = movie?.cover;
                if (!movie?.actors.length) row.actorText = movie?.detailsLoading ? '资料补全中…' : movie?.detailError ? '资料补全失败，点击详情重试' : '';
                if (!movie?.mag) row.magText = movie?.magnetsLoading ? '正在查询磁力…' : movie?.magnetError ? `磁力获取失败：${movie.magnetError}` : '当前条件下没有可用磁力';
            }
            for (const row of search.rows) row.open = () => this.perform(async () => {
                const version = this.requestVersion;
                const original = data.MOVIES.find(movie => movie.code === row.code);
                this.setState({ detail: row.code });
                await this.loadMovieDetails(original, version);
                if (version !== this.requestVersion || this._disposed) return;
                const magnets = await this.getMagnets(original);
                if (version !== this.requestVersion || this._disposed) return;
                this.magnets.set(row.code, magnets);
                original.mag = magnets[0] ? `${magnets[0].name} · ${magnets[0].size}` : '';
                original.magCount = magnets.length;
                this.forceUpdate?.();
            });
            if (search.d) { search.d.cover = movieIndex.get(st.detail)?.cover; search.d.magnets = this.magnetRows(st.detail); search.d.magCount = search.d.magnets.length; search.d.copy = () => this.perform(() => this.copyText(st.detail), '番号已复制'); }
            if (search.browse) {
                const groups = search.browse.groups;
                const page = this.pageItems(groups.flatMap(group => group.items), 'catalogPage', [st.browse, st.browseQ]);
                const visible = new Set(page.items);
                search.browse.groups = groups.map(group => ({ ...group, items: group.items.filter(item => visible.has(item)) })).filter(group => group.items.length);
                search.browse.paging = page.paging;
            }
            view.version = window.versionInfo?.version || '';
            return view;
        }
        magnetRows(code) { return (this.magnets.get(code) || []).map(magnet => ({ ...magnet, date: magnet.shareDate || magnet.date || '', fg: 'var(--fg)', sub: magnet.hasSubtitle || magnet.has_subtitle || magnet.subtitle ? '有' : '无', subFg: DIM, flags: [], dispatch: () => this.confirmDispatch([code], [magnet]) })); }
        toolStates() { return [
            { name: 'PikPak', connected: this.state.pikLogged }, { name: '115 网盘', connected: this.allConnected() }, { name: 'Aria2', connected: this.state.connections.aria2_connected },
        ].map(tool => ({ ...tool, dot: tool.connected ? OK : DIM2, fg: tool.connected ? OK : DIM2, halo: 'transparent', hint: tool.connected ? '已连接' : '未连接' })); }
        toolConfig(name) {
            if (!name) return null;
            const tool = this.toolStates().find(item => item.name === name);
            return { name, desc: '连接当前浏览器会话的下载工具', status: tool.hint, dot: tool.dot, fg: tool.fg, fields: [], canAct: true,
                actText: name === '115 网盘' ? '生成登录二维码' : '用配置连接', actFg: ACC,
                act: () => this.perform(() => name === '115 网盘' ? this.startQr() : this.connect(toolKey(name), true), '操作完成'),
                qr: Boolean(name === '115 网盘' && this.state.qr), qrImage: this.state.qr?.qrcode_image_url, qrText: this.state.qr?.message || '请使用 115 App 扫码', qrState: this.state.qr?.state || '',
                goSettings: () => this.setState({ toolCfg: null, route: 'settings', seTab: name }),
            };
        }
    };
}
