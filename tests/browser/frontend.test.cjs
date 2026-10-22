const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

let baseURL, browser, server, scratch;
before(async () => {
    const root = path.resolve(__dirname, '../..');
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'javjaeger-browser-'));
    for (const dir of ['static', 'templates']) fs.symlinkSync(path.join(root, dir), path.join(scratch, dir), process.platform === 'win32' ? 'junction' : 'dir');
    fs.writeFileSync(path.join(scratch, 'config.json'), JSON.stringify({ session_secret: 'isolated-browser-test', scrapers: Object.fromEntries(['javbus', 'libredmm', 'jav321', 'tokyohot', 'dlgetchu', 'fc2'].map(key => [key, { enabled: false }])) }));
    const imageCache = path.join(scratch, 'data/image_cache'); fs.mkdirSync(imageCache, { recursive: true });
    for (const [index, name] of ['old-one', 'old-two', 'shared-cover'].entries()) {
        const url = `https://www.javbus.com/qa-cache/${name}.svg`, key = crypto.createHash('sha256').update(url).digest('hex');
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#405c7a"/><circle cx="220" cy="60" r="30" fill="#cab99b"/><path d="M0 200V150L90 70L190 180L260 110L300 150V200" fill="#233348"/></svg>';
        const file = path.join(imageCache, key + '.image');
        fs.writeFileSync(file, 'image/svg+xml\n' + svg + (index < 2 ? ' '.repeat(600000) : ''));
        fs.utimesSync(file, index + 1, index + 1);
    }
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    baseURL = `http://127.0.0.1:${port}`;
    const venvPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.JAVJAEGER_QA_PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python');
    server = spawn(python, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(port)], {
        cwd: scratch, windowsHide: true,
        env: { ...process.env, PYTHONPATH: root, APP_ENV: 'test', JAVJAEGER_CONFIG_PATH: path.join(scratch, 'config.json'), JAVJAEGER_ACTOR_IMAGE_DIR: path.join(scratch, 'data/actor_images'), JAVJAEGER_ENABLE_FRONTEND_AUTO_RELOAD: 'false',
            JAVJAEGER_REVISION: '1234567890abcdef1234567890abcdef12345678', JAVJAEGER_BUILT_AT: '2026-10-20T04:00:00Z', JAVJAEGER_DEPLOYED_AT: '2026-10-20T04:30:00Z' },
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    let startupError;
    server.on('error', error => { startupError = error; });
    server.stderr.resume();
    for (let i = 0; i < 150; i++) {
        if (startupError) throw startupError;
        assert.equal(server.exitCode, null, 'isolated backend exited; install requirements.txt');
        try { if ((await fetch(baseURL)).ok) break; } catch {}
        await delay(200);
    }
    assert.ok((await fetch(baseURL)).ok, 'isolated backend started');
    browser = await chromium.launch({ headless: true });
});
after(async () => {
    await browser?.close();
    if (server?.exitCode === null) {
        const exited = once(server, 'close');
        server.kill();
        await exited;
    }
    if (scratch && path.dirname(scratch) === path.resolve(os.tmpdir()) && path.basename(scratch).startsWith('javjaeger-browser-')) {
        for (const dir of ['static', 'templates']) {
            const link = path.join(scratch, dir);
            if (fs.existsSync(link)) fs.unlinkSync(link);
        }
        fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
});

async function openApp(t, width = 1440, setup = async () => {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (['script', 'stylesheet'].includes(response.request().resourceType()) && response.status() >= 400) errors.push(`asset failed: ${response.status()} ${response.url()}`);
    });
    t.after(() => assert.deepEqual(errors, [], 'no uncaught application errors'));
    page.setDefaultTimeout(8000);
    await page.route('**/api/**', route => {
        if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        errors.push(`unmocked mutation: ${route.request().method()} ${new URL(route.request().url()).pathname}`);
        return route.fulfill({ status: 501, json: { detail: 'Test must mock mutations' } });
    });
    await setup(page);
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-mount.png'), fullPage: true });

    assert.equal(await page.locator('.sc-logic-error').count(), 0, 'imported component renders');
    try { await page.getByRole('button', { name: '管理界面', exact: true }).click(); }
    catch (error) {
        await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-mount-failure.png'), fullPage: true });
        fs.writeFileSync(path.join(os.tmpdir(), 'javjaeger-mount-failure.html'), await page.content());
        throw error;
    }
    return page;
}

const movie = (id = 'QA-001') => ({ id, title: `QA 测试影片 ${id}`, gid: '123', uc: 0, date: '2026-09-01', stars: [{ name: '测试演员', id: 'qa-star' }], genres: [{ name: '测试标签', id: 'qa-genre' }] });
const dispatchContract = require('../fixtures/dispatch-contract.json');
const magnet = { ...dispatchContract.magnets[0], source: 'javbus' };

test('browse: actor and tag filters, empty-page continuation and 115 playback survive reload', async t => {
    const requests = []; let task = null, submissions = 0;
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/static/actors.json', route => route.fulfill({ json: { QA: [{ id: 'qa-star', name: '测试演员' }] } }));
        await p.route('**/static/categories.json', route => route.fulfill({ json: { QA: [{ id: 'qa-genre', name: '测试标签' }] } }));
        await p.route(/\/api\/movies\?/, route => {
            const query = new URL(route.request().url()).searchParams;
            const filters = JSON.parse(query.get('filters') || '[]'), number = Number(query.get('page'));
            requests.push({ filters, number });
            const empty = filters.length >= 2 && number === 1;
            const movies = empty ? [] : Array.from({ length: number === 2 ? 8 : 1 }, (_, i) => ({ ...movie(`QA-${String(i + number).padStart(3, '0')}`), img: `/api/qa-browse-art/${i}` }));
            return route.fulfill({ json: { movies, pagination: { currentPage: number, hasNextPage: number === 1, nextPage: number === 1 ? 2 : null } } });
        });
        await p.route(/\/api\/movies\/QA-\d+$/, route => route.fulfill({ json: { ...movie(new URL(route.request().url()).pathname.split('/').at(-1)), img: '/api/qa-browse-art/0' } }));
        await p.route('**/api/qa-browse-art/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560"><rect width="400" height="560" fill="#444163"/><circle cx="200" cy="210" r="105" fill="#9184d9"/><path d="M0 560V440L180 270L400 450V560" fill="#232532"/><text x="30" y="510" fill="#fff" font-size="30">BROWSE TEST</text></svg>' }));
        await p.route('**/api/system/jobs', route => route.fulfill({ json: { tasks: task ? [task] : [] } }));
        await p.route('**/api/system/jobs/qa-browse-play', route => route.fulfill({ json: task }));
        await p.route('**/api/automation/play-jobs', route => {
            assert.equal(route.request().postDataJSON().movie_id, 'QA-002'); submissions++;
            task = { task_id: 'qa-browse-play', type: 'browse-play', status: 'running', phase: 'waiting', percent: 42, updated_at: 'waiting', message: '115 下载中 42%', can_cancel: true };
            return route.fulfill({ status: 202, json: task });
        });
        await p.route('**/api/automation/play-jobs/qa-browse-play/stream', route => route.fulfill({ contentType: 'video/mp4', body: fs.readFileSync(path.join(__dirname, '../fixtures/android_tv/test-pattern.mp4')) }));
    });
    await navigate(page, '浏览');
    const main = page.getByRole('main', { name: '影片浏览', exact: true });
    await main.getByRole('button', { name: '查看 QA-001 详情', exact: true }).waitFor();
    await main.getByRole('button', { name: '浏览演员目录', exact: true }).click();
    await page.getByRole('dialog', { name: '浏览筛选目录', exact: true }).getByRole('button', { name: '测试演员', exact: true }).click();
    await main.getByRole('button', { name: '浏览标签目录', exact: true }).click();
    await page.getByRole('dialog', { name: '浏览筛选目录', exact: true }).getByRole('button', { name: '测试标签', exact: true }).click();
    await main.getByRole('button', { name: '加载更多影片', exact: true }).click();
    await main.getByRole('button', { name: '查看 QA-002 详情', exact: true }).waitFor();
    assert.ok(requests.some(({ filters, number }) => number === 2 && filters.some(f => f.type === 'star' && f.value === 'qa-star') && filters.some(f => f.type === 'genre' && f.value === 'qa-genre')));
    assert.equal(await page.title(), 'JavJaeger');
    assert.equal(await page.locator('.sc-logic-error').count(), 0);
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-browse-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-browse-mobile.png'), animations: 'disabled' });
    await main.getByRole('button', { name: '查看 QA-002 详情', exact: true }).click();
    await page.getByRole('dialog', { name: '浏览影片详情', exact: true }).getByRole('button', { name: '最佳资源播放', exact: true }).click();
    await page.getByRole('dialog', { name: '115 影片播放', exact: true }).getByText('115 下载中 42%', { exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: '浏览影片详情', exact: true }).count(), 0, 'background details are hidden from assistive technology during playback');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('dialog', { name: '115 影片播放', exact: true }).getByText('115 下载中 42%', { exact: true }).waitFor();
    task = { ...task, status: 'success', percent: 100, can_cancel: false, can_retry: false, updated_at: 'ready', message: '视频已就绪', result: { success: true, movie_id: 'QA-002', file_name: 'QA-002.mp4', pick_code: 'fixture-code', account_id: 'fixture-account' } };
    const video = page.getByLabel('115 视频', { exact: true });
    await video.waitFor();
    assert.equal(await video.getAttribute('src'), '/api/automation/play-jobs/qa-browse-play/stream');
    await page.waitForFunction(() => document.querySelector('video[aria-label="115 视频"]')?.readyState >= 2);
    assert.ok(await video.evaluate(element => element.videoWidth > 0), 'native player decodes the ready video');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-browse-playback-mobile.png'), animations: 'disabled' });
    assert.equal(submissions, 1, 'refresh never submits another offline task');
    assert.match(page.url(), /#browse$/);
    task = null;
    const playback = page.getByRole('dialog', { name: '115 影片播放', exact: true });
    await playback.getByText(/后台任务已失效/).waitFor();
    await playback.getByRole('button', { name: '重试播放', exact: true }).click();
    await playback.getByText('115 下载中 42%', { exact: true }).waitFor();
    assert.equal(submissions, 2, 'an expired server job can be prepared again');
});


// The fake worker lives in Node, so a page reload cannot cancel its work or results.
const jobRegistries = new WeakMap();
async function backgroundRoute(page, url, kind, run) {
    let registry = jobRegistries.get(page);
    if (!registry) {
        registry = { jobs: [], version: 0 }; jobRegistries.set(page, registry);
        await page.route('**/api/system/jobs**', route => {
            const id = new URL(route.request().url()).pathname.split('/')[4];
            const job = registry.jobs.find(item => item.task_id === id);
            if (route.request().method() === 'DELETE') { registry.jobs = registry.jobs.filter(item => item !== job); return route.fulfill({ json: { success: true } }); }
            return route.fulfill({ status: id && !job ? 404 : 200, json: id ? job || {} : { tasks: registry.jobs.map(({ result, ...summary }) => summary) } });
        });
    }
    await page.route('**' + url, async route => {
        const body = route.request().postDataJSON();
        const job = { task_id: String(++registry.version), type: typeof kind === 'function' ? kind(body) : kind,
            status: 'running', percent: 0, created_at: new Date().toISOString(), updated_at: String(registry.version), message: '后台任务运行中', result: null };
        registry.jobs.push(job);
        await route.fulfill({ status: 202, json: job });
        Promise.resolve().then(() => run(body, result => { job.result = result; job.updated_at = String(++registry.version); })).then(result => {
            Object.assign(job, { result, status: result.success === false ? 'failed' : 'success', percent: 100, message: result.message || '后台任务完成', updated_at: String(++registry.version) });
        }).catch(() => Object.assign(job, { status: 'failed', message: '后台任务失败', updated_at: String(++registry.version) }));
    });
}
function searchSnapshot(body, movies = body.movies, { magnets = true, ready = movies.map(movie => movie.id) } = {}) {
    return { success: true, movies, mode: body.mode, source: body.source, details_ready: ready, completed_ids: ready,
        magnets: Object.fromEntries(ready.map(id => [id, magnets ? [{ ...magnet, source: body.source }] : []])), has_next_page: body.has_next_page };
}

async function libraryFixture(page, count = 4) {
    const state = { requests: [], settings: { source_directory: '/qa-incoming', directories: ['/qa'], ignored_paths: [] }, records: Array.from({ length: count }, (_, i) => ({
        movie_id: `QA-${String(i + 1).padStart(3, '0')}`, title: `QA 测试影片 ${i + 1}`, date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        stars: ['测试演员'], genres: ['测试标签'], studio: 'QA Studio', publisher: 'QA Publisher', series: 'QA Series',
        is_vr: i === 1, file_count: 1, total_size: 102400, scan_roots: ['/qa'], full_text: '测试演员 测试标签',
        files: [{ path: `/qa/QA-${i + 1}.mp4`, file_name: `QA-${i + 1}.mp4`, size: 102400, scan_root: '/qa' }],
        media_info: { width: 1920, height: 1080, bitrate: 5000000, codec: 'h264', container: 'mp4' }, metadata: {},
    })) };
    await page.route('**/api/movies/local-library**', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        state.requests.push({ path: url.pathname, method, body: request.postDataJSON?.() });
        if (url.pathname.endsWith('/actors')) return route.fulfill({ json: { success: true, total_actors: 1, actors: [{ key: 'qa-star', name: '测试演员', movie_count: state.records.length, movie_ids: state.records.map(r => r.movie_id) }] } });
        if (url.pathname.endsWith('/settings')) {
            if (method === 'PUT') state.settings = { ...state.settings, ...request.postDataJSON() };
            return route.fulfill({ json: { success: true, ...state.settings } });
        }
        if (url.pathname.endsWith('/information/check')) return route.fulfill({ json: { success: true, total_movies: count, complete_count: count - 1, incomplete_count: 1, incomplete_records: [{ movie_id: 'QA-001', missing_labels: ['本地封面'] }] } });
        if (url.pathname.endsWith('/information/download')) return route.fulfill({ json: { success: true, success_count: 1, failed_count: 0, results: [] } });
        if (url.pathname.endsWith('/scan/jobs')) return route.fulfill({ json: { success: true, task_id: 'qa-scan' } });
        if (url.pathname.endsWith('/scan/jobs/qa-scan')) return route.fulfill({ json: { status: 'success', result: { success: true, scan_count: 1, scanned_files: 4, recognized_files: 4, directory: '/qa' } } });
        if (method === 'DELETE') {
            const id = url.pathname.split('/')[4];
            state.records = id ? state.records.filter(r => r.movie_id !== id) : [];
        }
        return route.fulfill({ json: { success: true, records: state.records, total_movies: state.records.length, total_files: state.records.length, total_size: state.records.reduce((sum, record) => sum + record.total_size, 0) } });
    });
    return state;
}

