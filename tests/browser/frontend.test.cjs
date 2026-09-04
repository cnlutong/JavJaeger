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
    page.setDefaultTimeout(5000);
    await page.route('**/api/**', route => {
        if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        errors.push(`unmocked mutation: ${route.request().method()} ${new URL(route.request().url()).pathname}`);
        return route.fulfill({ status: 501, json: { detail: 'Test must mock mutations' } });
    });
    await setup(page);
    await page.goto(baseURL, { waitUntil: 'networkidle' });
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
        if (url.pathname.endsWith('/scan/jobs/qa-scan')) return route.fulfill({ json: { status: 'completed', result: { success: true, scan_count: 1, scanned_files: 4, recognized_files: 4, directory: '/qa' } } });
        if (method === 'DELETE') {
            const id = url.pathname.split('/')[4];
            state.records = id ? state.records.filter(r => r.movie_id !== id) : [];
        }
        return route.fulfill({ json: { success: true, records: state.records, total_movies: state.records.length, total_files: state.records.length, total_size: state.records.length * 102400 } });
    });
    return state;
}

test('shell logo, search, magnet sources, filter and history controls', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async page => {
        await page.route('**/api/movies*', route => { calls.push(route.request().url()); return route.fulfill({ json: { movies: [movie()] } }); });
        await page.route('**/api/movies/QA-*', route => { calls.push(route.request().url()); return route.fulfill({ json: movie() }); });
        await page.route('**/api/magnets/**', route => { calls.push(route.request().url()); return route.fulfill({ json: [magnet] }); });
        await page.route('**/api/history', route => route.fulfill({ json: [] }));
    });
    await page.getByRole('button', { name: '查看 JavJaeger logo 大图' }).click();
    await page.getByRole('dialog', { name: 'JavJaeger logo 大图' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await navigate(page, '影片检索');
    await page.locator('#keyword').fill('QA-001');
    await button(page.locator('form').filter({ has: page.locator('#keyword') }), '搜索').click();
    await page.locator('.jav-movie-card').waitFor();
    assert.match(await page.locator('.jav-movie-card').innerText(), /QA-001/);
    await choose(page, page.locator('#magnetSource'), 'YHG007');
    await page.waitForTimeout(100);
    assert.ok(calls.some(url => url.includes('source=yhg007')));
    await page.locator('#movieId').fill('QA-001');
    await button(page, '查询磁力链接').click();
    await page.locator('.jav-movie-card').waitFor();
    await button(page.locator('form').filter({ has: page.locator('#filterType') }), '筛选').click();
    await page.locator('.jav-movie-card').waitFor();
    await button(page, '查看历史记录').click();
    await page.getByText('历史下载记录', { exact: true }).waitFor();
    assert.equal(await button(page, '清空历史记录').isDisabled(), true);
    await button(page, '返回查询').click();
    assert.ok(await page.locator('.jav-results-panel').isVisible());
});

test('library filters, all views, preview history and deletion confirmation', async t => {
    let state;
    const page = await openApp(t, 1440, async p => { state = await libraryFixture(p); });
    const rows = page.locator('.ant-table-tbody > tr[data-row-key]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 4);
    await page.getByText('沉浸', { exact: true }).click();
    await page.getByRole('button', { name: '管理界面', exact: true }).click();
    assert.equal(await rows.count(), 4);
    await page.getByPlaceholder('搜索番号、标题、演员、标签').fill('QA-001');
    await button(page, '搜索').click();
    assert.equal(await rows.count(), 1);
    await button(page, '清空').first().click();
    await page.getByText('仅VR', { exact: true }).click();
    assert.equal(await rows.count(), 1);
    await page.getByText('全部', { exact: true }).click();
    await rows.first().click();
    await page.getByRole('dialog', { name: '影片沉浸式预览' }).waitFor();
    await button(page, '返回影片库').click();
    await page.getByRole('dialog', { name: '影片沉浸式预览' }).waitFor({ state: 'hidden' });
    await page.goForward();
    await page.getByRole('dialog', { name: '影片沉浸式预览' }).waitFor();
    await page.goBack();
    await page.getByText('卡片', { exact: true }).click();
    assert.equal(await page.locator('.jav-library-poster-card').count(), 4);
    await page.getByText('演员', { exact: true }).last().click();
    await page.locator('.jav-library-actor-card').first().click();
    assert.match(await page.locator('body').innerText(), /测试演员/);
    await page.getByText('列表', { exact: true }).click();
    await button(rows.first(), '移除').click();
    await confirm(page, '取消');
    assert.equal(await page.getByRole('dialog', { name: '影片沉浸式预览' }).count(), 0);
    assert.equal(state.requests.filter(r => r.method === 'DELETE').length, 0);
    await button(rows.first(), '移除').click();
    await confirm(page, '移除');
    await page.waitForTimeout(150);
    assert.equal(state.records.length, 3);
    await button(rows.first(), '彻底删除').click();
    await confirm(page, '取消');
    assert.equal(state.records.length, 3);
    await button(page, '清空影视库').click();
    await confirm(page, '取消');
    assert.equal(state.records.length, 3);
    await choose(page, page.getByRole('combobox', { name: '影视库排序' }), '番号 A-Z');
    assert.match(await rows.first().innerText(), /QA-001/);
    await page.getByRole('slider').focus();
    const previousSize = await page.getByRole('slider').getAttribute('aria-valuenow');
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.getByRole('slider').getAttribute('aria-valuenow'), previousSize);
    await button(page, '清洗无效文件').click();
    await confirm(page, '清洗');
    await page.getByText(/未发现无效文件/).waitFor();
    assert.ok(state.requests.some(r => r.path.endsWith('/clean-invalid') && r.method === 'POST'));
    await button(rows.first(), '彻底删除').click();
    await confirm(page, '彻底删除');
    await page.waitForTimeout(150);
    assert.equal(state.records.length, 2);
    assert.ok(state.requests.some(r => r.path.endsWith('/files') && r.method === 'DELETE'));
    await button(page, '清空影视库').click();
    await confirm(page, '清空');
    await page.getByText('影视库已清空', { exact: true }).waitFor();
    assert.equal(state.records.length, 0);
});

