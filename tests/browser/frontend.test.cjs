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
    const check = page.getByRole('button', { name: '资料检查', exact: true });
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
    await page.getByRole('button', { name: '系列', exact: true }).click();
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
            record.series = `QA Series ${i % 1000}`;
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
    await page.getByRole('button', { name: '系列', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '查看全部', exact: true }).count(), 6);
    await page.getByRole('button', { name: '查看全部', exact: true }).first().click();
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
        await p.route('**/api/movies/batch', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ json: dispatchContract.batch }); });
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
    assert.ok(calls.some(url => url.searchParams?.get('source') === 'yhg007'));
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
        await p.route('**/api/movies/batch', r => r.fulfill({ json: dispatchContract.batch }));
        await p.route('**/api/pikpak/download', r => { attempts++; return r.fulfill({ json: { success: false, results: [{ movie_id: 'QA-001', success: false, message: '测试连接失败' }] } }); });
        await p.route('**/api/history', r => { if (r.request().method() === 'DELETE') cleared = true; return r.fulfill({ json: r.request().method() === 'GET' ? (cleared ? [] : [{ movie_id: 'QA-001', download_resources: [{ link: magnet.link, source: 'javbus' }] }]) : { success: true } }); });
        await p.route('**/api/history/check-local-library', r => r.fulfill({ json: { success: true, records: [{ movie_id: 'QA-001', needs_reselect: true, in_local_library: false }] } }));
    });
    await navigate(page, '下载派发');
    await page.locator('textarea').fill('QA-001 qa-001');
    await page.getByRole('button', { name: '派发 1 个番号', exact: true }).click(); await approve(page, '开始派发');
    await page.getByText('测试连接失败', { exact: true }).waitFor();
    await page.getByRole('button', { name: '重新派发全部失败', exact: true }).click(); await approve(page, '开始派发');
    await page.waitForFunction(() => document.body.textContent.includes('测试连接失败'));
    assert.equal(attempts, 2);
    await page.getByRole('button', { name: '忽略此项', exact: true }).click();
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
    await field(page, '扫描目录').fill(input); await field(page, '整理输出目录').fill(output);
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
    await navigate(page, '本地刮削'); await field(page, '扫描目录').fill('/qa');
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.waitForFunction(() => sessionStorage.getItem('localScrapeActiveTask'));
    await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('button', { name: '管理界面', exact: true }).click(); await navigate(page, '本地刮削');
    assert.equal(await field(page, '扫描目录').inputValue(), '/qa');
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
        await p.route('**/api/movies/metadata-scrapers/test', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { results: r.request().postDataJSON().providers.map(provider => ({ provider, success: true, duration_ms: 3 })) } }); });
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

test('audit: 115 folders load every page, navigate back and dispatch with the source identity', async t => {
    const calls = [];
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/webdav/status', r => r.fulfill({ json: { webdav_connected: false, aria2_connected: true } }));
        await p.route('**/api/115/status', r => r.fulfill({ json: { connected: true } }));
        await p.route('**/api/115/files?*', r => {
            const url = new URL(r.request().url()); calls.push(url.searchParams.get('cid'));
            const items = url.searchParams.get('cid') === '10' ? [{ id: '20', name: 'QA.mp4', kind: 'file', size: 1024 ** 3, pick_code: 'qa-pick' }] : Number(url.searchParams.get('offset')) ? [{ id: '11', name: '第二页目录', kind: 'folder' }] : [{ id: '10', name: '测试目录', kind: 'folder' }];
            return r.fulfill({ json: { items, count: url.searchParams.get('cid') === '10' ? 1 : 2 } });
        });
        await p.route('**/api/aria2/downloads', r => r.fulfill({ json: { downloads: [] } }));
        await p.route('**/api/webdav/download', r => { calls.push(r.request().postDataJSON()); return r.fulfill({ json: { success: true, results: [{ success: true }] } }); });
    });
    await navigate(page, '网盘与下载'); await page.locator('aside').getByText('115 网盘', { exact: true }).click();
    await page.getByText('第二页目录', { exact: true }).waitFor();
    await page.getByText('测试目录', { exact: true }).click(); await page.getByText('QA.mp4', { exact: true }).waitFor();
    await page.locator('tr').filter({ hasText: 'QA.mp4' }).getByRole('button', { name: '发送', exact: true }).click(); await approve(page, '发送');
    await page.getByText('已发送到 Aria2', { exact: true }).waitFor();
    assert.equal(calls.find(body => body.files)?.files[0].source_type, 'pan115');
    await page.getByText('上一级', { exact: true }).click(); await page.getByText('测试目录', { exact: true }).waitFor();
});

test('workflow: real 115 job failure survives reload and can be ignored without marking downloaded', async t => {
    const page = await openApp(t, 1440, async p => {
        await p.route('**/api/movies/batch', r => r.fulfill({ json: dispatchContract.batch }));
        await p.route('**/api/115/download-jobs**', r => r.continue());
        await p.route('**/api/history**', r => r.continue());
    });
    await navigate(page, '下载派发');
    await page.locator('input[name="jj-tool"]').nth(1).check();
    await page.locator('textarea').fill('QA-001');
    const submitted = page.waitForResponse(r => r.url().endsWith('/api/115/download-jobs') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '派发 1 个番号', exact: true }).click(); await approve(page, '开始派发');
    const job = await (await submitted).json(); assert.ok(job.job_id);
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
    await page.request.delete(baseURL + '/api/history');
});