const navigate = async (page, name) => page.locator('header nav').getByRole('button', { name, exact: true }).click();
const field = (page, label) => page.locator('.field').filter({ has: page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('input,select,textarea').first();
const approve = async (page, label) => {
    const dialog = page.locator('.jj-confirm');
    const checkbox = dialog.getByRole('checkbox');
    if (await checkbox.count()) await checkbox.check();
    await dialog.getByRole('button', { name: label, exact: true }).click();
};

async function libraryArtwork(page, state) {
    // Synthetic, non-media artwork exercises real image loading and aspect ratios.
    state.records.forEach((record, i) => { record.cover_url = `/api/qa-posters/${i}`; });
    await page.route('**/api/qa-posters/*', route => {
        const i = Number(route.request().url().split('/').at(-1));
        const colors = ['#987653', '#586b7c', '#716178', '#517773', '#736351', '#585985'];
        return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><defs><linearGradient id="g" x2=".6" y2="1"><stop stop-color="${colors[i % colors.length]}"/><stop offset="1" stop-color="#111924"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="${110 + i % 3 * 60}" cy="210" r="82" fill="#e3d2ba" opacity=".42"/><path d="M0 440L160 260L280 410L400 340V600H0" fill="#131e29" opacity=".65"/><text x="32" y="70" fill="#fff" opacity=".7" font-family="sans-serif" font-size="14" letter-spacing="5">LAYOUT STUDY</text><text x="32" y="502" fill="#fff" font-family="sans-serif" font-size="36" letter-spacing="2">${['NIGHTFALL', 'STILL WATER', 'AFTER HOURS', 'DISTANT', 'HORIZON', 'BLUE HOUR'][i % 6]}</text><text x="32" y="538" fill="#fff" opacity=".55" font-family="sans-serif" font-size="14">TEST COLLECTION · ${String(i + 1).padStart(3, '0')}</text></svg>` });
    });
}

test('background tasks stay newest first across pagination, reopening and reload', async t => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ task_id: String(i), type: 'file-dispatch', status: 'failed', message: '排序测试-' + i,
        created_at: `2026-10-20T${String(9 + i).padStart(2, '0')}:00:00Z`, updated_at: 'initial', logs: [] }));
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/jobs', route => route.fulfill({ json: { tasks } }));
        await p.route(/\/api\/system\/jobs\/\d+$/, route => route.fulfill({ json: tasks.find(task => route.request().url().endsWith('/' + task.task_id)) }));
    });
    const open = () => page.locator('header').getByRole('button', { name: '后台 8', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '后台任务', exact: true });
    const names = () => dialog.locator('span[style*="text-overflow"]').allTextContents();
    await open(); assert.deepEqual(await names(), [7, 6, 5, 4, 3, 2].map(i => '排序测试-' + i));
    await dialog.getByRole('button', { name: '下一页', exact: true }).click(); assert.deepEqual(await names(), ['排序测试-1', '排序测试-0']);
    await page.keyboard.press('Escape'); await open(); assert.equal((await names())[0], '排序测试-7');
    await dialog.getByRole('button', { name: '查看', exact: true }).first().click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('log').getByText(/排序测试-7/).waitFor();
    await page.getByRole('button', { name: '关闭日志', exact: true }).click();
    tasks.reverse(); tasks.find(task => task.task_id === '0').updated_at = '2099-01-01T00:00:00Z';
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await open(); assert.deepEqual(await names(), [7, 6, 5, 4, 3, 2].map(i => '排序测试-' + i));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-background-order-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'background menu stays within the mobile viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-background-order-mobile.png'), animations: 'disabled' });
});

test('background logs update live, restore after refresh and show honest stage progress on desktop and mobile', async t => {
    let task = { task_id: 'live-files', type: 'file-dispatch', status: 'running', phase: 'scan', percent: 0, total: 0, completed: 0,
        updated_at: 'one', message: '正在遍历目录，总量待确定', logs: [{ time: '2026-10-20T17:00:00', message: '开始遍历测试目录' }] };
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/jobs', route => route.fulfill({ json: { tasks: [task] } }));
        await p.route('**/api/system/jobs/live-files', route => route.fulfill({ json: task }));
    });
    const openLog = async () => {
        await page.locator('header').getByRole('button', { name: '后台 1', exact: true }).click();
        await page.getByRole('dialog', { name: '后台任务', exact: true }).getByRole('button', { name: '查看', exact: true }).click();
    };
    await navigate(page, '设置'); await openLog();
    const dialog = page.getByRole('dialog', { name: '任务日志', exact: true }), log = dialog.getByRole('log');
    await log.getByText(/开始遍历测试目录/).waitFor();
    const progress = dialog.getByRole('progressbar', { name: '当前阶段进度' });
    assert.equal(await progress.getAttribute('aria-valuenow'), null);
    task = { ...task, phase: 'dispatch', completed: 1, total: 4, percent: 25, updated_at: 'two', message: '已提交 1/4',
        logs: [...task.logs, { time: '2026-10-20T17:00:03', message: '已提交 a.mp4' }] };
    await log.getByText(/已提交 a.mp4/).waitFor();
    assert.equal(await progress.getAttribute('aria-valuenow'), '25', await progress.evaluate(element => element.outerHTML));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-live-task-log-desktop.png'), animations: 'disabled' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click(); await openLog();
    await log.getByText(/已提交 a.mp4/).waitFor();
    task = { ...task, status: 'failed', updated_at: 'three', message: '提交中断，保留已提交结果', logs: [...task.logs, { time: '2026-10-20T17:00:06', message: '提交中断，保留已提交结果' }] };
    await log.getByText(/提交中断/).waitFor();
    assert.equal(await progress.getAttribute('aria-valuenow'), '25');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('.jj-toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-live-task-log-mobile.png'), animations: 'disabled' });
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await openLog(); await log.getByText(/提交中断/).waitFor();
});

test('file job cancellation and selective retry remain available after refresh on desktop and mobile', async t => {
    let task = { task_id: 'controlled-files', type: 'file-dispatch', status: 'running', phase: 'dispatch', percent: 33, completed: 1, total: 3,
        can_cancel: true, can_retry: false, updated_at: 'one', message: '已提交 a.mp4，正在提交 b.mp4', logs: [] };
    let cancellations = 0, retries = 0;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/jobs', route => route.fulfill({ json: { tasks: [task] } }));
        await p.route('**/api/system/jobs/controlled-files', route => route.fulfill({ json: task }));
        await p.route('**/api/system/jobs/controlled-files/cancel', async route => {
            cancellations++;
            task = { ...task, cancel_requested: true, can_cancel: false, updated_at: 'two', message: '正在取消，等待当前操作结束' };
            await route.fulfill({ json: task });
        });
        await p.route('**/api/system/jobs/controlled-files/retry', async route => {
            retries++;
            task = { ...task, status: 'running', can_cancel: true, can_retry: false, cancel_requested: false, updated_at: 'four', message: '仅重试 b.mp4、c.mp4，保留 a.mp4 提交结果' };
            await route.fulfill({ json: task });
        });
    });
    const openLog = async () => {
        await page.locator('header').getByRole('button', { name: '后台 1', exact: true }).click();
        await page.getByRole('dialog', { name: '后台任务', exact: true }).getByRole('button', { name: '查看', exact: true }).click();
    };
    await openLog();
    const dialog = page.getByRole('dialog', { name: '任务日志', exact: true });
    await dialog.getByRole('button', { name: '取消任务', exact: true }).click();
    await dialog.getByRole('status').getByText(/正在取消/).waitFor();
    assert.equal(await dialog.getByRole('button', { name: '取消任务', exact: true }).count(), 0);
    task = { ...task, status: 'cancelled', can_retry: true, updated_at: 'three', message: '任务已取消，已提交下载继续',
        logs: [{ time: '2026-10-20T18:00:00', message: 'a.mp4 已确认成功，b.mp4、c.mp4 尚未提交' }],
        result: { success: false, results: [{ filename: 'a.mp4', success: true, gid: '1234567890abcdef' }] } };
    await dialog.getByRole('button', { name: '重试未提交项', exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-job-controls-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click(); await openLog();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-job-controls-mobile.png'), animations: 'disabled' });
    await dialog.getByRole('button', { name: '重试未提交项', exact: true }).click();
    await dialog.getByText(/仅重试 b.mp4/).waitFor();
    await dialog.getByRole('button', { name: '取消任务', exact: true }).waitFor();
    assert.equal(cancellations, 1); assert.equal(retries, 1);
});

test('deployment: cinema and management share the image revision and update time after reload', async t => {
    const page = await openApp(t, 1440);
    for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        if (width === 390) { await page.reload(); await page.getByRole('button', { name: '管理界面', exact: true }).click(); }
        const badge = page.getByLabel('部署版本', { exact: true });
        assert.match(await badge.innerText(), /git-1234567/);
        assert.match(await badge.innerText(), /更新 2026-10-20 04:30:00 UTC/);
        assert.match(await badge.getAttribute('title'), /1234567890abcdef1234567890abcdef12345678/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-deployment-${width}.png`), fullPage: false });
        const management = { text: await badge.innerText(), title: await badge.getAttribute('title') };
        await page.getByRole('button', { name: '影院模式', exact: true }).click();
        const cinema = page.locator('.jj-cinema-bar').getByLabel('部署版本', { exact: true });
        assert.equal(await cinema.innerText(), management.text);
        assert.equal(await cinema.getAttribute('title'), management.title);
        assert.equal(await cinema.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), true);
        assert.equal(await page.getByRole('searchbox', { name: '影院搜索', exact: true }).isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-cinema-deployment-${width}.png`), fullPage: false });
        await page.getByRole('button', { name: '管理界面', exact: true }).click();
        assert.equal(await badge.innerText(), management.text);
    }
});

test('library layout: original sidebar, stats and views retain accessible detail polish', async t => {
    const page = await openApp(t, 1440, async p => {
        const state = await libraryFixture(p, 120);
        state.records[0].title = '用于检查换行与省略的超长影片标题 / A very long movie title that should never push controls off screen';
        state.records[0].files[0].path = '/qa/a-very-long-media-directory/'.repeat(4) + 'QA-001.mp4';
        await libraryArtwork(p, state);
    });
    await navigate(page, '影视库');
    assert.equal(await page.locator('aside').getByRole('textbox', { name: '影视库搜索' }).count(), 1, 'search remains in the original sidebar');
    for (const width of [1440, 2560, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const sidebar = await page.locator('.jj-library-sidebar').boundingBox();
        const main = await page.locator('.jj-library-main').boundingBox();
        if (width > 850) {
            assert.equal(sidebar.width, 250, 'original filter column stays visible');
            assert.ok(main.x >= sidebar.x + sidebar.width, 'library content stays beside filters');
        } else {
            assert.ok(main.y >= sidebar.y + sidebar.height - 1, 'mobile retains stacked filters and content');
        }
        for (const name of ['刷新影视库', '资料检查', '清洗无效文件', '扫描入库', '清空数据库']) {
            assert.equal(await page.getByRole('button', { name, exact: true }).isVisible(), true, `${name} remains directly available`);
        }
        assert.equal(await page.locator('.jj-library-stats > div').count(), 4, 'four original statistic cards');
        await page.locator('label').filter({ has: page.locator('input[name="jj-lbv"]') }).filter({ hasText: '海报' }).click();
        const grid = page.locator('.jj-library-posters');
        await grid.waitFor();
        assert.equal(await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), width > 850 ? 6 : 2, 'original poster column layout');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'controls and long titles stay inside viewport');
        const card = grid.getByRole('button').first();
        await card.focus(); await page.keyboard.press('Enter');
        await page.locator('.jj-drawer').waitFor();
        assert.equal(await page.locator('.jj-library-detail-cover img').evaluate(img => img.complete && img.naturalWidth > 0), true, 'detail uses the actual cover');
        if (width === 390) {
            await page.locator('.jj-drawer').evaluate(async node => { await Promise.all(node.getAnimations().map(animation => animation.finished)); });
            const play = await page.locator('.jj-drawer').getByRole('button', { name: '播放', exact: true }).boundingBox();
            assert.ok(play.x >= 0 && play.x + play.width <= width, 'file actions fit inside the mobile drawer');
        }
        await page.keyboard.press('Escape');
        assert.equal(await card.evaluate(node => node === document.activeElement), true, 'closing details restores keyboard focus');
        await field(page, '分辨率').selectOption('2160p');
        await page.getByText('没有符合条件的影片', { exact: true }).waitFor();
        await page.getByRole('button', { name: '清除筛选', exact: true }).click();
        await grid.waitFor();
        await page.locator('.jj-library-main').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-library-restored-${width}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const check = page.getByRole('button', { name: '检查项设置', exact: true });
    await check.click();
    await page.getByRole('button', { name: '开始检查', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await check.evaluate(node => node === document.activeElement), true, 'closing a dialog returns focus to its button');
    await page.locator('label').filter({ has: page.locator('input[name="jj-lbv"]') }).filter({ hasText: '列表' }).click();
    assert.equal(await page.locator('.jj-library-table th:visible').count(), 8, 'all original list columns remain visible');
    await navigate(page, '设置');
    await page.locator('aside').getByRole('button', { name: /^外观/ }).click();
    await page.getByText('浅色', { exact: true }).click();
    await navigate(page, '影视库');
    const scroll = await page.locator('.jj-library-main').evaluate(node => ({ scheme: getComputedStyle(node).colorScheme, width: getComputedStyle(node).scrollbarWidth, color: getComputedStyle(node).scrollbarColor }));
    assert.equal(scroll.scheme, 'light'); assert.equal(scroll.width, 'thin'); assert.notEqual(scroll.color, 'auto');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-library-restored-light.png'), fullPage: false });
});

test('information workflow: background check survives reload and leads to background completion', async t => {
    const missing = { success: true, fields: ['title', 'nfo'], total_movies: 4, incomplete_count: 1,
        incomplete_records: [{ movie_id: 'QA-001', missing_fields: ['title'], missing_labels: ['标题'] }] };
    let checkDone = false, downloadDone = false, submitted;
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/local-library/information/**', route => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('/check/jobs')) return route.fulfill({ status: 202, json: { task_id: 'information-check' } });
            if (url.pathname.endsWith('/download/jobs')) {
                submitted = route.request().postDataJSON();
                return route.fulfill({ status: 202, json: { task_id: 'information-download' } });
            }
            if (url.pathname.endsWith('/jobs/information-check')) return route.fulfill({ json: checkDone
                ? { status: 'success', percent: 100, result: missing } : { status: 'running', percent: 20, message: '正在检查本地资料' } });
            if (url.pathname.endsWith('/jobs/information-download')) return route.fulfill({ json: downloadDone
                ? { status: 'success', percent: 100, result: { success: true, updated_count: 1, failed_count: 0,
                    information_check: { ...missing, incomplete_count: 0, incomplete_records: [] } } }
                : { status: 'running', percent: 50, message: '正在补全 QA-001' } });
            return route.fulfill({ json: missing });
        });
    });
    assert.equal(await page.title(), 'JavJaeger');
    assert.equal(new URL(page.url()).origin, baseURL);
    await navigate(page, '影视库');
    await page.getByRole('button', { name: '资料检查', exact: true }).click();
    await page.getByText('资料检查已在后台启动，可在后台任务中查看进度', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '资料检查', exact: true }).isDisabled(), true);
    await navigate(page, '设置');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '设置');
    checkDone = true;
    await page.getByText(/资料检查完成：4 部已检查，1 部待补全；可在后台任务中查看结果/).waitFor();
    await page.locator('header').getByRole('button', { name: /后台/ }).click();
    const background = page.getByRole('dialog', { name: '后台任务', exact: true });
    await background.getByText('已完成', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-information-completed.png'), fullPage: false, animations: 'disabled' });
    await background.getByRole('button', { name: '查看', exact: true }).click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('button', { name: '查看结果', exact: true }).click();
    await page.getByText('QA-001：标题', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-information-next-step.png'), fullPage: false, animations: 'disabled' });
    await approve(page, '开始补全');
    await page.getByText('资料补全已在后台启动，可在后台任务中查看进度', { exact: true }).waitFor();
    assert.deepEqual(submitted.movie_ids, ['QA-001']);
    assert.deepEqual(submitted.fields, ['title', 'nfo']);
    assert.equal(submitted.overwrite_existing, false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    downloadDone = true;
    await page.getByText(/资料补全完成：1 成功，0 失败，剩余 0 部待补全；可在后台任务中查看结果/).waitFor();
    await page.locator('header').getByRole('button', { name: /后台/ }).click();
    await background.getByRole('button', { name: '查看', exact: true }).click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('button', { name: '查看结果', exact: true }).click();
    await approve(page, '完成');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('localLibraryInformationTask')), null);
    assert.equal(await page.locator('.sc-logic-error').count(), 0);
});

test('startup: delayed fallback React loading still mounts the application', async t => {
    const page = await openApp(t, 1440, async p => {
        await p.route('**/static/app.js*', async route => {
            const script = fs.readFileSync(path.resolve(__dirname, '../../static/app.js'), 'utf8');
            await route.fulfill({ contentType: 'text/javascript', body: 'window.qaReact = window.React; window.qaReactDOM = window.ReactDOM; delete window.React; delete window.ReactDOM;\n' + script });
        });
        await p.route('https://unpkg.com/**', async route => {
            await delay(250);
            await route.fulfill({ contentType: 'text/javascript', body: route.request().url().includes('react-dom@') ? 'window.ReactDOM = window.qaReactDOM;' : 'window.React = window.qaReact;' });
        });
        // Test the fallback timing with the already-loaded React objects, not CDN availability or SRI validation.
        await p.addInitScript(() => {
            const original = Element.prototype.appendChild;
            Element.prototype.appendChild = function (node) {
                if (node.tagName === 'SCRIPT' && node.src.startsWith('https://unpkg.com/')) node.removeAttribute('integrity');
                return original.call(this, node);
            };
        });
    });
    await navigate(page, '影视库');
    await page.getByRole('button', { name: '资料检查', exact: true }).waitFor();
});

test('background results: scan failures and cleanup remain reviewable after reload', async t => {
    let cleanupDone = false;
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/local-library/scan/jobs/qa-scan', route => route.fulfill({ json: {
            status: 'failed', message: '部分目录无法访问', result: { success: false, scans: [
                { directory: '/offline', success: false, message: '目录无法访问' }, { directory: '/qa', success: true }],
            },
        } }));
        await p.route('**/api/movies/local-library/clean-invalid/jobs**', route => route.fulfill({ json:
            route.request().method() === 'POST' ? { task_id: 'cleanup' } : cleanupDone ? {
                status: 'success', percent: 100, result: { success: true, message: '已清洗 1 个无效文件，1 个文件已保留',
                    deleted_files: [{ path: '/qa/empty.mp4' }], failed_files: [{ path: '/qa/kept.mp4', message: '探测失败，已保留文件' }],
                },
            } : { status: 'running', percent: 50, message: '正在核验媒体文件' },
        }));
    });
    await navigate(page, '影视库');
    await page.getByRole('button', { name: '扫描入库', exact: true }).click(); await approve(page, '开始扫描');
    await page.getByText('部分目录无法访问', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await page.locator('header').getByRole('button', { name: /后台/ }).click();
    const background = page.getByRole('dialog', { name: '后台任务', exact: true });
    await background.getByText('失败', { exact: true }).waitFor();
    await background.getByRole('button', { name: '查看', exact: true }).click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('button', { name: '查看结果', exact: true }).click();
    await page.getByText('/offline 目录无法访问', { exact: true }).waitFor();
    await approve(page, '查看对应页面');
    await page.getByRole('button', { name: '清洗无效文件', exact: true }).click(); await approve(page, '清洗');
    await page.getByText('清洗已在后台启动，可在后台任务中查看进度', { exact: true }).waitFor();
    await navigate(page, '设置');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    cleanupDone = true;
    await page.getByText('已清洗 1 个无效文件，1 个文件已保留', { exact: true }).waitFor();
    await page.locator('header').getByRole('button', { name: /后台/ }).click();
    await background.getByText('已完成', { exact: true }).waitFor();
    await background.getByRole('button', { name: '查看', exact: true }).click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('button', { name: '查看结果', exact: true }).click();
    await page.getByText('/qa/kept.mp4 探测失败，已保留文件', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cleanup-result.png'), animations: 'disabled' });
    await approve(page, '查看对应页面');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('localLibraryCleanupTask')), null);
});

test('library columns: spacious defaults, resizing, persistence and reset', async t => {
    const page = await openApp(t, 1440, async p => {
        const state = await libraryFixture(p, 65);
        state.records[0].stars = Array.from({ length: 12 }, (_, i) => `测试演员 ${i + 1}`);
        state.records[0].title = '可完整查看的长标题 / '.repeat(12);
        await libraryArtwork(p, state);
        state.records[0].thumbnail_url = state.records[0].cover_url;
        state.records[0].poster_url = '/api/qa-landscape';
        state.records[0].cover_url = '/api/qa-landscape';
        await p.route('**/api/qa-landscape', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#73596b"/></svg>' }));
    });
    const consoleIssues = [];
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleIssues.push(message.text()); });
    await navigate(page, '影视库');
    assert.equal(await page.title(), 'JavJaeger');
    assert.equal(page.url(), baseURL + '/');
    const table = page.locator('.jj-library-table table');
    const headers = table.locator('th');
    const actor = table.getByRole('separator', { name: '调整演员列宽', exact: true });
    assert.equal(await table.getByRole('separator').count(), 8, 'every column can be resized');
    assert.ok((await headers.nth(3).boundingBox()).width >= 220, 'actors have more room by default');
    assert.ok((await table.locator('tbody tr').first().locator('img').boundingBox()).width >= 120, 'cover is substantially larger');
    const portrait = table.locator('tbody tr').first().locator('img');
    assert.equal(await portrait.getAttribute('src'), '/api/qa-posters/0', 'library uses the separate portrait image instead of the landscape cover');
    const portraitBox = await portrait.boundingBox();
    assert.ok(Math.abs(portraitBox.height / portraitBox.width - 1.5) < .02, 'list artwork uses a portrait frame');
    assert.ok((await table.boundingBox()).width <= (await table.locator('..').boundingBox()).width + 1, 'desktop defaults fit the content area');
    const drag = async (handle, delta) => {
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
    };
    const actorBefore = (await headers.nth(3).boundingBox()).width;
    await drag(actor, 100);
    assert.ok(Math.abs((await headers.nth(3).boundingBox()).width - actorBefore - 100) < 2, 'drag changes the actor column and cells together');
    assert.equal(await page.locator('.jj-drawer').count(), 0, 'drag does not open details');
    await actor.focus(); await page.keyboard.press('ArrowRight');
    const savedActorWidth = (await headers.nth(3).boundingBox()).width;
    assert.ok(savedActorWidth > actorBefore + 100, 'keyboard also resizes');
    const cover = table.getByRole('separator', { name: '调整封面列宽', exact: true });
    const coverBefore = (await table.locator('tbody tr').first().locator('img').boundingBox()).width;
    await drag(cover, 60);
    assert.ok((await table.locator('tbody tr').first().locator('img').boundingBox()).width > coverBefore + 50, 'cover grows with its column');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.ok(Math.abs((await headers.nth(3).boundingBox()).width - savedActorWidth) < 2, 'pagination retains widths');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '影视库');
    assert.ok(Math.abs((await headers.nth(3).boundingBox()).width - savedActorWidth) < 2, 'reload restores widths');
    await actor.focus(); await page.keyboard.press('Home');
    assert.ok((await headers.nth(3).boundingBox()).width >= 120, 'minimum keeps actor content readable');
    await page.getByRole('button', { name: '恢复默认列宽', exact: true }).click();
    assert.ok(Math.abs((await headers.nth(3).boundingBox()).width - actorBefore) < 2, 'reset restores responsive defaults');
    const fileWidth = (await headers.nth(5).boundingBox()).width;
    for (const width of [1440, 2560, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await table.scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'wide tables scroll inside the viewport');
        assert.equal(await table.locator('th').count(), 8);
        if (width === 2560) {
            assert.ok(Math.abs((await headers.nth(5).boundingBox()).width - fileWidth) < 2, 'wide screens give extra space to content, keeping short data columns compact');
            assert.ok((await headers.nth(0).boundingBox()).width <= 220, 'default covers stay compact enough for a list on wide screens');
            assert.ok((await headers.nth(3).boundingBox()).width > actorBefore + 100);
        }
        if (width > 850) await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-library-columns-${width}.png`), fullPage: false });
    }
    assert.deepEqual(consoleIssues, [], 'column controls have no console errors or accessibility warnings');
});

