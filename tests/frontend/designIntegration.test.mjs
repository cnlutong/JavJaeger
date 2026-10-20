import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { connectDesign, designDataExports, adaptDesignScript } from '../../frontend/src/design/integration.mjs';
import { adaptTemplate } from '../../frontend/src/design/template.mjs';
import { saveWebDavSettings, saveAria2Settings } from '../../frontend/src/utils/storage.js';
import { withSecretPlaceholders } from '../../frontend/src/utils/systemSettings.mjs';

const original = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
const dispatchContract = JSON.parse(readFileSync(new URL('../fixtures/dispatch-contract.json', import.meta.url), 'utf8'));
const script = adaptDesignScript(original.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]);
class DCLogic {
    constructor(props) { this.props = props; }
    setState(patch) { this.state = { ...this.state, ...patch }; }
}
function app(storage = new Map()) {
    globalThis.window = {
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: k => storage.get('session:' + k) ?? null, setItem: (k, v) => storage.set('session:' + k, v), removeItem: k => storage.delete('session:' + k) },
        versionInfo: { version: 'test' },
    };
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(DCLogic);
    return new (connectDesign(Base))({});
}

test('library path settings supply scrape input/output and preserve an existing preview', async () => {
    const instance = app();
    const settings = { source_directory: '/incoming', directories: ['/library', '/library-2'], ignored_paths: [] };
    globalThis.fetch = async url => json(url.endsWith('/settings') ? settings : { records: [], actors: [], incomplete_records: [] });
    await instance.loadLibrary();
    assert.equal(instance.state.scScanDir, '/incoming');
    assert.equal(instance.scrapePayload().target_directory, '/library');
    assert.equal(instance.state.lbSource, '/incoming');
    instance.setState({ scScanDir: '/one-off-input', scOutDir: '/one-off-output' });
    instance.vLibrary().openPaths();
    instance.vLibrary().closePaths();
    assert.equal(instance.state.scScanDir, '/one-off-input');
    assert.equal(instance.state.scOutDir, '/one-off-output');

    instance.setState({ scPhase: 'preview', scScanDir: '/active-input', scOutDir: '/active-output' });
    await instance.loadLibrary();
    assert.equal(instance.state.scScanDir, '/active-input');
    assert.equal(instance.state.scOutDir, '/active-output');
    instance.vScrape().reset();
    assert.equal(instance.state.scScanDir, '/incoming');
    assert.equal(instance.state.scOutDir, '/library');
});

test('saving the two library paths updates scrape defaults and scans only the library', async () => {
    const instance = app(), requests = [];
    globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body); requests.push({ url, body });
        return json(url.endsWith('/settings') ? { success: true, ...body } : { task_id: 'scan' });
    };
    instance.setState({ lbSource: ' /incoming ', lbPaths: [' /library '], lbExcludes: [' /library/skip '], lbPathCfg: true });
    await instance.vLibrary().savePaths();
    assert.deepEqual(requests[0].body, { source_directory: '/incoming', directories: ['/library'], ignored_paths: ['/library/skip'] });
    assert.equal(instance.state.librarySettings.source_directory, '/incoming');
    assert.equal(instance.state.scScanDir, '/incoming');
    assert.equal(instance.state.scOutDir, '/library');
    instance.ask = dialog => dialog.run();
    await instance.vLibrary().scanAll();
    assert.deepEqual(requests[1].body.directories, ['/library']);
    assert.ok(!requests[1].body.directories.includes('/incoming'));

    instance.setState({ fsAdd: 'browse', browserTarget: { key: 'lbSource' }, browsePath: '/picked-input' });
    instance.vStorage().pickPath();
    assert.equal(instance.state.lbSource, '/picked-input');
});

test('scrape organization requires an output directory before starting a job', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ scScanDir: '/incoming', scOutDir: '', scOpts: { organize: true } });
    globalThis.fetch = () => { throw new Error('must not submit an incomplete path pair'); };
    assert.equal(await instance.previewScrape(), null);
    assert.match(instance.state.toast.text, /请选择影视库目录/);
});

test('closing path configuration discards drafts with batched React updates', () => {
    const instance = app(), updates = [];
    instance.setState({ lbPathCfg: true, lbSource: '/discarded', lbPaths: ['/discarded'],
        librarySettings: { source_directory: '/incoming', directories: ['/library'], ignored_paths: [] } });
    instance.setState = patch => updates.push(patch);
    instance.vLibrary().closePaths();
    const next = Object.assign({}, instance.state, ...updates);
    assert.equal(next.lbPathCfg, false);
    assert.equal(next.lbSource, '/incoming');
    assert.deepEqual(next.lbPaths, ['/library']);
});

test('saving defaults after a finished scrape prepares the next task', () => {
    const instance = app();
    instance.setState({ scPhase: 'idle', scrapeTask: { status: 'success' }, scScanDir: '/old', scOutDir: '/old-library' });
    instance.applyLibrarySettings({ source_directory: '/incoming', directories: ['/library'] }, true);
    assert.equal(instance.state.scScanDir, '/incoming');
    assert.equal(instance.state.scOutDir, '/library');
});

test('settings edits both media directories through the shared library configuration', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.applyLibrarySettings({ source_directory: '/incoming', directories: ['/library', '/archive'], ignored_paths: ['skip'] }, true);
    instance.setState({ route: 'settings', seTab: '媒体目录' });
    const view = instance.vSettings();
    assert.ok(view.tabs.some(tab => tab.name === '媒体目录'));
    assert.equal(view.isForm, true);
    assert.deepEqual(view.fields.map(field => field.label), ['待刮削目录', '影视库目录']);
    view.fields[0].set({ target: { value: ' /new-incoming ' } });
    instance.vSettings().fields[1].set({ target: { value: ' /new-library ' } });
    assert.equal(instance.state.librarySettings.source_directory, '/incoming', 'drafts do not change saved paths');
    let sent;
    globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/movies/local-library/settings'); assert.equal(options.method, 'PUT');
        sent = JSON.parse(options.body); return json({ success: true, ...sent });
    };
    await instance.vSettings().save();
    assert.deepEqual(sent, { source_directory: '/new-incoming', directories: ['/new-library', '/archive'], ignored_paths: ['skip'] });
    assert.equal(instance.state.lbSource, '/new-incoming');
    assert.equal(instance.state.scScanDir, '/new-incoming');
    assert.equal(instance.state.scOutDir, '/new-library');
});

test('media settings support directory browsing, reset and a fresh server reload', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.applyLibrarySettings({ source_directory: '/incoming', directories: ['/library'], ignored_paths: [] }, true);
    instance.setState({ seTab: '媒体目录' });
    instance.browseDirectory = async (path, target) => instance.setState({ browsePath: '/picked', browserTarget: target });
    await instance.vSettings().fields[0].browse();
    instance.vStorage().pickPath();
    assert.equal(instance.vSettings().fields[0].value, '/picked');
    instance.vSettings().reset();
    assert.equal(instance.vSettings().fields[0].value, '/incoming');
    globalThis.fetch = async url => {
        assert.equal(url, '/api/movies/local-library/settings');
        return json({ source_directory: '/server-incoming', directories: ['/server-library'], ignored_paths: [] });
    };
    await instance.vSettings().reload();
    assert.deepEqual(instance.vSettings().fields.map(field => field.value), ['/server-incoming', '/server-library']);
});

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

