const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

const TABLE = 'company_profile';

const handleSupabaseError = (error, context) => {
  if (!error) return;
  throw ApiError.serviceUnavailable(`Erro ao acessar o banco de dados (${context}): ${error.message}`);
};

async function findByUserId(userId) {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  handleSupabaseError(error, 'companyProfile.findByUserId');
  return data;
}

// Upsert em vez de insert/update separados: o perfil é 1:1 com o
// usuário, então "salvar" nunca precisa saber se já existia antes.
async function upsert(userId, { companyName, businessSummary, toneOfVoice, escalationNote }) {
  const payload = { user_id: userId, updated_at: new Date().toISOString() };
  if (companyName !== undefined) payload.company_name = companyName;
  if (businessSummary !== undefined) payload.business_summary = businessSummary;
  if (toneOfVoice !== undefined) payload.tone_of_voice = toneOfVoice;
  if (escalationNote !== undefined) payload.escalation_note = escalationNote;

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  handleSupabaseError(error, 'companyProfile.upsert');
  return data;
}

module.exports = { findByUserId, upsert };
