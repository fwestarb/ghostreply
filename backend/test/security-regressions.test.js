const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const passwords = require('../src/utils/password');
const env = require('../src/config/env');

function load(file, replacements = {}) {
  const filename = path.resolve(__dirname, '../src', file);
  const normalRequire = createRequire(filename);
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, Buffer, process, console,
    require: (name) => Object.hasOwn(replacements, name) ? replacements[name] : normalRequire(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return module.exports;
}

test('recuperação não expõe URL/token no JSON ou logger, inclusive fallback sem SMTP', async () => {
  for (const smtp of [false, true]) {
    const logs = [], sent = [];
    const mail = load('services/email.service.js', {
      '../config/env': { ...env, isConfigured: { smtp }, smtp: { from: 'test@example.test' } },
      '../utils/logger': { warn: (...args) => logs.push(args) },
      nodemailer: { createTransport: () => ({ sendMail: async (message) => sent.push(message) }) }
    });
    const token = 'synthetic-reset-canary';
    const result = await mail.sendPasswordResetEmail({ to: 'a@example.test', name: 'Teste', resetUrl: `https://example.test/reset?token=${token}` });
    assert.equal(result.sent, smtp);
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(JSON.stringify(logs).includes(token), false);
    assert.equal(sent.length, smtp ? 1 : 0);
    if (smtp) assert.ok(sent[0].text.includes(token));
    const controller = load('controllers/auth.controller.js', {
      '../services/auth.service': { forgotPassword: async () => ({ ...result, devResetUrl: token }) },
      '../utils/asyncHandler': (fn) => fn
    });
    let body;
    await controller.forgotPassword({ body: { email: 'a@example.test' } }, {
      status(code) { assert.equal(code, 200); return this; }, json(value) { body = value; }
    }, (error) => { throw error; });
    assert.deepEqual(Object.keys(body), ['message']);
    assert.equal(JSON.stringify(body).includes(token), false);
  }
});

test('senha respeita 72 bytes UTF-8 e não autentica sufixos truncados', async () => {
  for (const value of ['a'.repeat(71), 'a'.repeat(72), 'é'.repeat(36)]) {
    const hash = await passwords.hashPassword(value);
    assert.equal(await passwords.comparePassword(value, hash), true);
    assert.equal(await passwords.comparePassword(value + 'X', hash), false);
  }
  for (const value of ['a'.repeat(73), 'é'.repeat(36) + 'X', '😀'.repeat(19), null]) {
    await assert.rejects(passwords.hashPassword(value), (e) => e.statusCode === 400);
  }
});

test('senha inválida não consome link de recuperação, inclusive chamada direta ao serviço', async () => {
  let consumed = 0;
  const service = load('services/auth.service.js', {
    './token.service': { consumePasswordResetToken: async () => { consumed++; } }
  });
  await assert.rejects(service.resetPassword({ userId: 'test', token: 'test', newPassword: 'a'.repeat(73) }));
  assert.equal(consumed, 0);
});

// Modelo de PostgREST que executa os filtros reais do repository em uma única atualização.
// Não substitui teste integrado com Supabase/PostgreSQL.
function database(rows) {
  return { from() {
    let patch, predicates = [];
    const query = {
      update(values) { patch = values; return query; },
      eq(key, value) { predicates.push((row) => row[key] === value); return query; },
      is(key, value) { predicates.push((row) => row[key] === value); return query; },
      gt(key, value) { predicates.push((row) => row[key] > value); return query; },
      select() { return query; },
      then(resolve, reject) {
        try {
          const matched = rows.filter((row) => predicates.every((check) => check(row)));
          for (const row of matched) Object.assign(row, patch);
          return Promise.resolve({ data: matched.map(({ id }) => ({ id })), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      }
    };
    return query;
  } };
}

test('repositories consomem uma vez, filtram titular, expiração e estado final', async () => {
  for (const [file, method, terminal] of [
    ['refreshToken.repository.js', 'consume', 'revoked_at'], ['passwordReset.repository.js', 'markUsed', 'used_at']
  ]) {
    const rows = [{ id: 'active', user_id: 'owner', expires_at: '2999-01-01', [terminal]: null },
      { id: 'expired', user_id: 'owner', expires_at: '2000-01-01', [terminal]: null },
      { id: 'used', user_id: 'owner', expires_at: '2999-01-01', [terminal]: '2020-01-01' }];
    const repo = load(`repositories/${file}`, { '../config/supabase': database(rows) });
    assert.equal(await repo[method]('active', 'other'), false);
    assert.equal(await repo[method]('expired', 'owner'), false);
    assert.equal(await repo[method]('used', 'owner'), false);
    const results = await Promise.all([repo[method]('active', 'owner'), repo[method]('active', 'owner')]);
    assert.equal(results.filter(Boolean).length, 1);
  }
});

test('dois leitores válidos não emitem dois sucessores nem consomem dois resets', async () => {
  const hash = await passwords.hashToken('synthetic-token');
  let claimedRefresh = false, claimedReset = false, issued = 0;
  const claim = (kind) => {
    if (kind === 'refresh') { if (claimedRefresh) return false; claimedRefresh = true; }
    else { if (claimedReset) return false; claimedReset = true; }
    return true;
  };
  const service = load('services/token.service.js', {
    '../repositories/refreshToken.repository': {
      findActiveByUserId: async () => [{ id: 'old', token_hash: hash }],
      consume: async () => claim('refresh'), create: async () => { issued++; }
    },
    '../repositories/passwordReset.repository': {
      findUnusedByUserId: async () => [{ id: 'reset', token_hash: hash }],
      markUsed: async () => claim('reset')
    }
  });
  const records = await Promise.all([service.verifyRefreshToken('owner', 'synthetic-token'), service.verifyRefreshToken('owner', 'synthetic-token')]);
  const refresh = await Promise.allSettled(records.map((record) => service.rotateRefreshToken('owner', record.id)));
  assert.equal(refresh.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(issued, 1);
  const resets = await Promise.allSettled([service.consumePasswordResetToken('owner', 'synthetic-token'), service.consumePasswordResetToken('owner', 'synthetic-token')]);
  assert.equal(resets.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(service.consumePasswordResetToken('owner', 'wrong-token'));
});

test('access log omite query do link de recuperação', () => {
  require('../src/app');
  const morgan = require('morgan');
  assert.equal(morgan.url({ path: '/reset-password', originalUrl: '/reset-password?token=canary' }), '/reset-password');
});

test('log de erro também omite credenciais da query', () => {
  const logs = [];
  const middleware = load('middlewares/error.middleware.js', { '../utils/logger': { error: (...args) => logs.push(args) } });
  middleware.errorHandler(new Error('Synthetic failure'), { path: '/reset-password', originalUrl: '/reset-password?token=canary' },
    { status(code) { assert.equal(code, 500); return this; }, json() {} }, () => {});
  assert.equal(JSON.stringify(logs).includes('canary'), false);
  assert.equal(logs[0][1].path, '/reset-password');
});