test('cinema layouts, focus controls, search and preview', async t => {
    const page = await openApp(t, 1440, libraryFixture);
    await navigate(page, '影院模式');
    await page.getByText('海报墙', { exact: true }).click();
    assert.equal(await page.locator('.jav-library-immersive-grid-card').count(), 4);
    await page.getByText('封面走廊', { exact: true }).click();
    const title = await page.locator('.jav-library-immersive-corridor-copy h1').innerText();
    await page.getByRole('button', { name: '下一部', exact: true }).click();
    assert.notEqual(await page.locator('.jav-library-immersive-corridor-copy h1').innerText(), title);
    await page.getByRole('button', { name: '上一部', exact: true }).click();
    assert.equal(await page.locator('.jav-library-immersive-corridor-copy h1').innerText(), title);
    await page.getByText('焦点剧场', { exact: true }).click();
    await page.getByPlaceholder('搜索影片', { exact: true }).fill('QA-001');
    await page.getByRole('button', { name: '执行搜索' }).click();
    assert.match(await page.locator('.jav-library-immersive-shelf-hero').innerText(), /QA-001/);
    await button(page.locator('.jav-library-immersive-shelf-hero'), '播放影片').click();
    await page.getByRole('dialog', { name: '影片沉浸式预览' }).waitFor();
});

test('library path settings, directory browser, scan and information completion', async t => {
    let state;
    const page = await openApp(t, 1440, async p => {
        state = await libraryFixture(p);
        await p.route('**/api/system/directories**', route => route.fulfill({ json: { success: true, current_path: '/qa', parent_path: '/', entries: [{ name: 'media', path: '/qa/media' }] } }));
    });
    await button(page, '路径配置').click();
    await page.getByText('影视库路径配置', { exact: true }).waitFor();
    await button(page.locator('.ant-drawer-open'), '浏览').first().click();
    await page.getByRole('dialog', { name: '选择服务端目录' }).waitFor();
    await button(page, '选择当前目录').click();
    await button(page, '保存配置').click();
    await page.locator('.ant-message-success').waitFor();
    assert.ok(state.requests.some(r => r.method === 'PUT' && r.path.endsWith('/settings')));
    await button(page, '保存并扫描').click();
    await page.getByText(/扫描路径 1 个/).waitFor();
    assert.ok(state.requests.some(r => r.path.endsWith('/scan/jobs') && r.method === 'POST'));
    await closeDrawer(page);
    await button(page, '检查信息').click();
    await button(page, '保存标准').click();
    await button(page, '开始检查').click();
    await button(page, '下载缺失信息').waitFor();
    await button(page, '下载缺失信息').click();
    await page.waitForTimeout(100);
    assert.ok(state.requests.some(r => r.path.endsWith('/information/download') && r.body.write_nfo));
    await closeDrawer(page);
    await button(page, '筛选').click();
    await button(page.locator('.ant-drawer-open'), '清除全部').click();
    await closeDrawer(page);
});

test('PikPak login/logout, batch dispatch and Aria2 connection keep secrets in session storage', async t => {
    const calls = [];
    let connected = false;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/pikpak/login', r => r.fulfill({ json: { success: true } }));
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { aria2_connected: connected, webdav_connected: false } }));
        await p.route('**/api/aria2/connect', r => { connected = true; return r.fulfill({ json: { success: true } }); });
        await p.route('**/api/movies/download-by-codes', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { found_movies: [movie()], magnet_results: [{ movie_id: 'QA-001', ...magnet }] } }); });
        await p.route('**/api/aria2/download-magnets', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, message: 'QA dispatched' } }); });
    });
    await navigate(page, '下载派发');
    await page.getByPlaceholder('用户名', { exact: true }).fill('qa-user');
    await page.getByPlaceholder('密码', { exact: true }).fill('qa-only-password');
    await button(page, '登录').click();
    await button(page, '退出登录').waitFor();
    assert.ok((await page.evaluate(() => sessionStorage.getItem('pikpakCredentials'))).includes('qa-only-password'));
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('qa-only-password'));
    await button(page, '退出登录').click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('pikpakCredentials')), null);
    await page.getByText('直接下载', { exact: true }).click();
    await page.locator('button[title="打开配置"]').click();
    await page.getByPlaceholder('http://127.0.0.1:6800/jsonrpc', { exact: true }).fill('http://127.0.0.1:6800/jsonrpc');
    await page.locator('.ant-drawer-open input[type=password]').fill('qa-rpc-secret');
    await button(page, '连接 Aria2').click();
    await page.waitForTimeout(100);
    assert.equal(connected, true);
    await closeDrawer(page);
    await page.getByPlaceholder('支持多行、空格分隔...').fill('QA-001');
    await button(page, '搜索并下载').click();
    await page.getByText('QA dispatched', { exact: true }).waitFor();
    assert.equal(calls[0].auto_download, false);
    assert.deepEqual(calls[1].movie_ids, ['QA-001']);
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('qa-rpc-secret'));
});

