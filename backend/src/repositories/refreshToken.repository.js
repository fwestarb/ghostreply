const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

const TABLE = 'refresh_tokens';

const handleSupabaseError = (error, context) => {
  if (!error) return;
  throw ApiError.serviceUnavailable(`Erro ao acessar o banco de dados (${context}): ${error.message}`);
};

async function create({ userId, tokenHash, expiresAt }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt })
    .select('*')
    .single();

  handleSupabaseError(error, 'create');
  return data;
}

// Não dá para buscar por token_hash diretamente (o hash de bcrypt não é
// determinístico), então carregamos os tokens ativos do usuário e
// comparamos um a um com bcrypt.compare no service layer.
async function findActiveByUserId(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  handleSupabaseError(error, 'findActiveByUserId');
  return data || [];
}

async function revoke(id) {
  const { error } = await supabase.from(TABLE).update({ revoked_at: new Date().toISOString() }).eq('id', id);
  handleSupabaseError(error, 'revoke');
}

async function revokeAllForUser(userId) {
  const { error } = await supabase
    .from(TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  handleSupabaseError(error, 'revokeAllForUser');
}

module.exports = { create, findActiveByUserId, revoke, revokeAllForUser };
