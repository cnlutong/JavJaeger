import assert from 'node:assert/strict';
import test from 'node:test';
import { filterForumMovies, forumDispatchEntries, visibleForumSelection, forumDispatchFeedback } from '../../frontend/src/utils/forum.mjs';
import { readFileSync } from 'node:fs';
import { adaptDesignScript, connectDesign, designDataExports } from '../../frontend/src/design/integration.mjs';
const catalogue = JSON.parse(readFileSync(new URL('../fixtures/forum_sources.json', import.meta.url), 'utf8'));

function app(storage = new Map()) {
    globalThis.window = { location: { hash: '#forum' }, localStorage: { getItem: () => null, removeItem() {} },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
    class Logic { setState(patch, callback) { this.state = { ...this.state, ...patch }; callback?.(); } }
    const source = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
    const script = adaptDesignScript(source.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]);
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(Logic);
    const instance = new (connectDesign(Base))({});
    instance.setState({ foSources: catalogue.forums });
    return instance;
}

const rows = [
    { thread_id: '1', movie_id: 'QA-001', title: 'QA-001 [ltx模型] 影片甲', status: 'ready', magnets: [{ link: 'magnet:original-a', source: 'dmn12' }] },
    { thread_id: '2', movie_id: 'QA-002', title: 'QA-002 影片乙', status: 'ready', magnets: [{ link: 'magnet:original-b', source: 'dmn12' }] },
    { thread_id: '3', movie_id: 'QA-003', title: 'QA-003 [LTX] 影片丙', status: 'pending', magnets: [] },
];

test('section choices come from the server and restore an AI section across refresh', async t => {
    const storage = new Map([['javjaeger.forum', JSON.stringify({ source: 172, page: 3, keywords: ['LTX'] })]]);
    const instance = app(storage); t.after(() => instance.componentWillUnmount());
    instance.setState({ foSources: [] });
    const calls = [];
    instance.request = async url => { calls.push(url); return url.endsWith('/sources') ? catalogue : { cached: false }; };
    await Promise.all([instance.enterForum(), instance.enterForum()]);
    assert.equal(calls.filter(url => url.endsWith('/sources')).length, 1);
    assert.equal(instance.state.foSource, 172);
    assert.equal(instance.state.foPage, 3);
    assert.ok(calls.includes('/api/movies/forum/cache?forum_id=172&page=3'));
    assert.deepEqual(instance.renderVals().fo.sourceGroups.map(group => group.name), ['原创BT电影', 'AI综合区']);
    const all = instance.renderVals().fo.sourceGroups.flatMap(group => group.forums);
    assert.deepEqual(all, catalogue.forums);
});

test('an obsolete saved section resets before any cache request and catalogue failures can retry', async t => {
    const instance = app(new Map([['javjaeger.forum', JSON.stringify({ source: 999, page: 7, taskId: 'old-task' })]]));
    t.after(() => instance.componentWillUnmount());
    instance.setState({ foSources: [] });
    const calls = []; let offline = true;
    instance.request = async url => {
        calls.push(url);
        if (offline) throw new Error('offline');
        return url.endsWith('/sources') ? catalogue : { cached: false };
    };
    await instance.enterForum();
    assert.match(instance.state.foError, /分区/);
    assert.equal(calls.length, 1);
    offline = false;
    await instance.enterForum();
    assert.equal(instance.state.foSource, 36);
    assert.equal(instance.state.foPage, 1);
    assert.equal(instance.state.foTaskId, null);
    assert.equal(calls.at(-1), '/api/movies/forum/cache?forum_id=36&page=1');
    assert.equal(instance.state.foError, '');
});

test('starting a job waits for a valid catalogue and a failed catalogue load can retry', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ foSources: [] });
    let attempts = 0;
    instance.startBackgroundJob = async () => { attempts++; return { task_id: 'retry-start', status: 'success' }; };
    instance.request = async () => { throw new Error('offline'); };
    await instance.startForum();
    assert.equal(attempts, 0);
    assert.equal(instance.state.foStarting, false);
    instance.request = async () => catalogue;
    await instance.startForum();
    assert.equal(attempts, 1);
});

test('switching section resets page, result and selection while retaining title conditions', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ foPage: 4, foPageInput: '4', foMovies: rows, foSelected: ['1'], foCache: { movies: rows },
        foTaskId: 'finished-task', foTask: { status: 'success' }, foTitle: 'QA', foKeywords: ['LTX'] });
    instance.request = async () => ({ cached: false });
    instance.renderVals().fo.setSource({ target: { value: '166' } });
    assert.equal(instance.state.foSource, 166);
    assert.equal(instance.state.foPage, 1);
    assert.equal(instance.state.foTaskId, null);
    assert.equal(instance.state.foCache, null);
    assert.deepEqual(instance.state.foSelected, []);
    assert.deepEqual(instance.state.foMovies, []);
    assert.equal(instance.state.foTitle, 'QA');
    assert.deepEqual(instance.state.foKeywords, ['LTX']);
});

