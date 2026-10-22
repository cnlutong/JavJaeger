import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adaptDesignScript, connectDesign, designDataExports } from '../../frontend/src/design/integration.mjs';
import { adaptTemplate } from '../../frontend/src/design/template.mjs';

const original = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
const script = adaptDesignScript(original.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1]);
function app(hash = '#browse', storage = new Map()) {
    globalThis.window = { location: { hash }, versionInfo: {}, localStorage: { getItem: () => null, removeItem() {} },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
    class Logic { constructor(props) { this.props = props; } setState(patch, callback) { this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) }; callback?.(); } }
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(Logic);
    return new (connectDesign(Base))({});
}
const json = value => ({ ok: true, status: 200, headers: { get() {} }, json: async () => value });
const movie = id => ({ id, title: '影片 ' + id, img: 'https://www.javbus.com/covers/' + id + '.jpg' });

test('browse is a separate page with management and cinema entry points', () => {
    const instance = app(), view = instance.renderVals();
    assert.equal(instance.state.route, 'browse'); assert.equal(view.at.browse, true);
    assert.ok(view.nav.some(item => item.label === '浏览'));
    const html = adaptTemplate(original, '/logo.jpg');
    assert.match(html, /aria-label="影片浏览"/); assert.match(html, /cn\.browseOnline/);
    assert.match(html, /aria-label="浏览演员目录"/); assert.match(html, /aria-label="浏览标签目录"/);
    instance.componentWillUnmount();
});

test('browse combines actor and tag filters, deduplicates pages and can continue after an empty filtered page', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    const calls = [];
    globalThis.fetch = async url => { const query = new URL(url, 'http://test').searchParams; calls.push(query);
        return json({ movies: query.get('page') === '2' ? [] : [movie('QA-001')], pagination: { hasNextPage: Number(query.get('page')) < 3 } }); };
    await instance.loadBrowse({ reset: true, filters: [{ type: 'star', value: 'actor-a', label: '演员甲' }, { type: 'genre', value: 'tag-b', label: '标签乙' }] });
    assert.deepEqual(JSON.parse(calls[0].get('filters')), [{ type: 'star', value: 'actor-a', label: '演员甲' }, { type: 'genre', value: 'tag-b', label: '标签乙' }]);
    assert.equal(instance.renderVals().br.rows.length, 1);
    await instance.renderVals().br.more();
    assert.equal(instance.state.brPage, 2); assert.equal(instance.renderVals().br.hasMore, true);
    await instance.renderVals().br.more();
    assert.equal(instance.state.brPage, 3); assert.equal(instance.renderVals().br.rows.length, 1);
    assert.equal(instance.renderVals().br.hasMore, false);
});

test('filter changes ignore old responses and detail actors and tags retain JavBus ids', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let release;
    globalThis.fetch = async url => {
        if (url === '/api/movies/QA-002') return json({ ...movie('QA-002'), stars: [{ id: 'actor-a', name: '演员甲' }], genres: [{ id: 'tag-b', name: '标签乙' }] });
        if (new URL(url, 'http://test').searchParams.get('filters') === '[]') return new Promise(resolve => { release = () => resolve(json({ movies: [movie('OLD-001')] })); });
        return json({ movies: [movie('QA-002')], pagination: { hasNextPage: false } });
    };
    const old = instance.loadBrowse({ reset: true });
    await instance.loadBrowse({ reset: true, filters: [{ type: 'genre', value: 'tag-b', label: '标签乙' }] });
    release(); await old;
    assert.deepEqual(instance.renderVals().br.rows.map(row => row.code), ['QA-002']);
    await instance.renderVals().br.rows[0].open();
    const detail = instance.renderVals().br.detail;
    assert.match(detail.cover, /^\/api\/image-proxy\?url=/);
    assert.equal(detail.actors[0].value, 'actor-a'); assert.equal(detail.tags[0].value, 'tag-b');
    await detail.actors[0].pick();
    assert.equal(instance.state.brDetail, null);
    assert.ok(instance.state.brFilters.some(filter => filter.type === 'star' && filter.value === 'actor-a'));
});