test('performance: 10000 cinema facet options stay lazy, paged and searchable by keyboard', async t => {
    let state;
    const page = await openApp(t, 1440, async p => {
        state = await libraryFixture(p, 10000);
        state.records.forEach((record, i) => { record.stars = [`Actor ${i}`]; record.genres = [`Tag ${i}`]; });
    });
    await navigate(page, '影院模式');
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    const filters = page.locator('.jj-cinema-filters'), options = filters.locator('button[aria-pressed]');
    assert.equal(await options.count(), 0, 'collapsed filters contain no option DOM');
    const summary = filters.locator('summary');
    await summary.focus(); await page.keyboard.press('Enter');
    const actors = filters.getByRole('group', { name: '演员筛选', exact: true });
    await actors.getByRole('button', { name: 'Actor 0 1', exact: true }).waitFor();
    assert.ok(await options.count() <= 300, 'each of four groups contains at most 60 option buttons');
    assert.ok(await filters.locator('button').count() <= 310, 'pagination controls also stay bounded');
    t.diagnostic(JSON.stringify({ records: 10000, collapsedOptions: 0, expandedOptions: await options.count(), expandedButtons: await filters.locator('button').count() }));
    await actors.getByRole('button', { name: '下一页', exact: true }).click();
    await actors.getByRole('button', { name: 'Actor 60 1', exact: true }).waitFor();
    const actorSearch = actors.getByRole('searchbox', { name: '搜索演员选项', exact: true });
    await actorSearch.fill('Actor 9999');
    const lastActor = actors.getByRole('button', { name: 'Actor 9999 1', exact: true });
    await lastActor.focus(); await page.keyboard.press('Space');
    const tags = filters.getByRole('group', { name: '标签筛选', exact: true });
    await tags.getByRole('searchbox', { name: '搜索标签选项', exact: true }).fill('Tag 9999');
    await tags.getByRole('button', { name: 'Tag 9999 1', exact: true }).click();
    assert.equal(await page.locator('.jj-cinema-wall .jj-cinema-card').count(), 1);
    assert.match(await page.locator('.jj-cinema-wall').innerText(), /QA-10000/);
    await summary.focus(); await page.keyboard.press('Space');
    await options.first().waitFor({ state: 'detached' });
    assert.equal(await options.count(), 0);
    assert.equal(await page.locator('.jj-cinema-active-filters button[aria-label^="移除"]').count(), 2);
    await page.getByRole('button', { name: '清空 2 个条件', exact: true }).click();
    await summary.focus(); await page.keyboard.press('Enter');
    await actors.getByRole('button', { name: 'Actor 0 1', exact: true }).waitFor();
    assert.equal(await actorSearch.inputValue(), '');
    await actors.getByRole('button', { name: '下一页', exact: true }).click();
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    state.records = state.records.slice(0, 80).map((record, i) => ({ ...record, stars: [`New Actor ${i}`] }));
    await page.getByRole('button', { name: '刷新影视库', exact: true }).click();
    await page.getByText('80', { exact: true }).first().waitFor();
    await navigate(page, '影院模式');
    await actors.getByRole('button', { name: 'New Actor 0 1', exact: true }).waitFor();
    assert.ok(await options.count() <= 300);
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-facets-paged.png'), fullPage: false });
});

test('cinema tags: directory selection, AND/OR results and detail return share one filter state', async t => {
    const page = await openApp(t, 1440, async p => {
        const state = await libraryFixture(p, 4);
        state.records.forEach((record, index) => { record.genres = [['剧情', '中文字幕'], ['剧情'], ['中文字幕'], ['动作']][index]; });
    });
    assert.equal(await page.title(), 'JavJaeger');
    assert.ok(page.url().startsWith(baseURL));
    await navigate(page, '影院模式');
    assert.equal(await page.getByRole('button', { name: '系列', exact: true }).count(), 0);
    await page.getByRole('button', { name: '标签', exact: true }).click();
    const directory = page.getByRole('region', { name: '标签目录', exact: true });
    await directory.getByRole('button', { name: '剧情 2 部', exact: true }).focus();
    await page.keyboard.press('Space');
    await directory.getByRole('button', { name: '中文字幕 2 部', exact: true }).click();
    await directory.getByRole('combobox', { name: '标签组合', exact: true }).selectOption('and');
    await directory.getByRole('button', { name: '查看影片', exact: true }).click();
    assert.equal(await page.locator('.jj-cinema-wall .jj-cinema-card').count(), 1);
    assert.match(await page.locator('.jj-cinema-wall').innerText(), /QA-001/);
    await page.locator('.jj-cinema-wall .jj-cinema-card').first().click();
    await page.getByRole('dialog', { name: '影片详情', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('combobox', { name: '标签组合', exact: true }).inputValue(), 'and');
    await page.getByRole('button', { name: '全部标签', exact: true }).click();
    assert.equal(await directory.locator('button[aria-pressed="true"]').count(), 2);
    await directory.getByRole('searchbox', { name: '搜索标签', exact: true }).fill('剧情');
    assert.equal(await directory.locator('.jj-cinema-tag-directory > button').count(), 1);
    await directory.getByRole('combobox', { name: '标签组合', exact: true }).selectOption('or');
    await directory.getByRole('button', { name: '查看影片', exact: true }).click();
    assert.equal(await page.locator('.jj-cinema-wall .jj-cinema-card').count(), 3);
    await page.getByRole('button', { name: '全部标签', exact: true }).click();
    await directory.getByRole('button', { name: '清空标签选择', exact: true }).click();
    assert.equal(await directory.locator('button[aria-pressed="true"]').count(), 0);
    assert.equal(await directory.getByRole('searchbox', { name: '搜索标签', exact: true }).inputValue(), '');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-tags-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await directory.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'tag controls and long options fit the mobile viewport');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-tags-mobile.png'), fullPage: false });
});

test('cinema redesign: shelves, search, detail and playback preserve the browsing context', async t => {
    const page = await openApp(t, 1440, async p => {
        const state = await libraryFixture(p, 125);
        state.records[0].title = '夜色之下 / 用于验证详情文字换行与完整阅读的长标题';
        state.records[0].description = '测试收藏中的影片简介。使用真实元数据呈现内容，浏览影片、查看演员与选择本地播放文件。';
        state.records[0].files.push({ path: '/qa/QA-001-part-2.mp4', file_name: 'QA-001-part-2.mp4', size: 204800 });
        state.records[0].file_count = 2;
        await libraryArtwork(p, state);
    });
    const consoleIssues = [];
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleIssues.push(message.text()); });
    t.after(() => assert.deepEqual(consoleIssues, [], 'cinema has no console errors or accessibility warnings'));
    await navigate(page, '影院模式');
    for (const width of [1440, 2560, 1024, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const content = page.locator('.jj-cinema-content');
        await content.evaluate(node => { node.scrollTop = 0; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1), `cinema has one vertical scroll container at ${width}`);
        const shelf = page.locator('.jj-cinema-shelf').first();
        const poster = await shelf.locator('.jj-cinema-poster').first().boundingBox();
        assert.ok(Math.abs(poster.height / poster.width - 1.5) < .02, 'shelves use readable portrait covers');
        assert.ok(poster.width >= 140 && poster.width < 300, 'poster size uses the available width');
        assert.ok(poster.y < (width === 390 ? 590 : 530), 'first shelf is visible from the initial viewport');
        if (width === 1440) {
            await shelf.getByRole('button', { name: '下一组 最近入库', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.jj-cinema-shelf-track').scrollLeft > 200);
            await shelf.getByRole('button', { name: '上一组 最近入库', exact: true }).click();
            await page.waitForFunction(() => document.querySelector('.jj-cinema-shelf-track').scrollLeft < 5);
        }
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-cinema-home-${width}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    const search = page.getByRole('searchbox', { name: '影院搜索' });
    await search.fill('QA-001');
    assert.equal(await page.locator('.jj-cinema-wall .jj-cinema-card').count(), 1);
    const card = page.locator('.jj-cinema-wall .jj-cinema-card').first();
    await card.focus(); await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: '影片详情', exact: true });
    await detail.waitFor();
    await detail.getByRole('heading', { name: /^夜色之下/ }).waitFor();
    assert.equal(await detail.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-detail.png'), fullPage: false });
    const bytes = await sampleVideo(page);
    await page.route('**/api/movies/local-library/QA-001/play?file_index=1', route => route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
    await detail.getByRole('combobox', { name: '详情播放文件' }).selectOption('1');
    await detail.getByRole('button', { name: '播放所选文件', exact: true }).click();
    const video = page.locator('video'); await video.waitFor(); await video.evaluate(node => node.play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0);
    assert.match(await video.getAttribute('src'), /file_index=1$/);
    assert.equal(await video.evaluate(node => node.controls && !node.error), true);
    await page.getByRole('button', { name: '停止播放', exact: true }).click();
    assert.equal(await detail.isVisible(), true, 'player returns to the same detail screen');
    await page.keyboard.press('Escape');
    assert.equal(await card.evaluate(node => document.activeElement === node), true);
    assert.equal(await search.inputValue(), 'QA-001');
    await search.fill('无法命中');
    await page.getByText('没有符合条件的影片', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清空条件', exact: true }).click();
    await page.locator('.jj-cinema-filters summary').click();
    await page.getByRole('button', { name: /^1080p/ }).click();
    await page.locator('.jj-cinema-filters summary').click();
    await page.getByRole('button', { name: '移除 分辨率 · 1080p' }).click();
    assert.equal(await page.locator('.jj-cinema-active-filters').count(), 0);
    const content = page.locator('.jj-cinema-content');
    await content.evaluate(node => { node.scrollTop = 500; });
    const lowerCard = page.locator('.jj-cinema-wall .jj-cinema-card').nth(20);
    await lowerCard.focus();
    const beforeDetail = await content.evaluate(node => node.scrollTop);
    await page.keyboard.press('Enter');
    await detail.waitFor(); await page.keyboard.press('Escape');
    assert.equal(await content.evaluate(node => node.scrollTop), beforeDetail, 'closing details preserves the poster wall position');
    await page.getByRole('button', { name: '标签', exact: true }).click();
    assert.equal(await content.evaluate(node => node.scrollTop), 0, 'switching sections starts at the section heading');
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    assert.equal(await content.evaluate(node => node.scrollTop), 0, 'pagination shows the beginning of the next page');
    await page.getByRole('button', { name: '上一页', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.jj-cinema-wall .jj-cinema-card').first().click();
    await detail.getByRole('combobox', { name: '详情播放文件' }).scrollIntoViewIfNeeded();
    assert.equal(await detail.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'detail has no horizontal overflow');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-detail-mobile.png'), fullPage: false });
    await page.getByRole('button', { name: '关闭影片详情' }).click();
    await page.getByRole('button', { name: '演员', exact: true }).click();
    await page.locator('.jj-cinema-actor').first().click();
    await page.getByRole('heading', { name: '测试演员', exact: true }).waitFor();
    await page.getByRole('button', { name: '全部演员', exact: true }).click();
    assert.equal(await page.locator('.jj-cinema-actor').count(), 1);
});

test('cinema layout: short mobile viewport keeps the media wall readable and scrollable', async t => {
    const page = await openApp(t, 390, p => libraryFixture(p, 120));
    await page.setViewportSize({ width: 390, height: 640 });
    await navigate(page, '影院模式');
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    const wall = page.locator('.jj-cinema-wall');
    await wall.waitFor();
    const bounds = await wall.getByRole('button').first().boundingBox();
    assert.ok(bounds.width >= 130, 'mobile posters are readable, never eight miniature columns');
    assert.ok(bounds.y < 400, 'collapsed facets leave room for movies');
    await page.locator('.jj-cinema-filters summary').click();
    await page.getByRole('button', { name: /^1080p/ }).click();
    await page.locator('.jj-cinema-filters summary').click();
    await page.getByRole('button', { name: /^清空 \d+ 个条件/ }).click();
    await wall.waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-cinema-mobile-wall.png'), fullPage: false });
});

test('background task indicator spins only while tasks are active, including after navigation', async t => {
    let tasks = [];
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/transcoding/tasks', route => route.fulfill({ json: { tasks } }));
    });
    assert.equal(await page.title(), 'JavJaeger');
    assert.equal(new URL(page.url()).origin, baseURL);
    await navigate(page, '影视库');
    const indicator = page.locator('header').getByRole('button', { name: /^后台 \d+$/ });
    const animation = () => indicator.locator('span').first().evaluate(node => getComputedStyle(node).animationName);
    assert.match(await indicator.innerText(), /^后台\s+0$/);
    assert.equal(await animation(), 'none', 'idle indicator must not spin');
    for (const status of ['queued', 'running']) {
        tasks = [{ id: 'qa-bg', movie_id: 'QA-001', status, stage: status, progress: 10 }];
        await page.locator('header').getByRole('button', { name: '后台 1', exact: true }).waitFor();
        assert.equal(await animation(), 'jjspin', `${status} task animates`);
        await indicator.click();
        await page.getByRole('dialog', { name: '后台任务', exact: true }).getByText(status, { exact: true }).waitFor();
        await page.keyboard.press('Escape');
    }
    await navigate(page, '设置');
    tasks = ['completed', 'failed', 'cancelled'].map((status, i) => ({ id: `qa-bg-${i}`, movie_id: `QA-${i}`, status, progress: 100 }));
    await page.locator('header').getByRole('button', { name: '后台 0', exact: true }).waitFor();
    assert.equal(await animation(), 'none', 'finished tasks stop animating on other pages');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-background-idle.png'), fullPage: false });
});

test('performance: 10000 movies and 50 TB keep navigation, paging and input responsive', async t => {
    let state;
    const page = await openApp(t, 1440, async p => {
        state = await libraryFixture(p, 10000);
        state.records.forEach((record, i) => {
            record.stars = [`QA Actor ${i % 2000}`];
            record.genres = [`QA Tag ${i % 1000}`];
            record.total_size = record.files[0].size = 5000000000;
        });
    });
    const samples = {};
    for (const name of ['影视库', '设置', '影片检索', '影视库']) {
        const start = performance.now();
        await navigate(page, name);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        samples[name] = Math.round(performance.now() - start);
    }
    const rowCount = await page.locator('tbody tr').count();
    t.diagnostic(JSON.stringify({ navigationMs: samples, rowCount }));
    assert.ok(rowCount <= 60, `render at most one page, got ${rowCount} rows`);
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await page.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: '影视库搜索', exact: true }).fill('QA-10000');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    assert.match(await page.locator('tbody').innerText(), /QA-10000/);
    await page.getByRole('button', { name: '清空关键词', exact: true }).click();
    await page.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-performance-library.png'), fullPage: false });
    await navigate(page, '影院模式');
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    await page.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await page.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-performance-cinema.png'), fullPage: false });
    await page.getByRole('button', { name: '标签', exact: true }).click();
    assert.equal(await page.locator('.jj-cinema-tag-directory > button').count(), 60);
    await page.locator('.jj-cinema-tag-directory > button').first().click();
    await page.getByRole('button', { name: '查看影片', exact: true }).click();
    await page.getByText(/命中 10 部/).waitFor();
    assert.equal(state.records.reduce((sum, record) => sum + record.total_size, 0), 50000000000000);
    assert.equal(state.requests.filter(request => request.path.endsWith('/scan/jobs')).length, 0);
});

test('performance: delayed magnets and GPU probes never delay opening results or dialogs', async t => {
    let releaseMagnets, releaseCaps;
    const magnets = new Promise(resolve => { releaseMagnets = resolve; });
    const caps = new Promise(resolve => { releaseCaps = resolve; });
    t.after(() => { releaseMagnets(); releaseCaps(); });
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/movies/search-jobs', 'search', async body => { await magnets; return searchSnapshot(body); });
        await libraryFixture(p);
        await p.route('**/api/movies/QA-001', route => route.fulfill({ json: movie() }));
        await p.route('**/api/magnets/**', async route => { await magnets; await route.fulfill({ json: [magnet] }); });
        await p.route('**/api/movies/transcoding/presets', async route => { await caps; await route.fulfill({ json: { gpu_available: false, presets: [] } }); });
    });
    await navigate(page, '影片检索');
    await field(page, '番号').fill('QA-001');
    await page.getByRole('button', { name: '查询番号', exact: true }).click();
    await page.getByText('QA 测试影片 QA-001', { exact: true }).waitFor();
    await page.getByRole('button', { name: '详情', exact: true }).click();
    await page.locator('.jj-drawer').waitFor();
    releaseMagnets();
    await page.keyboard.press('Escape');
    await navigate(page, '影视库');
    await page.locator('tbody tr').first().getByRole('button', { name: '详情', exact: true }).click();
    await page.locator('.jj-drawer').getByRole('button', { name: '转码', exact: true }).click();
    await page.getByText('正在检测 GPU 和可用转码预设…', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '加入队列', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    const responded = page.waitForResponse(response => response.url().endsWith('/transcoding/presets'));
    releaseCaps(); await responded;
    assert.equal(await page.getByRole('button', { name: '加入队列', exact: true }).count(), 0);
});