test('performance: slow transcodes do not delay independent background job progress', async () => {
    const instance = app(), requests = [];
    instance.setState({ informationTask: { id: 'info', status: 'running' }, scanTask: { id: 'scan', status: 'running' }, qr: { session_id: 'qr', status: 0 } });
    let release;
    globalThis.fetch = async url => {
        requests.push(url);
        if (url.includes('/qrcode/')) return new Response('{}', { status: 503 });
        return url.endsWith('/transcoding/tasks') ? new Promise(resolve => { release = resolve; }) : json({ status: 'running', percent: 40 });
    };
    const pending = instance.poll();
    pending.catch(() => {});
    await new Promise(resolve => setImmediate(resolve));
    try {
        assert.ok(requests.includes('/api/movies/local-library/information/jobs/info'), 'information progress starts while the transcode response is pending');
        assert.ok(requests.includes('/api/movies/local-library/scan/jobs/scan'), 'scan progress starts while the transcode response is pending');
        assert.equal(instance.state.informationTask.percent, 40);
        assert.equal(instance.state.scanTask.percent, 40);
        await instance.poll();
        assert.equal(requests.length, 4, 'a failed QR request does not allow another poll to overlap the pending cycle');
    } finally { release(json({ tasks: [] })); await pending; instance.componentWillUnmount(); }
});

test('performance: duplicate reads share a request but a write starts a fresh read', async () => {
    const instance = app(), reads = [];
    globalThis.fetch = async (url, options) => options.method === 'GET'
        ? new Promise(resolve => reads.push(resolve)) : json({ success: true });
    const first = instance.request('/api/history'), duplicate = instance.request('/api/history');
    assert.equal(reads.length, 1);
    await instance.request('/api/history', 'DELETE');
    const fresh = instance.request('/api/history');
    assert.equal(reads.length, 2);
    reads[0](json(['old'])); reads[1](json(['new']));
    assert.deepEqual(await Promise.all([first, duplicate, fresh]), [['old'], ['old'], ['new']]);
    instance.componentWillUnmount();
});

test('performance: rapid library navigation reuses loaded data and explicit refresh stays fresh', async () => {
    const instance = app(); let reads = 0;
    globalThis.fetch = async url => { if (new URL(url, 'http://local').pathname === '/api/movies/local-library') reads++; return json({ records: [], actors: [], directories: [], incomplete_records: [] }); };
    await instance.loadLibrary();
    instance.go('library')(); instance.go('cinema')();
    assert.equal(reads, 1);
    await instance.loadLibrary(); assert.equal(reads, 2);
    instance._libraryLoadedAt = Date.now() - 31000;
    instance.go('library')(); assert.equal(reads, 3);
    await new Promise(resolve => setImmediate(resolve));
});

test('performance: library refresh reads compact index and only an explicit check verifies files', async () => {
    const instance = app(), checks = [], summaries = [];
    globalThis.fetch = async url => {
        if (url.includes('/information/check')) checks.push(new URL(url, 'http://local').searchParams.get('refresh_files'));
        if (['/api/movies/local-library', '/api/movies/local-library/actors'].includes(new URL(url, 'http://local').pathname)) summaries.push(new URL(url, 'http://local').searchParams.get('compact'));
        return json({ records: [], actors: [], directories: [], incomplete_records: [] });
    };
    await instance.loadLibrary(); await instance.loadLibrary();
    assert.deepEqual(summaries, ['true', 'true', 'true', 'true']);
    assert.deepEqual(checks, ['false', 'false']);
    globalThis.fetch = async (url, options) => {
        assert.equal(options.method, 'POST');
        assert.match(url, /information\/check\/jobs\?fields=/);
        return json({ task_id: 'check' });
    };
    await instance.vLibrary().openCheck();
    assert.equal(instance.state.informationTask.id, 'check');
    assert.deepEqual(checks, ['false', 'false']);
});

test('information check and completion form a background loop that survives page refresh', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'library', infoFields: ['title', 'nfo'] });
    const requests = [];
    const check = { success: true, fields: ['title', 'nfo'], total_movies: 2, incomplete_count: 1,
        incomplete_records: [{ movie_id: 'QA-001', missing_fields: ['title'], missing_labels: ['标题'] }] };
    let finished = false;
    globalThis.fetch = async (url, options) => {
        requests.push([url, options]);
        if (options.method === 'POST') return json({ task_id: url.includes('/check/') ? 'check' : 'download' });
        return json(finished ? { status: 'success', result: check } : { status: 'running', percent: 40 });
    };
    await instance.vLibrary().openCheck();
    assert.equal(instance.state.lbCheckCfg, false);
    assert.equal(instance.renderVals().bg.items[0].kind, '资料检查');
    instance.setState({ route: 'settings' });
    await instance.poll(); assert.equal(instance.state.informationTask.percent, 40);
    await instance.vLibrary().runCheck();
    assert.equal(requests.filter(([, o]) => o.method === 'POST').length, 1, 'running jobs cannot be overwritten');

    const restored = new instance.constructor({}); t.after(() => restored.componentWillUnmount());
    restored.setState({ route: 'settings' }); restored.loadLibrary = async () => {};
    finished = true; await restored.poll();
    assert.equal(restored.state.route, 'settings', 'completion must not interrupt navigation');
    assert.match(restored.state.toast.text, /资料检查完成/);
    assert.equal(restored.renderVals().bg.count, 1, 'finished result remains actionable');
    assert.equal(restored.renderVals().bg.animation, 'none');
    assert.ok(window.sessionStorage.getItem('localLibraryInformationTask'));
    const completedReload = new instance.constructor({}); t.after(() => completedReload.componentWillUnmount());
    completedReload.setState({ route: 'settings' }); completedReload.loadLibrary = async () => {};
    await completedReload.poll();
    completedReload.renderVals().bg.items[0].go();
    assert.equal(completedReload.state.dlg.okText, '开始补全', 'finished results also survive a later refresh');
    restored.setState({ infoFields: ['date'] });
    restored.renderVals().bg.items[0].go();
    assert.equal(restored.state.dlg.okText, '开始补全');
    assert.match(restored.state.dlg.list[0], /QA-001.*标题/);
    await restored.state.dlg.run();
    const body = JSON.parse(requests.at(-1)[1].body);
    assert.deepEqual(body.movie_ids, ['QA-001']);
    assert.deepEqual(body.fields, ['title', 'nfo'], 'completion uses the finished check snapshot');
    assert.equal(body.overwrite_existing, false);
    assert.equal(restored.state.informationTask.operation, 'download');

    globalThis.fetch = async () => json({ status: 'success', result: { success: true, updated_count: 1, failed_count: 0,
        information_check: { ...check, incomplete_count: 0, incomplete_records: [] } } });
    await restored.poll();
    restored.renderVals().bg.items[0].go();
    assert.match(restored.state.dlg.body, /剩余 0/);
    assert.equal(restored.state.dlg.okText, '完成');
    await restored.state.dlg.run();
    assert.equal(restored.renderVals().bg.count, 0);
    assert.equal(window.sessionStorage.getItem('localLibraryInformationTask'), null);
});

test('expired information jobs stay visible and can restart checking', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'settings' });
    globalThis.fetch = async () => json({ task_id: 'expired' });
    await instance.vLibrary().runCheck();
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await instance.perform(() => instance.poll());
    assert.equal(instance.state.informationTask.status, 'failed');
    instance.renderVals().bg.items[0].go();
    assert.match(instance.state.dlg.body, /失效/);
    assert.equal(instance.state.dlg.okText, '重新检查');
    globalThis.fetch = async () => json({ task_id: 'retry' });
    await instance.state.dlg.run();
    assert.equal(instance.state.informationTask.id, 'retry');
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