test('play waits for session-owned jobs, restores only ids and uses the protected stream after success', async t => {
    const storage = new Map(), instance = app('#browse', storage); t.after(() => instance.componentWillUnmount());
    const calls = []; let job = { task_id: 'play-1', type: 'browse-play', status: 'running', updated_at: '1', can_cancel: true, message: '等待离线下载' };
    globalThis.fetch = async (url, options = {}) => { calls.push([url, options.method, options.body && JSON.parse(options.body)]); return json(url === '/api/system/jobs' ? { tasks: [job] } : job); };
    await instance.startBrowsePlayback('QA-001');
    assert.deepEqual(calls[0], ['/api/automation/play-jobs', 'POST', { movie_id: 'QA-001' }]);
    assert.equal(instance.renderVals().br.playback.waiting, true); assert.equal(instance.renderVals().br.playback.url, '');
    const saved = JSON.parse(storage.get('javjaeger.browsePlayback'));
    assert.deepEqual(saved, { taskId: 'play-1', movie_id: 'QA-001' });
    const restored = app('#browse', storage); t.after(() => restored.componentWillUnmount());
    assert.equal(restored.state.brPlayback.movie_id, 'QA-001');
    await restored.loadBackgroundJobs();
    assert.equal(restored.renderVals().br.playback.waiting, true);
    job = { ...job, status: 'success', updated_at: '2', can_cancel: false, result: { success: true, movie_id: 'QA-001', file_name: 'QA-001.mp4', pick_code: 'private-pick-code', account_id: 'account' } };
    await restored.loadBackgroundJobs();
    assert.equal(restored.renderVals().br.playback.url, '/api/automation/play-jobs/play-1/stream');
    assert.ok(!storage.get('javjaeger.browsePlayback').includes('private-pick-code'));
    assert.match(adaptTemplate(original, '/logo.jpg'), /<video[^>]+br\.playback\.url/);
});

test('playback cancellation and retry reuse generic job controls and expose failures', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    let job = { task_id: 'play-1', type: 'browse-play', status: 'running', updated_at: '1', can_cancel: true }, calls = [];
    instance.setState({ brPlayback: { taskId: 'play-1', movie_id: 'QA-001' }, backgroundJobs: [job] });
    globalThis.fetch = async (url, options = {}) => { calls.push(url); job = { ...job, status: url.endsWith('/cancel') ? 'cancelled' : 'running', can_cancel: !url.endsWith('/cancel'), can_retry: url.endsWith('/cancel'), updated_at: String(calls.length + 1) }; return json(job); };
    await instance.renderVals().br.playback.cancel();
    assert.equal(instance.renderVals().br.playback.waiting, false); assert.equal(instance.renderVals().br.playback.canRetry, true);
    await instance.renderVals().br.playback.retry();
    assert.deepEqual(calls, ['/api/system/jobs/play-1/cancel', '/api/system/jobs/play-1/retry']);
    instance.setState({ backgroundJobs: [{ ...job, status: 'failed', message: '资源没有可播放文件', can_retry: true }] });
    assert.match(instance.renderVals().br.playback.message, /没有可播放文件/);
});

test('closing a pending playback does not reopen it, and expired saved jobs can start again', async t => {
    const storage = new Map(), instance = app('#browse', storage); t.after(() => instance.componentWillUnmount());
    let release, starts = 0;
    globalThis.fetch = async url => {
        if (url === '/api/automation/play-jobs') { starts++; return new Promise(resolve => { release = () => resolve(json({ task_id: 'play-1', type: 'browse-play', status: 'running' })); }); }
        return json({ tasks: [] });
    };
    const first = instance.startBrowsePlayback('QA-001');
    await instance.startBrowsePlayback('QA-001'); assert.equal(starts, 1);
    instance.closeBrowsePlayback(); release(); await first;
    assert.equal(instance.state.brPlayback, null); assert.equal(storage.has('javjaeger.browsePlayback'), false);
    assert.equal(instance.state.backgroundJobs.length, 1);
    storage.set('javjaeger.browsePlayback', JSON.stringify({ taskId: 'expired', movie_id: 'QA-001' }));
    const restored = app('#browse', storage); t.after(() => restored.componentWillUnmount());
    await restored.loadBackgroundJobs();
    assert.equal(restored.renderVals().br.playback.waiting, false);
    assert.equal(restored.renderVals().br.playback.canRetry, true);
    assert.match(restored.renderVals().br.playback.message, /失效|重启/);
    const retry = restored.renderVals().br.playback.retry(); release(); await retry;
    assert.equal(restored.state.brPlayback.taskId, 'play-1');
});

test('evicting an open completed playback stops waiting and allows a fresh preparation', async t => {
    const instance = app(); t.after(() => instance.componentWillUnmount());
    instance.setState({ brPlayback: { taskId: 'old-play', movie_id: 'QA-001' }, backgroundJobs: [
        { task_id: 'old-play', type: 'browse-play', status: 'success', updated_at: '1', result: { success: true, movie_id: 'QA-001' } },
        { task_id: 'other', type: 'file-dispatch', status: 'success', updated_at: '1' },
    ] });
    const calls = [];
    globalThis.fetch = async (url, options = {}) => { calls.push([url, options.method]); return json(url === '/api/system/jobs' ? { tasks: [] } : { task_id: 'new-play', type: 'browse-play', status: 'running' }); };
    await instance.loadBackgroundJobs();
    const playback = instance.renderVals().br.playback;
    assert.equal(playback.waiting, false); assert.equal(playback.url, ''); assert.equal(playback.canRetry, true);
    assert.match(playback.message, /失效|重启/);
    assert.ok(!instance.state.backgroundJobs.some(task => task.task_id === 'other'));
    await playback.retry();
    assert.deepEqual(calls.at(-1), ['/api/automation/play-jobs', 'POST']);
    assert.equal(instance.state.brPlayback.taskId, 'new-play');
});