test('performance: 10000 entries stay paged across history, transcode, scrape and files', async t => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ movie_id: `QA-${i}`, title: `QA ${i}`, source_path: `/qa/${i}.mp4`, code: `QA-${i}`, scrape_status: 'found', metadata: { id: `QA-${i}` } }));
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.addInitScript(() => sessionStorage.setItem('localScrapeActiveTask', JSON.stringify({ taskId: 'qa-many', type: 'preview', config: { scScanDir: '/qa' } })));
        await p.route('**/api/history', route => route.fulfill({ json: items }));
        await p.route('**/api/movies/transcoding/tasks', route => route.fulfill({ json: { tasks: items.map((item, i) => ({ id: `task-${i}`, movie_id: item.movie_id, status: 'completed', input_size: 5e9, output_size: 4e9 })) } }));
        await p.route('**/api/movies/transcoding/presets', route => route.fulfill({ json: { gpu_available: false, presets: [] } }));
        await p.route('**/api/movies/local-scrape/jobs/qa-many', route => route.fulfill({ json: { status: 'success', percent: 100, result: { success: true, items, total_files: items.length } } }));
        await p.route('**/api/system/files**', route => route.fulfill({ json: { success: true, current_path: '/qa', entries: items.map(item => ({ name: item.code + '.mp4', path: item.source_path, size: 5e9 })) } }));
    });
    for (const name of ['下载派发', '转码', '本地刮削', '网盘与下载']) {
        await navigate(page, name);
        await page.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
        const rows = page.locator('tbody tr');
        assert.equal(await rows.count(), 60, name);
        const first = await rows.first().innerText();
        const start = performance.now();
        await page.getByRole('button', { name: '下一页', exact: true }).click();
        await page.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
        assert.notEqual(await rows.first().innerText(), first);
        t.diagnostic(JSON.stringify({ page: name, count: 10000, nextPageMs: Math.round(performance.now() - start), rows: await rows.count() }));
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-performance-files.png'), fullPage: false });
    await navigate(page, '本地刮削');
    await page.getByRole('button', { name: /确认执行 10000 项/ }).click();
    const dialog = page.locator('.jj-confirm');
    await dialog.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    assert.equal(await dialog.locator('div').filter({ hasText: /^\/qa\/\d+\.mp4$/ }).count(), 60);
    await dialog.getByRole('button', { name: '下一页', exact: true }).click();
    await dialog.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-performance-confirmation.png'), fullPage: false });
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
});

test('performance: 10000 scrape execution outcomes remain paged and can reset', async t => {
    const results = Array.from({ length: 10000 }, (_, i) => ({ success: i < 6000, source_path: `/qa/result-${i}.mp4` }));
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.addInitScript(() => sessionStorage.setItem('localScrapeActiveTask', JSON.stringify({ taskId: 'qa-outcomes', type: 'apply', config: { scScanDir: '/qa' } })));
        await p.route('**/api/movies/local-scrape/jobs/qa-outcomes', route => route.fulfill({ json: {
            status: 'success', result: { success: true, success_count: 6000, failed_count: 4000, results },
        } }));
    });
    await navigate(page, '本地刮削');
    const heading = page.getByRole('heading', { name: '执行结果 · 6000 成功，4000 失败', exact: true });
    await heading.waitFor();
    const outcome = heading.locator('..'), rows = outcome.locator(':scope > div');
    assert.equal(await rows.count(), 60, 'execution outcomes render one page of DOM rows');
    await outcome.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await outcome.getByRole('button', { name: '下一页', exact: true }).click();
    await outcome.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    assert.match(await rows.first().innerText(), /result-60\.mp4/);
    assert.equal(await rows.count(), 60);
    await page.setViewportSize({ width: 390, height: 900 });
    await outcome.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-scrape-outcomes-paged.png'), fullPage: false });
    await outcome.getByRole('button', { name: '完成', exact: true }).click();
    assert.equal(await heading.count(), 0);
});

test('performance: 10000 dispatch failures remain paged with full retry and exact ignore', async t => {
    const records = Array.from({ length: 10000 }, (_, i) => ({ movie_id: `QA-${i}`, title: `QA ${i}`, status: 'failed',
        failed_resources: [{ link: `magnet:${i}`, source: 'javbus', tool: 'pikpak' }],
    }));
    let ignored;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/history', route => route.fulfill({ json: records }));
        await p.route('**/api/history/*/dismiss-failure', route => {
            const movieId = new URL(route.request().url()).pathname.split('/')[3];
            ignored = { movieId, ...route.request().postDataJSON() };
            records.find(record => record.movie_id === movieId).failed_resources = [];
            return route.fulfill({ json: { success: true } });
        });
    });
    await navigate(page, '下载派发');
    const failures = page.getByRole('heading', { name: '上一批派发部分失败', exact: true }).locator('../..');
    const rows = failures.locator('tbody tr');
    assert.equal(await rows.count(), 60, 'failed resources render one page of DOM rows');
    await failures.getByText('失败 10000 项', { exact: true }).waitFor();
    await failures.getByRole('button', { name: '下一页', exact: true }).click();
    await failures.getByText('第 2 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    assert.match(await rows.first().innerText(), /QA-60/);
    await failures.getByRole('button', { name: '重新派发全部失败', exact: true }).click();
    const dialog = page.locator('.jj-confirm');
    await dialog.getByText('第 1 / 167 页 · 共 10000 项', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await rows.first().getByRole('button', { name: '忽略此项', exact: true }).click();
    await failures.getByText('失败 9999 项', { exact: true }).waitFor();
    assert.deepEqual(ignored, { movieId: 'QA-60', link: 'magnet:60' });
    assert.match(await rows.first().innerText(), /QA-61/);
    assert.equal(await rows.count(), 60);
    await failures.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-dispatch-failures-paged.png'), fullPage: false });
});

test('performance: conditional polls discover external tasks after idle 304 responses', async t => {
    let transcodes = [], transcodeTag = '"transcodes-empty"';
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/transcoding/tasks', route => {
            const unchanged = route.request().headers()['if-none-match'] === transcodeTag;
            return route.fulfill({ status: unchanged ? 304 : 200, headers: { ETag: transcodeTag },
                ...(unchanged ? {} : { json: { tasks: transcodes } }) });
        });
        await p.route('**/api/movies/transcoding/presets', route => route.fulfill({ json: { gpu_available: false, presets: [] } }));
    });
    const isList = (response, suffix, status) => response.request().method() === 'GET'
        && new URL(response.url()).pathname.endsWith(suffix) && response.status() === status;
    await navigate(page, '影院模式');
    await page.waitForResponse(response => isList(response, '/transcoding/tasks', 304));
    transcodes = [{ id: 'external-tc', movie_id: 'QA-EXTERNAL', movie_title: 'External task', status: 'running', progress: 40 }];
    transcodeTag = '"transcodes-external"';
    await page.waitForResponse(response => isList(response, '/transcoding/tasks', 200));
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await page.locator('header nav').getByRole('button', { name: /^转码/ }).click();
    await page.getByText('QA-EXTERNAL', { exact: true }).waitFor();
    const manual = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/transcoding/tasks')
        && !request.headers()['if-none-match']);
    await page.getByRole('button', { name: '刷新', exact: true }).click(); await manual;
    transcodes = [{ ...transcodes[0], status: 'cancelled' }]; transcodeTag = '"transcodes-cancelled"';
    await page.getByRole('cell', { name: '已取消', exact: true }).waitFor();
    await navigate(page, '自动模式');
    await page.waitForResponse(response => isList(response, '/automation/tasks', 304));
    const created = await fetch(baseURL + '/api/automation/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: '跨窗口自动任务', enabled: false, nodes: ['trigger', 'search', 'magnet', 'download'].map(type => ({ id: type, type })), edges: [],
    }) });
    assert.equal(created.status, 200);
    const task = await created.json();
    t.after(() => fetch(baseURL + '/api/automation/tasks/' + task.id, { method: 'DELETE' }));
    await page.getByText('跨窗口自动任务', { exact: true }).waitFor();
    const updated = await fetch(baseURL + '/api/automation/tasks/' + task.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '跨窗口自动任务已更新' }) });
    assert.equal(updated.status, 200);
    await page.getByText('跨窗口自动任务已更新', { exact: true }).waitFor();
    const deleted = await fetch(baseURL + '/api/automation/tasks/' + task.id, { method: 'DELETE' }); assert.equal(deleted.status, 200);
    await page.getByText('跨窗口自动任务已更新', { exact: true }).waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-conditional-task-polling.png'), fullPage: false });
});

test('imported runtime renders all original pages with no demo data or errors', async t => {
    const page = await openApp(t);
    for (const name of ['影片检索', '下载派发', '本地刮削', '影视库', '自动模式', '转码', '网盘与下载', '设置']) {
        await navigate(page, name);
        assert.equal(await page.locator('.sc-logic-error').count(), 0, name);
        assert.doesNotMatch(await page.locator('body').innerText(), /MIZ-812|每日新片跟进|sk_jb_|dav.example.net|已索引 1,182/);
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-design-settings.png'), fullPage: true });
});

test('original search controls use actual movie, magnet, filter and recognition APIs', async t => {
    const calls = [];
    const cover = 'https://covers.example.test/search.svg';
    let detailRequests = 0;
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/movies/search-jobs', 'search', body => { calls.push(body); return searchSnapshot(body, body.movies.map(seed => ({ ...movie(seed.id), ...seed, img: cover, producer: { name: 'QA Detail Studio' } }))); });
        await p.route('**/api/movies?*', route => { calls.push(route.request().url()); return route.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/movies/QA-*', route => { calls.push(route.request().url()); detailRequests++; return route.fulfill({ json: { ...movie(), img: cover, producer: { name: 'QA Detail Studio' } } }); });
        await p.route('**/api/magnets/**', route => { calls.push(route.request().url()); return route.fulfill({ json: [magnet] }); });
        await p.route('**/api/movies/recognize', route => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/image-proxy?*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#405c7a"/><text x="30" y="112" fill="white" font-size="36">QA-001</text></svg>' }));
    });
    await navigate(page, '影片检索');
    await field(page, '番号').fill('QA-001');
    await page.getByRole('button', { name: '查询番号', exact: true }).click();
    await page.getByText('QA 测试影片 QA-001', { exact: true }).waitFor();
    assert.ok(calls.some(body => body.movies?.[0]?.gid === '123'));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-design-search.png'), fullPage: true });
    const expectedCover = '/api/image-proxy?url=' + encodeURIComponent(cover);
    assert.equal(await page.locator('main img').getAttribute('src'), expectedCover);
    await page.locator('label').filter({ has: page.locator('input[name="jj-view"]') }).filter({ hasText: '列表' }).click();
    const listCover = page.locator('tbody tr').first().locator('td').nth(1).locator('img');
    await listCover.waitFor();
    assert.equal(await listCover.getAttribute('src'), expectedCover, 'list and grid use the same proxied cover');
    await page.waitForFunction(() => document.querySelector('tbody img')?.naturalWidth > 0);
    const bounds = await listCover.boundingBox();
    assert.ok(bounds.width > 0 && bounds.width <= 74 && bounds.height > 0 && bounds.height <= 50, 'thumbnail stays inside the cover cell');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-search-list-cover-desktop.png'), fullPage: false });
    const openDetails = async () => {
        await page.locator('main').getByRole('button', { name: '详情', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '详情与配置', exact: true });
        await dialog.getByText('QA Detail Studio', { exact: true }).waitFor();
        const image = dialog.locator('img');
        await image.waitFor();
        assert.equal(await image.getAttribute('src'), expectedCover, 'details reuse the searched cover');
        await page.waitForFunction(() => document.querySelector('.jj-drawer img')?.naturalWidth > 0);
        await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
        return dialog;
    };
    let dialog = await openDetails();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-search-detail-cover-desktop.png'), fullPage: false });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await listCover.getAttribute('src'), expectedCover, 'closing details leaves the list cover intact');
    await page.setViewportSize({ width: 390, height: 844 });
    await listCover.scrollIntoViewIfNeeded();
    assert.ok(await listCover.isVisible(), 'list cover remains visible on mobile');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-search-list-cover-mobile.png'), fullPage: false });
    dialog = await openDetails();
    const detailBounds = await dialog.locator('img').boundingBox();
    assert.ok(detailBounds.x >= 0 && detailBounds.x + detailBounds.width <= 390, 'detail cover fits the mobile drawer');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-search-detail-cover-mobile.png'), fullPage: false });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('label').filter({ has: page.locator('input[name="jj-view"]') }).filter({ hasText: '封面' }).click();
    assert.equal(await page.locator('main img').getAttribute('src'), expectedCover);
    assert.equal(detailRequests, 1, 'a direct movie search already loaded its full details');
});

test('search: summaries appear first and background metadata fills rows before details open', async t => {
    let releaseDetails;
    const gate = new Promise(resolve => { releaseDetails = resolve; });
    t.after(() => releaseDetails());
    let detailCalls = 0;
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/movies/search-jobs', 'search', async (body, publish) => {
            const movies = body.movies.map(seed => ({ ...seed })), ready = [];
            await Promise.all(movies.map(async (seed, index) => {
                detailCalls++;
                if (seed.id === 'QA-001') await gate;
                movies[index] = { ...seed, stars: [{ name: '后台演员 ' + seed.id }], producer: { name: '后台制作商 ' + seed.id } };
                ready.push(seed.id); publish(searchSnapshot(body, [...movies], { ready: [...ready] }));
            }));
            return searchSnapshot(body, movies);
        });
        await p.route('**/api/movies?*', route => route.fulfill({ json: { movies: ['QA-001', 'QA-002'].map(id => ({ id, title: 'Summary ' + id, img: '/api/test-cover', gid: '123', uc: 0 })) } }));
        await p.route('**/api/movies/QA-*', async route => {
            detailCalls++;
            const id = route.request().url().split('/').at(-1);
            if (id === 'QA-001') await gate;
            await route.fulfill({ json: { id, stars: [{ name: '后台演员 ' + id }], producer: { name: '后台制作商 ' + id }, img: null } });
        });
        await p.route('**/api/test-cover', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#405c7a"/><circle cx="220" cy="60" r="30" fill="#cab99b"/><path d="M0 200V150L90 70L190 180L260 110L300 150V200" fill="#233348"/></svg>' }));
        await p.route('**/api/magnets/**', route => route.fulfill({ json: [magnet] }));
    });
    await navigate(page, '影片检索');
    await field(page, '磁力来源').selectOption('Cilisousuo');
    await page.getByRole('button', { name: '标签筛选', exact: true }).click();
    const started = page.waitForRequest(request => request.url().endsWith('/api/movies/search-jobs'), { timeout: 3000 });
    await page.getByRole('button', { name: '开始筛选', exact: true }).click();
    await page.getByText('Summary QA-001', { exact: true }).waitFor();
    await started;
    await page.locator('label').filter({ has: page.locator('input[name="jj-view"]') }).filter({ hasText: '列表' }).click();
    const row = page.locator('main tbody tr').filter({ hasText: 'Summary QA-001' });
    await row.getByText('资料补全中…', { exact: true }).waitFor();
    await page.getByText('后台演员 QA-002', { exact: true }).waitFor();
    assert.equal(await page.locator('.jj-drawer').count(), 0, 'metadata loads without opening details');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '影片检索');
    await page.locator('label').filter({ has: page.locator('input[name="jj-view"]') }).filter({ hasText: '列表' }).click();
    await page.getByText('后台演员 QA-002', { exact: true }).waitFor();
    assert.equal(detailCalls, 2, 'reload discovers the existing worker without submitting again');
    releaseDetails();
    await row.getByText('后台演员 QA-001', { exact: true }).waitFor();
    assert.equal(await row.locator('img').getAttribute('src'), '/api/test-cover');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-background-metadata-desktop.png'), fullPage: false });
    await row.getByRole('button', { name: '详情', exact: true }).click();
    const dialog = page.locator('.jj-drawer');
    await dialog.getByText('后台制作商 QA-001', { exact: true }).waitFor();
    assert.equal(detailCalls, 2, 'opening details does not repeat background requests');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await row.scrollIntoViewIfNeeded();
    assert.ok(await row.getByText('后台演员 QA-001', { exact: true }).isVisible());
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-background-metadata-mobile.png'), fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '影片检索');
    await page.getByRole('button', { name: '标签筛选', exact: true }).click();
    await page.getByRole('button', { name: '开始筛选', exact: true }).click();
    await page.getByText('后台演员 QA-001', { exact: true }).waitFor();
    await page.getByText('后台演员 QA-002', { exact: true }).waitFor();
    assert.equal(detailCalls, 4, 'page reload reads details from the shared backend');
    await page.getByRole('button', { name: '开始筛选', exact: true }).click();
    await page.getByText('后台演员 QA-001', { exact: true }).waitFor();
    assert.equal(detailCalls, 6, 'a repeated search checks the backend shared cache');
    await page.getByRole('button', { name: '番号查询', exact: true }).click();
    await field(page, '番号').fill('QA-001');
    await page.getByRole('button', { name: '查询番号', exact: true }).click();
    await page.getByText('后台演员 QA-001', { exact: true }).waitFor();
    await page.locator('main').getByRole('button', { name: '详情', exact: true }).click();
    await page.locator('.jj-drawer').getByText('后台制作商 QA-001', { exact: true }).waitFor();
    assert.equal(detailCalls, 8, 'the drawer reuses the backend result from the direct search');
    await page.locator('.jj-drawer').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-metadata-cache-restored.png'), fullPage: false });
});

