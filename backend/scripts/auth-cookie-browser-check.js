// Real browser cookies with a synthetic HTTP backend; no external accounts/services.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check) {
  const deadline = Date.now() + 10000;
  while (!check()) { if (Date.now() >= deadline) throw new Error('Synthetic endpoint timeout'); await delay(10); }
}
(async () => {
  let delayedRefresh, delayedLogout, logins = 0;
  const respond = (res, id, cookie) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `gr_refresh_token=${cookie}; HttpOnly; Path=/; SameSite=Lax` });
    res.end(JSON.stringify({ user: { id }, accessToken: `access-${id}` }));
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/api/auth/refresh') {
      if ((req.headers.cookie || '').includes('gr_refresh_token=A')) delayedRefresh = res;
      else if ((req.headers.cookie || '').includes('gr_refresh_token=B')) respond(res, 'B', 'B');
      else { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{}'); }
    } else if (req.url === '/api/auth/login') { logins++; respond(res, 'B', 'B'); }
    else if (req.url === '/api/auth/logout') delayedLogout = res;
    else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Synthetic auth</title>'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const context = await browser.newContext();
    await context.route('**/*', (route) => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    await context.addCookies([{ name: 'gr_refresh_token', value: 'A', url: base, httpOnly: true }]);
    const page = await context.newPage(); await page.goto(base);
    await page.evaluate(() => {
      const local = {}, session = {};
      const area = (values) => ({ get: async (key) => ({ [key]: values[key] }), set: async (data) => Object.assign(values, data), remove: async (key) => { delete values[key]; } });
      window.chrome = { storage: { local: area(local), session: area(session) }, runtime: { onMessage: { addListener() {} } }, identity: { getRedirectURL: () => 'https://example.test/' } };
    });
    const source = fs.readFileSync(path.resolve(__dirname, '../../background.js'), 'utf8').replace("const API_BASE_URL = 'http://localhost:4000/api';", `const API_BASE_URL = '${base}/api';`);
    await page.addScriptTag({ content: source + '\nglobalThis.api={getSession,signIn,signOut,saveSession,loadStoredSession};' });
    await page.evaluate(async () => {
      await api.saveSession({ user: { id: 'A' }, accessToken: 'old', expiresAt: 0 }, true);
      window.refreshing = api.getSession();
    });
    await until(() => delayedRefresh);
    await page.evaluate(() => { window.loggingIn = api.signIn({ email: 'B@example.test', password: 'synthetic' }); });
    await delay(50); assert.equal(logins, 0);
    respond(delayedRefresh, 'A', 'A2');
    await page.evaluate(() => Promise.all([refreshing, loggingIn]));
    assert.equal((await context.cookies()).find((c) => c.name === 'gr_refresh_token').value, 'B');
    assert.equal(await page.evaluate(async () => (await api.loadStoredSession()).user.id), 'B');
    await page.evaluate(async () => {
      const current = await api.loadStoredSession(); await api.saveSession({ ...current, expiresAt: 0 }, true);
      if ((await api.getSession()).user.id !== 'B') throw new Error('Cookie/session mismatch');
      window.loggingOut = api.signOut();
    });
    await until(() => delayedLogout);
    await page.evaluate(() => { window.nextLogin = api.signIn({ email: 'B@example.test', password: 'synthetic' }); });
    await delay(50); assert.equal(logins, 1);
    delayedLogout.writeHead(204, { 'Set-Cookie': 'gr_refresh_token=; HttpOnly; Path=/; Max-Age=0' }); delayedLogout.end();
    await page.evaluate(() => Promise.all([loggingOut, nextLogin]));
    assert.equal((await context.cookies()).find((c) => c.name === 'gr_refresh_token').value, 'B');
    assert.equal(await page.evaluate(async () => (await api.loadStoredSession()).user.id), 'B');
    console.log('PASS: real cookie jar preserves new account after delayed refresh and logout; subsequent refresh succeeds');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
