// Integração real: usa registros fictícios temporários e os remove no final.
// Executar manualmente: node scripts/smoke-local.js (uma chamada real de IA).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const app = require('../src/app');
const db = require('../src/config/supabase');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const ids = [];
  async function request(route, method, body, token, cookie, expected = 200) {
    const response = await fetch(base + route, {
      method, headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, expected, `${route}: ${data?.message || response.status}`);
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const password = crypto.randomBytes(24).toString('hex');
    const email = `ghost-check-${crypto.randomUUID()}@example.com`;
    const first = await request('/auth/register', 'POST', { name: 'Teste temporário', email, password, confirmPassword: password }, null, null, 201);
    ids.push(first.data.user.id);
    const second = await request('/auth/register', 'POST', { name: 'Teste isolamento', email: `ghost-check-${crypto.randomUUID()}@example.com`, password, confirmPassword: password }, null, null, 201);
    ids.push(second.data.user.id);
    const login = await request('/auth/login', 'POST', { email, password });
    const token = login.data.accessToken;
    await request('/knowledge/profile', 'PUT', { companyName: 'Loja fictícia de teste', businessSummary: 'Atendimento de segunda a sexta, das 9h às 18h.' }, token);
    const saved = await request('/knowledge/entries', 'POST', { type: 'faq', title: 'Horário', content: 'Abrimos às 9h, de segunda a sexta.' }, token, null, 201);
    const entryId = saved.data.entry.id;
    const persisted = await request('/knowledge/entries', 'GET', null, token);
    assert.equal(persisted.data.entries.length, 1);
    const isolated = await request('/knowledge/entries', 'GET', null, second.data.accessToken);
    assert.equal(isolated.data.entries.length, 0);
    await request(`/knowledge/entries/${entryId}`, 'PATCH', { content: 'Alteração indevida' }, second.data.accessToken, null, 404);
    const refreshed = await request('/auth/refresh', 'POST', { userId: ids[0] }, null, login.cookie);
    const generated = await request('/ai/replies', 'POST', { text: 'Que horas vocês abrem?', tone: 'profissional' }, refreshed.data.accessToken);
    assert.equal(generated.data.hasKnowledge, true);
    assert.equal(generated.data.replies.length, 3);
    assert.ok(generated.data.replies.every((reply) => typeof reply.text === 'string' && reply.text.trim()));
    await request('/auth/logout', 'POST', { userId: ids[0] }, null, refreshed.cookie, 204);
    await request('/auth/refresh', 'POST', { userId: ids[0] }, null, refreshed.cookie, 401);
    console.log('PASS: cadastro, login, perfil, persistência, isolamento entre usuários, refresh, IA real, logout e revogação.');
  } finally {
    if (ids.length) {
      const { error } = await db.from('app_users').delete().in('id', ids);
      if (error) { console.error('Não foi possível limpar os registros temporários.'); process.exitCode = 1; }
      else console.log('Registros fictícios de teste removidos.');
    }
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