test('original cinema and library show real indexed files', async t => {
    const page = await openApp(t, 1440, libraryFixture);
    await navigate(page, '影视库');
    assert.equal(await page.locator('tbody tr').count(), 4);
    await page.locator('tbody tr').first().getByRole('button', {name: '详情', exact:true}).click();
    await page.getByText('/qa/QA-1.mp4', { exact: true }).waitFor();
    assert.equal(await page.locator('.sc-logic-error').count(), 0);
});

test('library path editing, scan, information check and deletion use confirmed writes', async t => {
    let state;
    const page = await openApp(t, 1440, async p => { state = await libraryFixture(p); });
    await navigate(page, '影视库');
    await page.getByRole('button', { name: '路径配置', exact: true }).click();
    await page.getByRole('textbox', { name: '路径', exact: true }).fill('/qa-changed');
    await page.getByRole('button', { name: '保存路径配置', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('input[aria-label="路径"]'));
    assert.ok(state.requests.some(r => r.method === 'PUT' && r.body.directories[0] === '/qa-changed'));
    await page.getByRole('button', { name: '扫描入库', exact: true }).click();
    await approve(page, '开始扫描');
    await page.waitForResponse(r => r.url().includes('/scan/jobs/qa-scan'));
    await page.locator('tbody tr').first().getByRole('button', { name: '详情' }).click();
    await page.getByRole('button', { name: '移除记录', exact: true }).click();
    await approve(page, '取消');
    assert.equal(state.requests.filter(r => r.method === 'DELETE').length, 0);
    await page.getByRole('button', { name: '移除记录', exact: true }).click();
    await approve(page, '移除记录');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    assert.equal(state.records.length, 3);
});

test('server cache: independent browsers reuse metadata and share retention settings', async t => {
    let sourceCalls = 0;
    const upstream = http.createServer((request, response) => {
        if (request.url === '/QA-SHARED') {
            sourceCalls++;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(`<div class="container"><h3>QA-SHARED 缓存验证影片</h3><div class="movie"><a class="bigImage"><img src="/cover.svg"></a><div class="info">
                <p><span class="header">製作商:</span><a href="/studio/qa">共享制作商</a></p>
                <p><span class="genre" onmouseover="star"><a href="/star/qa">共享演员</a></span></p>
                </div></div></div><script>var gid = 123; var uc = 0;</script>`);
        } else {
            response.setHeader('Content-Type', 'image/svg+xml');
            response.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#405c7a"/><path d="M0 200V150L90 70L190 180L260 110L300 150V200" fill="#233348"/></svg>');
        }
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const settingsURL = baseURL + '/api/system/settings', cacheURL = baseURL + '/api/metadata-cache';
    const original = (await (await fetch(settingsURL)).json()).javbus;
    const put = (url, body) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    t.after(async () => {
        await put(settingsURL, { javbus: original });
        await put(cacheURL, { mode: 'days', days: 30, mb: 5 });
        await new Promise(resolve => upstream.close(resolve));
    });
    assert.ok((await put(settingsURL, { javbus: { base_url: `http://127.0.0.1:${upstream.address().port}`, proxy: '', request_interval_seconds: 0 } })).ok);
    const setup = async p => {
        await p.route('**/api/movies/search-jobs', route => route.continue());
        await p.route('**/api/magnets/**', route => route.fulfill({ json: [] }));
        await p.route('**/api/metadata-cache', route => route.continue());
    };
    const first = await openApp(t, 1440, setup);
    const query = async page => {
        await navigate(page, '影片检索');
        await field(page, '番号').fill('QA-SHARED');
        await page.getByRole('button', { name: '查询番号', exact: true }).click();
        await page.getByText('共享演员', { exact: true }).waitFor();
        await page.locator('main').getByRole('button', { name: '详情', exact: true }).click();
        await page.locator('.jj-drawer').getByText('共享制作商', { exact: true }).waitFor();
        await page.locator('.jj-drawer').getByRole('button', { name: '关闭', exact: true }).click();
    };
    const cacheTab = async page => {
        await navigate(page, '设置');
        await page.locator('aside').getByRole('button', { name: '缓存', exact: true }).click();
        await field(page, '缓存清理方式').waitFor();
    };
    await query(first);
    await cacheTab(first);
    await field(first, '最多缓存天数').fill('7');
    await first.getByRole('button', { name: '保存', exact: true }).click();
    await first.getByText('设置已保存', { exact: true }).waitFor();
    const second = await openApp(t, 1440, setup);
    await query(second);
    assert.equal(sourceCalls, 1, 'a new browser with no local storage must reuse the server cache');
    for (const page of [first, second]) {
        assert.equal(await page.evaluate(() => localStorage.getItem('javjaeger.movieMetadata.v1')), null);
        assert.equal(await page.evaluate(() => localStorage.getItem('javjaeger.movieCacheSettings.v1')), null);
    }
    await cacheTab(second);
    assert.equal(await field(second, '最多缓存天数').inputValue(), '7');
    await field(second, '缓存清理方式').selectOption({ label: '按占用空间' });
    await field(second, '最多占用空间（MB）').fill('1');
    await second.getByRole('button', { name: '保存', exact: true }).click();
    await second.getByText('设置已保存', { exact: true }).waitFor();
    await first.getByRole('button', { name: '重新载入', exact: true }).click();
    await first.getByText('配置已重新载入', { exact: true }).waitFor();
    assert.equal(await field(first, '缓存清理方式').inputValue(), '按占用空间');
    assert.equal(await field(first, '最多占用空间（MB）').inputValue(), '1');
    const disk = path.join(scratch, 'data/movie_metadata_cache.json');
    assert.equal(JSON.parse(fs.readFileSync(disk, 'utf8')).version, 2);
    const entries = fs.readdirSync(disk + '.entries').filter(name => name.endsWith('.json')).map(name => path.join(disk + '.entries', name));
    const actualBytes = fs.statSync(disk).size + entries.reduce((sum, entry) => sum + fs.statSync(entry).size, 0);
    assert.ok(actualBytes <= 1024 ** 2);
    assert.equal((await (await fetch(cacheURL)).json()).size_bytes, actualBytes);
    assert.ok(entries.some(entry => fs.readFileSync(entry, 'utf8').includes('共享演员')));
    await first.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-server-cache-desktop.png'), animations: 'disabled' });
    await field(second, '最多占用空间（MB）').fill('0');
    await second.getByRole('button', { name: '保存', exact: true }).click();
    await second.getByText(/正整数/).waitFor();
    await second.getByRole('button', { name: '重置改动', exact: true }).click();
    assert.equal(await field(second, '最多占用空间（MB）').inputValue(), '1');
    await second.setViewportSize({ width: 390, height: 844 });
    await field(second, '最多占用空间（MB）').scrollIntoViewIfNeeded();
    assert.ok(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await second.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-server-cache-mobile.png'), animations: 'disabled' });
});

test('image cache: covers render across browsers and the separate MB limit persists and prunes', async t => {
    const cover = 'https://www.javbus.com/qa-cache/shared-cover.svg';
    const setup = async p => {
        await backgroundRoute(p, '/api/movies/search-jobs', 'search', body => searchSnapshot(body, body.movies, { magnets: false }));
        await p.route('**/api/movies/QA-IMAGE', route => route.fulfill({ json: { ...movie('QA-IMAGE'), img: cover } }));
        await p.route('**/api/magnets/**', route => route.fulfill({ json: [] }));
        await p.route('**/api/image-cache', route => route.continue());
    };
    const first = await openApp(t, 1440, setup);
    const showCover = async page => {
        await navigate(page, '影片检索');
        await field(page, '番号').fill('QA-IMAGE');
        const loaded = page.waitForResponse(response => response.url().includes('/api/image-proxy?'));
        await page.getByRole('button', { name: '查询番号', exact: true }).click();
        assert.equal((await loaded).status(), 200, 'the real backend serves the disk-cached cover');
        await page.waitForFunction(() => document.querySelector('main img')?.naturalWidth === 300);
        await page.locator('label').filter({ has: page.locator('input[name="jj-view"]') }).filter({ hasText: '列表' }).click();
        await page.waitForFunction(() => document.querySelector('tbody img')?.naturalWidth === 300);
        await page.locator('main').getByRole('button', { name: '详情', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.jj-drawer img')?.naturalWidth === 300);
        await page.locator('.jj-drawer').getByRole('button', { name: '关闭', exact: true }).click();
    };
    await showCover(first);
    const second = await openApp(t, 1440, setup);
    await showCover(second);
    await navigate(second, '设置');
    await second.locator('aside').getByRole('button', { name: '图片缓存', exact: true }).click();
    await field(second, '图片缓存上限（MB）').waitFor();
    assert.equal(await field(second, '图片缓存上限（MB）').inputValue(), '256');
    const before = await (await fetch(baseURL + '/api/metadata-cache')).json();
    await field(second, '图片缓存上限（MB）').fill('1');
    await second.getByRole('button', { name: '保存', exact: true }).click();
    await second.getByText('设置已保存', { exact: true }).waitFor();
    const images = await (await fetch(baseURL + '/api/image-cache')).json();
    assert.equal(images.settings.mb, 1);
    assert.equal(images.count, 2);
    assert.ok(images.size_bytes <= 1024 ** 2);
    assert.deepEqual(await (await fetch(baseURL + '/api/metadata-cache')).json(), before, 'image quota never consumes metadata quota');
    await navigate(first, '设置');
    await first.locator('aside').getByRole('button', { name: '图片缓存', exact: true }).click();
    await field(first, '图片缓存上限（MB）').waitFor();
    assert.equal(await field(first, '图片缓存上限（MB）').inputValue(), '1');
    await field(first, '图片缓存上限（MB）').fill('2');
    await first.getByRole('button', { name: '重置改动', exact: true }).click();
    assert.equal(await field(first, '图片缓存上限（MB）').inputValue(), '1');
    await first.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-image-cache-desktop.png'), animations: 'disabled' });
    await field(first, '图片缓存上限（MB）').fill('0');
    await first.getByRole('button', { name: '保存', exact: true }).click();
    await first.getByText(/正整数/).waitFor();
    await first.getByRole('button', { name: '重置改动', exact: true }).click();
    await first.setViewportSize({ width: 390, height: 844 });
    await field(first, '图片缓存上限（MB）').scrollIntoViewIfNeeded();
    assert.ok(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await first.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-image-cache-mobile.png'), animations: 'disabled' });
});

test('settings: both media directories can be browsed, saved, reset and restored', async t => {
    const root = fs.realpathSync(scratch);
    const [oldSource, oldTarget, source, target, archive] = ['settings-old-inbox', 'settings-old-library', 'settings-inbox', 'settings-library', 'settings-archive'].map(name => path.join(root, name));
    for (const dir of [oldSource, oldTarget, source, target, archive]) fs.mkdirSync(dir);
    const endpoint = baseURL + '/api/movies/local-library/settings';
    const previous = await (await fetch(endpoint)).json();
    const put = values => fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    t.after(() => put(previous));
    await put({ source_directory: oldSource, directories: [oldTarget, archive], ignored_paths: ['skip'] });
    const page = await openApp(t, 1440, p => p.route('**/api/movies/local-library/settings', route => route.continue()));
    await navigate(page, '设置');
    await page.locator('aside').getByRole('button', { name: '媒体目录', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '待刮削目录', exact: true }).inputValue(), oldSource);
    for (const [label, value] of [['待刮削目录', source], ['影视库目录', target]]) {
        await page.getByRole('textbox', { name: label, exact: true }).fill(value);
        await page.getByRole('button', { name: '浏览' + label, exact: true }).click();
        await page.getByRole('button', { name: '使用该目录', exact: true }).click();
        assert.equal(await page.getByRole('textbox', { name: label, exact: true }).inputValue(), value);
    }
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('设置已保存', { exact: true }).waitFor();
    const saved = await (await fetch(endpoint)).json();
    assert.equal(saved.source_directory, source);
    assert.deepEqual(saved.directories, [target, archive]);
    assert.deepEqual(saved.ignored_paths, ['skip']);
    await navigate(page, '影视库');
    await page.locator('.jj-library-sidebar').getByText(target, { exact: true }).waitFor();
    await page.getByRole('button', { name: '前往本地刮削', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '待刮削目录', exact: true }).inputValue(), source);
    assert.equal(await page.getByRole('textbox', { name: '影视库目录', exact: true }).inputValue(), target);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '设置');
    await page.locator('aside').getByRole('button', { name: '媒体目录', exact: true }).click();
    await page.getByRole('textbox', { name: '待刮削目录', exact: true }).fill('/discarded');
    await page.getByRole('button', { name: '重置改动', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '待刮削目录', exact: true }).inputValue(), source);
    assert.equal(await page.getByRole('textbox', { name: '影视库目录', exact: true }).inputValue(), target);
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-settings-paths-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: '影视库目录', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-settings-paths-mobile.png'), fullPage: false });
});

test('library workflow: saved incoming and library directories survive reload and drive scraping', async t => {
    const incoming = path.join(fs.realpathSync(scratch), 'path-workflow-incoming'), library = path.join(fs.realpathSync(scratch), 'path-workflow-library');
    fs.mkdirSync(incoming); fs.mkdirSync(library);
    const source = path.join(incoming, 'QA-987.mp4'); fs.writeFileSync(source, 'test video');
    const endpoint = baseURL + '/api/movies/local-library/settings';
    const previous = await (await fetch(endpoint)).json();
    t.after(async () => { await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(previous) }); });
    await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_directory: '', directories: [], ignored_paths: [] }) });
    const page = await openApp(t, 1440, async p => {
        for (const pattern of ['**/api/movies/local-library**', '**/api/movies/local-scrape/**']) await p.route(pattern, route => route.continue());
    });
    await navigate(page, '影视库');
    await page.getByRole('button', { name: '路径配置', exact: true }).click();
    await page.getByRole('textbox', { name: '待刮削目录', exact: true }).fill(incoming);
    await page.locator('.jj-drawer').getByRole('button', { name: '浏览', exact: true }).click();
    await page.getByRole('button', { name: '使用该目录', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '待刮削目录', exact: true }).inputValue(), incoming);
    await page.locator('.jj-drawer').getByRole('button', { name: '添加', exact: true }).first().click();
    await page.getByRole('textbox', { name: '路径', exact: true }).fill(library);
    await page.getByRole('button', { name: '保存路径配置', exact: true }).click();
    await page.getByText('路径配置已保存', { exact: true }).waitFor();
    await page.getByRole('button', { name: '路径配置', exact: true }).click();
    await page.getByRole('textbox', { name: '路径', exact: true }).fill('/discarded-library');
    await page.locator('.jj-drawer').getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.jj-library-sidebar').getByText(library, { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '本地刮削');
    assert.equal(await field(page, '待刮削目录').inputValue(), incoming);
    assert.equal(await field(page, '影视库目录').inputValue(), library);
    await page.locator('label').filter({ hasText: /^联网刮削元数据/ }).getByRole('checkbox').uncheck();
    await field(page, '文件夹命名规则').fill('{code}');
    await page.locator('.field').filter({ has: page.locator('label').filter({ hasText: /^文件命名规则/ }) }).locator('input').fill('{code}');
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.getByText(path.join(library, 'QA-987', 'QA-987.mp4'), { exact: true }).waitFor();
    assert.ok(fs.existsSync(source), 'preview must preserve the incoming file');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-two-path-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: /^确认执行/ }).click(); await approve(page, '开始执行');
    await page.getByRole('heading', { name: /执行结果 · 1 成功/ }).waitFor();
    assert.ok(!fs.existsSync(source));
    assert.ok(fs.existsSync(path.join(library, 'QA-987', 'QA-987.mp4')));
    const records = await (await page.request.get(baseURL + '/api/movies/local-library')).json();
    assert.ok(records.records.some(record => record.movie_id === 'QA-987' && record.files[0].path.startsWith(library)));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '配置默认目录', exact: true }).click();
    await page.getByRole('heading', { name: '媒体目录配置', exact: true }).waitFor();
    await page.locator('.jj-drawer').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    assert.notEqual(await page.locator('.jj-drawer').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-two-path-mobile.png'), fullPage: false });
    await page.request.delete(baseURL + '/api/movies/local-library/QA-987');
});

