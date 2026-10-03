const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

const TABLE = 'app_users';

const handleSupabaseError = (error, context) => {
  if (!error) return;
  throw ApiError.serviceUnavailable(`Erro ao acessar o banco de dados (${context}): ${error.message}`);
};

async function findByEmail(email) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  handleSupabaseError(error, 'findByEmail');
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  handleSupabaseError(error, 'findById');
  return data;
}

async function create({ name, email, passwordHash = null, provider = 'password', avatarUrl = null }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      provider,
      avatar_url: avatarUrl
    })
    .select('*')
    .single();

  handleSupabaseError(error, 'create');
  return data;
}

async function updateProfile(id, { name, avatarUrl }) {
  const payload = { updated_at: new Date().toISOString() };
  if (name !== undefined) payload.name = name;
  if (avatarUrl !== undefined) payload.avatar_url = avatarUrl;

  const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select('*').single();
  handleSupabaseError(error, 'updateProfile');
  return data;
}

async function updatePassword(id, passwordHash) {
  const { error } = await supabase
    .from(TABLE)
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', id);

  handleSupabaseError(error, 'updatePassword');
}

module.exports = { findByEmail, findById, create, updateProfile, updatePassword };