test('WebDAV source CRUD, directory navigation, filtering and batch dispatch', async t => {
    const downloads = [];
    let connected = false;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { aria2_connected: true, webdav_connected: connected, webdav_url: connected ? 'https://qa.invalid/dav' : '' } }));
        await p.route('**/api/webdav/connect', r => { connected = true; return r.fulfill({ json: { success: true } }); });
        await p.route('**/api/webdav/files**', r => r.fulfill({ json: { success: true, files: [{ name: 'QA folder', path: '/folder', is_directory: true }, { name: 'QA.mp4', path: '/QA.mp4', is_directory: false, size: 1073741824 }, { name: 'notes.txt', path: '/notes.txt', is_directory: false, size: 123 }] } }));
        await p.route('**/api/webdav/download', r => { downloads.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, results: [{ success: true }] } }); });
    });
    await navigate(page, '网盘与下载');
    await button(page, '新增网盘').first().click();
    const dialog = page.getByRole('dialog', { name: '新增网盘' });
    await dialog.getByPlaceholder('家庭 NAS / 云盘').fill('QA DAV');
    await dialog.getByPlaceholder('https://...').fill('https://qa.invalid/dav');
    await dialog.locator('input[type=password]').fill('qa-webdav-secret');
    await button(dialog, '连接并添加').click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByPlaceholder('搜索当前目录').fill('QA.mp4');
    const row = page.getByRole('row').filter({ hasText: 'QA.mp4' });
    await row.getByRole('checkbox').check();
    await button(page, '下载选中').click();
    await page.waitForTimeout(100);
    assert.equal(downloads[0].files[0].path, '/QA.mp4');
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('qa-webdav-secret'));
    await page.getByPlaceholder('搜索当前目录').fill('');
    await page.getByText('QA folder', { exact: true }).click();
    await page.getByText('根目录', { exact: true }).click();
    await page.locator('.webdav-netdisk-list button[title="删除"]').click();
    await confirm(page, 'OK');
    await page.getByText('暂无来源', { exact: true }).waitFor();
    assert.ok(!(await page.evaluate(() => JSON.stringify(sessionStorage))).includes('qa-webdav-secret'));
    await navigate(page, '设置');
    await navigate(page, '网盘与下载');
    await page.getByText('暂无来源', { exact: true }).waitFor();
});

test('Aria2 task manager connects, refreshes, pauses, resumes and removes tasks', async t => {
    let status = 'active', removed = false;
    const actions = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { aria2_connected: true } }));
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { success: true, downloads: removed ? [] : [{ gid: 'qa-task', name: 'QA.mp4', status, totalLength: 1000, completedLength: 100, downloadSpeed: 10 }] } }));
        await p.route('**/api/aria2/*/qa-task', r => { const action = new URL(r.request().url()).pathname.split('/')[3]; actions.push(action); status = action === 'pause' ? 'paused' : 'active'; removed = action === 'remove'; return r.fulfill({ json: { success: true } }); });
    });
    await navigate(page, '网盘与下载');
    await page.getByText('Aria2 任务', { exact: true }).click();
    await button(page, '刷新列表').click();
    await button(page, '暂停').click();
    await button(page, '继续').click();
    await button(page.getByRole('row').filter({ hasText: 'QA.mp4' }), '删除').click();
    await confirm(page, 'OK');
    await page.getByText('暂无下载任务', { exact: true }).waitFor();
    assert.deepEqual(actions, ['pause', 'resume', 'remove']);
});

test('automatic workflow edits all four nodes and saves, runs, reloads and deletes', async t => {
    let saved = null;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/automation/tasks**', r => {
            const req = r.request(), method = req.method(), url = new URL(req.url());
            if (url.pathname.endsWith('/run')) return r.fulfill({ json: { status: 'success', dispatched_count: 1 } });
            if (method === 'DELETE') { saved = null; return r.fulfill({ json: { success: true } }); }
            if (method === 'POST' || method === 'PUT') { saved = { ...req.postDataJSON(), id: 'qa-auto', runs: [] }; return r.fulfill({ json: saved }); }
            return r.fulfill({ json: { tasks: saved ? [saved] : [] } });
        });
    });
    await navigate(page, '自动模式');
    await page.getByPlaceholder('任务名称').fill('QA automation');
    for (const type of ['trigger', 'search', 'magnet', 'download']) {
        await page.locator(`.automation-node-${type}`).click();
        assert.ok(await page.locator('.automation-inspector').isVisible());
    }
    await choose(page, page.locator('.automation-inspector .ant-select'), 'Aria2');
    await button(page, '保存').click();
    await page.getByText('自动任务已保存', { exact: true }).waitFor();
    assert.equal(saved.nodes.find(n => n.type === 'download').config.tool, 'aria2');
    await button(page.locator('.automation-toolbar'), '运行').click();
    await page.getByText('运行完成：派发 1 个任务', { exact: true }).waitFor();
    await button(page, '新建').click();
    await page.locator('.automation-task-item').filter({ hasText: 'QA automation' }).click();
    assert.equal(await page.getByPlaceholder('任务名称').inputValue(), 'QA automation');
    await button(page, '删除').click();
    await confirm(page, '删除');
    await page.getByText('暂无任务', { exact: true }).waitFor();
    assert.equal(saved, null);
});

