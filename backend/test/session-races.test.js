const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const local = { gr_session: { user: { id: 'owner' }, accessToken: 'old', expiresAt: 0, remember: true } }, session = {}, requests = [];
  const area = (values) => ({ get: async (key) => ({ [key]: values[key] }), set: async (data) => Object.assign(values, data), remove: async (key) => { delete values[key]; } });
  const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval, AbortController, URL, URLSearchParams, atob,
    crypto: require('node:crypto').webcrypto,
    chrome: { storage: { local: area(local), session: area(session) }, runtime: { onMessage: { addListener() {} } }, identity: { getRedirectURL: () => 'https://example.test/' } },
    fetch: (url) => new Promise((resolve) => requests.push({ url, resolve })) };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../background.js'), 'utf8') + '\nglobalThis.api={getSession,saveSession,clearSession,signIn,signOut};', sandbox);
  return { api: sandbox.api, local, requests };
}
const tick = () => new Promise(setImmediate);
const success = { ok: true, json: async () => ({ user: { id: 'owner' }, accessToken: 'new' }) };
test('duas operações compartilham refresh e preservam a sessão renovada', async () => {
  const s = setup(); const a = s.api.getSession(), b = s.api.getSession(); await tick();
  assert.equal(s.requests.length, 1);
  s.requests[0].resolve(success);
  assert.equal((await a).accessToken, 'new'); assert.equal((await b).accessToken, 'new');
  assert.equal(s.local.gr_session.accessToken, 'new');
});
test('falha antiga não apaga uma sessão de login posterior', async () => {
  const s = setup(); const pending = s.api.getSession(); await tick();
  await s.api.saveSession({ user: { id: 'other' }, accessToken: 'later', expiresAt: Date.now() + 999999 }, true);
  s.requests[0].resolve({ ok: false, status: 401, json: async () => ({}) });
  assert.equal((await pending).accessToken, 'later'); assert.equal(s.local.gr_session.user.id, 'other');
});
test('sucesso antigo não ressuscita sessão após logout', async () => {
  const s = setup(); const pending = s.api.getSession(); await tick(); await s.api.clearSession();
  s.requests[0].resolve(success); assert.equal(await pending, null); assert.equal(s.local.gr_session, undefined);
});
test('refresh inválido da sessão atual limpa somente essa sessão', async () => {
  const s = setup(); const pending = s.api.getSession(); await tick();
  s.requests[0].resolve({ ok: false, status: 401, json: async () => ({}) });
  assert.equal(await pending, null); assert.equal(s.local.gr_session, undefined);
});
test('login aguarda Set-Cookie do refresh antigo antes de estabelecer outra conta', async () => {
  const s = setup(); let cookie = 'old';
  const refreshing = s.api.getSession(); await tick();
  const login = s.api.signIn({ email: 'other@example.test', password: 'synthetic' }); await tick();
  assert.equal(s.requests.length, 1);
  cookie = 'refreshed-owner'; s.requests[0].resolve(success); await refreshing; await tick();
  assert.match(s.requests[1].url, /\/auth\/login$/);
  cookie = 'other-user'; s.requests[1].resolve({ ok: true, json: async () => ({ user: { id: 'other' }, accessToken: 'other' }) });
  await login; assert.equal(cookie, 'other-user'); assert.equal(s.local.gr_session.user.id, 'other');
});
test('login novo aguarda Clear-Cookie do logout anterior', async () => {
  const s = setup(); let cookie = 'old';
  const logout = s.api.signOut(); await tick();
  const login = s.api.signIn({ email: 'other@example.test', password: 'synthetic' }); await tick();
  assert.equal(s.requests.length, 1); assert.match(s.requests[0].url, /\/auth\/logout$/);
  cookie = null; s.requests[0].resolve({ ok: true, status: 204 }); await logout; await tick();
  cookie = 'other-user'; s.requests[1].resolve({ ok: true, json: async () => ({ user: { id: 'other' }, accessToken: 'other' }) });
  await login; assert.equal(cookie, 'other-user'); assert.equal(s.local.gr_session.user.id, 'other');
});
