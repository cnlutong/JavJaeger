import { loadAppTheme, saveAppTheme } from '../utils/theme.js';
import { loadPikPakSession, persistPikPakSession, clearPikPakSession, loadWebDavSettings, saveWebDavSettings, loadAria2Settings, saveAria2Settings } from '../utils/storage.js';
import { isConformingLocalScrapeItem, getLocalScrapeIssueReason } from '../utils/localScrapeResults.mjs';
import { withSecretPlaceholders, buildSettingsPayload } from '../utils/systemSettings.mjs';
import { buildDefaultTask } from '../utils/automationTask.mjs';
import { selectHistoryRedispatchResource } from '../utils/historyRedispatch.mjs';
import { loadLocalScrapeTaskTemplates, saveLocalScrapeTaskTemplate, deleteLocalScrapeTaskTemplate } from '../utils/localScrapeTemplates.mjs';

// Expose the supplied component's data tables to its API adapter; its markup and
// presentation methods remain the implementation, rather than a visual reference.
export const designDataExports = '\nComponent.data = { MOVIES, MAGNETS, LIB, CN_ACTORS, CN_RESUME, FILTER_DIMS, ACTOR_CATALOG, GENRE_CATALOG, BG, HISTORY, TC, PRESETS, SCRAPE_ROWS };';
const ACC = 'var(--acc)', OK = 'var(--ok)', WARN = 'var(--warn)', BAD = 'var(--bad)', DIM = 'var(--dim)', DIM2 = 'var(--dim2)';
const id = encodeURIComponent;
const sourceKey = value => ({ cili: 'cilisousuo', yhg: 'yhg007' }[value] || value);
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