test('settings sections, secret placeholders, save failure and successful save', async t => {
    let savedBody = null, fail = true;
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/settings', async r => {
            if (r.request().method() === 'GET') return r.continue();
            savedBody = r.request().postDataJSON();
            if (fail) return r.fulfill({ status: 400, json: { detail: 'QA invalid setting' } });
            return r.fulfill({ json: await (await p.request.get(`${baseURL}/api/system/settings`)).json() });
        });
    });
    await navigate(page, '设置');
    for (const name of ['JavBus API', '刮削源', '下载服务', '运行与安全', '概览']) {
        await button(page.locator('.settings-nav'), name).click();
        assert.ok(await page.locator('.settings-section-stack').isVisible());
    }
    await button(page, '保存全部').click();
    await page.getByText(/QA invalid setting/).waitFor();
    assert.equal(savedBody.pikpak.password, undefined);
    assert.equal(savedBody.pan115.cookie, undefined);
    fail = false;
    await button(page, '保存全部').click();
    await page.getByText('设置已保存', { exact: true }).waitFor();
    await button(page, '刷新').click();
    await page.locator('.settings-summary-value').first().waitFor();
});

test('local scrape templates, naming designer, preview, conflict choice and execution', async t => {
    const calls = [];
    const preview = { success: true, directory: '/qa', total_files: 3, found_count: 2, recognized_count: 2, conflict_count: 1, items: [
        { source_path: '/qa/QA-001.mp4', file_name: 'QA-001.mp4', code: 'QA-001', scrape_status: 'found', metadata: { title: 'QA matched' }, target_video_path: '/qa/out/QA-001.mp4' },
        { source_path: '/qa/QA-002.mp4', file_name: 'QA-002.mp4', code: 'QA-002', scrape_status: 'found', metadata: { title: 'QA conflict' }, target_video_path: '/qa/out/QA-002.mp4', target_exists: true },
        { source_path: '/qa/unknown.mp4', file_name: 'unknown.mp4', scrape_status: 'unrecognized', scrape_error: 'QA cannot recognize' },
    ] };
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies/local-scrape/**', r => {
            const req = r.request(), url = new URL(req.url());
            if (req.method() === 'POST') calls.push({ url: url.pathname, body: req.postDataJSON() });
            if (url.pathname.endsWith('/preview/jobs')) return r.fulfill({ json: { task_id: 'qa-preview' } });
            if (url.pathname.endsWith('/apply/jobs')) return r.fulfill({ json: { task_id: 'qa-apply' } });
            if (url.pathname.endsWith('/qa-preview')) return r.fulfill({ json: { status: 'completed', percent: 100, result: preview } });
            if (url.pathname.endsWith('/qa-apply')) return r.fulfill({ json: { status: 'completed', percent: 100, result: { success: true, success_count: 2, failed_count: 0, library_recorded_count: 2, results: [] } } });
            if (url.pathname.endsWith('/delete')) return r.fulfill({ json: { success: true, deleted_count: 1, failed_count: 0, results: [{ source_path: '/qa/unknown.mp4', success: true }] } });
            return r.fulfill({ status: 404, json: { detail: 'unmocked scrape endpoint' } });
        });
    });
    await navigate(page, '本地刮削');
    await button(page, '扫描并生成预览').click();
    await page.getByText('请输入要扫描的目录路径', { exact: true }).waitFor();
    await page.getByLabel('扫描目录', { exact: true }).fill('/qa');
    await page.getByPlaceholder('例如：下载目录入库').fill('QA template');
    await button(page.locator('.jav-local-template-panel'), '保存').click();
    await page.getByText('刮削任务模板已保存', { exact: true }).waitFor();
    await button(page.locator('.jav-local-settings'), '设置').last().click();
    await page.locator('.ant-drawer-open .ant-drawer-title').filter({ hasText: '文件命名模板设置' }).waitFor();
    await button(page.locator('.ant-drawer-open'), '重置').click();
    await button(page.locator('.ant-drawer-open'), '应用').click();
    await button(page, '扫描并生成预览').click();
    await page.getByText('QA matched', { exact: true }).waitFor();
    assert.equal(await page.locator('.ant-table-tbody > tr[data-row-key]').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    const size = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(size[0] <= size[1] + 1, `scrape results overflow: ${size}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button(page, '选择策略').click();
    await button(page.locator('.ant-drawer-open'), '保留新的').click();
    await page.locator('.ant-drawer-open').waitFor({ state: 'hidden' });
    await button(page, '执行选中项').click();
    await confirm(page, '执行');
    await page.getByText(/执行结果：成功 2/).waitFor();
    const apply = calls.find(c => c.url.endsWith('/apply/jobs'));
    assert.equal(apply.body.items.find(i => i.code === 'QA-002').conflict_resolution, 'keep_newer');
    await button(page, '全选不符合要求').click();
    await button(page, '查看原因').click();
    await page.getByText('刮削异常详情', { exact: true }).waitFor();
    await closeDrawer(page);
    await button(page, '删除选中').click();
    await confirm(page, '删除');
    await page.getByText('已删除 1 个不符合要求文件', { exact: true }).waitFor();
    assert.deepEqual(calls.find(c => c.url.endsWith('/delete')).body.source_paths, ['/qa/unknown.mp4']);
    await page.locator('.jav-local-template-panel button.ant-btn-dangerous').click();
    await confirm(page, '删除');
    assert.equal(await button(page.locator('.jav-local-template-panel'), '运行').isDisabled(), true);
});

test('transcoding modal submits indexed files and task manager filters, details, cancel, retry and delete', async t => {
    const actions = [];
    const task = { id: 'qa-transcode', movie_id: 'QA-001', movie_title: 'QA video', file_name: 'QA.mp4', status: 'running', progress: 20, options: { video_codec: 'hevc_nvenc' } };
    let removed = false;
    const capabilities = { success: true, ffmpeg_available: true, ffprobe_available: true, hardware_acceleration_required: true, gpu_available: true, presets: [{ id: 'adaptive_h265', name: 'QA 自适应', available: true, adaptive: true, options: {} }] };
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/transcoding/presets', r => r.fulfill({ json: capabilities }));
        await p.route('**/api/movies/transcoding/tasks**', r => {
            const req = r.request(), url = new URL(req.url());
            if (req.method() !== 'GET') {
                actions.push({ path: url.pathname, method: req.method(), body: req.postDataJSON() });
                if (url.pathname.endsWith('/cancel')) task.status = 'cancelled';
                if (url.pathname.endsWith('/retry')) task.status = 'queued';
                if (req.method() === 'DELETE') removed = true;
                return r.fulfill({ json: { success: true, task } });
            }
            return r.fulfill({ json: { tasks: removed ? [] : [task], counts: { [task.status]: removed ? 0 : 1 }, max_concurrent_tasks: 2 } });
        });
    });
    await button(page.locator('.ant-table-tbody > tr[data-row-key]').first(), '转码').click();
    const dialog = page.getByRole('dialog', { name: '转码影片' });
    await button(dialog, '启动后台转码').click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(actions[0].body.file_index, 0);
    assert.deepEqual(actions[0].body.options, {});
    await navigate(page, '转码');
    await button(page, '详情').click();
    await page.getByText('转码任务详情', { exact: true }).waitFor();
    await closeDrawer(page);
    await page.getByText('活动 1', { exact: true }).click();
    await button(page, '取消').click();
    await confirm(page, 'OK');
    await page.getByText('异常 1', { exact: true }).click();
    await button(page, '重试').click();
    await page.getByText('活动 1', { exact: true }).click();
    await button(page, '取消').click();
    await confirm(page, 'OK');
    await page.getByText('异常 1', { exact: true }).click();
    await page.locator('.transcoding-task-actions button').filter({ has: page.locator('.anticon-delete') }).click();
    await confirm(page, 'OK');
    assert.equal(removed, true);
    assert.ok(actions.some(a => a.path.endsWith('/retry')));
    await button(page, '刷新').click();
});

