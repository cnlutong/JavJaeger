import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { connectDesign, designDataExports, adaptDesignScript } from '../../frontend/src/design/integration.mjs';
import { adaptTemplate } from '../../frontend/src/design/template.mjs';
import { saveWebDavSettings, saveAria2Settings } from '../../frontend/src/utils/storage.js';

const original = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
const script = adaptDesignScript(original.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]);
class DCLogic {
    constructor(props) { this.props = props; }
    setState(patch) { this.state = { ...this.state, ...patch }; }
}
function app() {
    const storage = new Map();
    globalThis.window = {
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: k => storage.get('session:' + k) ?? null, setItem: (k, v) => storage.set('session:' + k, v), removeItem: k => storage.delete('session:' + k) },
        versionInfo: { version: 'test' },
    };
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(DCLogic);
    return new (connectDesign(Base))({});
}

test('the imported UI renders empty real state without fictional movies, jobs or credentials', () => {
    const instance = app();
    const view = instance.renderVals();
    assert.deepEqual(view.s.rows, []);
    assert.deepEqual(instance.vLibrary().rows, []);
    assert.deepEqual(instance.vTranscode().rows, []);
    assert.deepEqual(instance.vAuto().tasks, []);
    assert.deepEqual(instance.vStorage().rows, []);
    assert.equal(view.bg.count, 0);
    assert.equal(view.cn.showHero, false);
    assert.equal(instance.state.pikLogged, false);
    assert.ok(!JSON.stringify(instance.vSettings()).includes('sk_jb_'));
});

test('performance: rendering a route never builds hidden page views', () => {
    const instance = app(), calls = [];
    const routes = { cinema: 'vCinema', dispatch: 'vDispatch', transcode: 'vTranscode', scrape: 'vScrape', library: 'vLibrary', auto: 'vAuto', storage: 'vStorage', settings: 'vSettings' };
    for (const [route, method] of Object.entries(routes)) {
        const original = instance[method];
        instance[method] = function () { calls.push(route); return original.call(this); };
    }
    for (const route of ['search', ...Object.keys(routes)]) {
        calls.length = 0;
        instance.setState({ route }); instance.renderVals();
        assert.deepEqual(calls, route === 'search' ? [] : [route], route);
    }
});

test('performance: unchanged task polling does not schedule a render', async () => {
    const instance = app(); let renders = 0;
    instance.forceUpdate = () => { renders++; };
    const update = instance.setState.bind(instance);
    instance.setState = patch => { renders++; update(patch); };
    let progress = 10;
    globalThis.fetch = async url => json(url.includes('transcoding') ? { tasks: [{ id: 't', status: 'running', progress }] } : { tasks: [] });
    await instance.loadTranscodes(); await instance.loadTasks(); await instance.loadAria();
    renders = 0;
    await instance.loadTranscodes(); await instance.loadTasks(); await instance.loadAria();
    assert.equal(renders, 0);
    progress = 20; await instance.loadTranscodes();
    assert.equal(renders, 1);
});

test('performance: rapid library navigation reuses loaded data and explicit refresh stays fresh', async () => {
    const instance = app(); let reads = 0;
    globalThis.fetch = async url => { if (url === '/api/movies/local-library') reads++; return json({ records: [], actors: [], directories: [], incomplete_records: [] }); };
    await instance.loadLibrary();
    instance.go('library')(); instance.go('cinema')();
    assert.equal(reads, 1);
    await instance.loadLibrary(); assert.equal(reads, 2);
    instance._libraryLoadedAt = Date.now() - 31000;
    instance.go('library')(); assert.equal(reads, 3);
    await new Promise(resolve => setImmediate(resolve));
});

test('performance: library refresh reads the index and only an explicit check verifies files', async () => {
    const instance = app(), checks = [];
    globalThis.fetch = async url => {
        if (url.includes('/information/check')) checks.push(new URL(url, 'http://local').searchParams.get('refresh_files'));
        return json({ records: [], actors: [], directories: [], incomplete_records: [] });
    };
    await instance.loadLibrary(); await instance.loadLibrary();
    assert.deepEqual(checks, ['false', 'false']);
    await instance.vLibrary().runCheck();
    assert.equal(checks.filter(value => value === 'true').length, 1);
});

