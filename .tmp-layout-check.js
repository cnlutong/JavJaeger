const { chromium } = require('C:/Users/cnlut/AppData/Local/OpenAI/Codex/runtimes/cua_node/a89897d3d9baa117/bin/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const q = sel => document.querySelector(sel);
    const r = el => el ? el.getBoundingClientRect() : null;
    return {
      content: r(q('.jav-content'))?.width || null,
      workspace: r(q('.jav-workspace'))?.width || null,
      header: r(q('.jav-header'))?.width || null,
      layout: r(q('.jav-app-layout'))?.width || null,
      webdavShell: !!q('.jav-webdav-shell')
    };
  });
  console.log(JSON.stringify(data));
  await browser.close();
})();