test('search enriches every summary in the background and reuses details across all magnet sources', async t => {
    for (const src of ['javbus', 'cili', 'yhg']) await t.test(src, async t => {
        const instance = app(); t.after(() => instance.componentWillUnmount());
        instance.setState({ route: 'search', sMode: 'filter', src });
        const releases = new Map(), summaries = ['QA-001', 'QA-002'].map(id => ({ id, title: id, img: '/api/test-cover', gid: '1', uc: 0 }));
        t.after(() => { for (const release of releases.values()) release(); });
        let detailCalls = 0, renders = 0;
        instance.forceUpdate = () => { renders++; };
        globalThis.fetch = async url => {
            if (url.startsWith('/api/movies?')) return json({ movies: summaries });
            if (url.startsWith('/api/magnets/')) return json([]);
            detailCalls++;
            const code = url.split('/').at(-1);
            await new Promise(resolve => releases.set(code, resolve));
            return json({ id: code, stars: [{ name: 'Actor ' + code }], producer: { name: 'Background Studio' }, img: null });
        };
        const pending = instance.runSearch();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(instance.state.loading, false, 'summaries appear before slow details');
        assert.equal(instance.renderVals().s.rows.length, 2);
        assert.equal(detailCalls, 2, 'even summaries with magnet identifiers load full metadata automatically');
        const before = renders;
        releases.get('QA-001')();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(instance.renderVals().s.rows[0].actorText, 'Actor QA-001');
        assert.ok(renders > before, 'each movie updates while other metadata is still pending');
        assert.equal(instance.state.detail, null, 'no detail click is needed');
        releases.get('QA-002')(); await pending;
        await instance.renderVals().s.rows[0].open();
        assert.equal(instance.renderVals().s.d.studio, 'Background Studio');
        assert.equal(instance.renderVals().s.d.cover, '/api/test-cover');
        assert.equal(detailCalls, 2, 'opening enriched details reuses the saved metadata');
    });
});

test('search metadata always uses the shared backend and never persists in the browser', async t => {
    const storage = new Map([['javjaeger.movieMetadata.v1', JSON.stringify([['QA-001', { data: { id: 'QA-001', stars: ['Browser-only Actor'] } }]])]]);
    const instance = app(storage); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', sMode: 'filter', src: 'cili' });
    let calls = 0;
    globalThis.fetch = async url => {
        if (url.startsWith('/api/movies?')) return json({ movies: [{ id: 'QA-001', title: 'Summary title', img: '/api/test-cover' }] });
        if (url.startsWith('/api/magnets/')) return json([]);
        calls++;
        return json({ id: 'QA-001', stars: [{ name: 'Shared Actor' }], producer: { name: 'Shared Studio' } });
    };
    await instance.runSearch();
    await instance.renderVals().s.rows[0].open();
    assert.equal(calls, 1, 'a drawer reuses the result already loaded for this search');
    assert.equal(instance.renderVals().s.d.studio, 'Shared Studio');
    await instance.runSearch();
    assert.equal(calls, 2, 'a new search checks the backend shared cache');
    const reloaded = app(new Map()); t.after(() => reloaded.componentWillUnmount());
    reloaded.setState({ route: 'search', code: 'QA-001' });
    await reloaded.runSearch();
    assert.equal(reloaded.renderVals().s.rows[0].actorText, 'Shared Actor');
    assert.equal(calls, 3);
    assert.equal(storage.has('javjaeger.movieMetadata.v1'), false, 'obsolete browser caches are removed');
    assert.doesNotMatch([...storage.values()].join(''), /Shared Actor|Shared Studio/);
});

test('sparse backend details never replace known data in a fresh summary', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', sMode: 'code', code: 'QA-001', src: 'cili' });
    globalThis.fetch = async url => json(url.startsWith('/api/magnets/') ? [] : { id: 'QA-001', title: 'Known title' });
    await instance.runSearch();
    instance.setState({ sMode: 'filter' });
    globalThis.fetch = async url => json(url.startsWith('/api/magnets/') ? [] : { movies: [{ id: 'QA-001', stars: ['Fresh Actor'], producer: 'Fresh Studio' }] });
    await instance.runSearch();
    assert.equal(instance.renderVals().s.rows[0].actorText, 'Fresh Actor');
    await instance.renderVals().s.rows[0].open();
    assert.equal(instance.renderVals().s.d.studio, 'Fresh Studio');
});

test('cache settings are loaded and saved on the server for every browser', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ seTab: '缓存' });
    assert.equal(instance.vSettings().saveDisabled, true, 'unloaded settings cannot overwrite server defaults');
    let saved = { settings: { mode: 'days', days: 30, mb: 5 }, count: 2, size_bytes: 2048 }, writes = [];
    globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/metadata-cache');
        if (options.method === 'PUT') {
            writes.push(JSON.parse(options.body)); saved = { ...saved, settings: writes.at(-1) };
        }
        return json(saved);
    };
    await instance.vSettings().tabs.find(tab => tab.name === '缓存').pick();
    assert.equal(instance.vSettings().saveDisabled, false);
    assert.equal(instance.vSettings().fields[1].value, 30);
    assert.match(instance.vSettings().fields[2].value, /2 部.*2 KB/);
    instance.vSettings().fields[1].set({ target: { value: '7' } });
    await instance.vSettings().save();
    assert.deepEqual(writes[0], { mode: 'days', days: 7, mb: 5 });
    const second = app(); t.after(() => second.componentWillUnmount());
    second.setState({ seTab: '缓存' });
    await second.loadCacheSettings();
    assert.equal(second.vSettings().fields[1].value, 7, 'a browser with empty storage reads the same settings');
    second.vSettings().fields[0].set({ target: { value: '按占用空间' } });
    second.vSettings().fields[1].set({ target: { value: '1' } });
    await second.vSettings().save();
    second.vSettings().fields[1].set({ target: { value: '2' } });
    second.vSettings().reset();
    assert.equal(second.vSettings().fields[1].value, 1);
    saved.settings = { mode: 'days', days: 3, mb: 1 };
    await instance.vSettings().reload();
    assert.equal(instance.vSettings().fields[1].value, 3, 'reload sees policy changed on another device');
});

test('image cache has an independent server-side MB budget and usage', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const metadata = { settings: { mode: 'days', days: 7, mb: 5 }, count: 10, size_bytes: 2048 };
    instance.setState({ seTab: '图片缓存', cacheSettings: metadata, cacheDraft: { ...metadata.settings } });
    assert.equal(instance.vSettings().saveDisabled, true);
    let stored = { settings: { mb: 256 }, count: 3, size_bytes: 1024 }, writes = [];
    globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/image-cache');
        if (options.method === 'PUT') { writes.push(JSON.parse(options.body)); stored = { ...stored, settings: writes.at(-1) }; }
        return json(stored);
    };
    await instance.vSettings().tabs.find(tab => tab.name === '图片缓存').pick();
    assert.equal(instance.vSettings().fields[0].label, '图片缓存上限（MB）');
    assert.equal(instance.vSettings().fields[0].value, 256);
    assert.match(instance.vSettings().fields[1].value, /3 张.*1 KB/);
    instance.vSettings().fields[0].set({ target: { value: '64' } });
    await instance.vSettings().save();
    assert.deepEqual(writes, [{ mb: 64 }]);
    assert.equal(instance.state.cacheSettings, metadata, 'image changes never consume or change the metadata budget');
    instance.vSettings().fields[0].set({ target: { value: '1' } });
    instance.vSettings().reset();
    assert.equal(instance.vSettings().fields[0].value, 64);
    const other = app(); t.after(() => other.componentWillUnmount()); other.setState({ seTab: '图片缓存' });
    await other.vSettings().reload();
    assert.equal(other.vSettings().fields[0].value, 64);
});