test('performance: search shows movies while magnets are still loading', async () => {
    const instance = app(); instance.setState({ route: 'search', code: 'QA-001' });
    let release, requested;
    const magnetStarted = new Promise(resolve => { requested = resolve; });
    globalThis.fetch = async url => {
        if (url.startsWith('/api/magnets/')) { requested(); return new Promise(resolve => { release = resolve; }); }
        return json({ id: 'QA-001', gid: '1', uc: 0 });
    };
    const pending = instance.runSearch(); await magnetStarted;
    const view = instance.renderVals().s;
    release(json([])); await pending;
    assert.equal(view.showGrid || view.showList, true);
    assert.equal(view.rows[0].code, 'QA-001');
});

test('performance: movie and transcode dialogs open before slow requests complete', async () => {
    const instance = app(); instance.setState({ route: 'search', code: 'QA-001' });
    globalThis.fetch = async url => json(url.includes('/magnets/') ? [] : { id: 'QA-001', gid: '1', uc: 0 });
    await instance.runSearch();
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const details = instance.renderVals().s.rows[0].open();
    const detailVisible = instance.state.detail;
    globalThis.fetch = async () => json([]);
    release(json({ id: 'QA-001', gid: '1', uc: 0 })); await details;
    assert.equal(detailVisible, 'QA-001');
    await loadRecords(instance, [localRecord('QA-001')]);
    instance.loadTranscodes = () => new Promise(resolve => { release = resolve; });
    const transcode = instance.openTranscode('QA-001');
    const selection = instance.state.lbTc;
    instance.setState({ lbTc: null }); release(); await transcode;
    assert.equal(selection?.code, 'QA-001');
    assert.equal(instance.state.lbTc, null, 'finishing a request must not reopen a closed dialog');
});

test('performance: route gating preserves the shared directory picker', async () => {
    const instance = app(); instance.setState({ route: 'library' });
    globalThis.fetch = async () => json({ current_path: '/qa', directories: [] });
    await instance.browseDirectory('/qa', { key: 'lbPaths', index: 0 });
    assert.equal(instance.renderVals().fs.addForm?.path, '/qa');
});

test('original search controls load real movie and magnet endpoints', async () => {
    const instance = app();
    const requests = [];
    globalThis.fetch = async (url, options = {}) => {
        requests.push([String(url), options]);
        return new Response(JSON.stringify(String(url).startsWith('/api/magnets/')
            ? [{ name: 'QA-001.mkv', link: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789', size: '1 GB' }]
            : { id: 'QA-001', title: 'Real API result', gid: '12', uc: 0, stars: [{ name: 'QA Actor' }] }), { status: 200 });
    };
    instance.setState({ route: 'search', sMode: 'code', code: 'QA-001' });
    await instance.runSearch();
    const view = instance.renderVals();
    assert.equal(view.s.rows[0].code, 'QA-001');
    assert.equal(view.s.rows[0].title, 'Real API result');
    assert.ok(requests.some(([url]) => url.startsWith('/api/movies/QA-001')));
    assert.ok(requests.some(([url]) => url.startsWith('/api/magnets/QA-001') && url.includes('gid=12')));
    assert.ok(!view.s.rows[0].noMag);
});

test('failed writes are attempted once and never report success or echo response secrets', async () => {
    const instance = app();
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; return new Response('password=DO-NOT-ECHO', { status: 500 }); };
    await instance.perform(async () => instance.request('/api/history', 'DELETE'), '历史已清空');
    assert.equal(attempts, 1);
    assert.match(instance.state.toast.text, /失败|500/);
    assert.doesNotMatch(instance.state.toast.text, /历史已清空|DO-NOT-ECHO/);
    instance.componentWillUnmount();
});

test('background jobs finish on the backend success status and failed jobs stop polling', async () => {
    const instance = app();
    instance.setState({ route: 'scrape', scrapeTask: { id: 'job', status: 'running' } });
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'success', percent: 100, result: { success: true, items: [] } }));
    await instance.poll();
    assert.equal(instance.state.scPhase, 'preview');
    instance.setState({ scrapeTask: { id: 'failed-job', status: 'running' } });
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'failed', error: 'task_failed', message: '任务失败' }));
    await instance.perform(() => instance.poll());
    assert.equal(instance.state.scrapeTask.status, 'failed');
    instance.componentWillUnmount();
});

