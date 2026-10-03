const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
const provider = require('../src/services/openrouter.service');
const knowledge = require('../src/services/knowledge.service');
const ai = require('../src/services/ai.service');

test('modelos pagos são bloqueados antes de chamar o provedor', async () => {
  const key = env.openrouter.apiKey;
  env.openrouter.apiKey = 'test';
  try { await assert.rejects(provider.chatCompletion([], { model: 'paid/model' }), /pagos estão bloqueados/); }
  finally { env.openrouter.apiKey = key; }
});

test('limite gratuito não provoca tentativas automáticas', async () => {
  const originalFetch = global.fetch;
  const key = env.openrouter.apiKey;
  env.openrouter.apiKey = 'test';
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: false, status: 429, json: async () => ({}) }; };
  try {
    await assert.rejects(provider.chatCompletion([], { model: 'openrouter/free' }), (err) => err.statusCode === 429);
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; env.openrouter.apiKey = key; }
});

test('base vazia força revisão mesmo se o modelo declarar confiança', async () => {
  const originalContext = knowledge.buildContext;
  const originalCompletion = provider.chatCompletion;
  knowledge.buildContext = async () => ({ profile: {}, knowledgeBlock: '', hasKnowledge: false });
  provider.chatCompletion = async () => JSON.stringify({ replies: [
    { text: 'Vou verificar.', confident: true }, { unexpected: 'invalid' }
  ] });
  try {
    const result = await ai.generateReplies('test-user', { text: 'Qual o preço?' });
    assert.equal(result.replies.length, 1);
    assert.equal(result.replies[0].confident, false);
    assert.match(result.replies[0].reviewReason, /vazia/);
    assert.equal(result.hasKnowledge, false);
  } finally { knowledge.buildContext = originalContext; provider.chatCompletion = originalCompletion; }
});