test('failed cache settings loads and writes stay visible without claiming success', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ seTab: '缓存' });
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: '无法读取服务端缓存' }), { status: 500 });
    await instance.vSettings().reload();
    assert.equal(instance.vSettings().saveDisabled, true);
    assert.match(instance.state.toast.text, /无法读取/);
    globalThis.fetch = async () => json({ settings: { mode: 'days', days: 30, mb: 5 }, count: 0, size_bytes: 0 });
    await instance.vSettings().reload();
    instance.vSettings().fields[1].set({ target: { value: '0' } });
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: '缓存天数必须是正整数' }), { status: 400 });
    await instance.vSettings().save();
    assert.match(instance.state.toast.text, /正整数/);
    assert.equal(instance.vSettings().fields[1].value, 0, 'failed writes keep the draft available for correction');
});

test('browser storage failures do not break a completed search', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    window.localStorage.setItem = () => { throw new Error('storage full'); };
    instance.setState({ route: 'search', code: 'QA-001' });
    globalThis.fetch = async url => json(url.startsWith('/api/magnets/') ? [] : { id: 'QA-001', stars: [{ name: 'Live Actor' }] });
    await instance.runSearch();
    assert.equal(instance.state.searchError, '');
    assert.equal(instance.renderVals().s.rows[0].actorText, 'Live Actor');
});

test('background metadata failures preserve results and can retry when details open', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', sMode: 'recognize', src: 'cili' });
    let attempts = 0;
    globalThis.fetch = async url => {
        if (url.endsWith('/recognize')) return json({ movies: [{ id: 'QA-001', title: 'Known title', img: '/api/test-cover' }] });
        if (url.startsWith('/api/magnets/')) return json([{ link: 'magnet:test', title: 'QA', size: '1 GB' }]);
        if (++attempts === 1) return new Response('{}', { status: 503 });
        return json({ id: 'QA-001', stars: [{ name: 'Recovered Actor' }] });
    };
    await instance.runSearch();
    let view = instance.renderVals().s;
    assert.equal(instance.state.searchError, '');
    assert.equal(view.rows[0].title, 'Known title');
    assert.equal(view.rows[0].cover, '/api/test-cover');
    assert.equal(view.rows[0].noMag, false);
    assert.match(view.rows[0].actorText, /补全失败/);
    await view.rows[0].open();
    view = instance.renderVals().s;
    assert.equal(view.rows[0].actorText, 'Recovered Actor');
    assert.equal(attempts, 2);
});

test('background metadata stops queuing on reset or unmount and ignores stale responses', async t => {
    for (const action of ['reset', 'unmount']) await t.test(action, async () => {
        const instance = app();
        instance.setState({ route: 'search', sMode: 'filter', src: 'cili' });
        const releases = []; let details = 0, renders = 0;
        instance.forceUpdate = () => { renders++; };
        globalThis.fetch = async url => {
            if (url.startsWith('/api/movies?')) return json({ movies: Array.from({ length: 8 }, (_, i) => ({ id: 'QA-' + i })) });
            if (url.startsWith('/api/magnets/')) return json([]);
            details++;
            await new Promise(resolve => releases.push(resolve));
            return json({ id: url.split('/').at(-1), stars: [{ name: 'Stale Actor' }] });
        };
        const pending = instance.runSearch();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(details, 4, 'metadata follows the existing concurrency limit');
        if (action === 'reset') instance.clearSearch(); else instance.componentWillUnmount();
        const before = renders;
        for (const release of releases) release();
        await pending;
        assert.equal(details, 4, 'cancelled searches do not queue more metadata requests');
        assert.equal(renders, before, 'stale responses never repaint the current page');
        assert.ok(!instance.constructor.data.MOVIES.some(movie => movie.actors.includes('Stale Actor')));
        instance.componentWillUnmount();
    });
});

