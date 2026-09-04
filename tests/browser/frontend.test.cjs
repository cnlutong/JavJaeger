const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

let baseURL, browser, server, scratch;
before(async () => {
    const root = path.resolve(__dirname, '../..');
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'javjaeger-browser-'));
    for (const dir of ['static', 'templates']) fs.symlinkSync(path.join(root, dir), path.join(scratch, dir), process.platform === 'win32' ? 'junction' : 'dir');
    fs.writeFileSync(path.join(scratch, 'config.json'), JSON.stringify({ session_secret: 'isolated-browser-test', scrapers: Object.fromEntries(['javbus', 'libredmm', 'jav321', 'tokyohot', 'dlgetchu', 'fc2'].map(key => [key, { enabled: false }])) }));
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
        env: { ...process.env, PYTHONPATH: root, APP_ENV: 'test', JAVJAEGER_CONFIG_PATH: path.join(scratch, 'config.json'), JAVJAEGER_ACTOR_IMAGE_DIR: path.join(scratch, 'data/actor_images'), JAVJAEGER_ENABLE_FRONTEND_AUTO_RELOAD: 'false' },
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
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    return page;
}

const button = (root, label) => root.getByRole('button', { name: new RegExp(label.split('').join('\\s*')) });
const choose = async (page, selector, text) => {
    await selector.locator("xpath=ancestor-or-self::*[contains(concat(' ', @class, ' '), ' ant-select ')][1]").click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).first().click();
};
const closeDrawer = async page => {
    await page.locator('.ant-drawer-open .ant-drawer-close').last().click();
    await page.locator('.ant-drawer-open').waitFor({ state: 'hidden' });
};
const confirm = async (page, label) => {
    await button(page.locator('.ant-popconfirm:visible'), label).click();
    await page.locator('.ant-popconfirm:visible').waitFor({ state: 'hidden' });
};
const movie = (id = 'QA-001') => ({ id, title: `QA 测试影片 ${id}`, gid: '123', uc: 0, date: '2026-09-01', stars: [{ name: '测试演员', id: 'qa-star' }], genres: [{ name: '测试标签', id: 'qa-genre' }] });
const magnet = { name: 'QA test magnet', link: 'magnet:?xt=urn:btih:0123456789012345678901234567890123456789', size: '1 GB', source: 'javbus' };

async function libraryFixture(page, count = 4) {
    const state = { requests: [], records: Array.from({ length: count }, (_, i) => ({
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
        if (url.pathname.endsWith('/settings')) return route.fulfill({ json: { success: true, directories: ['/qa'], ignored_paths: [] } });
        if (url.pathname.endsWith('/information/check')) return route.fulfill({ json: { success: true, total_movies: count, complete_count: count - 1, incomplete_count: 1, incomplete_records: [{ movie_id: 'QA-001', missing_labels: ['本地封面'] }] } });
        if (url.pathname.endsWith('/information/download')) return route.fulfill({ json: { success: true, success_count: 1, failed_count: 0, results: [] } });
        if (url.pathname.endsWith('/scan/jobs')) return route.fulfill({ json: { success: true, task_id: 'qa-scan' } });
        if (url.pathname.endsWith('/scan/jobs/qa-scan')) return route.fulfill({ json: { status: 'success', result: { success: true, scan_count: 1, scanned_files: 4, recognized_files: 4, directory: '/qa' } } });
        if (method === 'DELETE') {
            const id = url.pathname.split('/')[4];
            state.records = id ? state.records.filter(r => r.movie_id !== id) : [];
        }
        return route.fulfill({ json: { success: true, records: state.records, total_movies: state.records.length, total_files: state.records.length, total_size: state.records.length * 102400 } });
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
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies?*', route => { calls.push(route.request().url()); return route.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/movies/QA-*', route => { calls.push(route.request().url()); return route.fulfill({ json: movie() }); });
        await p.route('**/api/magnets/**', route => { calls.push(route.request().url()); return route.fulfill({ json: [magnet] }); });
        await p.route('**/api/movies/recognize', route => { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { movies: [movie()] } }); });
    });
    await navigate(page, '影片检索');
    await field(page, '番号').fill('QA-001');
    await page.getByRole('button', { name: '查询番号', exact: true }).click();
    await page.getByText('QA 测试影片 QA-001', { exact: true }).waitFor();
    assert.ok(calls.some(url => typeof url === 'string' && url.includes('gid=123')));
    await page.screenshot({ path: path.join(os.tmpdir(), 'javjaeger-design-search.png'), fullPage: true });
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

test('settings connect PikPak with session-only secrets, dispatch and show write failures', async t => {
    const writes = []; let fail = true;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/pikpak/login', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true } }); });
        await p.route('**/api/pikpak/download', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ status: fail ? 500 : 200, json: fail ? { password: 'never-echo-response-secret' } : { success: true, results: [{ success: true }] } }); });
        await p.route('**/api/movies/download-by-codes', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, magnet_results: [{ ...magnet, movie_id: 'QA-001' }] } }); });
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
    assert.equal(writes.filter(body => body.magnet_links).length, 2);
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
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: true, aria2_connected: true } }));
        await p.route('**/api/webdav/files?*', r => r.fulfill({ json: { success: true, files: [{ name: 'folder', path: '/folder', is_directory: true }, { name: 'QA.mp4', path: '/QA.mp4', size: 1024 ** 3, is_directory: false }] } }));
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { success: true, downloads: [{ gid: 'qa-gid', name: 'QA-download', status: 'active', totalLength: 100, completedLength: 50, downloadSpeed: 10 }] } }));
        for (const url of ['**/api/webdav/download', '**/api/aria2/pause/*', '**/api/aria2/resume/*', '**/api/aria2/remove/*']) await p.route(url, r => { calls.push([r.request().method(), new URL(r.request().url()).pathname, r.request().postDataJSON()]); return r.fulfill({ json: { success: true, results: [{ success: true }] } }); });
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
    await field(page, '扫描目录').fill('/qa'); await field(page, '整理输出目录').fill('/target');
    await page.getByRole('button', { name: '另存为', exact: true }).click();
    assert.match(await page.evaluate(() => localStorage.getItem('localScrapeTaskTemplates')), /\/qa/);
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
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

test('indexed file playback uses the real selected-file endpoint and native video controls', async t => {
    const page = await openApp(t, 1440, libraryFixture);
    const bytes = await page.evaluate(async () => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144;
        const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }), chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start();
        const frames = setInterval(() => { ctx.fillStyle = '#232532'; ctx.fillRect(0, 0, 256, 144); }, 100);
        await new Promise(resolve => setTimeout(resolve, 1200)); recorder.stop(); await stopped; clearInterval(frames); stream.getTracks().forEach(track => track.stop());
        return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
    await page.route('**/api/movies/local-library/*/play?file_index=0', r => r.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
    await navigate(page, '影视库');
    await page.locator('tbody tr').first().getByRole('button', { name: '详情', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    const video = page.locator('video'); await video.waitFor(); await video.evaluate(e => e.play());
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    assert.equal(await video.evaluate(e => e.controls && e.error === null), true);
    await page.getByRole('button', { name: '停止播放', exact: true }).click(); assert.equal(await video.count(), 0);
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
    assert.equal(await page.getByRole('button', { name: '加入队列', exact: true }).count(), 0);
});