test('115 QR login refreshes configuration and 115 storage browsing dispatches selected files', async t => {
    let configured = false;
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/client-config', async r => {
            const config = await (await p.request.get(`${baseURL}/api/client-config`)).json();
            config.pan115.configured = configured;
            return r.fulfill({ json: config });
        });
        await p.route('**/api/115/qrcode/start', r => r.fulfill({ json: { session_id: 'qa-qr', qrcode_image_url: '/static/logo.jpg' } }));
        await p.route('**/api/115/qrcode/qa-qr/status', r => { configured = true; return r.fulfill({ json: { state: 'allowed', configured: true } }); });
        await p.route('**/api/115/files**', r => r.fulfill({ json: { cid: '0', count: 1, items: [{ id: 'qa-115-file', kind: 'file', name: 'QA115.mp4', size: 1073741824, pick_code: 'qa-pick' }] } }));
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { aria2_connected: true, webdav_connected: false } }));
        await p.route('**/api/webdav/download', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, results: [{ success: true }] } }); });
    });
    await navigate(page, '下载派发');
    await page.getByText('115', { exact: true }).click();
    await page.locator('button[title="打开配置"]').click();
    await button(page, '扫码登录 115').click();
    await page.getByAltText('115 登录二维码').waitFor();
    await page.getByText('115 扫码登录成功', { exact: true }).waitFor();
    await closeDrawer(page);
    await navigate(page, '网盘与下载');
    await button(page, '打开 115网盘').click();
    await page.getByRole('row').filter({ hasText: 'QA115.mp4' }).getByRole('checkbox').check();
    await button(page, '下载选中').click();
    await page.waitForTimeout(100);
    assert.equal(calls[0].files[0].source_type, 'pan115');
    assert.equal(calls[0].files[0].pick_code, 'qa-pick');
});

