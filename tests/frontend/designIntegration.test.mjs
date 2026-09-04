import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { connectDesign, designDataExports } from '../../frontend/src/design/integration.mjs';

const original = readFileSync(new URL('../../frontend/src/design/JavJaeger.dc.html', import.meta.url), 'utf8');
const script = original.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic {
    constructor(props) { this.props = props; }
    setState(patch) { this.state = { ...this.state, ...patch }; }
}
function app() {
    const storage = new Map();
    globalThis.window = {
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        versionInfo: { version: 'test' },
    };
    const Base = new Function('DCLogic', script + designDataExports + '\nreturn Component;')(DCLogic);
    return new (connectDesign(Base))({});
}

test('the imported UI renders empty real state without fictional movies, jobs or credentials', () => {
    const instance = app();
    const view = instance.renderVals();
    assert.deepEqual(view.s.rows, []);
    assert.deepEqual(view.lb.rows, []);
    assert.deepEqual(view.tc.rows, []);
    assert.deepEqual(view.au.tasks, []);
    assert.deepEqual(view.fs.rows, []);
    assert.equal(view.bg.count, 0);
    assert.equal(view.cn.showHero, false);
    assert.equal(instance.state.pikLogged, false);
    assert.ok(!JSON.stringify(view.se).includes('sk_jb_'));
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
    instance.setState({ sMode: 'code', code: 'QA-001' });
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