test('settings connect PikPak with session-only secrets, dispatch and show write failures', async t => {
    const writes = []; let fail = true;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/pikpak/login', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true } }); });
        await backgroundRoute(p, '/api/automation/dispatch-jobs', body => 'dispatch-' + body.tool, body => {
            writes.push(body); return { success: true, tool: body.tool, results: [{ movie_id: 'QA-001', success: true }] };
        });
        await p.route('**/api/automation/dispatch-jobs', route => fail
            ? route.fulfill({ status: 500, json: { password: 'never-echo-response-secret' } }) : route.fallback());
    });
    await navigate(page, '设置');
    await page.locator('aside').getByRole('button', { name: /^PikPak/ }).click();
    await page.getByRole('textbox', { name: '用户名', exact: true }).fill('qa@example.invalid');
    await page.locator('input[aria-label="密码"]').fill('qa-session-secret');
    assert.equal(await page.locator('input[aria-label="密码"]').getAttribute('type'), 'password');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await page.getByRole('button', { name: '退出登录', exact: true }).waitFor();
    const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
    assert.doesNotMatch(storage.local, /qa-session-secret/); assert.match(storage.session, /qa-session-secret/);
    await navigate(page, '下载派发');
    await page.locator('textarea').fill('QA-001');
    await page.getByRole('button', { name: /^派发 [0-9]+ 个番号$/ }).click();
    await approve(page, '开始派发');
    await page.getByText('请求失败（HTTP 500）', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /never-echo-response-secret|下载任务已提交/);
    fail = false;
    await page.getByRole('button', { name: /^派发 [0-9]+ 个番号$/ }).click(); await approve(page, '开始派发');
    await page.getByText('下载任务已提交', { exact: true }).waitFor();
    assert.equal(writes.filter(body => body.tool === 'pikpak').length, 1);
});

test('automation creates, edits four nodes, saves, runs and deletes real tasks', async t => {
    let saved = null; const writes = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/automation/tasks**', async route => {
            const r = route.request(), url = new URL(r.url());
            if (r.method() !== 'GET') writes.push([r.method(), url.pathname, r.postDataJSON()]);
            if (r.method() === 'DELETE') saved = null;
            else if (['POST', 'PUT'].includes(r.method()) && !url.pathname.endsWith('/run')) saved = { ...r.postDataJSON(), id: 'qa-task', runs: [] };
            return route.fulfill({ json: r.method() === 'GET' ? { tasks: saved ? [saved] : [] } : saved || { success: true } });
        });
    });
    await navigate(page, '自动模式');
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await page.getByRole('textbox', { name: '任务名称', exact: true }).fill('QA 自动任务');
    await page.getByRole('combobox', { name: '检索方式', exact: true }).selectOption('codes');
    await page.getByRole('textbox', { name: '番号列表', exact: true }).fill('QA-001');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('自动任务已保存', { exact: true }).waitFor();
    assert.equal(saved.name, 'QA 自动任务');
    assert.equal(saved.nodes.find(n => n.type === 'search').config.codes, 'QA-001');
    assert.equal(saved.nodes.length, 4);
    await page.getByRole('button', { name: '立即运行一次', exact: true }).click(); await approve(page, '立即运行');
    await page.getByText('运行已提交', { exact: true }).waitFor();
    assert.ok(writes.some(r => r[1].endsWith('/qa-task/run')));
    await page.getByRole('button', { name: '删除任务', exact: true }).click(); await approve(page, '删除任务');
    await page.getByText('任务已删除', { exact: true }).waitFor(); assert.equal(saved, null);
});

test('WebDAV file navigation, filtering, dispatch and Aria2 pause/resume/remove use session APIs', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/webdav/download/jobs', 'file-dispatch', body => { calls.push(['POST', '/api/webdav/download/jobs', body]); return { success: true, message: '已发送到 Aria2', results: [{ filename: 'QA.mp4', success: true }] }; });
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: true, aria2_connected: true } }));
        await p.route('**/api/webdav/files?*', r => r.fulfill({ json: { success: true, files: [{ name: 'folder', path: '/folder', is_directory: true }, { name: 'QA.mp4', path: '/QA.mp4', size: 1024 ** 3, is_directory: false }] } }));
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { success: true, downloads: [{ gid: 'qa-gid', name: 'QA-download', status: 'active', totalLength: 100, completedLength: 50, downloadSpeed: 10 }] } }));
        for (const url of ['**/api/aria2/pause/*', '**/api/aria2/resume/*', '**/api/aria2/remove/*']) await p.route(url, r => { calls.push([r.request().method(), new URL(r.request().url()).pathname, r.request().postDataJSON()]); return r.fulfill({ json: { success: true, results: [{ success: true }] } }); });
    });
    await navigate(page, '网盘与下载');
    await page.locator('aside').getByText('WebDAV', { exact: true }).click();
    await page.getByText('QA.mp4', { exact: true }).waitFor();
    const row = page.locator('tr').filter({ hasText: 'QA.mp4' });
    await row.getByRole('checkbox').check();
    await page.getByRole('button', { name: '发送到 Aria2', exact: true }).click(); await approve(page, '发送');
    await page.getByText('已发送到 Aria2', { exact: true }).waitFor();
    assert.equal(calls[0][2].files[0].path, '/QA.mp4'); assert.equal(calls[0][2].files[0].source_type, 'webdav');
    const task = page.locator('tr').filter({ hasText: 'QA-download' });
    await task.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByText('下载任务已更新', { exact: true }).waitFor();
    assert.ok(calls.some(c => c[1].endsWith('/pause/qa-gid')));
    await task.getByRole('button', { name: '删除', exact: true }).click(); await approve(page, '删除');
    await page.getByText('下载任务已更新', { exact: true }).waitFor();
    assert.ok(calls.some(c => c[0] === 'DELETE'));
});

test('storage folders stay selectable with custom MB and GB minimums on desktop and mobile', async t => {
    const sent = [];
    const entries = [
        { name: '递归目录', path: '/folder', is_directory: true, size: 0 },
        { name: 'tiny.mp4', path: '/tiny', size: 100 * 1024 ** 2 },
        { name: 'medium.mp4', path: '/medium', size: 700 * 1024 ** 2 },
        { name: 'large.mkv', path: '/large', size: 2 * 1024 ** 3 },
        { name: 'large.txt', path: '/text', size: 3 * 1024 ** 3 },
    ];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', route => route.fulfill({ json: { webdav_connected: true, aria2_connected: true } }));
        await p.route('**/api/115/status', route => route.fulfill({ json: { connected: true } }));
        await p.route('**/api/webdav/files?*', route => route.fulfill({ json: { files: entries } }));
        await p.route('**/api/115/files?*', route => route.fulfill({ json: { count: entries.length, items: entries.map(item => ({ ...item, id: item.path, kind: item.is_directory ? 'folder' : 'file' })) } }));
        await p.route('**/api/aria2/downloads', route => route.fulfill({ json: { downloads: [] } }));
        await backgroundRoute(p, '/api/webdav/download/jobs', 'file-dispatch', body => { sent.push(body); return { success: true, message: '后台目录筛选完成', results: [] }; });
    });
    await navigate(page, '网盘与下载');
    await page.locator('aside').getByText('WebDAV', { exact: true }).click();
    const minimum = page.getByRole('spinbutton', { name: '最小体积', exact: true });
    const unit = page.getByRole('combobox', { name: '体积单位', exact: true });
    await page.getByRole('checkbox', { name: '仅显示视频文件', exact: true }).check();
    await minimum.fill('512');
    await page.getByText('medium.mp4', { exact: true }).waitFor();
    assert.equal(await page.getByText('tiny.mp4', { exact: true }).count(), 0);
    assert.equal(await page.getByText('large.txt', { exact: true }).count(), 0);
    await unit.selectOption('GB'); await minimum.fill('1.5');
    await page.getByText('large.mkv', { exact: true }).waitFor();
    assert.equal(await page.getByText('medium.mp4', { exact: true }).count(), 0);
    const folder = page.locator('tr').filter({ hasText: '递归目录' });
    await folder.getByRole('checkbox').check();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-custom-file-size-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '发送到 Aria2', exact: true }).click();
    await page.getByRole('dialog').getByText(/文件夹会递归查找全部子目录/).waitFor();
    const first = page.waitForResponse(response => response.url().endsWith('/api/webdav/download/jobs'));
    await approve(page, '发送'); await first;
    assert.equal(sent[0].min_file_size_mb, 1536);
    assert.equal(sent[0].video_filter, true); assert.equal(sent[0].files[0].is_directory, true);
    assert.equal(sent[0].files[0].source_type, 'webdav');
    await page.locator('aside').getByText('115 网盘', { exact: true }).click();
    await unit.selectOption('MB'); await minimum.fill('256.5');
    await folder.getByRole('checkbox').check();
    await page.getByRole('button', { name: '发送到 Aria2', exact: true }).click();
    const second = page.waitForResponse(response => response.url().endsWith('/api/webdav/download/jobs'));
    await approve(page, '发送'); await second;
    assert.equal(sent[1].min_file_size_mb, 256.5);
    assert.equal(sent[1].files[0].source_type, 'pan115'); assert.equal(sent[1].files[0].is_directory, true);
    await folder.getByRole('checkbox').check(); await minimum.fill('-1');
    await page.getByRole('alert').getByText(/最小体积/).waitFor();
    assert.equal(await page.getByRole('button', { name: '发送到 Aria2', exact: true }).isDisabled(), true);
    await minimum.fill('1.5'); await unit.selectOption('GB');
    await page.setViewportSize({ width: 390, height: 844 });
    await minimum.scrollIntoViewIfNeeded();
    const inputBounds = await minimum.boundingBox(), unitBounds = await unit.boundingBox();
    assert.ok(inputBounds.x >= 0 && unitBounds.x + unitBounds.width <= 390);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-custom-file-size-mobile.png'), animations: 'disabled' });
});

test('scrape preview handles real conflicts, persists templates and submits chosen resolution', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies/local-scrape/**', route => {
            const r = route.request(), url = new URL(r.url());
            if (r.method() === 'POST') { calls.push([url.pathname, r.postDataJSON()]); return route.fulfill({ json: { success: true, task_id: url.pathname.includes('preview') ? 'qa-preview' : 'qa-apply' } }); }
            return route.fulfill({ json: { status: 'success', result: { success: true, total_files: 1, items: [{ source_path: '/qa/QA-001.mkv', code: 'QA-001', scrape_status: 'found', metadata: { id: 'QA-001', title: 'QA' }, target_video_path: '/target/QA-001.mkv', target_exists: true, source_file: { path: '/qa/QA-001.mkv', size: 2048, height: 1080 }, target_file: { path: '/target/QA-001.mkv', size: 1024, height: 720 } }] } } });
        });
    });
    await navigate(page, '本地刮削');
    await field(page, '待刮削目录').fill('/qa'); await field(page, '影视库目录').fill('/target');
    await page.getByRole('button', { name: '另存为', exact: true }).click();
    assert.match(await page.evaluate(() => localStorage.getItem('localScrapeTaskTemplates')), /\/qa/);
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.getByText('/target/QA-001.mkv', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await page.locator('header').getByRole('button', { name: /后台/ }).click();
    await page.getByRole('dialog', { name: '后台任务', exact: true }).getByRole('button', { name: '查看', exact: true }).click();
    await page.getByRole('dialog', { name: '任务日志', exact: true }).getByRole('button', { name: '查看结果', exact: true }).click();
    await page.getByText('/target/QA-001.mkv', { exact: true }).waitFor();
    await page.getByRole('button', { name: '对比源文件', exact: true }).click();
    await page.getByRole('button', { name: '保留此文件', exact: true }).first().click();
    await page.getByRole('button', { name: /^确认执行/ }).click(); await approve(page, '开始执行');
    await page.getByText('刮削执行已启动', { exact: true }).waitFor();
    assert.equal(calls.at(-1)[1].items[0].conflict_resolution, 'keep_target');
});

test('115 QR login uses actual image and waits for confirmed status', async t => {
    let logged = false, polled = 0;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/115/status', r => r.fulfill({ json: { connected: logged, configured: logged } }));
        await p.route('**/api/115/qrcode/start', r => r.fulfill({ json: { success: true, session_id: 'qa-qr', qrcode_image_url: '/static/logo.jpg', status: 0 } }));
        await p.route('**/api/115/qrcode/qa-qr/status', r => { polled++; logged = true; return r.fulfill({ json: { status: 2, state: 'allowed', configured: true } }); });
    });
    await navigate(page, '设置'); await page.locator('aside').getByRole('button', { name: /^115 网盘/ }).click();
    await page.getByRole('button', { name: '扫码登录', exact: true }).click();
    await page.getByRole('img', { name: '115 登录二维码' }).waitFor();
    await page.getByText('115 扫码登录成功', { exact: true }).waitFor();
    assert.ok(polled > 0);
});

test('theme persists and all pages remain reachable at mobile width', async t => {
    const page = await openApp(t, 390, libraryFixture);
    for (const name of ['影片检索', '下载派发', '本地刮削', '影视库', '自动模式', '转码', '网盘与下载', '设置']) {
        await navigate(page, name);
        assert.equal(await page.locator('.sc-logic-error').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name);
    }
    await page.locator('aside').getByRole('button', { name: /^外观/ }).click();
    await page.getByText('浅色', { exact: true }).click();
    assert.equal(await page.locator('[data-jjtheme]').getAttribute('data-jjtheme'), 'light');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-jjtheme]').getAttribute('data-jjtheme'), 'light');
    const exit = await page.getByRole('button', { name: '管理界面', exact: true }).boundingBox();
    assert.ok(exit && exit.x >= 0 && exit.x + exit.width <= 390, 'cinema exit stays inside the mobile viewport');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-design-mobile.png'), fullPage: true });
});

async function sampleVideo(page) {
    return page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144;
        const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
        const frames = setInterval(() => { ctx.fillStyle = '#232532'; ctx.fillRect(0, 0, 256, 144); }, 100);
        await new Promise(resolve => setTimeout(resolve, 1200)); recorder.stop(); await stopped; clearInterval(frames); stream.getTracks().forEach(track => track.stop());
        return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
}

