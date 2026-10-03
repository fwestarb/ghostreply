const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(fetch) {
  let listener;
  let heartbeat;
  let stopped = false;
  let pings = 0;
  const storage = () => ({ get: async () => ({}), remove: async () => {}, set: async () => {} });
  const context = vm.createContext({
    fetch, AbortController, URL, URLSearchParams, crypto: global.crypto,
    atob: global.atob, setTimeout, clearTimeout,
    setInterval(fn) { heartbeat = fn; return 1; },
    clearInterval() { stopped = true; }, console: { log() {} },
    chrome: { runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      getPlatformInfo(fn) { pings++; fn({}); }
    }, identity: { getRedirectURL: () => 'https://test.chromiumapp.org/' },
    storage: { local: storage(), session: storage() } }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../background.js'), 'utf8'), context);
  return { listener, ping: () => heartbeat(), pings: () => pings, stopped: () => stopped };
}

test('worker mantém o canal durante uma resposta pendente e limpa o heartbeat', async () => {
  let resolveFetch;
  const w = worker(() => new Promise((resolve) => { resolveFetch = resolve; }));
  let result;
  assert.equal(w.listener({ type: 'AUTH_LOGIN', payload: {} }, {}, (response) => { result = response; }), true);
  await new Promise(setImmediate);
  assert.equal(result, undefined);
  w.ping();
  assert.equal(w.pings(), 1);
  resolveFetch({ ok: false, status: 401, json: async () => ({ error: { message: 'E-mail ou senha inválidos.' } }) });
  await new Promise(setImmediate);
  assert.equal(result.ok, false);
  assert.match(result.error, /senha inválidos/);
  assert.equal(w.stopped(), true);
});

test('mensagem desconhecida responde com orientação de atualização', () => {
  const w = worker(async () => { throw new Error('Não deveria chamar a rede'); });
  let result;
  assert.equal(w.listener({ type: 'OLD_VERSION' }, {}, (response) => { result = response; }), false);
  assert.equal(result.ok, false);
  assert.match(result.error, /Recarregue/);
});

test('cliente converte perda de canal em uma ação compreensível', async () => {
  const context = vm.createContext({ setTimeout, clearTimeout, chrome: { runtime: {
    id: 'test', lastError: { message: 'The message port closed before a response was received.' },
    sendMessage(message, callback) { callback(undefined); }
  } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../messaging.js'), 'utf8'), context);
  await assert.rejects(vm.runInContext("GhostReplyMessaging.send('AUTH_LOGIN', {})", context), /Recarregue a extensão/);
});

test('Google sem client ID é rejeitado antes de verificar um token', async () => {
  const env = require('../src/config/env');
  const google = require('../src/services/google.service');
  const current = env.googleClientId;
  env.googleClientId = '';
  try { await assert.rejects(google.verifyGoogleIdToken('test'), (error) => error.statusCode === 503); }
  finally { env.googleClientId = current; }
});

test('cadastro mostra os erros específicos de validação', async () => {
  let route;
  const w = worker(async url => {
    route = url;
    return { ok: false, status: 400, json: async () => ({ error: { message: 'Dados inválidos.', details: [
      {field:'email',message:'E-mail inválido.'}, {field:'password',message:'A senha deve ter pelo menos 8 caracteres.'}
    ] } }) };
  });
  const response = await new Promise(resolve => w.listener({type:'AUTH_SIGNUP',payload:{}},{},resolve));
  assert.match(route, /\/auth\/register$/);
  assert.equal(response.ok, false);
  assert.match(response.error, /E-mail inválido/);
  assert.match(response.error, /8 caracteres/);
});

test('cadastro não é reenviado automaticamente após falha do servidor', async () => {
  let attempts = 0;
  const w = worker(async () => {
    attempts++;
    return {ok:false,status:503,json:async () => ({error:{message:'Banco indisponível.'}})};
  });
  const response = await new Promise(resolve => w.listener({type:'AUTH_SIGNUP',payload:{}},{},resolve));
  assert.equal(attempts, 1);
  assert.equal(response.error, 'Banco indisponível.');
});