async function navigate(page, name) {
    await page.getByRole('navigation', { name: '主功能导航' }).getByRole('button', { name, exact: true }).click();
}

test('local folder source can be added, browsed, refreshed and removed', async t => {
    const paths = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/files**', r => {
            const current = new URL(r.request().url()).searchParams.get('path');
            paths.push(current);
            return r.fulfill({ json: { success: true, current_path: current, entries: current === '/qa' ? [{ name: 'sub', path: '/qa/sub', is_directory: true }, { name: 'QA-local.mp4', path: '/qa/QA-local.mp4', is_directory: false, size: 1024 }] : [] } });
        });
    });
    await navigate(page, '网盘与下载');
    await button(page, '新增本地文件夹').first().click();
    const modal = page.getByRole('dialog', { name: '新增本地文件夹' });
    await modal.getByLabel('名称', { exact: true }).fill('QA folder');
    await modal.getByLabel('本地路径', { exact: true }).fill('/qa');
    await button(modal, '添加并浏览').click();
    await page.getByText('QA-local.mp4', { exact: true }).waitFor();
    assert.equal(await page.getByRole('row').filter({ hasText: 'QA-local.mp4' }).getByRole('checkbox').isDisabled(), true);
    await page.getByText('sub', { exact: true }).click();
    await page.getByText('..', { exact: true }).click();
    await page.getByText('QA-local.mp4', { exact: true }).waitFor();
    await button(page, '刷新').click();
    assert.ok(paths.includes('/qa/sub'));
    await page.locator('.webdav-netdisk-list button[title="删除"]').click();
    await confirm(page, 'OK');
    await page.getByText('暂无来源', { exact: true }).waitFor();
});

test('scraper settings support priority, language, enable toggles, reset, testing and result application', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/system/settings', async r => {
            if (r.request().method() === 'PUT') calls.push({ path: '/settings', body: r.request().postDataJSON() });
            return r.fulfill({ json: await (await p.request.get(`${baseURL}/api/system/settings`)).json() });
        });
        await p.route('**/api/movies/metadata-scrapers/**', r => {
            calls.push({ path: new URL(r.request().url()).pathname, body: r.request().postDataJSON() });
            return r.fulfill({ json: { success: true, summary: { success: 1, total: 1, failed: 0 }, results: [{ provider: 'javbus', success: true, status: 'ok', duration_ms: 5 }] } });
        });
    });
    await navigate(page, '设置');
    await page.locator('.settings-nav-item').filter({ hasText: '刮削源' }).click();
    const first = page.locator('tr[data-row-key="javbus"]');
    await button(first, '下移').click();
    await first.getByText('#2', { exact: true }).waitFor();
    await button(first, '上移').click();
    await first.getByText('#1', { exact: true }).waitFor();
    await first.getByRole('switch').check();
    await choose(page, first.getByRole('combobox'), 'ja');
    await first.getByRole('spinbutton').fill('700');
    await button(page, '测试所有源').click();
    await page.getByText('测试完成：1/1 可用', { exact: true }).waitFor();
    const saved = calls.find(c => c.path === '/settings').body;
    assert.equal(saved.scrapers.javbus.enabled, true);
    assert.equal(saved.scrapers.javbus.language, 'ja');
    assert.equal(saved.scrapers.javbus.request_delay, 700);
    await button(page, '按结果启停').click();
    await page.getByText('已按测试结果更新启用状态', { exact: true }).waitFor();
    assert.equal(calls.find(c => c.path.endsWith('apply-test-results')).body.results[0].provider, 'javbus');
    await first.getByRole('switch').check();
    await page.locator('.settings-nav-item').filter({ hasText: '运行与安全' }).click();
    await button(page, '重置表单').click();
    await page.locator('.settings-nav-item').filter({ hasText: '刮削源' }).click();
    assert.equal(await first.getByRole('switch').isChecked(), false);
});

test('history review, lookup and confirmed clear preserve expected request contracts', async t => {
    const calls = [];
    const record = { movie_id: 'QA-001', title: 'QA history', in_local_library: true, needs_reselect: false, stars: ['测试演员'], genres: ['测试标签'] };
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/history**', r => {
            const req = r.request(), url = new URL(req.url());
            calls.push({ path: url.pathname, method: req.method() });
            return r.fulfill({ json: url.pathname.endsWith('check-local-library') ? { success: true, records: [record], missing_records: [] } : req.method() === 'DELETE' ? { success: true } : [record] });
        });
        await p.route('**/api/movies/QA-001', r => r.fulfill({ json: movie() }));
        await p.route('**/api/magnets/**', r => r.fulfill({ json: [] }));
    });
    await navigate(page, '影片检索');
    await button(page, '查看历史记录').click();
    await button(page, '核对并重新下载').click();
    await page.getByText('历史记录均已入库', { exact: true }).waitFor();
    await button(page, '详情搜索').click();
    await page.locator('.jav-movie-card').waitFor();
    await button(page, '查看历史记录').click();
    await button(page, '清空历史记录').click();
    await confirm(page, '取消');
    assert.ok(!calls.some(c => c.method === 'DELETE'));
    await button(page, '清空历史记录').click();
    await confirm(page, '确定');
    assert.ok(calls.some(c => c.method === 'DELETE'));
    assert.equal(await button(page, '核对并重新下载').isDisabled(), true);
});