function movieView(record, local = false) {
    const metadata = record.metadata || {}, media = record.media_info || metadata.media_info || {};
    const tags = names(record.genres || metadata.genres);
    if (record.is_vr && !tags.includes('VR')) tags.push('VR');
    const files = Array.isArray(record.files) ? record.files : [];
    const code = record.movie_id || record.id || record.code || '';
    return {
        raw: record, code, title: record.title || metadata.title || code,
        actors: names(record.stars || metadata.stars), tags,
        date: String(record.date || metadata.date || ''), dur: `${record.duration || metadata.duration || Math.round((media.duration_seconds || 0) / 60) || '—'} 分`,
        studio: record.studio?.name || record.studio || metadata.studio?.name || '—',
        label: record.publisher?.name || record.publisher || record.label?.name || metadata.label?.name || '—',
        series: record.series?.name || record.series || metadata.series?.name || '—', director: record.director?.name || record.director || metadata.director?.name || '—',
        local: local || record.in_local_library ? 'in' : 'none', vr: tags.includes('VR'), sub: tags.includes('中文字幕'), k4: Number(media.height) >= 2160,
        res: media.height ? `${media.height}p` : '—', codec: media.codec || media.video_codec || '—',
        files: record.file_count ?? files.length, size: size(record.total_size || files.reduce((sum, file) => sum + Number(file.size || 0), 0)),
        c: record.information_complete === false ? 0 : 100, added: String(record.updated_at || record.added_at || record.created_at || ''),
        gone: local && (record.file_count ?? files.length) === 0, mag: '', magCount: 0,
        cover: imageSource(record.poster_url || record.cover_url || record.img || metadata.cover_url || metadata.img || ''),
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
            this.state = { ...this.state, theme: loadAppTheme(), route: 'cinema', cnHero: '', cnPlaying: null,
                code: '', sMode: 'code', fValue: '', fLabel: '', fList: [], dCodes: '', dScope: '3',
                pikLogged: session.isLoggedIn, fsAria: 'down', fsPath: [], fsSrc: 'local',
                scPhase: 'idle', scScanDir: '', scOutDir: '', lbPaths: [], lbExcludes: [], auTask: '',
                settings: {}, settingsDraft: {}, connections: {}, clientConfig: {}, tasks: [], fileRows: [],
                tcCaps: {}, searchError: '', searchDone: false, loading: false, libraryLoaded: false,
                scanTask: null, scrapeTask: null, scrapeResult: null, checkResult: null, tool: 'PikPak',
                autoDraft: null, directory: '', directories: [], browserTarget: null, qr: null, sourcesResult: [],
                scrapeTemplates: loadLocalScrapeTaskTemplates(), pathEdits: {}, tcOptions: {}, fsMinSize: '不限', fsVideoOnly: false,
                infoFields: ['title', 'date', 'stars', 'genres', 'cover_url', 'nfo', 'poster_file'],
            };
            this.magnets = new Map();
            this.requestVersion = 0;
            this._disposed = false;
        }

        async request(url, method = 'GET', body) {
            const options = { method };
            if (body !== undefined) {
                if (body instanceof FormData) options.body = body;
                else { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
            }
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
            const result = await response.json();
            if (result?.success === false || result?.error && !result.status) throw new Error(safeText(result.message || result.error));
            return result;
        }

        async perform(action, success) {
            try { const result = await action(); if (success && !this._disposed) this.toast(success, OK); return result; }
            catch (error) { if (!this._disposed) this.toast(safeText(error.message), BAD); return null; }
        }

        componentDidMount() {
            this.perform(async () => {
                await Promise.all([this.loadLibrary(), this.loadSettings(), this.loadConnections(), this.loadHistory(), this.loadTasks(), this.loadTranscodes(), this.loadCatalogs()]);
                const config = this.state.clientConfig;
                for (const key of ['webdav', 'aria2', 'pikpak']) {
                    if (config[key]?.configured && (config[key].auto_connect || config[key].auto_login)) await this.perform(() => this.connect(key, true));
                }
            });
            this._poll = setInterval(() => this.perform(() => this.poll()), 3000);
        }

        componentWillUnmount() {
            this._disposed = true;
            clearInterval(this._poll);
            for (const key of ['_tt', '_st', '_sc1', '_sc2', '_bt']) clearTimeout(this[key]);
        }

        allConnected() { return Boolean(this.state.connections.pan115); }
        go(route) { return () => {
            this.setState({ route, bgOpen: false, detail: null, lbDetail: null, cnPlaying: null });
            this.perform(async () => {
                if (['cinema', 'library'].includes(route)) await this.loadLibrary();
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
            this.setState({ settings: payload, settingsDraft: withSecretPlaceholders(payload) });
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
                this.request('/api/movies/local-library'), this.request('/api/movies/local-library/settings'), this.request('/api/movies/local-library/actors'),
            ]);
            data.LIB.splice(0, data.LIB.length, ...(library.records || library.movies || []).map(record => movieView(record, true)));
            data.CN_ACTORS.splice(0, data.CN_ACTORS.length, ...(actors.actors || []).map(actor => ({ ...actor, count: actor.movie_count, size: size(actor.total_size), noAvatar: !actor.avatar_url })));
            const dims = [['actor', '演员', 'actors'], ['series', '系列', 'series'], ['studio', '制作商', 'studio'], ['res', '分辨率', 'res'], ['flag', '标记', 'tags']];
            data.FILTER_DIMS.splice(0, data.FILTER_DIMS.length, ...dims.map(([key, name, field]) => ({ key, name,
                options: [...new Set(data.LIB.flatMap(movie => movie[field]))].filter(value => value && value !== '—'),
                test: (movie, value) => Array.isArray(movie[field]) ? movie[field].includes(value) : movie[field] === value,
            })));
            this.setState({ libraryLoaded: true, librarySummary: library, lbPaths: settings.directories || [], lbExcludes: settings.ignored_paths || [], cnHero: data.LIB.some(movie => movie.code === this.state.cnHero) ? this.state.cnHero : data.LIB[0]?.code || '' });
        }
        async loadHistory() {
            const history = await this.request('/api/history');
            data.HISTORY.splice(0, data.HISTORY.length, ...(Array.isArray(history) ? history : history.records || history.history || []));
            this.forceUpdate?.();
        }
        async loadTasks() {
            const result = await this.request('/api/automation/tasks');
            const tasks = result.tasks || [];
            this.setState({ tasks, auTask: tasks.some(task => task.id === this.state.auTask) ? this.state.auTask : tasks[0]?.id || '' });
        }
        async loadTranscodes(capabilities = false) {
            const payload = await this.request('/api/movies/transcoding/tasks');
            data.TC.splice(0, data.TC.length, ...(payload.tasks || []).map(task => ({ ...task, raw: task,
                code: task.movie_id, title: task.movie_title, file: task.source_path, preset: task.preset_name,
                codec: task.options?.video_codec || '', gpu: task.gpu_name || task.hardware_backend,
                pct: task.progress, eta: task.eta_seconds == null ? '—' : `${Math.ceil(task.eta_seconds / 60)} 分`,
                elapsed: `${task.elapsed_seconds || 0} 秒`, inSize: size(task.input_size), outSize: size(task.output_size),
            })));
            if (capabilities) { this.setState({ tcCaps: {} }); this.setState({ tcCaps: await this.request('/api/movies/transcoding/presets') }); }
            this.forceUpdate?.();
        }

        async getMagnets(movie, source = this.state.src) {
            const query = new URLSearchParams({ source: sourceKey(source), sortBy: this.state.sortBy, sortOrder: this.state.sortOrder, exclude4k: String(this.state.exclude4k) });
            if (this.state.sub !== '0') query.set('hasSubtitle', this.state.sub);
            if (sourceKey(source) === 'javbus') {
                if (!movie.raw.gid || movie.raw.uc === undefined) movie.raw = { ...movie.raw, ...await this.request(`/api/movies/${id(movie.code)}`) };
                if (movie.raw.gid) query.set('gid', movie.raw.gid);
                if (movie.raw.uc !== undefined) query.set('uc', movie.raw.uc);
            }
            const result = await this.request(`/api/magnets/${id(movie.code)}?${query}`);
            const magnets = Array.isArray(result) ? result : result.magnets || [];
            return magnets.map(magnet => ({ ...magnet, source: magnet.source || sourceKey(source), movie_id: movie.code }));
        }

        runSearch = async () => {
            const version = ++this.requestVersion, st = { ...this.state };
            data.MOVIES.splice(0); this.magnets.clear();
            this.setState({ loading: true, sel: [], detail: null, searchError: '', searchDone: false, nextPage: false });
            await this.perform(async () => {
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
                const movies = (payload.movies || []).map(movie => movieView(movie));
                data.MOVIES.splice(0, data.MOVIES.length, ...movies);
                this.magnets.clear();
                this.setState({ searchDone: true, nextPage: Boolean(payload.pagination?.hasNextPage || payload.has_next_page || movies.length >= 30) });
                // Keep the existing four-request ceiling while loading results in order.
                for (let offset = 0; offset < movies.length; offset += 4) {
                    await Promise.all(movies.slice(offset, offset + 4).map(async movie => {
                        try {
                            const magnets = await this.getMagnets(movie, st.src);
                            if (version !== this.requestVersion) return;
                            this.magnets.set(movie.code, magnets);
                            movie.mag = magnets[0] ? `${magnets[0].name} · ${magnets[0].size}` : '';
                            movie.magCount = magnets.length;
                        } catch { movie.mag = ''; }
                    }));
                    if (version !== this.requestVersion) return;
                    this.forceUpdate?.();
                }
                if (st.autoDownload && st.sMode !== 'magnet') this.confirmDispatch(movies.map(movie => movie.code));
            });
            if (version === this.requestVersion) this.setState({ loading: false });
        };
        visible() { return this.state.sMode === 'magnet' ? [] : data.MOVIES; }
        setSrc(src) { return () => { this.setState({ src }); if (this.state.searchDone) void this.runSearch(); }; }
        dispatchOne(movie) { return () => this.confirmDispatch([movie.code]); }
        confirmDispatch(codes, magnets) {
            if (!codes.length) { this.toast('请选择影片或填写番号', WARN); return; }
            this.ask({ title: `派发 ${codes.length} 部到 ${this.state.tool}？`, color: ACC, okText: '开始派发',
                body: '将提交真实下载任务；本地已有影片与已尝试链接由后端检查。', list: codes,
                run: () => this.perform(async () => {
                    let entries = magnets;
                    if (!entries && this.state.route === 'search') entries = codes.flatMap(code => (this.magnets.get(code) || []).slice(0, 1));
                    if (!entries) {
                        const payload = await this.request('/api/movies/download-by-codes', 'POST', { movie_codes: codes.join('\n'), auto_download: false,
                            magnet_source: sourceKey(this.state.route === 'dispatch' ? this.state.dSrc : this.state.src), has_subtitle_filter: this.state.route === 'dispatch' ? (this.state.dSubOnly ? 'true' : null) : this.state.sub === '0' ? null : this.state.sub, exclude_4k: this.state.route === 'dispatch' ? this.state.dNo4k : this.state.exclude4k });
                        entries = payload.magnet_results || [];
                    }
                    const usable = entries.filter(item => item.link || item.magnet_link);
                    if (!usable.length) throw new Error('没有可派发的磁力；可能已入库或链接均已尝试');
                    const tool = toolKey(this.state.tool);
                    const body = { magnet_links: usable.map(item => item.link || item.magnet_link), movie_ids: usable.map(item => item.movie_id || item.id || codes[0]), magnet_sources: usable.map(item => item.source || sourceKey(this.state.src)) };
                    if (tool === 'pikpak' && this.auth && !this.auth.fromConfig) Object.assign(body, { username: this.auth.username, password: this.auth.password });
                    const endpoint = { pikpak: '/api/pikpak/download', pan115: '/api/115/download', aria2: '/api/aria2/download-magnets' }[tool];
                    const result = await this.request(endpoint, 'POST', body);
                    await this.loadHistory();
                    if (result.results?.some(item => item.success === false && !item.skipped)) throw new Error('部分下载派发失败，请查看下载历史');
                }, '下载任务已提交'),
            });
        }

        async poll() {
            if (this._polling || this._disposed) return;
            this._polling = true;
            try {
                if (['transcode', 'library', 'cinema'].includes(this.state.route)) await this.loadTranscodes();
                for (const [key, prefix] of [['scanTask', '/api/movies/local-library/scan/jobs/'], ['scrapeTask', '/api/movies/local-scrape/jobs/']]) {
                    const current = this.state[key];
                    if (!current || ['success', 'completed', 'failed'].includes(current.status)) continue;
                    const task = await this.request(prefix + id(current.id));
                    this.setState({ [key]: { ...task, id: current.id, operation: current.operation } });
                    if (['success', 'completed'].includes(task.status)) {
                        if (key === 'scanTask') { this.setState({ lbScanning: false }); await this.loadLibrary(); }
                        else if (current.operation === 'apply') { this.setState({ scPhase: 'idle', scrapeResult: task.result }); data.SCRAPE_ROWS.splice(0); await this.loadLibrary(); this.toast(`刮削执行完成：${task.result?.success_count || 0} 成功，${task.result?.failed_count || 0} 失败`, task.result?.failed_count ? WARN : OK); }
                        else this.applyScrapeResult(task.result);
                    } else if (task.status === 'failed') { this.setState({ lbScanning: false, scPhase: 'idle' }); throw new Error(safeText(task.error || task.message)); }
                    else if (key === 'scrapeTask') this.setState({ scPct: task.percent || 0 });
                }
                if (this.state.qr?.session_id) await this.pollQr();
            } finally { this._polling = false; }
        }

        vCinema() {
            if (!data.LIB.length) return { tabs: [], showHero: false, showShelves: false, showWall: true, showActors: false, wall: [], wallEmpty: true, wallMeta: this.state.libraryLoaded ? '影视库为空，请到管理界面添加路径并扫描入库' : '正在读取影视库…', emptyTitle: '影视库为空', emptyBody: '添加媒体路径并扫描入库后，即可在这里浏览和播放。', clearText: '配置影视库', clearFilters: this.go('library'), libMeta: '0 部', filterGroups: [], sorts: [], filterCount: 0, hasFilters: false, exit: this.go('library'), closePlayer: () => this.setState({ cnPlaying: null }) };
            const view = super.vCinema();
            view.libMeta = `${data.LIB.length} 部 · ${size(data.LIB.reduce((sum, movie) => sum + Number(movie.raw.total_size || 0), 0))}`;
            view.actorsMeta = `${data.CN_ACTORS.length} 位本地演员`;
            view.hero.playNote = '播放原文件';
            view.hero.desc = `${data.LIB.find(movie => movie.code === view.hero.code)?.actors.join(' / ') || ''} · 本地影片`;
            view.transcode = () => this.openTranscode(view.hero.code);
            view.hero.cover = data.LIB.find(movie => movie.code === view.hero.code)?.cover;
            view.emptyTitle = '没有符合条件的影片'; view.emptyBody = '当前组合过滤掉了全部结果。去掉一个条件，或清空后重新选择。'; view.clearText = '清空条件';
            for (const row of view.wall) row.cover = data.LIB.find(movie => movie.code === row.code)?.cover;
            view.play = () => this.setState({ cnPlaying: view.hero.code, cnPaused: false, cnBuffering: false });
            if (view.player) { view.player.url = `/api/movies/local-library/${id(this.state.cnPlaying)}/play?file_index=${this.state.playerIndex || 0}`; view.player.error = () => this.toast('浏览器无法播放此文件，可从影片详情创建硬件转码任务', WARN); }
            if (this.state.cnTab === '推荐') view.shelves = [{ name: '最近入库', meta: `${data.LIB.length} 部`, cardW: '158px', items: data.LIB.slice(0, 12).map(movie => ({ ...movie, sub: movie.actors.join(' / '), ring: 'var(--t08)', ringW: '1px', pick: () => this.setState({ cnHero: movie.code }) })) }];
            if (this.state.cnTab === '系列') view.shelves = [...new Set(data.LIB.map(movie => movie.series))].filter(series => series !== '—').map(series => ({ name: series, meta: '', cardW: '158px', items: data.LIB.filter(movie => movie.series === series).map(movie => ({ ...movie, sub: movie.actors.join(' / '), ring: 'var(--t08)', ringW: '1px', pick: () => this.setState({ cnHero: movie.code }) })) }));
            for (const shelf of view.shelves) for (const row of shelf.items) row.cover = data.LIB.find(movie => movie.code === row.code)?.cover;
            return view;
        }

        vLibrary() {
            const view = super.vLibrary(), st = this.state;
            const totalSize = data.LIB.reduce((sum, movie) => sum + Number(movie.raw.total_size || 0), 0);
            view.stats = [stat('影片', data.LIB.length), stat('文件', data.LIB.reduce((sum, movie) => sum + movie.files, 0)), stat('占用容量', size(totalSize), '', ACC), stat('待补资料', st.checkResult?.incomplete_count ?? '待检查', '', WARN)];
            view.paths = st.lbPaths.map(path => ({ path, status: '已配置', fg: 'var(--fg)', stFg: DIM, scan: () => this.scanLibrary([path]) }));
            view.pathGroups = [['媒体库路径', 'lbPaths'], ['排除目录', 'lbExcludes']].map(([name, key]) => ({ name, hint: '服务端可访问的路径', empty: !st[key].length, emptyText: '尚未添加路径',
                add: () => this.setState({ [key]: [...st[key], ''] }), rows: st[key].map((path, index) => ({ path, status: '', stFg: DIM2,
                    change: event => this.setState({ [key]: st[key].map((value, i) => i === index ? event.target.value : value) }),
                    browse: () => this.browseDirectory(path, { key, index }), remove: () => this.setState({ [key]: st[key].filter((_, i) => i !== index) }),
                })),
            }));
            view.savePaths = () => this.perform(async () => { await this.request('/api/movies/local-library/settings', 'PUT', { directories: st.lbPaths.filter(path => path.trim()), ignored_paths: st.lbExcludes.filter(path => path.trim()) }); this.setState({ lbPathCfg: false }); }, '路径配置已保存');
            view.scanAll = () => this.scanLibrary(st.lbPaths);
            view.stopScan = () => this.toast('当前扫描由后端运行，完成后会自动更新', WARN);
            view.runSearch = () => this.forceUpdate?.();
            view.checkItems = [['title', '标题'], ['date', '发行日期'], ['stars', '演员'], ['genres', '标签'], ['cover_url', '封面链接'], ['nfo', 'NFO 文件'], ['poster_file', '本地封面']].map(([key, label]) => ({ label, hint: '', on: st.infoFields.includes(key), toggle: () => this.setState({ infoFields: st.infoFields.includes(key) ? st.infoFields.filter(value => value !== key) : [...st.infoFields, key] }) }));
            view.scanMessage = st.scanTask?.message || '扫描任务运行中，完成后自动更新';
            view.scanPercent = st.scanTask?.percent || 0;
            const sortField = st.lbSort.startsWith('发行') ? 'date' : st.lbSort.startsWith('番号') ? 'code' : st.lbSort.includes('体积') ? 'total_size' : 'added';
            view.rows.sort((a, b) => { const left = data.LIB.find(movie => movie.code === a.code), right = data.LIB.find(movie => movie.code === b.code); return sortField === 'total_size' ? right.raw.total_size - left.raw.total_size : sortField === 'code' ? left.code.localeCompare(right.code) : String(right[sortField]).localeCompare(String(left[sortField])); });
            for (const row of view.rows) { row.cover = data.LIB.find(movie => movie.code === row.code)?.cover; row.cNote = st.checkResult ? row.cNote : '待检查'; row.completeness = st.checkResult ? row.completeness : '—'; }
            view.actorOptions = ['全部演员', ...new Set(data.LIB.flatMap(movie => movie.actors))].map(t => ({ t }));
            view.studioOptions = ['全部制作商', ...new Set(data.LIB.map(movie => movie.studio))].map(t => ({ t }));
            view.runCheck = () => this.perform(async () => { const result = await this.request('/api/movies/local-library/information/check?fields=' + id(st.infoFields.join(','))); this.setState({ checkResult: result, lbCheckCfg: false });
                const incomplete = new Map((result.incomplete_records || []).map(record => [record.movie_id, record]));
                for (const movie of data.LIB) { movie.c = incomplete.has(movie.code) ? 0 : 100; movie.missing = incomplete.get(movie.code)?.missing_labels; }
            }, '资料检查完成');
            view.clean = () => this.ask({ title: '清洗无效媒体文件？', body: '后端会重新探测文件，并永久删除无法读取媒体参数的现存视频，同时移除索引。此操作不可撤销。', ackText: '我确认永久删除无效视频文件', color: BAD, okText: '清洗',
                run: () => this.perform(async () => { await this.request('/api/movies/local-library/clean-invalid', 'POST'); await this.loadLibrary(); }, '无效媒体清洗完成'),
            });
            view.purgeDb = () => this.ask({ title: '清空影视库索引？', body: '只清除影视库索引，保留媒体文件。', ackText: '我确认清空全部索引', color: BAD, okText: '清空',
                run: () => this.perform(async () => { await this.request('/api/movies/local-library', 'DELETE'); await this.loadLibrary(); }, '影视库索引已清空'),
            });
            view.actors = data.CN_ACTORS.map(actor => ({ ...actor, initial: actor.name.slice(0, 1), meta: `${actor.count} 部`, avatar: actor.noAvatar ? '暂无头像' : '本地头像', avatarFg: DIM2, open: () => this.setState({ lbActor: actor.name, lbView: 'list' }) }));
            const record = data.LIB.find(movie => movie.code === st.lbDetail);
            if (view.d && record) {
                view.d.fields = [['发行日期', record.date], ['制作商', record.studio], ['发行商', record.label], ['系列', record.series], ['分辨率 / 编码', `${record.res} · ${record.codec}`], ['体积', record.size]].map(([k, v]) => ({ k, v, fg: 'var(--fg)', mono: 'inherit', fs: '12px' }));
                view.d.files = (record.raw.files || []).map((file, index) => ({ idx: index, path: file.path, size: size(file.size), codec: record.codec, status: '已索引', stFg: OK, fg: 'var(--fg)', gone: false,
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
        completeInformation(codes, onlyMissing) { return this.perform(async () => {
            await this.request('/api/movies/local-library/information/download', 'POST', { movie_ids: codes, only_missing: onlyMissing, write_nfo: true, download_images: true, overwrite_existing: !onlyMissing });
            await this.loadLibrary();
        }, '影片资料已更新'); }
        scanLibrary(paths) {
            const directories = paths.filter(path => path.trim());
            if (!directories.length) { this.setState({ lbPathCfg: true }); return; }
            this.ask({ title: '扫描入库？', body: '扫描已配置目录并导入媒体与 NFO 信息。', list: directories, color: ACC, okText: '开始扫描',
                run: () => this.perform(async () => { const task = await this.request('/api/movies/local-library/scan/jobs', 'POST', { directories, ignored_paths: this.state.lbExcludes, recursive: true, probe_media: true }); this.setState({ scanTask: { id: task.task_id, status: 'running' }, lbScanning: true }); }, '后台扫描已启动'),
            });
        }
        openTranscode(code, fileIndex = 0) { return this.perform(async () => {
            await this.loadTranscodes(true);
            const preset = this.state.tcCaps.presets?.find(item => item.id === 'adaptive_h265' && item.available !== false) || this.state.tcCaps.presets?.find(item => item.available !== false);
            this.setState({ route: 'library', lbTc: { code, fileIndex }, lbTcPreset: preset?.id || '', tcOptions: {} });
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
                })), custom: !preset?.adaptive, customFields: [
                    this.formField('编码器', st.tcOptions.video_codec ?? preset?.options?.video_codec ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, video_codec: value } }), 'select', caps.available_encoders || []),
                    this.formField('CQ / CRF', st.tcOptions.crf ?? preset?.options?.crf ?? 24, value => this.setState({ tcOptions: { ...st.tcOptions, crf: Number(value) } })),
                    this.formField('最大高度（留空保持原始）', st.tcOptions.max_height ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, max_height: value ? Number(value) : null } })),
                    ...[['quality_mode', '质量模式', 'select', ['crf', 'bitrate']], ['video_bitrate_kbps', '视频码率 kbps', 'number'], ['speed_preset', '速度预设', 'select', ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']], ['tune', '调优', 'select', ['', 'film', 'animation', 'grain', 'fastdecode', 'zerolatency']], ['frame_rate', '帧率', 'number'], ['pixel_format', '像素格式', 'select', ['auto', 'yuv420p', 'yuv420p10le']], ['audio_codec', '音频编码', 'select', caps.audio_codecs || ['copy', 'aac']], ['audio_bitrate_kbps', '音频码率 kbps', 'number'], ['audio_channels', '音频声道', 'number'], ['copy_subtitles', '保留字幕', 'check'], ['copy_metadata', '保留元数据', 'check'], ['deinterlace', '去隔行', 'check']].map(([key, label, kind, options]) => this.formField(label, st.tcOptions[key] ?? preset?.options?.[key] ?? '', value => this.setState({ tcOptions: { ...st.tcOptions, [key]: value === '' || kind === 'number' && value === 0 ? null : value } }), kind, options)),
                ], note: caps.gpu_available ? '仅对当前选中文件创建硬件转码任务，输出更小时才替换。' : '未检测到可用 GPU，无法创建转码任务。',
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
            const active = data.TC.filter(task => ['running', 'queued'].includes(task.status)), done = data.TC.filter(task => task.status === 'completed'), bad = data.TC.filter(task => ['failed', 'cancelled'].includes(task.status));
            view.stats = [stat('活动任务', active.length), stat('已完成', done.length, '', OK), stat('异常 / 取消', bad.length, '', WARN), stat('节省空间', size(done.reduce((sum, task) => sum + Math.max(0, task.raw.input_size - task.raw.output_size), 0)), '', ACC)];
            view.nActive = active.length; view.nDone = done.length; view.nBad = bad.length;
            view.caps = [['FFmpeg', caps.ffmpeg_available], ['ffprobe', caps.ffprobe_available], ['GPU', caps.gpu_available]].map(([label, available]) => ({ label, value: available === undefined ? '待检测' : available ? '可用' : '不可用', dot: available ? OK : DIM2, fg: DIM }));
            view.presets = (caps.presets || []).map(preset => ({ name: preset.name, desc: preset.description, codec: preset.options?.video_codec, op: preset.available === false ? '.5' : '1', bg: 'var(--t03)', ring: 'var(--t09)', tagBg: 'var(--t08)', tagFg: ACC, codecFg: DIM, tag: preset.available === false ? '不可用' : '可用' }));
            view.refresh = () => this.perform(() => this.loadTranscodes(true), '转码队列已刷新');
            view.clean = () => this.ask({ title: '清理完成记录？', body: '仅移除已完成任务的记录，保留媒体文件。', color: WARN, okText: '清理', run: () => this.perform(async () => { for (const task of done) await this.request(`/api/movies/transcoding/tasks/${id(task.id)}`, 'DELETE'); await this.loadTranscodes(); }, '完成记录已清理') });
            for (const row of view.rows) {
                const task = data.TC.find(item => item.id === row.id);
                row.cancel = () => this.ask({ title: `取消 ${task.code} 转码？`, body: '终止编码并保留原文件。', color: WARN, okText: '取消任务', run: () => this.transcodeAction(task, 'cancel') });
                row.retry = () => this.transcodeAction(task, 'retry'); row.del = () => this.transcodeAction(task, '', 'DELETE');
            }
            if (view.d) {
                const task = data.TC.find(item => item.id === this.state.tcDetail);
                view.d.fields = [['文件', task.file], ['编码器', task.codec], ['硬件', task.gpu], ['输入大小', task.inSize], ['输出大小', task.outSize]].map(([k, v]) => ({ k, v, mono: 'inherit', fs: '12px' }));
                view.d.retry = () => this.transcodeAction(task, 'retry');
                view.d.cancel = () => this.transcodeAction(task, 'cancel');
                view.d.copy = () => this.perform(() => navigator.clipboard.writeText(JSON.stringify(task.raw.options, null, 2)), '转码参数已复制');
            }
            return view;
        }

        scrapePayload() { const st = this.state; return { ...st.scOpts, directory: st.scScanDir, target_directory: st.scOutDir || null,
            folder_template: st.scFolderRule, naming_template: st.scFileRule, max_depth: st.scMaxDepth ? Number(st.scMaxDepth) : null, concurrent: Number(st.scConcurrent) || 3 }; }
        applyScrapeResult(result) {
            if (!result || result.success === false) { this.setState({ scPhase: 'idle' }); throw new Error('刮削任务失败'); }
            this.setState({ scrapeResult: result, scPhase: 'preview', scPct: 100, scSkip: [] });
            const side = file => ({ size: size(file?.size), res: file?.height ? `${file.height}p` : '—', codec: file?.codec || '—', bitrate: file?.bitrate || '—', dur: file?.duration_seconds || '—', date: file?.modified_at || '—', path: file?.path || '—' });
            data.SCRAPE_ROWS.splice(0, data.SCRAPE_ROWS.length, ...(result.items || []).map(item => ({ raw: item, src: item.source_path, srcMeta: size(item.size || item.source_file?.size), code: item.code || '未识别', dst: item.target_video_path || item.target_path || '—', dstMeta: '',
                kind: item.target_duplicate || !isConformingLocalScrapeItem(item) ? 'error' : item.target_exists ? 'conflict' : 'ok',
                note: item.target_duplicate ? '多个源文件指向同一目标，请修改命名规则' : getLocalScrapeIssueReason(item), existing: side(item.target_file), incoming: side(item.source_file), betterSide: 'existing',
            })));
        }
        executeScrape(organize = this.state.scOpts.organize) {
            if (this.scrapePreviewConfig !== JSON.stringify(this.scrapePayload())) { this.toast('配置已改变，请重新生成预览后执行', WARN); return; }
            const rows = data.SCRAPE_ROWS.filter(row => row.kind !== 'error' && !this.state.scSkip.includes(row.src));
            if (!rows.length) { this.toast('请先生成预览并选择可执行文件', WARN); return; }
            this.ask({ title: '执行刮削整理？', color: WARN, okText: '开始执行', ackText: organize ? '我已确认目标路径与冲突处理规则' : '', body: organize ? '会按预览移动或替换文件，请确认冲突处理。' : '在原目录写入元数据与图片，不移动视频。', list: rows.map(row => row.src),
                run: () => this.perform(async () => {
                    const payload = { ...this.scrapePayload(), organize, items: rows.map(row => ({ source_path: row.src, code: row.raw.code, metadata: row.raw.metadata, conflict_resolution: this.state.pathEdits[row.src] || (row.kind === 'conflict' ? null : undefined) })) };
                    if (rows.some(row => row.kind === 'conflict' && !this.state.pathEdits[row.src])) throw new Error('请先为冲突文件选择保留策略');
                    const task = await this.request('/api/movies/local-scrape/apply/jobs', 'POST', payload); this.setState({ scrapeTask: { id: task.task_id, status: 'running', operation: 'apply' }, scPhase: 'scanning' });
                }, '刮削执行已启动'),
            });
        }
        vScrape() {
            const view = super.vScrape(), st = this.state, rows = data.SCRAPE_ROWS;
            view.subtitle = st.scPhase === 'preview' ? `扫描 ${st.scScanDir} · ${rows.length} 个文件` : st.scPhase === 'scanning' ? '后台任务运行中' : '配置扫描路径后生成预览';
            view.scanLog = (st.scrapeTask?.logs || []).map(entry => ({ t: safeText(typeof entry === 'string' ? entry : entry.message), fg: DIM }));
            view.stats = [stat('扫描文件', st.scrapeResult?.total_files ?? rows.length), stat('可执行', rows.filter(row => row.kind === 'ok').length, '', OK), stat('文件冲突', rows.filter(row => row.kind === 'conflict').length, '', WARN), stat('异常', rows.filter(row => row.kind === 'error').length, '', BAD)];
            const optionNames = { writeNfo: 'write_nfo', downloadImages: 'download_images', downloadSampleImages: 'download_sample_images', downloadActorImages: 'download_actor_images', downloadListThumbnail: 'download_list_thumbnail', overwriteExisting: 'overwrite_existing', recursive: 'recursive', scrape: 'scrape', organize: 'organize' };
            view.templates = st.scrapeTemplates.map(template => ({ name: template.name, path: `${template.values.directory} → ${template.values.targetDirectory || '原目录'}`, used: '', bg: 'transparent', ring: 'var(--t09)',
                pick: () => this.setState({ scScanDir: template.values.directory, scOutDir: template.values.targetDirectory || '', scFolderRule: template.values.folderTemplate, scFileRule: template.values.namingTemplate, scMaxDepth: template.values.maxDepth ?? '', scConcurrent: template.values.concurrent, scOpts: Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [name, template.values[key]])) }),
                remove: () => this.setState({ scrapeTemplates: deleteLocalScrapeTaskTemplate(window.localStorage, template.id) }),
            }));
            view.saveTpl = () => this.perform(async () => { saveLocalScrapeTaskTemplate(window.localStorage, `刮削模板 ${st.scrapeTemplates.length + 1}`, { directory: st.scScanDir, targetDirectory: st.scOutDir, folderTemplate: st.scFolderRule, namingTemplate: st.scFileRule, maxDepth: st.scMaxDepth, concurrent: st.scConcurrent, ...Object.fromEntries(Object.entries(optionNames).map(([key, name]) => [key, st.scOpts[name]])) }); this.setState({ scrapeTemplates: loadLocalScrapeTaskTemplates() }); }, '模板已保存');
            view.preview = () => this.perform(async () => { if (!st.scScanDir.trim()) throw new Error('请填写扫描目录'); const payload = this.scrapePayload(); this.scrapePreviewConfig = JSON.stringify(payload); const task = await this.request('/api/movies/local-scrape/preview/jobs', 'POST', payload); this.setState({ scrapeTask: { id: task.task_id, status: 'running' }, scPhase: 'scanning', scPct: 0 }); });
            view.applyStrategy = () => { const strategy = st.scStrategy.split(' ')[0]; this.setState({ pathEdits: { ...st.pathEdits, ...Object.fromEntries(rows.filter(row => row.kind === 'conflict').map(row => [row.src, strategy])) } }); this.toast('已为冲突项设置处理策略'); };
            view.execute = () => this.executeScrape(); view.dryRun = () => this.executeScrape(false);
            view.execNote = `${rows.filter(row => row.kind !== 'error' && !st.scSkip.includes(row.src)).length} 个待处理文件`;
            if (view.cmp) {
                view.cmp.sides.forEach((side, index) => { side.better = false; side.keep = () => this.setState({ pathEdits: { ...st.pathEdits, [st.scCmp]: index === 0 ? 'keep_target' : 'keep_source' }, scCmp: null }); });
                view.cmp.skip = () => this.setState({ scSkip: [...st.scSkip, st.scCmp], scCmp: null });
            }
            for (const row of view.rows) {
                row.inspect = () => this.ask({ title: row.code, body: rows.find(item => item.src === row.src)?.note || row.src, color: DIM, okText: '关闭' });
                row.fix = () => { this.toast('修改源文件名或命名规则后重新生成预览', WARN); };
            }
            return view;
        }

        vDispatch() {
            const st = this.state, codes = st.dScope === '1' ? data.MOVIES.map(movie => movie.code) : st.dScope === '2' ? st.sel : st.dCodes.split(/[\s,，]+/).filter(Boolean);
            const history = data.HISTORY.map(record => ({ raw: record, code: record.movie_id || record.id || '', title: record.title || '', res: selectHistoryRedispatchResource(record)?.link || '', src: selectHistoryRedispatchResource(record)?.source || '', tool: record.download_tool || record.tool || '', time: record.timestamp || record.download_time || record.date || '',
                status: record.status || '已记录', local: record.in_local_library ? '已入库' : record.needs_reselect ? '未入库' : '待核对', stBg: 'var(--t08)', stFg: DIM, localFg: DIM2, actText: '重新派发', act: () => { const resource = selectHistoryRedispatchResource(record, sourceKey(st.dSrc)); this.confirmDispatch([record.movie_id || record.id], resource ? [{ ...resource, movie_id: record.movie_id || record.id }] : undefined); },
            }));
            return { tool: st.tool, src: st.dSrc, tools: this.toolStates().map(tool => ({ ...tool, key: tool.name, status: tool.hint, meta: '', active: st.tool === tool.name, bg: st.tool === tool.name ? 'var(--t08)' : 'transparent', ring: 'var(--t09)', needsAction: !tool.connected, actionText: '配置', pick: () => this.setState({ tool: tool.name }), action: () => this.setState({ route: 'settings', seTab: tool.name }) })),
                scope1: st.dScope === '1', scope2: st.dScope === '2', scope3: st.dScope === '3', setScope1: () => this.setState({ dScope: '1' }), setScope2: () => this.setState({ dScope: '2' }), setScope3: () => this.setState({ dScope: '3' }),
                codes: st.dCodes, setCodes: event => this.setState({ dCodes: event.target.value }), setSrc: event => this.setState({ dSrc: event.target.value }),
                subOnly: st.dSubOnly, toggleSub: () => this.setState({ dSubOnly: !st.dSubOnly }), no4k: st.dNo4k, toggle4k: () => this.setState({ dNo4k: !st.dNo4k }),
                skipLocal: true, toggleSkipLocal: () => {}, skipTried: true, toggleSkipTried: () => {}, runCount: codes.length, run: () => this.confirmDispatch(codes),
                stats: [stat('历史记录', history.length), stat('PikPak', st.pikLogged ? '已登录' : '未登录'), stat('Aria2', st.connections.aria2_connected ? '已连接' : '未连接'), stat('115 网盘', this.allConnected() ? '已配置' : '未配置')], failed: [],
                hf0: st.dHf === '0', hf1: st.dHf === '1', hf2: st.dHf === '2', setHf0: () => this.setState({ dHf: '0' }), setHf1: () => this.setState({ dHf: '1' }), setHf2: () => this.setState({ dHf: '2' }),
                checkNote: st.dChecked ? '已核对本地库' : '尚未核对本地库', check: () => this.perform(async () => { const result = await this.request('/api/history/check-local-library', 'POST'); data.HISTORY.splice(0, data.HISTORY.length, ...(result.records || [])); this.setState({ dChecked: true }); }, '本地库核对完成'),
                refresh: () => this.perform(() => this.loadHistory(), '历史记录已刷新'),
                clear: () => this.ask({ title: '清空下载历史？', body: '将同时清空已尝试链接，后续派发可能再次尝试旧链接。', ackText: '我确认清空历史记录', color: BAD, okText: '清空', run: () => this.perform(async () => { await this.request('/api/history', 'DELETE'); await this.loadHistory(); }, '下载历史已清空') }),
                history: history.filter(record => st.dHf === '0' || (st.dHf === '1' ? record.local !== '已入库' : record.status === 'failed')),
            };
        }

        formField(label, value, update, kind = 'text', options = [], hint = '') {
            const revealed = this.state.seReveal.includes(label);
            return { label, value: value ?? '', on: Boolean(value), checkLabel: label, hint, hintFg: DIM2, span: 'auto', mono: 'inherit', ls: 'normal',
                isText: kind === 'text' || kind === 'number', isSecret: kind === 'secret', isSelect: kind === 'select', isCheck: kind === 'check', isStatus: kind === 'status',
                inputType: kind === 'secret' && !revealed ? 'password' : kind === 'number' ? 'number' : 'text', statusFg: DIM,
                options: options.map(option => ({ t: String(option) })), set: event => update(kind === 'check' ? event.target.checked : kind === 'number' ? Number(event.target.value) : event.target.value),
                revealText: revealed ? '隐藏' : '显示', reveal: () => this.setState({ seReveal: revealed ? this.state.seReveal.filter(key => key !== label) : [...this.state.seReveal, label] }),
            };
        }

        createAuto(codes = []) {
            const draft = buildDefaultTask();
            if (codes.length) Object.assign(draft.nodes.find(node => node.type === 'search').config, { mode: 'codes', codes: codes.join('\n') });
            this.setState({ route: 'auto', auTask: '', autoDraft: draft, auNode: 'search' });
        }
        editAuto(update) { this.setState({ autoDraft: { ...(this.state.autoDraft || this.state.tasks.find(task => task.id === this.state.auTask)), ...update } }); }
        async saveAuto() {
            const task = this.state.autoDraft || this.state.tasks.find(task => task.id === this.state.auTask);
            if (!task?.name.trim()) throw new Error('请先创建任务并填写名称');
            const result = await this.request(`/api/automation/tasks${task.id ? '/' + id(task.id) : ''}`, task.id ? 'PUT' : 'POST', task);
            await this.loadTasks();
            this.setState({ autoDraft: null, auTask: result.id || result.task?.id || task.id || this.state.auTask });
            return result.task || result;
        }
        vAuto() {
            const st = this.state, task = st.autoDraft || st.tasks.find(item => item.id === st.auTask), titles = { trigger: '触发', search: '检索', magnet: '磁力', download: '下载' };
            const node = task?.nodes.find(item => item.id === st.auNode);
            const triggerText = trigger => trigger?.type === 'scheduled' ? `定时 ${trigger.scheduled_time}` : trigger?.type === 'interval' ? `间隔 ${trigger.interval_minutes} 分钟` : '自动运行';
            const field = (label, key, kind = 'text', options = []) => this.formField(label, node?.type === 'trigger' ? task.trigger[key] : node?.config[key], value => {
                if (node.type === 'trigger') this.editAuto({ trigger: { ...task.trigger, [key]: value || null } });
                else this.editAuto({ nodes: task.nodes.map(item => item.id === node.id ? { ...item, config: { ...item.config, [key]: value } } : item) });
            }, kind, options);
            let fields = [];
            if (node?.type === 'trigger') fields = [field('触发方式', 'type', 'select', ['auto', 'scheduled', 'interval']), field('执行时间 HH:MM', 'scheduled_time'), field('间隔分钟', 'interval_minutes', 'number')];
            if (node?.type === 'search') fields = [field('检索方式', 'mode', 'select', ['keyword', 'filters', 'codes']), field('关键词', 'keyword'), field('番号列表', 'codes'),
                this.formField('筛选条件 JSON', st.autoFiltersText ?? JSON.stringify(node.config.filters || []), value => this.setState({ autoFiltersText: value })),
                field('结果上限', 'max_results', 'number'), field('磁力', 'magnet', 'select', ['exist', 'all']), field('类型', 'type', 'select', ['normal', 'uncensored']), field('跳过本地已有', 'skip_existing', 'check')];
            if (node?.type === 'magnet') fields = [field('磁力来源', 'source', 'select', ['javbus', 'cilisousuo', 'yhg007']), field('字幕筛选', 'has_subtitle', 'select', ['', 'true', 'false']), field('排除 4K', 'exclude_4k', 'check'), field('允许中文字幕', 'allow_chinese_subtitles', 'check')];
            if (node?.type === 'download') fields = [field('下载工具', 'tool', 'select', ['pikpak', 'pan115', 'aria2'])];
            return {
                tasks: st.tasks.map(item => ({ name: item.name, trigger: triggerText(item.trigger), last: item.last_run_at || '尚未运行', status: item.enabled ? '已启用' : '已停用', dot: item.enabled ? OK : DIM2, stFg: item.enabled ? OK : DIM2,
                    bg: item.id === task?.id ? 'rgba(145,132,217,.08)' : 'transparent', ring: item.id === task?.id ? ACC : 'var(--t09)', pick: () => this.setState({ auTask: item.id, autoDraft: null, auNode: null, autoFiltersText: null }) })),
                create: () => this.createAuto(), hasTask: Boolean(task),
                cur: { name: task?.name || '创建自动任务', setName: event => this.editAuto({ name: event.target.value }), summary: task ? triggerText(task.trigger) : '点击新建开始配置', last: task?.last_run_at || '尚未运行', status: task?.enabled ? '已启用' : '已停用', tagBg: 'var(--t08)', tagFg: task?.enabled ? OK : DIM2, toggleText: task?.enabled ? '停用任务' : '启用任务', toggleFg: task?.enabled ? WARN : ACC },
                save: () => this.perform(() => this.saveAuto(), '自动任务已保存'),
                remove: () => { if (task?.id) this.ask({ title: `删除 ${task.name}？`, body: '删除任务和运行记录，已派发的下载不受影响。', color: BAD, okText: '删除任务', run: () => this.perform(async () => { await this.request(`/api/automation/tasks/${id(task.id)}`, 'DELETE'); this.setState({ autoDraft: null }); await this.loadTasks(); }, '任务已删除') }); else this.setState({ autoDraft: null }); },
                toggleRun: () => this.perform(async () => { if (!task) throw new Error('请先创建任务'); this.editAuto({ enabled: !task.enabled }); await this.saveAuto(); }, '任务状态已保存'),
                runNow: () => { if (task) this.ask({ title: `运行 ${task.name}？`, body: '将保存当前配置并执行真实检索和下载派发。', color: ACC, okText: '立即运行', run: () => this.perform(async () => { const saved = await this.saveAuto(); await this.request(`/api/automation/tasks/${id(saved.id)}/run`, 'POST'); await this.loadTasks(); }, '运行已提交') }); },
                pauseAll: st.tasks.length > 0 && st.tasks.every(item => !item.enabled), togglePauseAll: () => this.ask({ title: '停用全部自动任务？', body: '关闭后续自动触发，已运行任务不受影响。恢复时请逐项启用。', color: WARN, okText: '停用全部', run: () => this.perform(async () => { for (const item of st.tasks.filter(item => item.enabled)) await this.request(`/api/automation/tasks/${id(item.id)}`, 'PUT', { enabled: false }); await this.loadTasks(); }, '自动任务已停用') }),
                autoLayout: () => { if (task) this.editAuto({ nodes: task.nodes.map((item, index) => ({ ...item, position: { x: 48 + index * 248, y: 110 } })) }); },
                nodes: (task?.nodes || []).map((item, index) => ({ title: titles[item.type], step: String(index + 1).padStart(2, '0'), desc: titles[item.type], meta: item.type === 'trigger' ? triggerText(task.trigger) : Object.entries(item.config).filter(([, value]) => typeof value !== 'object').map(([key, value]) => `${key}: ${value}`).join(' · '), badge: '', hasArrow: index < task.nodes.length - 1, bg: 'var(--t03)', ring: item.id === st.auNode ? ACC : 'var(--t09)', iconBg: 'var(--t08)', iconFg: ACC, stFg: DIM2,
                    pick: () => this.setState({ auNode: item.id, autoFiltersText: null, nodeBeforeEdit: structuredClone(task) }) })),
                node: node ? { title: titles[node.type], fields } : null,
                closeNode: () => this.setState({ auNode: null, autoDraft: st.nodeBeforeEdit || st.autoDraft, autoFiltersText: null }),
                saveNode: () => this.perform(async () => { if (node?.type === 'search' && st.autoFiltersText != null) { const filters = JSON.parse(st.autoFiltersText); if (!Array.isArray(filters) || filters.some(item => !item.type || !item.value)) throw new Error('筛选条件须为含 type 和 value 的数组'); this.editAuto({ nodes: task.nodes.map(item => item.id === node.id ? { ...item, config: { ...item.config, filters } } : item) }); } this.setState({ auNode: null }); }, '节点已更新，保存任务后生效'),
                refresh: () => this.perform(() => this.loadTasks()),
                runs: (task?.runs || []).map(run => ({ time: run.started_at, trigger: run.status, found: run.found_count, matched: run.magnet_count, dispatched: run.dispatched_count, skipped: run.skipped_count, errors: run.error ? 1 : 0, result: safeText(run.error, run.status), dispatchFg: OK, errFg: BAD, resFg: DIM,
                    open: () => this.ask({ title: `运行 ${run.started_at}`, body: safeText(run.error, run.status), list: (run.items || []).map(item => `${item.movie_id}: ${item.status} ${safeText(item.message, '')}`), color: ACC, okText: '关闭' }) })),
            };
        }

        async connect(key, fromConfig = false) {
            const values = this.state.settingsDraft[key] || {};
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
                if (!fromConfig) {
                    form.set(`${key}_url`, values.url || '');
                    if (key === 'webdav') { form.set('username', values.username || ''); form.set('password', values.password || loadWebDavSettings().password || ''); }
                    else form.set('aria2_secret', values.secret || loadAria2Settings().secret || '');
                }
                await this.request(`/api/${key}/connect${fromConfig ? '-config' : ''}`, 'POST', fromConfig ? undefined : form);
                if (!fromConfig) (key === 'webdav' ? saveWebDavSettings : saveAria2Settings)(values);
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
        async loadAria() { const payload = await this.request('/api/aria2/downloads'); this.setState({ ariaTasks: payload.downloads || [] }); }
        ariaAction(task, action) { return this.perform(async () => { await this.request(`/api/aria2/${action}/${id(task.gid)}`, action === 'remove' ? 'DELETE' : 'POST'); await this.loadAria(); }, '下载任务已更新'); }
        async browseDirectory(path = '', target = null) {
            const result = await this.request(`/api/system/directories?path=${id(path)}`);
            this.setState({ fsAdd: 'browse', browserTarget: target, browsePath: result.current_path || '', directories: result.directories || result.entries || [], browseParent: result.parent_path });
        }
        minFileSize() { return { '不限': 0, '大于 500 MB': 500, '大于 2 GB': 2048, '大于 8 GB': 8192 }[this.state.fsMinSize] || 0; }
        sendFiles(files) {
            if (this.state.fsSrc === 'local') { this.toast('本地目录用于浏览，远程文件可发送到 Aria2', WARN); return; }
            this.ask({ title: `发送 ${files.length} 个文件到 Aria2？`, body: '从当前网盘下载到已连接的 Aria2。', list: files.map(file => file.name), color: ACC, okText: '发送', run: () => this.perform(async () => {
                const result = await this.request('/api/webdav/download', 'POST', { files: files.map(file => ({ ...file, path: file.path || file.id, is_directory: file.is_directory || file.kind === 'folder', source_type: this.state.fsSrc === '115' ? 'pan115' : 'webdav' })), video_filter: this.state.fsVideoOnly, min_file_size_mb: this.minFileSize() });
                if (result.results?.some(item => item.success === false && !item.skipped)) throw new Error('部分文件发送失败，请检查下载任务');
                this.setState({ fsSel: [] }); await this.loadAria();
            }, '已发送到 Aria2') });
        }
        vStorage() {
            const st = this.state, connected = st.fsSrc === 'local' || (st.fsSrc === '115' ? this.allConnected() : st.connections.webdav_connected);
            const rows = st.fileRows.filter(file => file.is_directory || file.kind === 'folder' || ((!st.fsQ || file.name.toLowerCase().includes(st.fsQ.toLowerCase())) && (!st.fsVideoOnly || /\.(mp4|mkv|avi|wmv|mov|m4v|ts|flv|webm)$/i.test(file.name)) && Number(file.size) >= this.minFileSize() * 1024 ** 2));
            const selected = rows.filter(file => st.fsSel.includes(file.path || file.id)), tasks = st.ariaTasks || [];
            return {
                sources: [['local', '服务端本地', true], ['webdav', 'WebDAV', st.connections.webdav_connected], ['115', '115 网盘', this.allConnected()]].map(([key, name, up]) => ({ key, name, status: up ? '可用' : '未连接', dot: up ? OK : DIM2, stFg: up ? OK : DIM2, meta: '', op: 1, cursor: 'pointer', needsCfg: key !== 'local', bg: key === st.fsSrc ? 'rgba(145,132,217,.08)' : 'transparent', ring: key === st.fsSrc ? ACC : 'var(--t09)', config: () => this.setState({ route: 'settings', seTab: name }), pick: () => { this.setState({ fsSrc: key, fileRows: [], directory: '', directoryTrail: [] }); if (up) this.perform(() => this.loadFiles(key, '')); } })),
                subtitle: st.fsSrc === 'local' ? '服务端本地目录' : '远程目录 · 可发送到 Aria2', offline: !connected, showFiles: connected, goSettings: () => this.setState({ route: 'settings', seTab: st.fsSrc === '115' ? '115 网盘' : 'WebDAV' }),
                q: st.fsQ, setQ: event => this.setState({ fsQ: event.target.value }), videoOnly: st.fsVideoOnly, toggleVideo: () => this.setState({ fsVideoOnly: !st.fsVideoOnly }), minSize: st.fsMinSize, setMinSize: event => this.setState({ fsMinSize: event.target.value }),
                crumbs: [{ name: '根目录 / ', fg: ACC, go: () => this.perform(() => this.loadFiles(st.fsSrc, '')) }, { name: st.directory || '/', fg: DIM, go: () => this.perform(() => this.loadFiles()) }, { name: '上一级', fg: ACC, go: () => this.perform(() => { const trail = st.directoryTrail || []; const parent = st.fsSrc === '115' ? trail.at(-1) || '' : st.directoryParent ?? (st.directory.replace(/[\\/][^\\/]+[\\/]?$/, '') || '/'); this.setState({ directoryTrail: trail.slice(0, -1) }); return this.loadFiles(st.fsSrc, parent); }) }],
                dirMeta: `${rows.length} 项`, allSel: rows.length > 0 && selected.length === rows.length, toggleAll: () => this.setState({ fsSel: selected.length === rows.length ? [] : rows.map(file => file.path || file.id) }),
                rows: rows.map(file => { const dir = file.is_directory || file.kind === 'folder', key = file.path || file.id; return { ...file, isDir: dir, type: dir ? '文件夹' : file.kind || '文件', size: size(file.size), date: file.modified || file.modified_time || file.mtime || '—', icon: dir ? 'ph-folder' : 'ph-file', iconFg: dir ? ACC : DIM, fg: dir ? ACC : 'var(--fg)', cursor: dir ? 'pointer' : 'default', sel: st.fsSel.includes(key), toggle: () => this.setState({ fsSel: st.fsSel.includes(key) ? st.fsSel.filter(value => value !== key) : [...st.fsSel, key] }),
                    open: () => { if (dir) { this.setState({ directoryTrail: [...(st.directoryTrail || []), st.directory] }); return this.perform(() => this.loadFiles(st.fsSrc, key)); } }, send: () => this.sendFiles([file]) }; }),
                selCount: st.route === 'storage' ? selected.length : 0, selSize: size(selected.reduce((sum, file) => sum + Number(file.size || 0), 0)), clearSel: () => this.setState({ fsSel: [] }), sendSel: () => this.sendFiles(selected), canSend: st.fsSrc !== 'local',
                refreshAria: () => this.perform(() => this.loadAria()), ariaConnected: st.connections.aria2_connected, ariaDown: !st.connections.aria2_connected, ariaStatus: st.connections.aria2_connected ? '已连接' : '未连接', ariaDot: st.connections.aria2_connected ? OK : DIM2, ariaFg: DIM, ariaMeta: `${tasks.length} 个任务`, connectAria: () => this.perform(() => this.connect('aria2', true), 'Aria2 已连接'), jobs115: null,
                browsePath: () => this.perform(() => this.browseDirectory()), closeAdd: () => this.setState({ fsAdd: null }),
                addForm: st.fsAdd === 'browse' ? { title: '浏览服务端目录', desc: '选择服务端可访问的目录', path: st.browsePath, entries: [...(st.browseParent != null ? [{ name: '..', path: st.browseParent }] : []), ...st.directories].map(entry => ({ name: entry.name || entry.path, meta: entry.path, open: () => this.perform(() => this.browseDirectory(entry.path, st.browserTarget)) })) } : null,
                pickPath: () => { const target = st.browserTarget; this.setState({ fsAdd: null }); if (target) this.setState({ [target.key]: st[target.key].map((value, index) => index === target.index ? st.browsePath : value) }); else this.perform(() => this.loadFiles('local', st.browsePath)); },
                pauseAll: () => this.ask({ title: '暂停全部下载？', body: '暂停当前活动及等待中的 Aria2 任务。', color: WARN, okText: '暂停', run: () => this.perform(async () => { for (const task of tasks.filter(task => ['active', 'waiting'].includes(task.status))) await this.request(`/api/aria2/pause/${id(task.gid)}`, 'POST'); await this.loadAria(); }, '下载已暂停') }),
                tasks: tasks.map(task => ({ name: task.name, dir: task.gid, pct: Number(task.totalLength) ? Math.round(100 * Number(task.completedLength) / Number(task.totalLength)) : 0, speed: `${size(task.downloadSpeed)}/s`, eta: '—', sizeText: `${size(task.completedLength)} / ${size(task.totalLength)}`, status: task.status, stFg: task.status === 'error' ? BAD : DIM, fg: 'var(--fg)', canPause: ['active', 'waiting'].includes(task.status), canResume: task.status === 'paused', pause: () => this.ariaAction(task, 'pause'), resume: () => this.ariaAction(task, 'resume'), del: () => this.ask({ title: '删除 Aria2 任务？', body: `从 Aria2 移除 ${task.name} 下载任务，保留已下载文件。`, color: BAD, okText: '删除', run: () => this.ariaAction(task, 'remove') }) })),
            };
        }

        vSettings() {
            const st = this.state, sectionMap = { 'JavBus API': 'javbus', '刮削源': 'scrapers', WebDAV: 'webdav', Aria2: 'aria2', PikPak: 'pikpak', '115 网盘': 'pan115', 磁力筛选: 'magnet_health' }, key = sectionMap[st.seTab];
            const values = st.settingsDraft[key] || {}, update = (field, value) => this.setState({ settingsDraft: { ...st.settingsDraft, [key]: { ...values, [field]: value } } });
            const labels = { enabled: '启用', base_url: '基地址', url: '服务地址', username: '用户名', password: '密码', secret: 'RPC Secret', cookie: 'Cookie', timeout_seconds: '请求超时（秒）', proxy: '代理', request_interval_seconds: '请求间隔（秒）', cache_expire_seconds: '缓存有效期（秒）', cache_max_size: '缓存条目上限', image_retry_attempts: '图片重试次数', image_retry_backoff_seconds: '图片重试间隔', auto_connect: '自动连接', auto_login: '自动登录', save_dir_id: '离线目录 CID', login_app: '登录 App', batch_size: '批量大小', batch_interval_seconds: '批次间隔（秒）', jitter_seconds: '随机延时（秒）', probe_with_aria2: '使用 Aria2 探测', min_seeders: '最少做种数', min_peers: '最少节点数', min_availability: '最低可用率', min_score: '最低评分', probe_timeout_seconds: '探测超时（秒）', allow_unknown: '允许未知健康度' };
            const tabs = ['配置概览', '外观', ...Object.keys(sectionMap), '运行安全'];
            const status = name => name === 'WebDAV' ? (st.connections.webdav_connected ? '已连接' : '未连接') : this.toolStates().find(tool => tool.name === name)?.hint || '';
            let fields = key && key !== 'scrapers' ? Object.entries(values).filter(([field, value]) => labels[field] && typeof value !== 'object').map(([field, value]) => this.formField(labels[field], value, value => update(field, value), ['password', 'secret', 'cookie'].includes(field) ? 'secret' : typeof value === 'boolean' ? 'check' : typeof value === 'number' ? 'number' : 'text', [], ['password', 'secret', 'cookie'].includes(field) ? '留空保留服务端已存值；保存会写入服务端配置。' : '')) : [];
            if (st.seTab === '运行安全') fields = [this.formField('会话密钥', st.settings.security?.session_secret_configured ? '已配置' : '未配置', () => {}, 'status'), this.formField('环境变量覆盖', Object.entries(st.settings.environment_overrides?.javbus || {}).filter(([, value]) => value).map(([name]) => name).join(' · ') || '无', () => {}, 'status')];
            const sources = st.settingsDraft.scrapers || {}, priority = sources.priority || [], providers = [...new Set([...priority, ...Object.keys(sources).filter(name => name !== 'priority')])];
            const updateSource = (name, updates) => this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, [name]: { ...sources[name], ...updates } } } });
            const testSources = providers => this.perform(async () => { const result = await this.request('/api/movies/metadata-scrapers/test', 'POST', { providers, concurrent: 3, apply_results: false }); this.setState({ sourcesResult: result.results || [] }); }, '刮削源测试已完成');
            return {
                tabs: tabs.map(name => ({ name, status: status(name), dot: status(name) === '已连接' ? OK : DIM2, stFg: DIM2, bg: name === st.seTab ? 'rgba(145,132,217,.12)' : 'transparent', fg: name === st.seTab ? 'var(--fg)' : DIM, fw: name === st.seTab ? 500 : 400, pick: () => this.setState({ seTab: name }) })),
                isOverview: st.seTab === '配置概览', isAppearance: st.seTab === '外观', isSources: key === 'scrapers', isForm: Boolean(key && key !== 'scrapers') || st.seTab === '运行安全', fields,
                cur: { title: st.seTab, desc: st.seTab === '外观' ? '管理界面配色主题' : '配置现有服务与连接', canTest: ['webdav', 'aria2', 'pikpak', 'pan115', 'scrapers', 'javbus'].includes(key), banner: status(st.seTab), bannerFg: DIM, bannerBg: 'var(--t03)', bannerRing: 'var(--t09)', bannerMeta: '' },
                overview: tabs.filter(name => !['配置概览', '外观'].includes(name)).map(name => ({ name, status: status(name) || '查看配置', dot: DIM2, stFg: DIM, ring: 'var(--ring)', meta: '', action: '查看', go: () => this.setState({ seTab: name }) })),
                themes: [{ key: 'dark', name: '深色', desc: '深色主题', bg: '#161826', surf: '#232532', ring: '#3f424d', fg: '#e9e9ed', dim: '#92939b', acc: '#9184d9' }, { key: 'light', name: '浅色', desc: '浅色主题', bg: '#f1f2f7', surf: '#ffffff', ring: '#d7dae4', fg: '#1a1c28', dim: '#676977', acc: '#5b4fa8' }].map(theme => ({ ...theme, active: st.theme === theme.key, ringOuter: st.theme === theme.key ? ACC : 'var(--ring)', badge: st.theme === theme.key ? '当前使用' : '点击切换', badgeFg: ACC, badgeBg: 'var(--t08)', pick: () => { saveAppTheme(theme.key); this.setState({ theme: theme.key }); } })),
                sources: providers.map((name, index) => { const source = sources[name] || {}, result = st.sourcesResult.find(item => item.provider === name || item.name === name); return { name, host: source.base_url || '', status: source.implemented === false ? '未实现' : result ? (result.success ? '测试成功' : '测试失败') : '待测试', latency: result?.elapsed_ms ? `${result.elapsed_ms} ms` : '', note: '', on: source.enabled, order: index + 1, op: source.enabled ? 1 : .55, ring: 'var(--t09)', stFg: DIM, dot: DIM2, upDisabled: index === 0, toggleText: source.enabled ? '禁用' : '启用', toggle: () => updateSource(name, { enabled: !source.enabled }), test: () => testSources([name]), up: () => { const next = [...providers]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; this.setState({ settingsDraft: { ...st.settingsDraft, scrapers: { ...sources, priority: next } } }); },
                    fields: Object.entries(source).filter(([field]) => ['language', 'request_delay', 'base_url', 'api_key'].includes(field)).map(([field, value]) => this.formField(field, value, value => updateSource(name, { [field]: value }), field === 'api_key' ? 'secret' : typeof value === 'number' ? 'number' : 'text')) }; }),
                test: () => key === 'scrapers' || key === 'javbus' ? testSources(key === 'javbus' ? ['javbus'] : providers) : this.perform(() => this.connect(key, !values.password && !values.secret && !values.cookie && Object.entries(values).every(([field, value]) => ['password', 'secret', 'cookie'].includes(field) || st.settings[key]?.[field] === value)), '连接成功'),
                applyTestResults: () => this.perform(async () => { if (!st.sourcesResult.length) throw new Error('请先运行测试'); await this.request('/api/movies/metadata-scrapers/apply-test-results', 'POST', { results: st.sourcesResult }); await this.loadSettings(); }, '已按测试结果更新配置'),
                save: () => this.perform(async () => { if (st.seTab === '外观') { saveAppTheme(st.theme); return; } await this.request('/api/system/settings', 'PUT', buildSettingsPayload(st.settingsDraft)); await this.loadSettings(); await this.loadConnections(); }, '设置已保存'),
                reload: () => this.perform(() => this.loadSettings()), reset: () => this.setState({ settingsDraft: withSecretPlaceholders(st.settings) }),
                startQr: () => this.perform(() => this.startQr()), showQrLogin: key === 'pan115', logout: () => { clearPikPakSession(); this.auth = null; this.setState({ pikLogged: false }); }, showLogout: key === 'pikpak' && st.pikLogged,
            };
        }

        renderVals() {
            const view = super.renderVals(), st = this.state;
            view.sysInfo = `JavJaeger ${window.versionInfo?.version || ''}`;
            for (const nav of view.nav) nav.badge = nav.label === '转码' ? String(data.TC.filter(task => ['running', 'queued'].includes(task.status)).length || '') : nav.label === '自动模式' ? String(st.tasks.filter(task => task.enabled).length || '') : '';
            view.tools = this.toolStates();
            view.bg.items = data.TC.filter(task => ['running', 'queued'].includes(task.status)).map(task => ({ kind: '转码', name: task.code, pct: task.pct, pctText: `${task.pct}%`, meta: task.stage, fg: ACC, go: this.go('transcode') }));
            for (const key of ['scanTask', 'scrapeTask']) if (st[key] && !['success', 'completed', 'failed'].includes(st[key].status)) view.bg.items.push({ kind: key === 'scanTask' ? '扫描入库' : '刮削', name: st[key].message || '后台运行中', pct: st[key].percent || 0, pctText: '', meta: st[key].status, fg: ACC, go: this.go(key === 'scanTask' ? 'library' : 'scrape') });
            view.bg.count = view.bg.items.length;
            const search = view.s, movies = this.visible();
            Object.assign(search, { offline: false, srcText: st.searchDone ? '已获取结果' : '待查询', srcDot: DIM2, srcFg: DIM,
                showGrid: !st.loading && movies.length > 0 && st.view === 'grid', showList: !st.loading && movies.length > 0 && st.view === 'list',
                empty: !st.loading && movies.length === 0 && st.sMode !== 'magnet', emptyTitle: st.searchDone ? '没有匹配的影片' : '开始检索', emptyBody: '填写条件后查询真实影片数据。',
                nextDisabled: !st.nextPage, noResults: !movies.length, summary: `${movies.length} 部`, recogCount: movies.length, recogSkipped: '', selSize: '', selNote: '',
                fCatalogNote: '可输入代码或从目录选择', magQueryNote: `${this.magnets.get(st.code)?.length || 0} 条磁力`,
                downloadAll: () => this.confirmDispatch(movies.map(movie => movie.code)), batchDispatch: () => this.confirmDispatch(st.sel),
                batchAuto: () => this.createAuto(st.sel), toggleExclude4k: () => { this.setState({ exclude4k: !st.exclude4k }); if (st.searchDone) void this.runSearch(); },
                toolStatus: this.toolStates().find(tool => tool.name === st.tool)?.hint || '未连接',
                toolCfg: this.toolConfig(st.toolCfg),
            });
            search.magRows = this.magnetRows(st.code);
            const activeTool = this.toolStates().find(tool => tool.name === st.tool);
            search.toolDot = activeTool?.dot; search.toolFg = activeTool?.fg;
            for (const row of search.rows) row.cover = data.MOVIES.find(movie => movie.code === row.code)?.cover;
            for (const row of search.rows) row.open = () => this.perform(async () => {
                const original = data.MOVIES.find(movie => movie.code === row.code);
                const detail = movieView(await this.request(`/api/movies/${id(row.code)}`));
                Object.assign(original, detail);
                this.magnets.set(row.code, await this.getMagnets(original));
                this.setState({ detail: row.code });
            });
            if (search.d) { search.d.magnets = this.magnetRows(st.detail); search.d.magCount = search.d.magnets.length; search.d.copy = () => this.perform(() => navigator.clipboard.writeText(st.detail), '番号已复制'); }
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