test('performance: movie and transcode dialogs open before slow requests complete', async () => {
    const instance = app(); instance.setState({ route: 'search', sMode: 'filter', src: 'cili' });
    globalThis.fetch = async url => url.startsWith('/api/movies?') ? json({ movies: [{ id: 'QA-001' }] }) : url.includes('/magnets/') ? json([]) : new Response('{}', { status: 503 });
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
            ? [{ title: 'QA-001.mkv', link: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789', size: '1 GB' }]
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

test('performance: 10000 history, transcode, scrape and storage entries render one page', () => {
    const instance = app(), data = instance.constructor.data;
    for (let i = 0; i < 10000; i++) {
        data.HISTORY.push({ movie_id: `QA-${i}`, title: `QA ${i}`, download_links: [] });
        data.TC.push({ id: `task-${i}`, status: 'completed', code: `QA-${i}`, raw: { input_size: 5e9, output_size: 4e9 } });
        data.SCRAPE_ROWS.push({ src: `/qa/${i}.mp4`, code: `QA-${i}`, kind: 'ok', raw: {} });
    }
    instance.setState({ scPhase: 'preview', fileRows: data.SCRAPE_ROWS.map(row => ({ path: row.src, name: row.code + '.mp4', size: 5e9 })), ariaTasks: data.TC.map(task => ({ gid: task.id, name: task.code, status: 'completed' })) });
    for (const [method, field] of [['vDispatch', 'history'], ['vTranscode', 'rows'], ['vScrape', 'rows'], ['vStorage', 'rows']]) {
        const before = performance.now(), view = instance[method]();
        assert.equal(view[field].length, 60, method);
        assert.match(view.paging.text, /10000/);
        const first = view[field][0];
        view.paging.next();
        assert.notDeepEqual(instance[method]()[field][0], first);
        console.log(JSON.stringify({ method, count: 10000, viewMs: Math.round(performance.now() - before) }));
    }
    const storage = instance.vStorage(); storage.toggleAll();
    assert.equal(instance.state.fsSel.length, 10000, 'batch selection still includes all filtered entries');
    assert.equal(instance.vStorage().rows.every(row => row.sel), true);
    assert.equal(instance.vStorage().tasks.length, 60);
    instance.setState({ fsQ: 'QA-9999' });
    assert.equal(instance.vStorage().rows.length, 1);
    instance.componentWillUnmount();
});

test('performance: 10000 scrape outcomes format one page and retain every result after paging or reset', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    assert.match(adaptTemplate(original.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1], '/logo'), /onClick="\{\{ sc.reset \}\}">完成<\/button>/);
    let formats = 0;
    const results = Array.from({ length: 10000 }, (_, i) => ({ success: i < 6000,
        get target_video_path() { formats++; return `/qa/result-${i}.mp4`; } }));
    instance.setState({ route: 'scrape', scPhase: 'idle', scrapeResult: { success_count: 6000, failed_count: 4000, results } });
    let outcome = instance.vScrape().outcome;
    assert.equal(outcome.rows.length, 60);
    assert.equal(formats, 60, 'format only the visible outcome rows');
    assert.equal(outcome.rows[0].path, '/qa/result-0.mp4');
    assert.match(outcome.summary, /6000 成功，4000 失败/);
    assert.match(outcome.paging.text, /共 10000 项/);
    outcome.paging.next(); outcome = instance.vScrape().outcome;
    assert.equal(outcome.rows[0].path, '/qa/result-60.mp4');
    for (let page = 2; page < 167; page++) { outcome.paging.next(); outcome = instance.vScrape().outcome; }
    assert.equal(outcome.rows.length, 40);
    assert.equal(outcome.rows.at(-1).path, '/qa/result-9999.mp4');
    assert.equal(outcome.paging.last, true);
    instance.setState({ scrapeResult: { success_count: 10000, failed_count: 0, results } });
    assert.equal(instance.vScrape().outcome.rows[0].path, '/qa/result-0.mp4', 'a new result resets pagination');
    instance.vScrape().reset();
    assert.equal(instance.vScrape().outcome, null);
});

test('performance: 10000 failed resources page before formatting and preserve cross-page retry and ignore', async t => {
    const instance = app(), data = instance.constructor.data; t.after(() => instance.componentWillUnmount());
    let titles = 0;
    const records = Array.from({ length: 10000 }, (_, i) => ({ movie_id: `QA-${i}`, status: 'failed', needs_reselect: i % 2 === 0,
        get title() { titles++; return `Movie ${i}`; },
        failed_resources: [{ link: `magnet:${i}`, source: 'javbus', tool: 'pikpak' }],
    }));
    data.HISTORY.push(...records); instance.setState({ route: 'dispatch' });
    let view = instance.vDispatch();
    assert.equal(view.failed.length, 60);
    assert.equal(view.history.length, 60);
    assert.equal(titles, 60, 'format only the visible history rows');
    assert.equal(view.historyCount, 10000);
    assert.equal(view.missingCount, 5000);
    assert.match(view.batchSummary, /失败 10000 项/);
    view.failedPaging.next(); view = instance.vDispatch();
    assert.equal(view.failed[0].code, 'QA-60');
    let submitted;
    instance.confirmDispatch = (codes, magnets) => { submitted = { codes, magnets }; };
    view.retryAll();
    assert.equal(submitted.codes.length, 10000);
    assert.equal(submitted.magnets.at(-1).link, 'magnet:9999');
    view.paging.next(); view = instance.vDispatch();
    assert.equal(view.history[0].code, 'QA-60');
    view.setHf1(); view = instance.vDispatch();
    assert.equal(view.history[0].code, 'QA-0', 'history filtering resets its page and still examines every record');
    assert.match(view.paging.text, /共 5000 项/);
    assert.equal(view.failed[0].code, 'QA-60', 'history and failed-resource pagination remain independent');
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push([url, options.body && JSON.parse(options.body)]);
        if (url.endsWith('/dismiss-failure')) { records[60].failed_resources = []; return json({ success: true }); }
        return json(records);
    };
    await view.failed[0].skip(); view = instance.vDispatch();
    assert.deepEqual(requests[0], ['/api/history/QA-60/dismiss-failure', { link: 'magnet:60' }]);
    assert.match(view.batchSummary, /失败 9999 项/);
    assert.equal(view.failed[0].code, 'QA-61');
    for (let page = 2; page < 167; page++) { view.failedPaging.next(); view = instance.vDispatch(); }
    assert.equal(view.failed.at(-1).code, 'QA-9999');
    assert.equal(view.failedPaging.last, true);
    instance.loadHistory = async () => data.HISTORY.splice(0);
    await assert.rejects(instance.finishDispatch({ results: [{ movie_id: 'NEW-001', success: false, message: 'Failed fixture' }] }, 'PikPak'));
    view = instance.vDispatch();
    assert.equal(view.failed[0].code, 'NEW-001', 'a new dispatch batch resets failure pagination');
    assert.equal(view.failedPaging.visible, false);
});

const localRecord = (code, overrides = {}) => ({ movie_id: code, title: code, files: [{ path: `/${code}.mp4`, size: 100 }], stars: [], genres: [], total_size: 100, ...overrides });
test('cinema: search, removable filters and details preserve the browsing context', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    await loadRecords(instance, Array.from({ length: 125 }, (_, i) => localRecord(`QA-${i}`, { title: `影片 ${i}`, stars: ['测试演员'], series: '测试系列', media_info: { height: 1080 } })));
    instance.setState({ route: 'cinema', cnTab: '全部影片' });
    instance.vCinema().paging.next();
    instance.vCinema().setQuery({ target: { value: ' QA-124 ' } });
    let view = instance.vCinema();
    assert.deepEqual(view.wall.map(row => row.code), ['QA-124']);
    view.wall[0].open();
    assert.equal(instance.state.route, 'cinema');
    view = instance.vCinema();
    assert.equal(view.detail.code, 'QA-124');
    view.closeDetail();
    assert.equal(instance.state.cnTab, '全部影片');
    assert.equal(instance.state.cnQ, ' QA-124 ');
    view.clearQuery();
    view = instance.vCinema();
    assert.equal(view.wall.length, 60);
    view.filterGroups.find(group => group.name === '分辨率').items[0].toggle();
    view = instance.vCinema();
    assert.equal(view.activeFilters.length, 1);
    view.activeFilters[0].remove();
    assert.equal(instance.vCinema().activeFilters.length, 0);
    instance.vCinema().setQuery({ target: { value: '不存在的影片' } });
    assert.equal(instance.vCinema().wallEmpty, true);
    instance.vCinema().clearFilters();
    assert.equal(instance.vCinema().wall.length, 60);
});

test('cinema: shelves use recent library data and playback skips missing segments', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    await loadRecords(instance, [localRecord('QA-OLD', { updated_at: '2026-01-01' }), localRecord('QA-NEW', {
        updated_at: '2026-09-01', file_count: 3, files: [{ path: '/missing.mp4', exists: false }, { path: '/available.mp4' }, { path: '/missing-last.mp4', exists: false }],
    })]);
    let view = instance.vCinema();
    assert.equal(view.shelves[0].items[0].code, 'QA-NEW');
    view.shelves[0].items[0].open();
    view = instance.vCinema();
    assert.equal(view.detail.fileIndex, '1');
    view.detail.play();
    view = instance.vCinema();
    assert.match(view.player.url, /QA-NEW\/play\?file_index=1$/);
    view.player.ended();
    assert.equal(instance.state.playerIndex, 1, 'never auto-play a missing segment');
    view.closePlayer();
    assert.equal(instance.vCinema().detail.code, 'QA-NEW', 'stopping playback returns to cinema details');
});

test('library: portrait thumbnails take priority over landscape covers across local movie views', async () => {
    const instance = app();
    const landscape = { poster_url: '/api/landscape-poster', cover_url: '/api/landscape-cover' };
    const remote = 'https://example.test/portrait.jpg';
    await loadRecords(instance, [
        localRecord('QA-001', { ...landscape, thumbnail_url: '/api/local-portrait', metadata: { list_thumbnail_url: remote } }),
        localRecord('QA-002', { ...landscape, thumbnail_url: remote }),
        localRecord('QA-003', { ...landscape, metadata: { list_thumbnail_url: remote } }),
        localRecord('QA-004', landscape),
    ]);
    const expected = ['/api/local-portrait', `/api/image-proxy?url=${encodeURIComponent(remote)}`, `/api/image-proxy?url=${encodeURIComponent(remote)}`, '/api/landscape-poster'];
    assert.deepEqual(instance.vLibrary().rows.map(row => row.cover), expected);
    assert.deepEqual(instance.vCinema().shelves[0].items.map(row => row.cover), expected);
    instance.setState({ lbDetail: 'QA-001' });
    assert.equal(instance.vLibrary().d.cover, expected[0]);
    instance.componentWillUnmount();
});

