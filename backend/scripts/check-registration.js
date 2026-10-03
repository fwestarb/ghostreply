// Manual integration check; deletes its fictitious account afterwards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const db = require('../src/config/supabase');
const root = path.resolve(__dirname, '../..');
const store = () => {
  const data = {};
  return { get: async key => ({ [key]: data[key] }), set: async value => Object.assign(data, value), remove: async key => { delete data[key]; } };
};
(async () => {
  let id, listener;
  const routes = [];
  const chrome = { storage: { local: store(), session: store() }, identity: { getRedirectURL: () => 'https://test.chromiumapp.org/' }, runtime: {
    id: 'test', onMessage: { addListener(fn) { listener = fn; } }, getPlatformInfo(fn) { fn({}); },
    sendMessage(message, callback) { listener(message, {}, callback); }
  } };
  const context = vm.createContext({ chrome, AbortController, URL, URLSearchParams, atob, setTimeout, clearTimeout, setInterval, clearInterval,
    console: { log() {} }, fetch: async (url, options) => { routes.push(new URL(url).pathname); return fetch(url, options); } });
  for (const file of ['background.js', 'messaging.js', 'auth-client.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  const element = () => ({ children: [], disabled: false, style: {}, value: '', appendChild(child) { this.children.push(child); }, append() {}, addEventListener(name, fn) { this[name] = fn; } });
  const fields = [];
  const field = () => { const input = element(); fields.push(input); return { input, wrap: element() }; };
  const toasts = [];
  let refreshed = false;
  Object.assign(context, { document: { createElement: element }, criarCampo: field, criarCampoSenha: field,
    setButtonLoading(button, loading) { button.disabled = loading; }, body: element(),
    ctx: { showToast(message, type) { toasts.push({ message, type }); }, onSwitch() {}, async refresh() { refreshed = true; } } });
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const renderSignupView ='), source.indexOf('const renderRecoverView =')) + '\nrenderSignupView(body,ctx);', context);
  const password = 'Aa 9ç!' + crypto.randomBytes(12).toString('hex');
  const email = `ghost-check-${crypto.randomUUID()}@example.com`;
  fields[0].value = 'Teste temporário'; fields[1].value = email.toUpperCase(); fields[2].value = password; fields[3].value = password;
  try {
    const form = context.body.children.find(child => child.className === 'ghostreply-auth-form');
    await form.submit({ preventDefault() {} });
    const stored = (await chrome.storage.local.get('gr_session')).gr_session;
    id = stored?.user?.id;
    assert.ok(id, toasts.at(-1)?.message || 'Cadastro não armazenou sessão');
    assert.ok(refreshed);
    assert.equal(routes[0], '/api/auth/register');
    assert.ok(!routes.includes('/api/auth/login'));
    await vm.runInContext('AuthClient.logout()', context);
    context.credentials = { email: ` ${email.toUpperCase()} `, password };
    const login = await vm.runInContext('AuthClient.login(credentials.email,credentials.password,true)', context);
    assert.equal(login.user.id, id);
    await assert.rejects(vm.runInContext("AuthClient.signup('Teste',credentials.email,credentials.password)", context), /Já existe uma conta/);
    await assert.rejects(vm.runInContext("AuthClient.login(credentials.email,'senha-errada',true)", context), /E-mail ou senha inválidos/);
    await assert.rejects(vm.runInContext("AuthClient.signup('Teste','email-invalido','curta')", context), /E-mail inválido.*8 caracteres|8 caracteres.*E-mail inválido/);
    console.log('PASS: formulário -> cliente -> worker -> cadastro real -> sessão.');
    console.log('PASS: logout/login, e-mail maiúsculo/espaços, senha especial, duplicação e validações.');
  } finally {
    if (!id) { const result = await db.from('app_users').select('id').eq('email', email).maybeSingle(); id = result.data?.id; }
    if (id) { const { error } = await db.from('app_users').delete().eq('id', id); if (error) throw error; console.log('Conta fictícia removida.'); }
  }
})().catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