test('search dispatch submits the displayed selected magnet and its source', async () => {
    const instance = app(), calls = [];
    instance.setState({ route: 'search', tool: 'Aria2' });
    instance.magnets.set('QA-001', [{ movie_id: 'QA-001', link: 'magnet:?xt=urn:btih:selected', source: 'yhg007' }]);
    globalThis.fetch = async (url, options) => { calls.push([url, options.body && JSON.parse(options.body)]); return new Response(JSON.stringify(url === '/api/history' ? [] : { success: true })); };
    instance.confirmDispatch(['QA-001']);
    await instance.state.dlg.run();
    assert.equal(calls[0][0], '/api/aria2/download-magnets');
    assert.deepEqual(calls[0][1].magnet_links, ['magnet:?xt=urn:btih:selected']);
    assert.deepEqual(calls[0][1].magnet_sources, ['yhg007']);
    instance.componentWillUnmount();
});

const json = value => new Response(JSON.stringify(value));
const localRecord = (code, overrides = {}) => ({ movie_id: code, title: code, files: [{ path: `/${code}.mp4`, size: 100 }], stars: [], genres: [], total_size: 100, ...overrides });
async function loadRecords(instance, records, incomplete = []) {
    globalThis.fetch = async url => json(url.includes('/information/check') ? { fields: ['title', 'date'], incomplete_records: incomplete, incomplete_count: incomplete.length }
        : url.endsWith('/settings') ? { directories: [], ignored_paths: [] } : url.endsWith('/actors') ? { actors: [] } : { records });
    await instance.loadLibrary();
}

test('performance: library and cinema avoid quadratic full-library lookups', async () => {
    const instance = app(), count = 240;
    await loadRecords(instance, Array.from({ length: count }, (_, i) => localRecord(`QA-${String(i).padStart(4, '0')}`, { stars: [`Actor ${i % 60}`], series: `Series ${i % 40}` })));
    const data = Object.getPrototypeOf(instance.constructor).data;
    let lookups = 0;
    for (const movie of data.LIB) {
        const code = movie.code;
        Object.defineProperty(movie, 'code', { get() { lookups++; return code; }, configurable: true });
    }
    instance.setState({ lbSort: '番号', cnTab: '全部影片' });
    instance.vLibrary();
    assert.ok(lookups < count * 40, `library code accesses: ${lookups}`);
    let predicates = 0;
    for (const dim of data.FILTER_DIMS) {
        const predicate = dim.test;
        dim.test = (...args) => { predicates++; return predicate(...args); };
    }
    lookups = 0; instance.vCinema();
    assert.ok(lookups < count * 40, `cinema code accesses: ${lookups}`);
    assert.ok(predicates <= count * data.FILTER_DIMS.length, `facet scans: ${predicates}`);
});

test('performance: series shelves are bounded and can open every film in a series', async () => {
    const instance = app();
    await loadRecords(instance, Array.from({ length: 240 }, (_, i) => localRecord(`QA-${i}`, { series: `Series ${i % 10}` })));
    instance.setState({ route: 'cinema', cnTab: '系列' });
    const view = instance.vCinema();
    assert.ok(view.shelves.length <= 6);
    assert.ok(view.shelves.every(shelf => shelf.items.length <= 12));
    view.shelves[0].openAll();
    assert.equal(instance.vCinema().wall.length, 24);
});

test('performance: catalogue pages retain groups, search and selection', async () => {
    const instance = app();
    globalThis.fetch = async () => json({ Actors: Array.from({ length: 200 }, (_, i) => ({ id: `actor-${i}`, name: `QA Actor ${i}` })) });
    await instance.loadCatalogs(); instance.setState({ route: 'search', browse: 'star' });
    const view = instance.renderVals().s;
    assert.equal(view.browse.groups[0].items.length, 60);
    view.browse.paging.next();
    instance.setState({ browseQ: 'QA Actor 199' });
    const result = instance.renderVals().s.browse;
    assert.equal(result.groups[0].items.length, 1);
    result.groups[0].items[0].pick();
    assert.equal(instance.state.fValue, 'actor-199');
});

