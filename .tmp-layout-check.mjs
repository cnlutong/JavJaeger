import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const path = 'D:/codex-projekt/JavJaeger/layout-check.png';
  await page.screenshot({ path, fullPage: true });
  const widthData = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    return {
      appWidth: rect(q('.jav-app'))?.width || null,
      headerWidth: rect(q('.jav-header'))?.width || null,
      layoutWidth: rect(q('.jav-app-layout'))?.width || null,
      contentWidth: rect(q('.jav-content'))?.width || null,
      workspaceWidth: rect(q('.jav-workspace'))?.width || null,
      resultsWidth: rect(q('.jav-results-panel'))?.width || null,
      hasWebdavShell: Boolean(q('.jav-webdav-shell')),
    };
  });
  console.log(JSON.stringify(widthData));
  await browser.close();
})();
