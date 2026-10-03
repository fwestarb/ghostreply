const env = require('../src/config/env');
const db = require('../src/config/supabase');
const provider = require('../src/services/openrouter.service');

(async () => {
  let failed = false;
  if (!env.isConfigured.supabase) {
    console.log('Banco: falta SUPABASE_URL ou SUPABASE_SECRET_KEY no backend/.env.');
    failed = true;
  } else {
    for (const table of ['app_users', 'refresh_tokens', 'password_resets', 'company_profile', 'knowledge_entries']) {
      const { error } = await db.from(table).select(table === 'company_profile' ? 'user_id' : 'id').limit(0);
      console.log(`${table}: ${error ? 'falha (' + error.code + ')' : 'acesso confirmado'}`);
      if (error) failed = true;
    }
  }
  if (process.argv.includes('--ai')) {
    try {
      const reply = await provider.chatCompletion([{ role: 'user', content: 'Responda apenas OK.' }], { maxTokens: 1500 });
      console.log(`IA real: resposta recebida (${reply.length} caracteres), usando ${env.openrouter.model}.`);
    } catch (error) { console.log(`IA: ${error.message}`); failed = true; }
  }
  process.exitCode = failed ? 1 : 0;
})().catch(() => { console.error('Não foi possível verificar a configuração.'); process.exitCode = 1; });
