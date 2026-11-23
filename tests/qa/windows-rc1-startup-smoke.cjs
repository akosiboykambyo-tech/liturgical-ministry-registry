'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  const modulePath = process.env.COWL_QA_PLAYWRIGHT_PATH;
  assert.ok(modulePath && fs.existsSync(modulePath), 'Playwright module not installed');
  const { chromium } = require(modulePath);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      try {
        const page = await context.newPage();
        const response = await page.goto('http://127.0.0.1:3399/admin', {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        assert.equal(response?.status(), 200, 'Admin login HTTP status');
        await page.locator('input[type="email"]').first().waitFor({state: 'visible',timeout: 30000});
        await page.locator('input[type="password"]').first().waitFor({state: 'visible',timeout: 30000});
        console.log('PASS: Windows Chromium + Next.js RC1 login at ' + width + 'px');
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => {console.error('SMOKE FAILED: ' + error.message);process.exitCode = 1;});