test('indexed file playback uses the real selected-file endpoint and native video controls', async t => {
    const page = await openApp(t, 1440, libraryFixture);
    const bytes = await sampleVideo(page);
    await page.route('**/api/movies/local-library/*/play?file_index=0', r => r.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
    await navigate(page, '影视库');
    await page.locator('tbody tr').first().getByRole('button', { name: '详情', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    const video = page.locator('video'); await video.waitFor(); await video.evaluate(e => e.play());
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    assert.equal(await video.evaluate(e => e.controls && e.error === null), true);
    await page.getByRole('button', { name: '停止播放', exact: true }).click(); assert.equal(await video.count(), 0);
});

test('local subtitles render in cinema and library, toggle without restarting video and follow selected files', async t => {
    const token = '0123456789abcdef01234567';
    const page = await openApp(t, 1440, async p => {
        const state = await libraryFixture(p, 1);
        state.records[0].files.push({ path: '/qa/QA-001-CD2.mp4', exists: true });
        await p.route('**/api/movies/local-library/QA-001/subtitles?*', route => route.fulfill({ json: { subtitles: new URL(route.request().url()).searchParams.get('file_index') === '0' ? [{ id: token, language: 'zh-Hans', label: '简体中文', default: true }] : [] } }));
        await p.route(`**/api/movies/local-library/QA-001/subtitles/${token}?*`, route => route.fulfill({ contentType: 'text/vtt; charset=utf-8', body: 'WEBVTT\n\n00:00:00.000 --> 00:01:00.000\n字幕显示测试\n' }));
    });
    const bytes = await sampleVideo(page);
    await page.route('**/api/movies/local-library/QA-001/play?*', route => route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    await navigate(page, '影院模式');
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    await page.locator('.jj-cinema-wall .jj-cinema-card').first().click();
    await page.getByRole('button', { name: '播放所选文件', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '本地影片播放', exact: true });
    const video = dialog.locator('video');
    const selector = dialog.getByRole('combobox', { name: '字幕', exact: true });
    await page.waitForFunction(() => document.querySelector('.jj-player video')?.textTracks[0]?.activeCues?.[0]?.text === '字幕显示测试');
    assert.equal(await selector.inputValue(), token);
    assert.equal(await video.locator('track').getAttribute('srclang'), 'zh-Hans');
    await video.evaluate(node => { node.pause(); window.qaSubtitleVideo = node; window.qaSubtitlePosition = node.currentTime; });
    await selector.selectOption('');
    assert.equal(await video.evaluate(node => node.textTracks[0].mode), 'disabled');
    await selector.selectOption(token);
    assert.equal(await video.evaluate(node => node.textTracks[0].mode), 'showing');
    assert.equal(await video.evaluate(node => node === window.qaSubtitleVideo && node.currentTime === window.qaSubtitlePosition && node.paused), true);
    await dialog.locator('.jj-subtitle-settings summary').click();
    const font = dialog.getByRole('combobox', { name: '字幕字体', exact: true });
    const fontSize = dialog.getByRole('combobox', { name: '字幕字号', exact: true });
    const bottom = dialog.getByRole('combobox', { name: '字幕底部留白', exact: true });
    assert.equal(await font.inputValue(), 'sans');
    assert.equal(await fontSize.inputValue(), 'normal');
    assert.equal(await bottom.inputValue(), '4');
    assert.deepEqual(await video.evaluate(node => { const cue = node.textTracks[0].cues[0]; return [cue.line, cue.lineAlign, cue.snapToLines]; }), [96, 'end', false]);
    await font.selectOption('serif');
    await fontSize.selectOption('huge');
    await bottom.selectOption('12');
    assert.equal(await video.evaluate(node => node.textTracks[0].cues[0].line), 88);
    assert.equal(await video.getAttribute('data-subtitle-font'), 'serif');
    assert.equal(await video.getAttribute('data-subtitle-size'), 'huge');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-subtitle-style-raised.png') });
    await bottom.selectOption('2');
    assert.equal(await video.evaluate(node => node.textTracks[0].cues[0].line), 98);
    assert.equal(await video.evaluate(node => node === window.qaSubtitleVideo && node.currentTime === window.qaSubtitlePosition && node.paused), true, 'appearance changes preserve the video and play position');
    await video.evaluate(node => node.requestFullscreen());
    await page.waitForFunction(() => document.fullscreenElement?.tagName === 'VIDEO');
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-subtitle-style-fullscreen.png') });
    assert.equal(await video.getAttribute('data-subtitle-size'), 'huge');
    await page.evaluate(() => document.exitFullscreen());
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        assert.ok(await selector.isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-subtitles-${width}.png`) });
    }
    await dialog.getByRole('combobox', { name: '播放文件', exact: true }).selectOption('1');
    await dialog.getByText('无外挂字幕', { exact: true }).waitFor();
    assert.equal(await video.locator('track').count(), 0);
    assert.equal(await selector.inputValue(), '');
    await dialog.getByRole('button', { name: '停止播放', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '影视库');
    await page.locator('tbody tr').first().getByRole('button', { name: '详情', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector('.jj-player video')?.textTracks[0]?.activeCues?.[0]?.text === '字幕显示测试');
    await dialog.locator('.jj-subtitle-settings summary').click();
    assert.equal(await font.inputValue(), 'serif');
    assert.equal(await fontSize.inputValue(), 'huge');
    assert.equal(await bottom.inputValue(), '2');
    assert.equal(await video.evaluate(node => node.textTracks[0].cues[0].line), 98);
    await page.getByRole('button', { name: '停止播放', exact: true }).click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '全部影片', exact: true }).click();
    await page.locator('.jj-cinema-wall .jj-cinema-card').first().click();
    await page.getByRole('button', { name: '播放所选文件', exact: true }).click();
    await dialog.locator('.jj-subtitle-settings summary').click();
    assert.equal(await fontSize.inputValue(), 'huge');
    assert.equal(await bottom.inputValue(), '2');
    await dialog.getByRole('button', { name: '恢复默认', exact: true }).click();
    assert.equal(await font.inputValue(), 'sans');
    assert.equal(await fontSize.inputValue(), 'normal');
    assert.equal(await bottom.inputValue(), '4');
    await page.getByRole('button', { name: '停止播放', exact: true }).click();
    assert.deepEqual(consoleErrors, []);
});

test('transcode selected file, task cancel/retry/delete and failed capability refresh', async t => {
    const writes = []; let queue = [], failCaps = false;
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/transcoding/presets', r => failCaps ? r.fulfill({ status: 503, json: {} }) : r.fulfill({ json: { success: true, gpu_available: true, ffmpeg_available: true, ffprobe_available: true, available_encoders: ['hevc_nvenc'], presets: [{ id: 'adaptive_h265', name: 'QA 自适应', adaptive: true, available: true, options: { video_codec: 'hevc_nvenc' } }] } }));
        await p.route('**/api/movies/transcoding/tasks**', r => {
            const request = r.request(), pathname = new URL(request.url()).pathname;
            if (request.method() !== 'GET') writes.push([request.method(), pathname, request.postDataJSON()]);
            if (request.method() === 'DELETE') queue = [];
            else if (pathname.endsWith('/cancel')) queue[0].status = 'cancelled';
            else if (pathname.endsWith('/retry')) queue[0].status = 'queued';
            else if (request.method() === 'POST') queue = [{ ...request.postDataJSON(), id: 'qa-tc', movie_title: 'QA', status: 'queued', progress: 0, options: { video_codec: 'hevc_nvenc' } }];
            return r.fulfill({ json: { success: true, tasks: queue } });
        });
    });
    await navigate(page, '影视库'); await page.locator('tbody tr').first().getByRole('button', { name: '详情' }).click();
    await page.getByRole('button', { name: '转码', exact: true }).last().click();
    await page.getByRole('button', { name: '加入队列', exact: true }).click();
    await page.getByText('转码任务已创建', { exact: true }).waitFor();
    assert.equal(writes[0][2].file_index, 0); assert.equal(writes[0][2].movie_id, 'QA-001');
    await page.locator('tbody tr').first().getByRole('button', { name: '取消', exact: true }).click(); await approve(page, '取消任务');
    await page.getByText('已取消', { exact: true }).waitFor();
    await page.locator('tbody tr').first().getByRole('button', { name: '重试', exact: true }).click();
    await page.getByText('排队中', { exact: true }).waitFor();
    await page.locator('tbody tr').first().getByRole('button', { name: '取消', exact: true }).click(); await approve(page, '取消任务');
    await page.getByText('已取消', { exact: true }).waitFor(); await page.locator('tbody tr').first().getByRole('button', { name: '删除' }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0);
    failCaps = true;
    await navigate(page, '影视库'); await page.locator('tbody tr').first().getByRole('button', { name: '详情' }).click();
    await page.getByRole('button', { name: '转码', exact: true }).last().click();
    await page.getByText('请求失败（HTTP 503）', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '加入队列', exact: true }).isDisabled(), true);
});

test('audit: every rendered page button has an action and dynamic panels have accurate counts', async t => {
    const page = await openApp(t, 1440, libraryFixture);
    const inventory = [];
    for (const name of ['影片检索', '下载派发', '本地刮削', '影视库', '自动模式', '转码', '网盘与下载', '设置']) {
        await navigate(page, name);
        const controls = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => {
            const key = Object.keys(button).find(key => key.startsWith('__reactProps'));
            return { name: button.textContent.trim() || button.title || button.getAttribute('aria-label'), enabled: !button.disabled, bound: typeof button[key]?.onClick === 'function' };
        }));
        assert.deepEqual(controls.filter(control => control.enabled && !control.bound), [], name);
        assert.doesNotMatch(await page.locator('body').innerText(), /批次 b-20260723|全部 128|未入库 3|3 个文件冲突/);
        inventory.push({ page: name, controls });
    }
    fs.writeFileSync(path.join(os.tmpdir(), 'javjaeger-control-audit.json'), JSON.stringify(inventory, null, 2));
});

test('audit: filter catalogue, source switching, pagination, HTML recognition, selection and reset', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/movies/search-jobs', 'search', body => { calls.push(body); return searchSnapshot(body); });
        await p.route('**/api/movies?*', r => { calls.push(new URL(r.request().url())); return r.fulfill({ json: { movies: [movie()], pagination: { hasNextPage: new URL(r.request().url()).searchParams.get('page') === '1' } } }); });
        await p.route('**/api/movies/all?*', r => { calls.push(new URL(r.request().url())); return r.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/movies/recognize', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/movies/QA-*', r => r.fulfill({ json: movie() }));
        await p.route('**/api/magnets/**', r => { calls.push(new URL(r.request().url())); return r.fulfill({ json: [magnet] }); });
        await p.route('**/static/actors.json', r => r.fulfill({ json: { 'QA': [{ id: 'qa-star', name: '测试演员' }] } }));
    });
    await navigate(page, '影片检索');
    await page.getByRole('button', { name: '标签筛选', exact: true }).click();
    await page.getByRole('button', { name: '浏览筛选目录', exact: true }).click();
    await page.getByText('测试演员', { exact: true }).click();
    await page.getByRole('button', { name: '添加为筛选条件', exact: true }).click();
    await page.getByRole('button', { name: '开始筛选', exact: true }).click();
    await page.getByText('QA 测试影片 QA-001', { exact: true }).waitFor();
    assert.ok(calls.some(url => url.searchParams?.get('filters')?.includes('qa-star')));
    await field(page, '磁力来源').selectOption('YHG007');
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === '下一页' && button.disabled));
    assert.ok(calls.some(url => url.source === 'yhg007'));
    assert.ok(calls.some(url => url.searchParams?.get('page') === '2'));
    await page.getByRole('button', { name: '全选本页', exact: true }).click();
    await page.getByRole('button', { name: '加入自动任务', exact: true }).click();
    await page.getByRole('textbox', { name: '番号列表', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '番号列表', exact: true }).inputValue(), 'QA-001');
    await navigate(page, '影片检索');
    await page.getByRole('button', { name: '影片识别', exact: true }).click();
    await page.locator('textarea').fill('<div id="videothumblist">QA-001</div>');
    await page.getByRole('button', { name: '开始识别', exact: true }).click();
    await page.getByText('QA 测试影片 QA-001', { exact: true }).waitFor();
    assert.ok(calls.some(body => body.html_content?.includes('videothumblist')));
    await page.getByRole('button', { name: '重置', exact: true }).click();
    assert.equal(await page.getByText('QA 测试影片 QA-001', { exact: true }).count(), 0);
});

test('audit: failed batch retry, ignore and history check/clear form a complete workflow', async t => {
    let attempts = 0, cleared = false;
    const page = await openApp(t, 1440, async p => {
        await backgroundRoute(p, '/api/automation/dispatch-jobs', body => 'dispatch-' + body.tool, body => {
            attempts++; return { success: false, tool: body.tool, results: [{ movie_id: 'QA-001', magnet: magnet.link, success: false, message: attempts === 1 ? '测试连接失败' : '测试连接失败（重试）' }] };
        });
        await p.route('**/api/history', r => { if (r.request().method() === 'DELETE') cleared = true; return r.fulfill({ json: r.request().method() === 'GET' ? (cleared ? [] : [{ movie_id: 'QA-001', download_resources: [{ link: magnet.link, source: 'javbus' }] }]) : { success: true } }); });
        await p.route('**/api/history/*/dismiss-failure', r => r.fulfill({ json: { success: true } }));
        await p.route('**/api/history/check-local-library', r => r.fulfill({ json: { success: true, records: [{ movie_id: 'QA-001', needs_reselect: true, in_local_library: false }] } }));
    });
    await navigate(page, '下载派发');
    await page.locator('textarea').fill('QA-001 qa-001');
    await page.getByRole('button', { name: '派发 1 个番号', exact: true }).click(); await approve(page, '开始派发');
    await page.getByText('测试连接失败', { exact: true }).waitFor();
    await page.getByRole('button', { name: '重新派发全部失败', exact: true }).click(); await approve(page, '开始派发');
    await page.getByText('测试连接失败（重试）', { exact: true }).waitFor();
    assert.equal(attempts, 2);
    await page.getByRole('button', { name: '忽略此项', exact: true }).click();
    await page.getByText('已忽略该失败项', { exact: true }).waitFor();
    assert.equal(await page.getByText('上一批派发部分失败', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '核对本地库', exact: true }).click();
    await page.getByText('未入库 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清空历史', exact: true }).click(); await approve(page, '清空');
    await page.getByText('全部 0', { exact: true }).waitFor(); assert.equal(cleared, true);
});

test('audit: actor cards, completeness filters and drawers work on mobile', async t => {
    const page = await openApp(t, 390, libraryFixture);
    await navigate(page, '影视库');
    await page.locator('label').filter({ has: page.locator('input[name="jj-lbv"]') }).filter({ hasText: '演员' }).click();
    await page.locator('.jj-actor-card').click();
    assert.equal(await field(page, '演员').inputValue(), '测试演员');
    await page.locator('label').filter({ has: page.locator('input[name="jj-lbm"]') }).filter({ hasText: '缺资料' }).click();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.locator('tbody tr').getByRole('button', { name: '详情', exact: true }).click();
    const drawer = page.locator('.jj-drawer');
    const bounds = await drawer.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'drawer fits mobile viewport');
    await drawer.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-audit-mobile-drawer.png'), fullPage: false });
    await page.keyboard.press('Escape'); assert.equal(await drawer.count(), 0);
});

test('audit: real backend saves settings, repairs a designation, organizes media, plays it and removes only its index', async t => {
    const input = path.join(scratch, 'audit-inbox'), output = path.join(scratch, 'audit-library');
    fs.mkdirSync(input); fs.mkdirSync(output);
    const page = await openApp(t, 1440, async p => {
        for (const pattern of ['**/api/system/settings', '**/api/movies/local-scrape/**', '**/api/movies/local-library**']) await p.route(pattern, route => route.continue());
    });
    fs.writeFileSync(path.join(input, 'unknown.webm'), Buffer.from(await sampleVideo(page)));
    await navigate(page, '设置');
    await page.locator('aside').getByRole('button', { name: /^JavBus API/ }).click();
    await page.getByRole('spinbutton', { name: '请求超时（秒）', exact: true }).fill('9');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('设置已保存', { exact: true }).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(path.join(scratch, 'config.json'), 'utf8')).javbus.timeout_seconds, 9);
    await navigate(page, '本地刮削');
    await field(page, '待刮削目录').fill(input); await field(page, '影视库目录').fill(output);
    await field(page, '文件夹命名规则').fill('{code}');
    await page.locator('label').filter({ hasText: /^联网刮削元数据/ }).getByRole('checkbox').uncheck();
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.getByRole('button', { name: '手动指定番号', exact: true }).click();
    await page.getByRole('textbox', { name: '正确番号', exact: true }).fill('ABP-123');
    await page.getByRole('button', { name: '重新生成预览', exact: true }).click();
    await page.getByText('可执行', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: /^确认执行/ }).click(); await approve(page, '开始执行');
    await page.getByText('刮削执行完成：1 成功，0 失败', { exact: true }).waitFor();
    assert.equal(fs.existsSync(path.join(input, 'unknown.webm')), false, 'backend moved the actual fixture');
    await navigate(page, '影视库');
    await page.locator('tbody tr').filter({ hasText: 'ABP-123' }).getByRole('button', { name: '详情', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    const video = page.locator('video'); await video.waitFor(); await video.evaluate(el => el.play());
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    assert.equal(await video.evaluate(el => el.error), null);
    await page.getByRole('button', { name: '停止播放', exact: true }).click();
    await page.getByRole('button', { name: '管理界面', exact: true }).click(); await navigate(page, '影视库');
    await page.locator('tbody tr').filter({ hasText: 'ABP-123' }).getByRole('button', { name: '详情', exact: true }).click();
    await page.getByRole('button', { name: '移除记录', exact: true }).click(); await approve(page, '移除记录');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0);
    assert.ok(fs.readdirSync(path.join(output, 'ABP-123')).some(name => name.endsWith('.webm')), 'index removal preserves the real file');
});

test('audit: desktop and mobile page layouts expose their controls without application errors', async t => {
    for (const width of [1440, 390]) {
        const page = await openApp(t, width, libraryFixture);
        for (const [index, name] of ['影片检索', '下载派发', '本地刮削', '影视库', '自动模式', '转码', '网盘与下载', '设置'].entries()) {
            await navigate(page, name);
            if (name === '自动模式') await page.getByRole('button', { name: '新建', exact: true }).click();
            await page.screenshot({ path: path.join(os.tmpdir(), `javjaeger-audit-${width}-${index}.png`), fullPage: true });
            assert.equal(await page.locator('.sc-logic-error').count(), 0, `${name} ${width}`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${width}`);
        }
    }
});

test('audit: refresh restores a running preview and partial execution keeps per-file outcomes', async t => {
    let ready = false;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies/local-scrape/**', r => {
            const url = r.request().url();
            if (r.request().method() === 'POST') return r.fulfill({ json: { task_id: url.includes('preview') ? 'restore-preview' : 'partial-apply' } });
            if (url.includes('partial-apply')) return r.fulfill({ json: { status: 'failed', result: { success: false, success_count: 1, failed_count: 1, results: [{ source_path: '/qa/QA-001.mp4', success: true }, { source_path: '/qa/QA-002.mp4', success: false, error: 'apply_failed' }] } } });
            return r.fulfill({ json: ready ? { status: 'success', result: { success: true, items: [{ source_path: '/qa/QA-001.mp4', code: 'QA-001', scrape_status: 'found', metadata: { id: 'QA-001', title: 'QA' } }] } } : { status: 'running', percent: 20 } });
        });
    });
    await navigate(page, '本地刮削'); await field(page, '待刮削目录').fill('/qa'); await field(page, '影视库目录').fill('/target');
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.waitForFunction(() => sessionStorage.getItem('localScrapeActiveTask'));
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '管理界面', exact: true }).click(); await navigate(page, '本地刮削');
    assert.equal(await field(page, '待刮削目录').inputValue(), '/qa');
    ready = true; await page.getByRole('button', { name: /^确认执行/ }).click(); await approve(page, '开始执行');
    await page.getByRole('heading', { name: '执行结果 · 1 成功，1 失败', exact: true }).waitFor();
    assert.equal(await page.getByText('/qa/QA-002.mp4', { exact: false }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /^确认执行/ }).count(), 0);
});

test('audit: provider fields, order, enablement, tests and reset/save operate on actual settings payloads', async t => {
    let stored = { javbus: { enabled: false }, scrapers: { priority: ['javbus', 'libredmm'], javbus: { enabled: false, uses_shared_config: true }, libredmm: { enabled: false, request_delay: 100 } } };
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/settings', r => { if (r.request().method() === 'PUT') { stored = r.request().postDataJSON(); calls.push(stored); } return r.fulfill({ json: stored }); });
        await backgroundRoute(p, '/api/movies/metadata-scrapers/test/jobs', 'scraper-test', body => { calls.push(body); return { success: true, results: body.providers.map(provider => ({ provider, success: true, duration_ms: 3 })) }; });
        await p.route('**/api/movies/metadata-scrapers/apply-test-results', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true } }); });
    });
    await navigate(page, '设置'); await page.locator('aside').getByRole('button', { name: /^刮削源/ }).click();
    const cards = page.locator('div:has(> .jj-provider-fields)');
    await cards.filter({ hasText: 'libredmm' }).getByRole('spinbutton').fill('200');
    await cards.filter({ hasText: 'libredmm' }).getByRole('button', { name: '启用', exact: true }).click();
    await cards.filter({ hasText: 'libredmm' }).getByRole('button', { name: /上移/ }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click(); await page.getByText('设置已保存', { exact: true }).waitFor();
    assert.equal(stored.scrapers.priority[0], 'libredmm'); assert.equal(stored.scrapers.libredmm.request_delay, 200); assert.equal(stored.scrapers.libredmm.enabled, true);
    await cards.filter({ hasText: 'libredmm' }).getByRole('button', { name: '测试', exact: true }).click();
    await page.getByText('测试成功', { exact: true }).waitFor();
    await page.getByRole('button', { name: /按测试结果/ }).click(); await page.getByText('已按测试结果更新配置', { exact: true }).waitFor();
    assert.ok(calls.some(body => body.results?.[0].provider === 'libredmm'));
    await cards.filter({ hasText: 'libredmm' }).getByRole('spinbutton').fill('300');
    await page.getByRole('button', { name: '重置改动', exact: true }).click();
    assert.equal(await cards.filter({ hasText: 'libredmm' }).getByRole('spinbutton').inputValue(), '200');
});

test('audit: real automation backend saves all four nodes, toggles scheduling and records a no-download run', async t => {
    const page = await openApp(t, 1440, async p => { await p.route('**/api/automation/tasks**', r => r.continue()); });
    await navigate(page, '自动模式'); await page.getByRole('button', { name: '新建', exact: true }).click();
    await page.getByRole('textbox', { name: '任务名称', exact: true }).fill('QA empty workflow');
    await page.getByRole('combobox', { name: '检索方式', exact: true }).selectOption('codes');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await page.getByRole('button', { name: /^01.*触发/ }).click();
    await page.getByRole('combobox', { name: '触发方式', exact: true }).selectOption('scheduled');
    await page.getByRole('textbox', { name: '执行时间 HH:MM', exact: true }).fill('23:59');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await page.getByRole('button', { name: /^03.*磁力/ }).click();
    await page.getByRole('combobox', { name: '磁力来源', exact: true }).selectOption('yhg007');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await page.getByRole('button', { name: /^04.*下载/ }).click();
    await page.getByRole('combobox', { name: '下载工具', exact: true }).selectOption('aria2');
    await page.getByRole('button', { name: '保存节点', exact: true }).click();
    await page.getByRole('button', { name: '启用任务', exact: true }).click(); await page.getByText('任务状态已保存', { exact: true }).waitFor();
    await page.getByText('已启用任务 1 / 1', { exact: false }).waitFor();
    await page.getByRole('checkbox').filter({ visible: true }).click(); await approve(page, '停用全部');
    await page.getByRole('button', { name: '立即运行一次', exact: true }).click(); await approve(page, '立即运行');
    await page.getByText('没有新影片需要下载', { exact: true }).waitFor();
    const tasks = await (await page.request.get(baseURL + '/api/automation/tasks')).json();
    assert.equal(tasks.tasks[0].enabled, false); assert.equal(tasks.tasks[0].runs[0].found_count, 0);
    assert.equal(tasks.tasks[0].runs[0].status, 'noop');
    assert.equal(tasks.tasks[0].nodes.find(n => n.type === 'magnet').config.source, 'yhg007');
    await page.getByRole('button', { name: '删除任务', exact: true }).click(); await approve(page, '删除任务');
    await page.getByText('任务已删除', { exact: true }).waitFor();
});

test('115 directory paging distinguishes this page from all pages and refreshes uncached entries', async t => {
    let entries = Array.from({ length: 245 }, (_, i) => ({ id: String(i), name: `file-${String(i).padStart(3, '0')}.mp4`, kind: i === 0 ? 'folder' : 'file', size: 1024 ** 3, pick_code: 'pick-' + i }));
    const calls = []; let releaseRefresh, secondPageReached;
    const secondPage = new Promise(resolve => { secondPageReached = resolve; });
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: false, aria2_connected: true } }));
        await p.route('**/api/115/status', r => r.fulfill({ json: { connected: true } }));
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { downloads: [] } }));
        await p.route('**/api/115/files?*', async route => {
            const query = new URL(route.request().url()).searchParams, offset = Number(query.get('offset')), refresh = query.get('refresh') === 'true';
            calls.push({ offset, refresh });
            if (refresh && offset === 0) entries = [...entries.slice(0, -1), { id: 'fresh', name: 'fresh.mp4', kind: 'file', size: 1024 ** 3, pick_code: 'fresh-pick' }];
            if (refresh && offset === 200) {
                const wait = new Promise(resolve => { releaseRefresh = resolve; }); secondPageReached(); await wait;
            }
            await route.fulfill({ json: { cid: '0', count: entries.length, items: entries.slice(offset, offset + 200) } });
        });
    });
    await navigate(page, '网盘与下载'); await page.locator('aside').getByText('115 网盘', { exact: true }).click();
    const perPage = page.getByRole('combobox', { name: '网盘每页数量', exact: true });
    const fileTable = page.getByRole('table').filter({ has: page.getByRole('checkbox', { name: '全选本页', exact: true }) });
    await fileTable.getByText('file-000.mp4', { exact: true }).waitFor();
    assert.equal(await fileTable.locator('tbody tr').count(), 60);
    await perPage.selectOption('20'); assert.equal(await fileTable.locator('tbody tr').count(), 20);
    const header = fileTable.getByRole('checkbox', { name: '全选本页', exact: true });
    await header.check(); await page.getByText(/已选 20 个文件/).waitFor();
    const pager = page.getByRole('navigation', { name: '网盘文件分页', exact: true });
    await pager.getByRole('button', { name: '下一页', exact: true }).click(); assert.equal(await header.isChecked(), false);
    await header.check(); await page.getByText(/已选 40 个文件/).waitFor();
    await header.uncheck(); await page.getByText(/已选 20 个文件/).waitFor();
    await pager.getByRole('button', { name: '上一页', exact: true }).click(); assert.equal(await header.isChecked(), true);
    await page.getByRole('button', { name: '全选本目录（245 项）', exact: true }).click();
    await page.getByText(/已选 245 个文件/).waitFor();
    assert.deepEqual(calls, [{ offset: 0, refresh: false }, { offset: 200, refresh: false }]);
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-directory-selection-desktop.png'), animations: 'disabled' });
    const filter = page.getByPlaceholder('关键词 / 番号', { exact: true });
    await filter.fill('file-24'); await page.getByRole('button', { name: '全选本目录（5 项）', exact: true }).click();
    await filter.fill(''); await page.getByText(/已选 5 个文件/).waitFor();
    const refresh = page.getByRole('button', { name: '刷新目录', exact: true });
    await refresh.click(); await secondPage;
    assert.equal(await refresh.isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: '全选本目录（245 项）', exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole('button', { name: '发送到 Aria2', exact: true }).isEnabled(), false);
    releaseRefresh(); await page.getByText(/已选 4 个文件/).waitFor();
    await page.getByText('目录已刷新', { exact: true }).waitFor();
    assert.deepEqual(calls.slice(-2), [{ offset: 0, refresh: true }, { offset: 200, refresh: true }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.jj-file-toolbar').scrollIntoViewIfNeeded();
    await perPage.selectOption('50'); assert.equal(await fileTable.locator('tbody tr').count(), 50);
    await page.getByRole('button', { name: '全选本目录（245 项）', exact: true }).click();
    await page.getByText(/已选 245 个文件/).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('.jj-toast').waitFor({ state: 'hidden' });
    await page.locator('.jj-file-toolbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-directory-selection-mobile.png'), animations: 'disabled' });
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '管理界面', exact: true }).click();
    await navigate(page, '网盘与下载'); assert.equal(await perPage.inputValue(), '50');
});