test('title query and optional LTX keyword match literally without case sensitivity', () => {
    assert.deepEqual(filterForumMovies(rows, '', ['LTX']).map(r => r.thread_id), ['1', '3']);
    assert.deepEqual(filterForumMovies(rows, '影片乙', []).map(r => r.thread_id), ['2']);
    assert.deepEqual(filterForumMovies(rows, '.*', []), []);
});

test('filtering removes hidden or unready rows from the actionable selection', () => {
    const visible = filterForumMovies(rows, '', ['LTX']);
    assert.deepEqual(visibleForumSelection(visible, ['1', '2', '3']), ['1']);
});

test('dispatch preserves exact forum links, association and source instead of re-searching by code', () => {
    assert.deepEqual(forumDispatchEntries(rows, ['1', '3']), [{ movie_id: 'QA-001', link: 'magnet:original-a', source: 'dmn12' }]);
});

test('inline dispatch feedback follows the exact resource and selected destination', () => {
    const jobs = [{ type: 'dispatch-pan115', result: { results: [{ movie_id: 'QA-001', magnet: 'magnet:original-a', success: true }] } }];
    assert.equal(forumDispatchFeedback(rows[0], jobs, '115 网盘').handled, true);
    assert.match(forumDispatchFeedback(rows[0], jobs, '115 网盘').text, /已提交/);
    assert.equal(forumDispatchFeedback(rows[0], jobs, 'Aria2').handled, false);
    assert.equal(forumDispatchFeedback(rows[1], jobs, '115 网盘').handled, false);
    assert.equal(forumDispatchFeedback(rows[0], [{ type: 'dispatch-pan115', result: { results: [{ magnet: 'magnet:original-a', success: false }] } }], '115 网盘').handled, false);
    assert.equal(forumDispatchFeedback(rows[0], [...jobs, { type: 'dispatch-pan115', result: { results: [{ magnet: 'magnet:original-a', success: false }] } }], '115 网盘').handled, false);
});

test('completed dispatch clears successful selection once and leaves failed items selected', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ foMovies: rows, foSelected: ['1', '2'], tool: '115 网盘' });
    const jobs = [{ task_id: 'dispatch-1', type: 'dispatch-pan115', status: 'success', result: { results: [
        { magnet: 'magnet:original-a', success: true }, { magnet: 'magnet:original-b', success: false },
    ] } }];
    instance.syncForumJobs(jobs);
    assert.deepEqual(instance.state.foSelected, ['2']);
    instance.setState({ foSelected: ['1'] });
    instance.syncForumJobs(jobs);
    assert.deepEqual(instance.state.foSelected, ['1'], 'an explicit repeat selection stays selected');
});

test('forum is a real navigation entry and filtering clears invisible selected rows', t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    assert.equal(instance.state.route, 'forum');
    assert.ok(instance.renderVals().nav.some(item => item.label === '论坛影片'));
    instance.applyForumTask({ task_id: 'forum-1', type: 'forum-fetch', status: 'success', result: { forum_id: 36, page: 1, movies: rows } }, true);
    instance.setState({ foSelected: ['1', '2'] });
    instance.renderVals().fo.toggleKeyword();
    assert.deepEqual(instance.state.foSelected, ['1']);
    assert.equal(instance.renderVals().fo.rows.length, 2);
});

test('forum uses shared dispatch confirmation and persists only public controls and task identity', t => {
    const storage = new Map(), instance = app(storage); t.after(() => instance.componentWillUnmount());
    instance.applyForumTask({ task_id: 'forum-1', type: 'forum-fetch', status: 'success', result: { forum_id: 36, page: 1, movies: rows } }, true);
    instance.setState({ connections: { pan115: true }, tool: '115 网盘' });
    let sent;
    instance.confirmDispatch = (...args) => { sent = args; };
    instance.dispatchForum(['1']);
    assert.deepEqual(sent, [['QA-001'], [{ movie_id: 'QA-001', link: 'magnet:original-a', source: 'dmn12' }], '115 网盘']);
    const saved = storage.get('javjaeger.forum');
    assert.ok(saved.includes('forum-1'));
    assert.equal(saved.includes('magnet:'), false);
});

test('server cache restores public rows without fabricating a background task', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const calls = [];
    instance.request = async url => { calls.push(url); return { cached: true, result: { forum_id: 36, page: 1, movies: rows,
        message: '已读取 3/3 条', cache: { hit: true, saved_at: '2026-10-27T10:00:00Z' } } }; };
    await instance.loadForumCache();
    assert.deepEqual(calls, ['/api/movies/forum/cache?forum_id=36&page=1']);
    assert.equal(instance.state.foMovies.length, 3);
    assert.equal(instance.state.foTaskId, null);
    assert.equal(instance.renderVals().fo.hasTask, true);
    assert.match(instance.renderVals().fo.cacheText, /缓存/);
});