test('performance: large search results page locally and stop rendering when hidden', async () => {
    const instance = app(); instance.setState({ route: 'search', sMode: 'recognize' });
    globalThis.fetch = async url => json(url.includes('/magnets/') ? [] : { movies: Array.from({ length: 200 }, (_, i) => ({ id: `QA-${i}`, gid: '1', uc: 0 })) });
    await instance.runSearch();
    const first = instance.renderVals().s;
    assert.equal(first.rows.length, 60);
    first.selectPage(); assert.equal(instance.state.sel.length, 60);
    first.paging.next(); assert.equal(instance.renderVals().s.rows[0].code, 'QA-60');
    instance.setState({ route: 'settings' });
    assert.deepEqual(instance.renderVals().s.rows, []);
});

test('audit: search errors persist and reset or mode changes invalidate pending results', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ code: 'QA-001' });
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await instance.runSearch();
    assert.match(instance.state.searchError, /503/);
    assert.equal(instance.renderVals().s.offline, true);
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const pending = instance.runSearch();
    instance.renderVals().s.reset();
    release(json({ id: 'QA-001', gid: '1', uc: 0 }));
    await pending;
    assert.deepEqual(instance.renderVals().s.rows, []);
    assert.equal(instance.state.loading, false);
});

test('audit: pagination obeys backend metadata for every magnet source', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const records = Array.from({ length: 30 }, (_, i) => ({ id: `QA-${i}`, gid: '1', uc: 0 }));
    globalThis.fetch = async url => json(url.startsWith('/api/magnets') ? [] : { movies: records, pagination: { hasNextPage: false } });
    instance.setState({ sMode: 'filter', src: 'yhg' }); await instance.runSearch();
    assert.equal(instance.renderVals().s.showPager, true);
    assert.equal(instance.renderVals().s.nextDisabled, true);
});

test('audit: library completeness and mixed-unit cinema sorting use actual data', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    await loadRecords(instance, [localRecord('QA-1', { total_size: 900 * 1024 ** 2 }), localRecord('QA-2', { total_size: 2 * 1024 ** 3 })], [{ movie_id: 'QA-1', missing_labels: ['日期'], missing_fields: ['date'] }]);
    instance.setState({ lbM: '2' });
    assert.deepEqual(instance.vLibrary().rows.map(row => row.code), ['QA-1']);
    instance.setState({ cnTab: '全部影片', cnSort: '体积' });
    assert.equal(instance.vCinema().wall[0].code, 'QA-2');
});

test('audit: cinema resets file index between films and includes every VR resolution', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    await loadRecords(instance, [localRecord('QA-1'), localRecord('QA-2', { is_vr: true, media_info: { height: 2880 } })]);
    instance.setState({ cnHero: 'QA-2', playerIndex: 1, cnTab: 'VR' });
    const view = instance.vCinema(); view.play();
    assert.equal(instance.state.playerIndex, 0);
    assert.equal(view.shelves.flatMap(shelf => shelf.items).length, 1);
});

test('audit: metadata partial failures do not announce complete success', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.loadLibrary = async () => {};
    globalThis.fetch = async () => json({ success: true, updated_count: 0, failed_count: 1, results: [{ success: false }] });
    await instance.completeInformation(['QA-001'], true);
    assert.match(instance.state.toast.text, /失败/);
    assert.doesNotMatch(instance.state.toast.text, /^影片资料已更新$/);
});

test('audit: preview resets conflict choices and non-organizing apply skips target conflicts', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const row = { source_path: '/qa.mkv', code: 'QA-001', metadata: { title: 'QA' }, scrape_status: 'found', target_video_path: '/target/qa.mkv', target_exists: true };
    instance.setState({ pathEdits: { '/qa.mkv': 'keep_source' }, scScanDir: '/qa', scOutDir: '/target' });
    instance.applyScrapeResult({ success: true, items: [row] });
    assert.deepEqual(instance.state.pathEdits, {});
    instance.scrapePreviewConfig = JSON.stringify(instance.scrapePayload());
    let sent;
    globalThis.fetch = async (_, options) => { sent = JSON.parse(options.body); return json({ task_id: 'apply' }); };
    instance.executeScrape(false); await instance.state.dlg.run();
    assert.equal(sent.organize, false);
    assert.equal(sent.items.length, 1);
});