test('library: loading, empty collection and filtered results retain the right recovery action', async () => {
    const instance = app();
    assert.equal(instance.vLibrary().emptyTitle, '正在读取影视库…');
    assert.equal(instance.vLibrary().showEmptyAction, false);
    await loadRecords(instance, []);
    const empty = instance.vLibrary();
    assert.equal(empty.emptyTitle, '开始建立你的影视库');
    empty.emptyAction(); assert.equal(instance.state.lbPathCfg, true);
    await loadRecords(instance, [localRecord('QA-001', { cover_url: '/api/test-cover' })]);
    instance.setState({ lbQ: 'missing', lbView: 'poster' });
    const filtered = instance.vLibrary();
    assert.equal(filtered.empty, true);
    filtered.emptyAction();
    assert.equal(instance.vLibrary().rows.length, 1);
    assert.equal(instance.state.lbQ, '');
    assert.equal(instance.vLibrary().showPoster, true);
    instance.setState({ lbDetail: 'QA-001' });
    assert.equal(instance.vLibrary().d.cover, '/api/test-cover');
    instance.componentWillUnmount();
});
test('performance: batch confirmation and background menu stay bounded without losing actions', () => {
    const instance = app(), data = instance.constructor.data;
    const list = Array.from({ length: 10000 }, (_, i) => `QA-${i}`);
    data.TC.push(...list.map(code => ({ code, status: 'queued' })));
    let submitted = 0;
    instance.ask({ title: 'QA batch', list, ackText: 'QA acknowledge', run: () => { submitted = list.length; } });
    let view = instance.renderVals();
    assert.equal(view.dlg.list.length, 60);
    assert.equal(view.dlg.blocked, true);
    assert.equal(view.bg.count, 10000);
    assert.equal(view.bg.items.length, 6);
    view.dlg.paging.next(); view.bg.paging.next();
    view = instance.renderVals();
    assert.equal(view.dlg.list[0].t, 'QA-60');
    assert.equal(view.bg.items[0].name, 'QA-6');
    view.dlg.ack(); instance.renderVals().dlg.confirm();
    assert.equal(submitted, 10000);
    instance.ask({ title: 'QA next batch', list });
    assert.equal(instance.renderVals().dlg.list[0].t, 'QA-0');
    instance.componentWillUnmount();
});

async function loadRecords(instance, records, incomplete = []) {
    globalThis.fetch = async url => json(url.includes('/information/check') ? { fields: ['title', 'date'], incomplete_records: incomplete, incomplete_count: incomplete.length }
        : url.endsWith('/settings') ? { directories: [], ignored_paths: [] } : new URL(url, 'http://local').pathname.endsWith('/actors') ? { actors: [] } : { records });
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

test('performance: 10000-film library and cinema format only the visible page', async t => {
    for (const method of ['vLibrary', 'vCinema']) await t.test(method, async () => {
        const instance = app(), count = 10000;
        await loadRecords(instance, Array.from({ length: count }, (_, i) => localRecord(`QA-${String(count - i - 1).padStart(5, '0')}`)));
        const data = Object.getPrototypeOf(instance.constructor).data;
        let titles = 0;
        for (const movie of data.LIB) {
            const title = movie.title;
            Object.defineProperty(movie, 'title', { get() { titles++; return title; }, configurable: true });
        }
        instance.setState({ lbSort: '番号 A→Z', cnTab: '全部影片', cnSort: '番号' });
        let view = instance[method](), rows = view.rows || view.wall;
        assert.equal(rows.length, 60);
        assert.equal(rows[0].code, 'QA-00000');
        assert.match(view.paging.text, /10000/);
        assert.ok(titles <= 64, `${method} formatted ${titles} titles for one 60-film page`);
        view.paging.next();
        view = instance[method]();
        assert.equal((view.rows || view.wall)[0].code, 'QA-00060');
        instance.setState({ lbQ: 'QA-09999', cnQ: 'QA-09999' });
        view = instance[method]();
        assert.deepEqual((view.rows || view.wall).map(row => row.code), ['QA-09999'], 'filtering still examines the full library and resets pagination');
        assert.equal(view.paging.visible, false);
    });
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
    instance.setState({ route: 'settings' });
    globalThis.fetch = async () => json({ task_id: 'partial' });
    await instance.completeInformation(['QA-001'], true);
    globalThis.fetch = async () => json({ status: 'success', result: { success: true, updated_count: 0, failed_count: 1,
        results: [{ movie_id: 'QA-001', success: false }], information_check: { fields: ['title'], incomplete_count: 1,
            incomplete_records: [{ movie_id: 'QA-001', missing_labels: ['标题'] }] } } });
    await instance.poll();
    assert.match(instance.state.toast.text, /失败/);
    assert.doesNotMatch(instance.state.toast.text, /^影片资料已更新$/);
    instance.renderVals().bg.items[0].go();
    assert.equal(instance.state.dlg.okText, '继续补全');
    assert.match(instance.state.dlg.list.join(' '), /QA-001.*失败/);
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
    instance.setState({ scScanDir: '/qa', scOutDir: '/library' });
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
    globalThis.fetch = async url => json(url.startsWith('/api/magnets/') ? [{ link: 'magnet:test', title: 'QA', size: '1 GB' }] : { id: 'QA-1', gid: '1', uc: 0 });
    await instance.runSearch(); await instance.renderVals().s.rows[0].open();
    assert.equal(instance.renderVals().s.rows[0].noMag, false);
});

test('search detail updates retain known metadata and covers while syncing background information', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', sMode: 'filter', src: 'javbus' });
    const cover = 'https://covers.example.test/list.jpg', expectedCover = '/api/image-proxy?url=' + encodeURIComponent(cover);
    const summary = { id: 'QA-001', title: 'List title', date: '2026-09-01', img: cover };
    let details = 0;
    globalThis.fetch = async url => {
        if (url.startsWith('/api/movies?')) return json({ movies: [summary] });
        if (url.startsWith('/api/magnets/')) return json([{ link: 'magnet:test', title: 'QA', size: '1 GB' }]);
        details++;
        return json({ id: 'QA-001', gid: '1', uc: 0, title: '', img: null, date: null, stars: [{ name: 'Background actor' }], producer: { name: 'Background studio' } });
    };
    await instance.runSearch();
    let view = instance.renderVals().s;
    assert.equal(view.rows[0].actorText, 'Background actor', 'details fetched for magnets immediately enrich the list');
    assert.equal(view.rows[0].cover, expectedCover);
    assert.equal(view.rows[0].title, summary.title);
    assert.equal(view.rows[0].date, summary.date);
    let failMagnets = false;
    globalThis.fetch = async url => {
        if (url.startsWith('/api/magnets/')) {
            if (failMagnets) throw new Error('fixture magnet refresh failed');
            return json([{ link: 'magnet:test', title: 'QA', size: '1 GB' }]);
        }
        details++;
        return json({ id: 'QA-001', gid: '1', uc: 0, img: null });
    };
    await view.rows[0].open();
    view = instance.renderVals().s;
    assert.equal(view.d.cover, expectedCover, 'the detail drawer receives the known cover');
    assert.equal(view.d.studio, 'Background studio');
    assert.equal(view.rows[0].actorText, 'Background actor');
    assert.equal(view.rows[0].cover, expectedCover);
    failMagnets = true;
    await view.rows[0].open();
    assert.equal(instance.renderVals().s.rows[0].noMag, false, 'a failed detail refresh does not erase an already loaded best magnet');
    assert.ok(details >= 1);
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
    assert.ok(window.sessionStorage.getItem('localScrapeActiveTask'), 'completed preview remains recoverable until reset');
    const finished = new instance.constructor({}); t.after(() => finished.componentWillUnmount());
    finished.setState({ route: 'settings' }); await finished.poll();
    assert.equal(finished.state.scPhase, 'preview');
    assert.equal(finished.renderVals().bg.items[0].kind, '刮削');
    assert.equal(finished.renderVals().bg.animation, 'none');
    finished.vScrape().reset();
    assert.equal(window.sessionStorage.getItem('localScrapeActiveTask'), null);
});