test('115 file deletion confirms names, preserves cross-page selection and handles failures without Aria2', async t => {
    let entries = Array.from({ length: 22 }, (_, i) => ({ id: String(i + 101), name: i === 0 ? '批量删除目录' : i === 1 ? '单项删除.mp4' : `保留-${i}.mp4`, kind: i === 0 ? 'folder' : 'file', size: 1024 }));
    const deletions = [], listings = [];
    let failDelete = false, holdDelete = false, releaseDelete;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: true, aria2_connected: false } }));
        await p.route('**/api/115/status', r => r.fulfill({ json: { connected: true } }));
        await p.route('**/api/system/files?*', r => r.fulfill({ json: { entries: [{ name: 'local-only.mp4', path: '/local-only.mp4', size: 1024 }] } }));
        await p.route('**/api/webdav/files?*', r => r.fulfill({ json: { files: [{ name: 'webdav-only.mp4', path: '/webdav-only.mp4', size: 1024 }] } }));
        await p.route('**/api/115/files**', async route => {
            const request = route.request();
            if (request.method() === 'DELETE') {
                const body = request.postDataJSON(); deletions.push(body);
                if (holdDelete) await new Promise(resolve => { releaseDelete = resolve; });
                if (failDelete) return route.fulfill({ status: 400, json: { detail: '删除测试失败，请重试' } });
                entries = entries.filter(entry => !body.ids.includes(entry.id));
                return route.fulfill({ json: { success: true, deleted_ids: body.ids } });
            }
            const query = new URL(request.url()).searchParams, offset = Number(query.get('offset'));
            listings.push({ refresh: query.get('refresh'), offset });
            return route.fulfill({ json: { cid: '0', count: entries.length, items: entries.slice(offset, offset + 200) } });
        });
    });
    await navigate(page, '网盘与下载');
    const table = page.getByRole('table').filter({ has: page.getByRole('checkbox', { name: '全选本页', exact: true }) });
    const row = name => table.locator('tr').filter({ hasText: name });
    const batch = page.getByRole('button', { name: '删除所选', exact: true });
    for (const [source, name] of [['服务端本地', 'local-only.mp4'], ['WebDAV', 'webdav-only.mp4']]) {
        await page.locator('aside').getByText(source, { exact: true }).click();
        await table.getByText(name, { exact: true }).waitFor();
        assert.equal(await table.getByRole('button', { name: '删除', exact: true }).count(), 0);
        assert.equal(await batch.count(), 0, `${source} has no cloud deletion action`);
    }
    await page.locator('aside').getByText('115 网盘', { exact: true }).click();
    await row('单项删除.mp4').getByRole('button', { name: '删除', exact: true }).waitFor();
    await row('单项删除.mp4').getByRole('checkbox').check();
    assert.equal(await batch.isEnabled(), true, 'deletion does not need Aria2');
    await row('单项删除.mp4').getByRole('button', { name: '删除', exact: true }).click();
    const dialog = page.locator('.jj-confirm');
    await dialog.getByText('单项删除.mp4', { exact: true }).waitFor();
    assert.equal(deletions.length, 0, 'opening confirmation does not delete');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(deletions.length, 0, 'cancelling does not delete');
    assert.equal(await row('单项删除.mp4').getByRole('checkbox').isChecked(), true);
    await row('单项删除.mp4').getByRole('button', { name: '删除', exact: true }).click(); await approve(page, '删除');
    await row('单项删除.mp4').waitFor({ state: 'hidden' });
    assert.deepEqual(deletions, [{ ids: ['102'] }]);
    assert.equal(listings.at(-1).refresh, 'true', 'successful deletion reloads uncached entries');
    assert.equal(await page.locator('.jj-selection').count(), 0, 'deleted selection is cleared');

    await page.getByRole('combobox', { name: '网盘每页数量', exact: true }).selectOption('20');
    await row('批量删除目录').getByRole('checkbox').check();
    const pager = page.getByRole('navigation', { name: '网盘文件分页', exact: true });
    await pager.getByRole('button', { name: '下一页', exact: true }).click();
    await row('保留-21.mp4').getByRole('checkbox').check();
    await page.getByText(/已选 2 个文件/).waitFor(); await batch.click();
    await dialog.getByText('批量删除目录', { exact: true }).waitFor();
    await dialog.getByText('保留-21.mp4', { exact: true }).waitFor();
    await dialog.getByText(/文件夹.*子/).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-115-delete-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await dialog.getByRole('dialog').evaluate(el => { const bounds = el.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; }), 'confirmation fits a mobile viewport');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-115-delete-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    holdDelete = true;
    const submitted = page.waitForRequest(request => request.method() === 'DELETE' && request.url().endsWith('/api/115/files'));
    await approve(page, '删除'); await submitted; await dialog.waitFor({ state: 'hidden' });
    assert.equal(await batch.isDisabled(), true, 'batch deletion cannot be submitted twice');
    assert.equal(await row('保留-21.mp4').getByRole('button', { name: '删除', exact: true }).isDisabled(), true);
    assert.deepEqual(deletions[1], { ids: ['101', '122'] }, 'one request includes selected file and folder across pages');
    releaseDelete();
    await row('保留-2.mp4').waitFor();
    assert.equal(await page.locator('.jj-selection').count(), 0);
    assert.equal(await table.getByText('批量删除目录', { exact: true }).count(), 0);
    assert.equal(await table.getByText('保留-21.mp4', { exact: true }).count(), 0);
    assert.equal(deletions.length, 2);

    holdDelete = false; failDelete = true;
    await row('保留-2.mp4').getByRole('checkbox').check(); await batch.click(); await approve(page, '删除');
    await page.getByText('115 删除未确认完成，请刷新目录核对后重试', { exact: true }).waitFor();
    assert.equal(await row('保留-2.mp4').getByRole('checkbox').isChecked(), true, 'failed deletion keeps the item selected');
    assert.equal(await batch.isEnabled(), true, 'failed deletion can be retried');
    assert.equal(deletions.length, 3);
});

test('audit: 115 folders load every page, navigate back and dispatch with the source identity', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: false, aria2_connected: true } }));
        await p.route('**/api/115/status', r => r.fulfill({ json: { connected: true } }));
        await p.route('**/api/115/files?*', r => {
            const url = new URL(r.request().url()); calls.push(url.searchParams.get('cid'));
            const items = url.searchParams.get('cid') === '10' ? [{ id: '20', name: 'QA.mp4', kind: 'file', size: 1024 ** 3, pick_code: 'qa-pick' }] : Number(url.searchParams.get('offset')) ? [{ id: '11', name: '第二页目录', kind: 'folder', size: '' }] : [{ id: '10', name: '测试目录', kind: 'folder', size: '' }];
            return r.fulfill({ json: { items, count: url.searchParams.get('cid') === '10' ? 1 : 2 } });
        });
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { downloads: [] } }));
        await backgroundRoute(p, '/api/webdav/download/jobs', 'file-dispatch', body => { calls.push(body); return { success: true, message: '已发送到 Aria2', results: [{ success: true }] }; });
    });
    await navigate(page, '网盘与下载'); await page.locator('aside').getByText('115 网盘', { exact: true }).click();
    await page.getByText('第二页目录', { exact: true }).waitFor();
    await page.getByText('测试目录', { exact: true }).click(); await page.getByText('QA.mp4', { exact: true }).waitFor();
    await page.locator('tr').filter({ hasText: 'QA.mp4' }).getByRole('button', { name: '发送', exact: true }).click(); await approve(page, '发送');
    await page.getByText('已发送到 Aria2', { exact: true }).waitFor();
    assert.equal(calls.find(body => body.files)?.files[0].source_type, 'pan115');
    await page.getByText('上一级', { exact: true }).click(); await page.getByText('测试目录', { exact: true }).waitFor();
    await page.locator('tr').filter({ hasText: '测试目录' }).getByRole('checkbox').check();
    await page.getByRole('spinbutton', { name: '最小体积', exact: true }).fill('1.5');
    await page.getByRole('combobox', { name: '体积单位', exact: true }).selectOption('GB');
    await page.getByRole('button', { name: '发送到 Aria2', exact: true }).click();
    const submitted = page.waitForResponse(response => response.url().endsWith('/api/webdav/download/jobs'));
    await approve(page, '发送'); await submitted;
    const folder = calls.filter(body => body.files).at(-1);
    assert.equal(folder.files[0].is_directory, true); assert.equal(folder.files[0].size, 0);
    assert.equal(folder.min_file_size_mb, 1536);
});

test('workflow: real 115 job failure survives reload and can be ignored without marking downloaded', async t => {
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies/batch', r => r.fulfill({ json: dispatchContract.batch }));
        await p.route('**/api/automation/dispatch-jobs', r => r.continue({ postData: JSON.stringify({ ...r.request().postDataJSON(), magnet_links: [magnet.link], magnet_sources: ['javbus'] }) }));
        await p.route('**/api/history**', r => r.continue());
    });
    await navigate(page, '下载派发');
    await page.locator('input[name="jj-tool"]').nth(1).check();
    await page.locator('textarea').fill('QA-001');
    const submitted = page.waitForResponse(r => r.url().endsWith('/api/automation/dispatch-jobs') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '派发 1 个番号', exact: true }).click(); await approve(page, '开始派发');
    const job = await (await submitted).json(); assert.ok(job.task_id);
    await page.getByRole('button', { name: '忽略此项', exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click(); await navigate(page, '下载派发');
    await page.getByRole('button', { name: '忽略此项', exact: true }).waitFor();
    let history = await (await page.request.get(baseURL + '/api/history')).json();
    const record = history.find(item => item.movie_id === 'QA-001');
    assert.equal(record.failed_resources[0].link, magnet.link); assert.equal(record.failed_resources[0].tool, 'pan115');
    assert.equal(record.download_resources.length, 0);
    await page.getByRole('button', { name: '忽略此项', exact: true }).click();
    await page.getByText('已忽略该失败项', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '忽略此项', exact: true }).count(), 0);
    const downloaded = await (await page.request.get(baseURL + '/api/downloaded-movies/QA-001')).json();
    assert.equal(downloaded.is_downloaded, false);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '管理界面', exact: true }).click(); await navigate(page, '下载派发');
    assert.equal(await page.getByRole('button', { name: '忽略此项', exact: true }).count(), 0, 'restoring a job keeps ignored failures dismissed');
    await page.request.delete(baseURL + '/api/history');
});