test('audit: download outcomes expose real failures and failed-batch retry handlers', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'dispatch', tool: 'Aria2', dCodes: 'qa-1 QA-1' });
    globalThis.fetch = async url => json(url === '/api/history' ? [] : { success: false, results: [{ movie_id: 'QA-1', success: false, message: '添加失败' }] });
    instance.confirmDispatch(['QA-1'], [{ movie_id: 'QA-1', link: 'magnet:?xt=urn:btih:qa', source: 'javbus' }]);
    await instance.state.dlg.run();
    const view = instance.vDispatch();
    assert.equal(view.failed.length, 1);
    assert.equal(typeof view.retryAll, 'function');
    assert.equal(view.runCount, 1);
    assert.equal(view.historyCount, 0);
});

test('audit: hidden automation filter drafts cannot leak into another task', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ autoFiltersText: '[{"type":"star","value":"old"}]', nodeBeforeEdit: { name: 'old' } });
    instance.createAuto();
    assert.equal(instance.state.autoFiltersText, null);
    const view = instance.vAuto(); view.closeNode();
    assert.equal(instance.state.autoDraft.name, '新的自动任务');
    instance.createAuto();
    instance.setState({ autoFiltersText: 'invalid json' });
    let writes = 0; globalThis.fetch = async () => { writes++; return json({ id: 'saved' }); };
    await instance.perform(() => instance.saveAuto());
    assert.equal(writes, 0, 'invalid open-node filters cannot be silently discarded on task save');
});

test('audit: remote folder selection is usable and local files cannot dispatch', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ fsSrc: 'local', fileRows: [{ name: 'QA.mp4', path: '/QA.mp4', size: 10 }], fsQ: '', fsVideoOnly: false, fsMinSize: '不限' });
    assert.equal(instance.vStorage().rows[0].canSend, false);
    instance.setState({ fsSrc: 'webdav', connections: { webdav_connected: true, aria2_connected: true }, fileRows: [{ name: 'folder', path: '/folder', is_directory: true }] });
    assert.equal(instance.vStorage().rows[0].canSend, true);
    instance.setState({ fsQ: 'absent' });
    assert.equal(instance.vStorage().rows.length, 0);
});

test('audit: polling refreshes active download and automation views independently', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let aria = 0, auto = 0;
    instance.loadAria = async () => { aria++; }; instance.loadTasks = async () => { auto++; };
    instance.setState({ route: 'storage', connections: { aria2_connected: true } }); await instance.poll();
    instance.setState({ route: 'auto' }); await instance.poll();
    assert.equal(aria, 1); assert.equal(auto, 1);
});

test('audit: unsaved provider configuration cannot silently test stored values', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ seTab: 'JavBus API', settings: { javbus: { base_url: 'https://old.invalid' } }, settingsDraft: { javbus: { base_url: 'https://new.invalid' } } });
    let requests = 0; globalThis.fetch = async () => { requests++; return json({ results: [] }); };
    await instance.vSettings().test();
    assert.equal(requests, 0);
    assert.match(instance.state.toast.text, /保存/);
});

test('audit: imported template has no phantom batch summary, duplicate disabled attrs or inert actor cards', () => {
    const html = adaptTemplate(original.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1], 'logo');
    assert.doesNotMatch(html, /全部 128|未入库 3|失败 2|批次 b-20260723-1418/);
    assert.doesNotMatch(html, /<button\b[^>]*disabled=[^>]*disabled=/);
    assert.match(html, /class="jj-actor-card"[^>]*onClick="{{ a.open }}"/);
    assert.match(html, /{{ a.avatarUrl }}/);
});

test('audit: organize-only preview is executable and disabled metadata options stay off', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ scOpts: { ...instance.state.scOpts, scrape: false } });
    instance.applyScrapeResult({ success: true, items: [{ source_path: '/ABP-123.mp4', code: 'ABP-123', scrape_status: 'recognized', metadata: { code: 'ABP-123' } }] });
    assert.equal(instance.vScrape().rows[0].isOk, true);
    assert.equal(instance.scrapePayload().write_nfo, false);
    assert.equal(instance.scrapePayload().download_images, false);
});