test('a late cache response cannot overwrite a newly started fetch', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let resolve;
    instance.request = () => new Promise(done => { resolve = done; });
    const reading = instance.loadForumCache();
    instance.applyForumTask({ task_id: 'new-task', type: 'forum-fetch', status: 'running', result: { forum_id: 36, page: 1, movies: [] } }, true);
    resolve({ cached: true, result: { forum_id: 36, page: 1, movies: rows } });
    await reading;
    assert.equal(instance.state.foMovies.length, 0);
    assert.equal(instance.state.foTaskId, 'new-task');
});

test('manual source refresh bypasses the server cache', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let sent;
    instance.startBackgroundJob = async (url, payload) => { sent = payload; return { task_id: 'fresh', status: 'running' }; };
    await instance.startForum(undefined, true);
    assert.deepEqual(sent, { forum_id: 36, page: 1, force_refresh: true });
});

for (const [query, keywords] of [['  影片甲  ', []], ['', ['LTX']], ['  影片甲  ', ['LTX']]]) {
    test(`forum fetch, pagination and refresh send the current title conditions: ${JSON.stringify([query, keywords])}`, async t => {
        const instance = app(); t.after(() => instance.componentWillUnmount());
        instance.setState({ foTitle: query, foKeywords: keywords });
        const sent = [];
        instance.startBackgroundJob = async (url, payload) => {
            sent.push({ url, payload });
            return { task_id: `filtered-${sent.length}`, status: 'success', result: { forum_id: 36, page: payload.page, has_next: true, movies: [] } };
        };
        await instance.renderVals().fo.fetch();
        await instance.renderVals().fo.next();
        await instance.renderVals().fo.refresh();
        const conditions = { ...(query.trim() ? { title_query: query.trim() } : {}), ...(keywords.length ? { keywords } : {}) };
        assert.deepEqual(sent, [
            { url: '/api/movies/forum/jobs', payload: { forum_id: 36, page: 1, ...conditions } },
            { url: '/api/movies/forum/jobs', payload: { forum_id: 36, page: 2, ...conditions } },
            { url: '/api/movies/forum/jobs', payload: { forum_id: 36, page: 2, ...conditions, force_refresh: true } },
        ]);
        instance.setForumFilter({ foTitle: '', foKeywords: [] });
        await instance.renderVals().fo.fetch();
        assert.deepEqual(sent.at(-1).payload, { forum_id: 36, page: 2 }, 'cleared conditions do not leak into later requests');
    });
}

test('forum cache settings entry loads, saves, resets and clears only after confirmation', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ route: 'settings', seTab: '论坛缓存' });
    assert.equal(instance.vSettings().saveDisabled, true);
    let stored = { settings: { list_minutes: 30, post_hours: 24, mb: 32 }, count: 3, size_bytes: 4096 }, prompt;
    const calls = [];
    instance.request = async (url, method = 'GET', body) => {
        calls.push({ url, method, body });
        if (method === 'PUT') stored = { ...stored, settings: { ...body } };
        if (method === 'DELETE') stored = { ...stored, count: 0, size_bytes: 0 };
        return stored;
    };
    instance.ask = specification => { prompt = specification; };
    await instance.vSettings().tabs.find(tab => tab.name === '论坛缓存').pick();
    assert.equal(instance.vSettings().saveDisabled, false);
    const set = (label, value) => instance.vSettings().fields.find(field => field.label === label).set({ target: { value } });
    set('列表缓存时间（分钟）', '10');
    set('帖子缓存时间（小时）', '12');
    set('论坛缓存上限（MB）', '8');
    await instance.vSettings().save();
    assert.deepEqual(stored.settings, { list_minutes: 10, post_hours: 12, mb: 8 });
    set('论坛缓存上限（MB）', '2');
    instance.vSettings().reset();
    assert.equal(instance.vSettings().fields[2].value, 8);
    set('论坛缓存上限（MB）', '4');
    instance.vSettings().clearForumCache();
    assert.equal(calls.filter(call => call.method === 'DELETE').length, 0);
    await prompt.run();
    assert.equal(instance.state.forumCacheSettings.count, 0);
    assert.equal(instance.state.forumCacheDraft.mb, 4, 'clearing data preserves unsaved settings edits');
    assert.deepEqual(stored.settings, { list_minutes: 10, post_hours: 12, mb: 8 });
    assert.equal(calls.at(-1).url, '/api/movies/forum/cache');
});

test('forum page offers a direct entry to its cache settings', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.request = async () => ({ settings: { list_minutes: 30, post_hours: 24, mb: 32 }, count: 0, size_bytes: 0 });
    await instance.renderVals().fo.openCacheSettings();
    assert.equal(instance.state.route, 'settings');
    assert.equal(instance.state.seTab, '论坛缓存');
    assert.equal(instance.state.forumCacheDraft.mb, 32);
});