test('mobile navigation reaches all nine pages without horizontal page overflow', async t => {
    const page = await openApp(t, 390);
    for (const name of ['影院模式', '影片检索', '下载派发', '本地刮削', '影视库', '自动模式', '转码', '网盘与下载', '设置']) {
        await navigate(page, name);
        await page.waitForTimeout(100);
        assert.ok(await page.locator('body').innerText());
        const size = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        assert.ok(size[0] <= size[1] + 1, `${name} overflows: ${size}`);
        if (name === '影院模式') await page.getByRole('button', { name: '管理界面', exact: true }).click();
    }
});

test('settings summary has readable dark-theme text', async t => {
    const page = await openApp(t);
    await navigate(page, '设置');
    await page.locator('.settings-summary-value').first().waitFor();
    const contrast = await page.locator('.settings-summary-value').first().evaluate(element => {
        const luminance = color => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255)
                .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const fg = luminance(getComputedStyle(element).color);
        const bg = luminance(getComputedStyle(element.closest('.settings-summary-card')).backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    assert.ok(contrast >= 4.5, `text contrast ${contrast}`);
});

test('mobile library keeps numeric summaries readable and preview controls reachable', async t => {
    const page = await openApp(t, 390, p => libraryFixture(p));
    const clipped = await page.locator('.jav-library-kpis strong').evaluateAll(elements => elements.filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent));
    assert.deepEqual(clipped, [], 'KPI values must not be clipped');
    await page.locator('.ant-table-tbody > tr[data-row-key]').first().click();
    const modal = page.getByRole('dialog', { name: '影片沉浸式预览' });
    await modal.waitFor();
    const bounds = await button(modal, '返回影片库').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await button(modal, '返回影片库').click();
    await modal.waitFor({ state: 'hidden' });
});

test('indexed movie preview loads and plays a neutral video through the selected file endpoint', async t => {
    const page = await openApp(t, 1440, p => libraryFixture(p));
    const bytes = await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 144;
        const ctx = canvas.getContext('2d');
        const stream = canvas.captureStream(10);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const chunks = [];
        recorder.ondataavailable = event => chunks.push(event.data);
        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
        recorder.start();
        const frames = setInterval(() => { ctx.fillStyle = '#232532'; ctx.fillRect(0, 0, 256, 144); }, 100);
        await new Promise(resolve => setTimeout(resolve, 1200));
        recorder.stop();
        await stopped;
        clearInterval(frames);
        stream.getTracks().forEach(track => track.stop());
        return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    });
    await page.route('**/api/movies/local-library/*/play?file_index=0', r => r.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
    await page.locator('.ant-table-tbody > tr[data-row-key]').first().click();
    await button(page.getByRole('dialog'), '播放影片').click();
    const video = page.locator('video.jav-library-preview-player');
    await video.waitFor();
    await video.evaluate(e => e.play());
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    assert.equal(await video.evaluate(e => e.error), null);
    assert.match(await video.getAttribute('src'), /\/play\?file_index=0$/);
});

test('transcoding cannot submit stale GPU capabilities after a failed refresh', async t => {
    let requests = 0;
    const page = await openApp(t, 1440, async p => {
        await libraryFixture(p);
        await p.route('**/api/movies/transcoding/presets', r => ++requests === 1
            ? r.fulfill({ json: { success: true, ffmpeg_available: true, gpu_available: true, hardware_acceleration_required: true, presets: [{ id: 'adaptive_h265', name: 'QA adaptive', available: true, options: {} }] } })
            : r.fulfill({ status: 503, json: { detail: 'QA GPU probe unavailable' } }));
    });
    const rows = page.locator('.ant-table-tbody > tr[data-row-key]');
    await button(rows.first(), '转码').click();
    await page.getByText('GPU 硬件编码已启用', { exact: true }).waitFor();
    await page.getByRole('dialog').locator('.ant-modal-close').click();
    await button(rows.nth(1), '转码').click();
    await page.getByText('QA GPU probe unavailable', { exact: true }).waitFor();
    assert.equal(await button(page.getByRole('dialog'), '启动后台转码').isDisabled(), true);
    assert.equal(await page.getByText('GPU 硬件编码已启用', { exact: true }).count(), 0);
});

test('automation download node can be reached and configured', async t => {
    const page = await openApp(t);
    await navigate(page, '自动模式');
    assert.equal(await page.locator('.automation-canvas').evaluate(e => getComputedStyle(e).overflowX), 'auto');
    await page.locator('.automation-node-download').click();
    assert.match(await page.locator('.automation-inspector').innerText(), /下载方式/);
    const node = page.locator('.automation-node-download');
    const originalX = await node.evaluate(e => parseFloat(e.style.left));
    const box = await node.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 3 });
    await page.mouse.up();
    const movedX = await node.evaluate(e => parseFloat(e.style.left));
    assert.ok(Math.abs(movedX - (originalX - 20)) <= 2, `scrolled node jumped from ${originalX} to ${movedX}`);
    await page.getByRole('button', { name: '自动排版', exact: true }).click();
    await page.locator('.automation-node-trigger').click();
    assert.match(await page.locator('.automation-inspector').innerText(), /触发条件/);
});