test('audit: manual designation submits an override and regenerates the actual preview', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ scScanDir: '/qa' });
    instance.applyScrapeResult({ success: true, items: [{ source_path: '/qa/unknown.mp4', scrape_status: 'unrecognized' }] });
    instance.vScrape().rows[0].fix();
    assert.equal(instance.state.scRepair.src, '/qa/unknown.mp4');
    instance.vScrape().repair.setCode({ target: { value: 'ABP-123' } });
    let sent;
    globalThis.fetch = async (_, options) => { sent = JSON.parse(options.body); return json({ task_id: 'repaired-preview' }); };
    await instance.vScrape().repair.submit();
    assert.deepEqual(sent.code_overrides, { '/qa/unknown.mp4': 'ABP-123' });
    assert.equal(instance.state.scPhase, 'scanning');
});

test('audit: automation filter mode and multiline codes match backend contracts', () => {
    const instance = app(); instance.createAuto();
    const fields = instance.vAuto().node.fields;
    assert.ok(fields.find(field => field.label === '检索方式').options.some(option => option.t === 'filter'));
    assert.equal(fields.find(field => field.label === '番号列表').isTextarea, true);
});

test('audit: opening movie details preserves its loaded best magnet', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', code: 'QA-1' });
    globalThis.fetch = async url => json(url.startsWith('/api/magnets/') ? [{ link: 'magnet:test', name: 'QA', size: '1 GB' }] : { id: 'QA-1', gid: '1', uc: 0 });
    await instance.runSearch(); await instance.renderVals().s.rows[0].open();
    assert.equal(instance.renderVals().s.rows[0].noMag, false);
});

test('audit: automation summaries and GPU diagnostics contain only actual backend state', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ tasks: [{ id: 'a', name: 'A', enabled: true, nodes: [], runs: [{ started_at: new Date().toISOString(), dispatched_count: 3, skipped_count: 2, items: [{ status: 'dispatch_failed' }] }] }], tcCaps: { gpu_available: false, gpu_error: 'GPU probe failed', max_concurrent_tasks: 1 } });
    const automation = instance.vAuto(), transcode = instance.vTranscode();
    assert.equal(automation.enabledCount, 1); assert.equal(automation.taskCount, 1);
    assert.equal(automation.dispatchedToday, 3); assert.equal(automation.skippedToday, 2); assert.equal(automation.errorsToday, 1);
    assert.equal(transcode.hardwareMessage, 'GPU probe failed'); assert.equal(transcode.maxConcurrent, 1);
    const template = adaptTemplate(original, '/logo.jpg');
    assert.doesNotMatch(template.split(/<script[^>]*data-dc-script/)[0], /运行中任务 2 \/ 4|今日自动派发 18|驱动 535\.161|全局并发 5|每 [125]s 轮询|可用变量[^<]*\{label\}/);
});

test('audit: partial scrape results remain reviewable and refresh the actual library', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'scrape', scrapeTask: { id: 'apply', status: 'running', operation: 'apply' } });
    let loaded = 0; instance.loadLibrary = async () => { loaded++; };
    const result = { success: false, success_count: 1, failed_count: 1, results: [{ source_path: '/ok.mp4', success: true }, { source_path: '/bad.mp4', success: false, error: 'apply_failed' }] };
    globalThis.fetch = async () => json({ status: 'failed', result });
    await instance.poll();
    assert.equal(loaded, 1); assert.deepEqual(instance.state.scrapeResult, result);
    const view = instance.renderVals().sc;
    assert.equal(view.outcome.rows.length, 2); assert.match(view.outcome.summary, /1 成功.*1 失败/);
    assert.match(view.outcome.rows[1].status, /失败/);
});

