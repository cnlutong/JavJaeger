const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'layout-check.png', fullPage: true });
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    headerLeft: document.querySelector('.jav-header-left')?.getBoundingClientRect().width || null,
    header: document.querySelector('.jav-header')?.getBoundingClientRect().width || null,
    content: document.querySelector('.jav-content')?.getBoundingClientRect().width || null,
    workspace: document.querySelector('.jav-workspace')?.getBoundingClientRect().width || null,
    nav: document.querySelector('.jav-header-nav')?.getBoundingClientRect().width || null,
    versionText: document.querySelector('.jav-version')?.innerText || ''
  }));
  console.log(JSON.stringify(widths));
  await browser.close();
})();
