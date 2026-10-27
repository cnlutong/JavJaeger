import assert from 'node:assert/strict';
import test from 'node:test';
import { filterForumMovies, forumDispatchEntries, visibleForumSelection, forumDispatchFeedback } from '../../frontend/src/utils/forum.mjs';
import { readFileSync } from 'node:fs';
import { adaptDesignScript, connectDesign, designDataExports } from '../../frontend/src/design/integration.mjs';

function app(storage = new Map()) {
    globalThis.window = { location: { hash: '#forum' }, localStorage: { getItem: () => null, removeItem() {} },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
    class Logic { setState(patch, callback) { this.state = { ...this.state, ...patch }; callback?.(); } }
    const source = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
    const script = adaptDesignScript(source.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]);
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(Logic);
    return new (connectDesign(Base))({});
}

const rows = [
    { thread_id: '1', movie_id: 'QA-001', title: 'QA-001 [ltx模型] 影片甲', status: 'ready', magnets: [{ link: 'magnet:original-a', source: 'dmn12' }] },
    { thread_id: '2', movie_id: 'QA-002', title: 'QA-002 影片乙', status: 'ready', magnets: [{ link: 'magnet:original-b', source: 'dmn12' }] },
    { thread_id: '3', movie_id: 'QA-003', title: 'QA-003 [LTX] 影片丙', status: 'pending', magnets: [] },
];

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