test('audit: reconnect never sends a previous endpoint secret to a new server and refreshes failure status', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    saveWebDavSettings({ url: 'https://old.example/dav', username: 'old-user', password: 'old-password' });
    saveAria2Settings({ url: 'https://old.example/rpc', secret: 'old-secret' });
    instance.setState({ settingsDraft: { webdav: { url: 'https://new.example/dav', username: 'new-user' }, aria2: { url: 'https://new.example/rpc' } }, connections: { webdav_connected: true, aria2_connected: true } });
    const sent = []; let refreshed = 0;
    globalThis.fetch = async (_, options) => { sent.push(Object.fromEntries(options.body.entries())); return new Response('{}', { status: 400 }); };
    instance.loadConnections = async () => { refreshed++; instance.setState({ connections: { webdav_connected: false, aria2_connected: false } }); };
    await instance.perform(() => instance.connect('webdav'));
    await instance.perform(() => instance.connect('aria2'));
    assert.equal(sent[0].password, ''); assert.equal(sent[1].aria2_secret, ''); assert.equal(refreshed, 2);
    assert.equal(instance.state.connections.webdav_connected, false);
});

test('audit: repeated writes share an in-flight request and allow a later intentional retry', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let count = 0, release;
    globalThis.fetch = async () => { count++; await new Promise(resolve => { release = resolve; }); return json({ success: true }); };
    const first = instance.request('/api/movies/local-scrape/preview/jobs', 'POST', { directory: '/qa' });
    const duplicate = instance.request('/api/movies/local-scrape/preview/jobs', 'POST', { directory: '/qa' });
    assert.equal(count, 1); release(); await Promise.all([first, duplicate]);
    const retry = instance.request('/api/movies/local-scrape/preview/jobs', 'POST', { directory: '/qa' });
    assert.equal(count, 2); release(); await retry;
});

test('audit: copying remains usable on LAN HTTP without the Clipboard API', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const previous = globalThis.document; t.after(() => { globalThis.document = previous; });
    let copied = '', removed = false, restored = false;
    const area = { style: {}, select() { copied = this.value; }, remove() { removed = true; } };
    globalThis.document = { createElement: () => area, body: { append() {} }, execCommand: name => name === 'copy', activeElement: { focus() { restored = true; } } };
    await instance.copyText('QA-001'); assert.equal(copied, 'QA-001'); assert.ok(removed && restored);
});

test('audit: low-resolution library filter includes 480p and excludes unknown and HD', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    await loadRecords(instance, [480, 720, 1080, 0].map(height => localRecord('QA-' + height, { media_info: { height } })));
    instance.setState({ route: 'library', lbRes: '720p 及以下' });
    assert.deepEqual(instance.renderVals().lb.rows.map(row => row.code).sort(), ['QA-480', 'QA-720']);
});

test('audit: background scrape resumes after refresh with the exact preview configuration', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'scrape', scScanDir: '/qa', scOutDir: '/target', scFolderRule: '{code}', scFileRule: '{code}', scOpts: { scrape: false, organize: true }, scConcurrent: '2' });
    globalThis.fetch = async () => json({ task_id: 'persisted-preview' }); await instance.previewScrape();
    const restored = new instance.constructor({}); t.after(() => restored.componentWillUnmount());
    assert.equal(restored.state.scrapeTask?.id, 'persisted-preview'); assert.equal(restored.state.scScanDir, '/qa');
    assert.equal(restored.scrapePreviewConfig, JSON.stringify(restored.scrapePayload()));
    restored.setState({ route: 'scrape' });
    globalThis.fetch = async () => json({ status: 'success', result: { success: true, items: [] } });
    await restored.poll(); assert.equal(restored.state.scPhase, 'preview');
    assert.equal(window.sessionStorage.getItem('localScrapeActiveTask'), null);
});

test('audit: unrelated polling errors do not hide a completed scrape and expired jobs stop retrying', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'cinema', scrapeTask: { id: 'preview', status: 'running' } });
    instance.loadTranscodes = async () => { throw new Error('transcode unavailable'); };
    globalThis.fetch = async () => json({ status: 'success', result: { success: true, items: [] } });
    await instance.poll(); assert.equal(instance.state.scPhase, 'preview');
    instance.setState({ route: 'scrape', scrapeTask: { id: 'expired', status: 'running' } });
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await instance.perform(() => instance.poll()); assert.equal(instance.state.scrapeTask.status, 'failed');
    assert.match(instance.state.toast.text, /任务已失效/);
});