test('audit closure: scan failures preserve the actual per-directory results and do not block other jobs', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.loadLibrary = async () => {};
    instance.setState({ route: 'settings', scanTask: { id: 'scan', status: 'running' }, scrapeTask: { id: 'scrape', status: 'running', operation: 'preview' } });
    globalThis.fetch = async url => url.includes('/scan/') ? new Response('{}', { status: 503 }) : json({ status: 'success', result: { success: true, items: [] } });
    await instance.poll();
    assert.equal(instance.state.scrapeTask.status, 'success', 'one unavailable job must not starve others');
    globalThis.fetch = async () => json({ status: 'failed', result: { success: false, message: '一个目录失败', scans: [{ directory: '/offline', success: false, message: '无法访问' }] } });
    await instance.poll();
    const scan = instance.renderVals().bg.items.find(item => item.kind === '扫描入库');
    assert.ok(scan, 'finished failures remain in the task center');
    scan.go();
    assert.match(instance.state.dlg.list.join(' '), /offline.*无法访问/);
});

test('audit closure: cleanup runs in the background and retains its reviewable result', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'settings' }); instance.loadLibrary = async () => {};
    globalThis.fetch = async url => { assert.match(url, /clean-invalid\/jobs$/); return json({ task_id: 'clean' }); };
    instance.vLibrary().clean(); await instance.state.dlg.run();
    assert.equal(instance.state.cleanupTask.id, 'clean');
    globalThis.fetch = async () => json({ status: 'success', result: { success: true, message: '已清洗 1 个无效文件',
        deleted_file_count: 1, failed_files: [{ path: '/qa/kept.mp4', message: '无法确认媒体无效，已保留文件' }] } });
    await instance.poll();
    instance.renderVals().bg.items.find(item => item.kind === '清洗无效文件').go();
    assert.match(instance.state.dlg.list.join(' '), /kept.mp4.*保留/);
});

test('audit closure: switching to a disconnected source discards an old directory response', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ fsSrc: 'local' });
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    const pending = instance.loadFiles('local', '/qa');
    instance.vStorage().sources.find(item => item.key === '115').pick();
    release(json({ entries: [{ name: 'old', path: '/qa/old' }] })); await pending;
    assert.equal(instance.state.fsSrc, '115'); assert.deepEqual(instance.state.fileRows, []);
});

test('audit closure: partial file dispatch exposes each outcome and refreshes successful downloads', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let refreshed = false; instance.loadAria = async () => { refreshed = true; };
    instance.setState({ route: 'storage', fsSrc: 'webdav', connections: { aria2_connected: true }, fsSel: ['/qa'] });
    globalThis.fetch = async () => json({ success: true, results: [
        { filename: 'sent.mp4', success: true }, { filename: 'failed.mp4', success: false, message: '添加失败' },
    ] });
    instance.sendFiles([{ name: 'folder', path: '/qa', is_directory: true }]); await instance.state.dlg.run();
    assert.equal(refreshed, true);
    assert.match(instance.state.dlg.list.join(' '), /sent.mp4.*成功.*failed.mp4.*失败/);
    assert.equal(instance.state.dlg.okText, '查看下载任务');
});

test('audit closure: backend validation messages are readable but secrets stay hidden', async () => {
    const instance = app();
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: { message: '配置文件写入失败，请检查目录权限' } }), { status: 500 });
    await assert.rejects(instance.request('/api/system/settings', 'PUT', {}), /目录权限/);
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: { message: 'password=private' } }), { status: 500 });
    await assert.rejects(instance.request('/api/system/settings', 'PUT', {}), error => !error.message.includes('private'));
});

test('audit closure: filtered or empty folders do not silently claim a complete dispatch', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ fsSrc: 'webdav', connections: { aria2_connected: true } });
    instance.loadAria = async () => {};
    let results = [{ filename: 'movie.mp4', success: true }, { filename: 'sample.txt', success: false, skipped: true, message: '非视频文件' }];
    globalThis.fetch = async () => json({ success: Boolean(results.length), results });
    instance.sendFiles([{ path: '/qa', name: 'qa', is_directory: true }]); await instance.state.dlg.run();
    assert.match(instance.state.dlg.body, /1 成功，0 失败，1 跳过/);
    assert.match(instance.state.dlg.list.join(' '), /sample.txt.*已跳过/);
    results = [];
    instance.sendFiles([{ path: '/qa', name: 'qa', is_directory: true }]); await instance.state.dlg.run();
    assert.match(instance.state.toast.text, /没有新增下载任务/);
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


test('workflow: batch dispatch consumes the backend-verified query contract', async t => {
    const instance = app(), calls = []; t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'dispatch', tool: 'Aria2', dCodes: 'QA-001', dNo4k: true });
    globalThis.fetch = async (url, options) => {
        calls.push([url, options.body && JSON.parse(options.body)]);
        return new Response(JSON.stringify(url === '/api/movies/batch' ? dispatchContract.batch : url === '/api/history' ? [] : { success: true, results: [{ movie_id: 'QA-001', success: true }] }));
    };
    instance.vDispatch().run(); await instance.state.dlg.run();
    assert.equal(calls[0][0], '/api/movies/batch');
    assert.equal(calls[0][1].exclude_4k, true);
    const body = calls.find(([url]) => url === '/api/aria2/download-magnets')?.[1];
    assert.deepEqual(body?.movie_ids, ['QA-001']);
    assert.deepEqual(body?.magnet_links, [dispatchContract.magnets[0].link]);
});

test('workflow: backend title and producer fields render in the actual design', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'search', code: 'QA-001' });
    globalThis.fetch = async url => new Response(JSON.stringify(url.startsWith('/api/magnets/') ? dispatchContract.magnets : { id: 'QA-001', title: 'Fixture', gid: '1', uc: '0', producer: { name: 'Fixture Studio' } }));
    await instance.runSearch(); instance.setState({ detail: 'QA-001' });
    assert.equal(instance.magnetRows('QA-001')[0].name, 'QA-001 fixture');
    assert.equal(instance.renderVals().s.d.studio, 'Fixture Studio');
    assert.doesNotMatch(instance.renderVals().s.rows[0].magText, /undefined/);
});

test('workflow: failed scan still refreshes successful imports', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let refreshed = 0; instance.loadLibrary = async () => { refreshed++; };
    instance.setState({ route: 'scrape', scanTask: { id: 'scan', status: 'running' }, lbScanning: true });
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 'failed', result: { success: false, scan_count: 1, failed_count: 1 }, message: '1 个目录成功、1 个目录失败' }));
    await instance.perform(() => instance.poll());
    assert.equal(refreshed, 1);
    assert.equal(instance.state.lbScanning, false);
    assert.match(instance.state.toast.text, /失败/);
});

