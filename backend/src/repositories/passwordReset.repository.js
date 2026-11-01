const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

const TABLE = 'password_resets';

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

async function findUnusedByUserId(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());

  handleSupabaseError(error, 'findUnusedByUserId');
  return data || [];
}

async function markUsed(id, userId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from(TABLE).update({ used_at: now })
    .eq('id', id).eq('user_id', userId).is('used_at', null).gt('expires_at', now).select('id');
  handleSupabaseError(error, 'markUsed');
  return data?.length === 1;
}

module.exports = { create, findUnusedByUserId, markUsed };