test('settings priority summary is correct before visiting the scraper section', async t => {
    const page = await openApp(t);
    const config = await (await page.request.get(`${baseURL}/api/system/settings`)).json();
    await navigate(page, '设置');
    await page.getByText(`优先级队列 ${config.scrapers.priority.length} 个 provider`, { exact: true }).waitFor();
});

test('a new movie search clears pagination from a previous filtered list', async t => {
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies*', r => r.fulfill({ json: { movies: Array.from({ length: 30 }, (_, i) => movie(`QA-${i}`)) } }));
        await p.route('**/api/movies/QA-*', r => r.fulfill({ json: movie() }));
        await p.route('**/api/magnets/**', r => r.fulfill({ json: [] }));
    });
    await navigate(page, '影片检索');
    await button(page.locator('form').filter({ has: page.locator('#filterType') }), '筛选').click();
    await button(page, '下一页').first().click();
    await page.getByText('第 2 页', { exact: true }).first().waitFor();
    await page.locator('#keyword').fill('QA-001');
    await button(page.locator('form').filter({ has: page.locator('#keyword') }), '搜索').click();
    await page.waitForFunction(() => document.querySelectorAll('.jav-movie-card').length === 1);
    assert.equal(await button(page, '上一页').count(), 0);
});

test('catalog browsing, global magnet options, recognition and single or whole-page dispatch work together', async t => {
    const downloads = [], queries = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/static/categories.json', r => r.fulfill({ json: { QA: [{ name: '测试类别', code: 'qa-genre' }] } }));
        await p.route('**/static/actors.json', r => r.fulfill({ json: [{ name: '测试演员', code: 'qa-star' }] }));
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { aria2_connected: true } }));
        await p.route('**/api/movies*', r => { queries.push(new URL(r.request().url())); return r.fulfill({ json: { movies: [movie()] } }); });
        await p.route('**/api/movies/QA-*', r => r.fulfill({ json: movie() }));
        await p.route('**/api/magnets/**', r => r.fulfill({ json: [magnet] }));
        await p.route('**/api/movies/recognize', r => r.fulfill({ json: { movies: [movie()], magnet_results: [{ movie_id: 'QA-001', ...magnet }] } }));
        await p.route('**/api/aria2/download-magnets', r => { downloads.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, message: 'QA dispatch success' } }); });
    });
    await navigate(page, '影片检索');
    await choose(page, page.locator('#magnetSource'), 'Cilisousuo');
    await page.getByText('全局排除4K', { exact: true }).click();
    await page.getByText('4K过滤：开启', { exact: true }).waitFor();
    for (const [type, card] of [['类别', '.jav-picker-card'], ['演员', '.jav-actor-card']]) {
        await page.locator('#filterType').locator("xpath=ancestor::*[contains(concat(' ', @class, ' '), ' ant-select ')][1]").click();
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: type }).getByText('浏览', { exact: true }).click();
        await page.keyboard.press('Escape');
        await page.locator(card).first().click();
    }
    const filter = page.locator('form').filter({ has: page.locator('#filterType') });
    await button(filter, '筛选').click();
    await page.locator('.jav-movie-card').waitFor();
    assert.equal(JSON.parse(queries.at(-1).searchParams.get('filters')).length, 2);
    await button(filter, '清空').click();
    await page.getByText('直接下载', { exact: true }).click();
    await button(page, '立即下载').click();
    await page.getByText('QA dispatch success', { exact: true }).waitFor();
    await button(page, '下载本页全部影片').click();
    await page.waitForTimeout(100);
    assert.equal(downloads.length, 2);
    await page.getByPlaceholder('请粘贴JAVLibrary网页源代码...').fill('QA-001');
    await button(page, '识别并下载').click();
    await page.getByText('识别完成', { exact: true }).waitFor();
    assert.equal(await page.locator('.jav-movie-card').count(), 1);
});

test('batch dispatch and recognition reject HTTP failures instead of reporting success', async t => {
    const page = await openApp(t);
    await page.route('**/api/movies/download-by-codes', route => route.fulfill({ status: 422, json: { detail: 'QA invalid codes' } }));
    await navigate(page, '下载派发');
    await page.getByPlaceholder('支持多行、空格分隔...').fill('QA-001');
    await page.getByRole('button', { name: /搜索并下载/ }).click();
    await page.locator('.ant-message-error').waitFor();
    assert.equal(await page.locator('.ant-message-success').count(), 0);
    await page.route('**/api/movies/recognize', route => route.fulfill({ status: 500, json: { detail: 'QA unavailable' } }));
    await navigate(page, '影片检索');
    await page.getByPlaceholder('请粘贴JAVLibrary网页源代码...').fill('QA-001');
    await page.getByRole('button', { name: /识别并下载/ }).click();
    await page.locator('.ant-message-error').last().waitFor();
    assert.equal(await page.locator('.ant-message-success').count(), 0);
});