test('workflow: scrape subset sends the confirmed preview destination', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'scrape' });
    instance.scrapePreviewConfig = JSON.stringify(instance.scrapePayload());
    instance.constructor.data.SCRAPE_ROWS.push({ src: '/incoming/ABP-123-b.mp4', kind: 'ok', raw: { code: 'ABP-123', target_video_path: '/out/ABP-123-2.mp4', metadata: {} } });
    let body; instance.startJob = async (_key, _url, payload) => { body = payload; };
    instance.executeScrape(); await instance.state.dlg.run();
    assert.equal(body.items[0].target_video_path, '/out/ABP-123-2.mp4');
});

test('workflow: persisted failures retry the same resource and original tool', async t => {
    const instance = app(), calls = []; t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'dispatch', tool: 'PikPak' });
    instance.constructor.data.HISTORY.push({ movie_id: 'QA-001', status: 'failed', failed_resources: [{ link: 'magnet:retry', source: 'javbus', tool: 'aria2' }] });
    globalThis.fetch = async (url, options) => { calls.push([url, options.body && JSON.parse(options.body)]); return new Response(JSON.stringify(url === '/api/history' ? [] : { success: true, results: [] })); };
    const failed = instance.vDispatch().failed;
    assert.equal(failed.length, 1); failed[0].retry(); await instance.state.dlg.run();
    assert.equal(calls[0][0], '/api/aria2/download-magnets');
    assert.deepEqual(calls[0][1].magnet_links, ['magnet:retry']);
});

test('workflow: 115 jobs remain visible until their partial result is consumed', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'dispatch', tool: '115 网盘' });
    const calls = [];
    globalThis.fetch = async url => {
        calls.push(url);
        return new Response(JSON.stringify(url === '/api/115/download-jobs' ? { job_id: 'job115', status: 'queued' } : url.includes('/download-jobs/') ? { status: 'completed', result: { success: true, results: [{ movie_id: 'QA-001', magnet: 'magnet:fixture', success: false }] } } : []));
    };
    instance.confirmDispatch(['QA-001'], [{ link: 'magnet:fixture', movie_id: 'QA-001' }]); await instance.state.dlg.run();
    assert.ok(calls.includes('/api/115/download-jobs'));
    assert.equal(instance.state.dispatchTask.id, 'job115');
    assert.ok(window.sessionStorage.getItem('pan115ActiveDispatch'));
    await instance.perform(() => instance.poll());
    assert.equal(instance.vDispatch().failed.length, 1);
    assert.ok(window.sessionStorage.getItem('pan115ActiveDispatch'));
    instance.renderVals().bg.items.find(item => item.kind === '115 派发').go();
    assert.match(instance.state.dlg.list[0], /QA-001.*失败/);
    await instance.state.dlg.run();
    assert.equal(window.sessionStorage.getItem('pan115ActiveDispatch'), null);
});

test('audit closure: repeated job starts are rejected while submission is pending', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let release, calls = 0;
    globalThis.fetch = async () => { calls++; return new Promise(resolve => { release = resolve; }); };
    const first = instance.startJob('scrapeTask', '/api/movies/local-scrape/preview/jobs', {});
    await assert.rejects(instance.startJob('scrapeTask', '/api/movies/local-scrape/preview/jobs', {}), /正在运行/);
    release(json({ task_id: 'preview' })); await first;
    assert.equal(calls, 1);
    instance.showBackgroundResult('scrapeTask');
    assert.equal(instance.state.route, 'scrape');
});

test('audit closure: concurrent source diagnostics preserve both results', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const settings = { scrapers: { priority: ['javbus', 'jav321'], javbus: {}, jav321: {} } };
    instance.setState({ seTab: '刮削源', settings, settingsDraft: withSecretPlaceholders(settings) });
    const pending = [];
    globalThis.fetch = async () => new Promise(resolve => pending.push(resolve));
    const sources = instance.vSettings().sources;
    const first = sources[0].test(), second = sources[1].test();
    pending[0](json({ results: [{ provider: 'javbus', success: true }] })); await first;
    pending[1](json({ results: [{ provider: 'jav321', success: false }] })); await second;
    assert.deepEqual(instance.state.sourcesResult.map(item => item.provider), ['javbus', 'jav321']);
});

test('audit closure: source results cannot overwrite unsaved settings or survive a configuration reload', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const settings = { javbus: { base_url: 'https://old.test' }, scrapers: {} };
    instance.setState({ seTab: '刮削源', settings, settingsDraft: withSecretPlaceholders(settings), sourcesResult: [{ provider: 'javbus', success: false }] });
    instance.setState({ settingsDraft: { ...instance.state.settingsDraft, javbus: { base_url: 'https://new.test' } } });
    let writes = 0;
    globalThis.fetch = async (_, options) => { if (options.method !== 'GET') writes++; return json(settings); };
    await instance.vSettings().applyTestResults();
    assert.equal(writes, 0);
    assert.match(instance.state.toast.text, /先保存/);
    await instance.loadSettings();
    assert.deepEqual(instance.state.sourcesResult, []);
    let release;
    globalThis.fetch = async (_, options) => options.method === 'POST' ? new Promise(resolve => { release = resolve; }) : json(settings);
    const pending = instance.vSettings().test();
    await instance.loadSettings();
    release(json({ results: [{ provider: 'javbus', success: true }] })); await pending;
    assert.deepEqual(instance.state.sourcesResult, [], 'an old in-flight test cannot restore stale results');
});

test('workflow: scraper diagnostics use duration and error fields and shared JavBus settings', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'settings', seTab: '刮削源', settingsDraft: { javbus: { base_url: 'https://fixture.test' }, scrapers: { priority: ['javbus'], javbus: { enabled: true, uses_shared_config: true } } }, sourcesResult: [{ provider: 'javbus', success: false, duration_ms: 125, error_message: 'metadata unavailable' }] });
    const source = instance.vSettings().sources[0];
    assert.equal(source.latency, '125 ms');
    assert.match(source.note, /metadata unavailable/);
    assert.equal(source.fields.length, 0);
});

test('workflow: automation starts in background and progress remains available off-route', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let requested = '', polls = 0;
    const task = { id: 'auto-fixture', name: 'fixture', nodes: [], runs: [{ id: 'run', status: 'running', message: '正在匹配 1/2' }] };
    instance.setState({ route: 'auto', tasks: [task], auTask: task.id });
    instance.saveAuto = async () => task;
    instance.loadTasks = async () => { polls++; };
    globalThis.fetch = async url => { requested = url; return json(task.runs[0]); };
    instance.vAuto().runNow(); await instance.state.dlg.run();
    assert.equal(requested, '/api/automation/tasks/auto-fixture/run?background=true');
    instance.setState({ route: 'settings' }); polls = 0;
    await instance.poll(); assert.equal(polls, 1);
    assert.match(instance.renderVals().bg.items[0].meta, /正在匹配/);
});

test('workflow: ignoring a persisted failure removes that exact resource and refreshes history', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'dispatch' });
    instance.constructor.data.HISTORY.push({ movie_id: 'QA-001', failed_resources: [{ link: 'magnet:ignore', tool: 'pikpak' }] });
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push([url, options.body && JSON.parse(options.body)]); return json(url === '/api/history' ? [] : { success: true }); };
    await instance.vDispatch().failed[0].skip();
    assert.deepEqual(calls[0], ['/api/history/QA-001/dismiss-failure', { link: 'magnet:ignore' }]);
    assert.equal(instance.vDispatch().failed.length, 0);
});
