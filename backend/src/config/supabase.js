const { createClient } = require('@supabase/supabase-js');
const env = require('./env');
const ApiError = require('../utils/ApiError');

// A chave secreta é usada somente neste backend. Se faltar configuração,
// o servidor retorna erro 503 nas rotas de banco, sem tentar usar a chave
// placeholder para acessar o projeto.
const supabase = createClient(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseServiceRoleKey || 'placeholder-service-role-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

module.exports = new Proxy(supabase, {
  get(target, property) {
    if (property === 'from' && !env.isConfigured.supabase) {
      return () => { throw ApiError.serviceUnavailable('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no backend.'); };
    }
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
