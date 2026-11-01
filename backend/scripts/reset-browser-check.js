// Optional browser regression, run separately from npm test.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = require('../src/app');
(async () => {
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext();
    const base = `http://127.0.0.1:${server.address().port}`;
    let posts = 0, payload, fail = false;
    const violations = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      if (!request.url().startsWith(base + '/')) return route.abort();
      if (new URL(request.url()).pathname === '/api/auth/reset-password') {
        posts++; payload = request.postDataJSON();
        return route.fulfill({ status: fail ? 400 : 200, contentType: 'application/json',
          body: JSON.stringify(fail ? { error: { message: 'Link expirado.' } } : { message: 'OK' }) });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('console', (message) => { if (/Content Security Policy/.test(message.text())) violations.push(message.text()); });
    await page.goto(base + '/reset-password');
    await page.locator('#feedback').filter({ hasText: 'inválido' }).waitFor();
    assert.equal(await page.locator('button').isDisabled(), true);
    await page.goto(base + '/reset-password?uid=synthetic&token=canary');
    await page.locator('#password').fill('Synthetic123'); await page.locator('#confirm').fill('Different123');
    await page.locator('button').click(); assert.match(await page.locator('#feedback').textContent(), /não coincidem/); assert.equal(posts, 0);
    await page.locator('#password').fill('é'.repeat(37)); await page.locator('#confirm').fill('é'.repeat(37));
    await page.locator('button').click(); assert.match(await page.locator('#feedback').textContent(), /72 bytes/); assert.equal(posts, 0);
    await page.locator('#password').fill('Synthetic123'); await page.locator('#confirm').fill('Synthetic123');
    fail = true; await page.locator('button').click(); await page.locator('#feedback').filter({ hasText: 'Link expirado' }).waitFor();
    assert.equal(await page.locator('button').isEnabled(), true);
    fail = false; await page.locator('button').click(); await page.locator('#feedback').filter({ hasText: 'sucesso' }).waitFor();
    assert.equal(posts, 2); assert.equal(payload.token, 'canary'); assert.equal(payload.newPassword, 'Synthetic123');
    assert.equal(await page.locator('form').count(), 0); assert.deepEqual(violations, []);
    console.log('PASS: reset browser (invalid link, mismatch, UTF8 limit, error recovery, successful POST, CSP)');
  } finally { if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
