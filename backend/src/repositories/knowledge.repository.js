const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

const TABLE = 'knowledge_entries';

const handleSupabaseError = (error, context) => {
  if (!error) return;
  throw ApiError.serviceUnavailable(`Erro ao acessar o banco de dados (${context}): ${error.message}`);
};

async function listByUserId(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('type', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  handleSupabaseError(error, 'knowledge.listByUserId');
  return data || [];
}

async function findById(userId, id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  handleSupabaseError(error, 'knowledge.findById');
  return data;
}

async function create(userId, { type, title, content, position }) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      type: type || 'faq',
      title: title || '',
      content,
      position: Number.isInteger(position) ? position : 0
    })
    .select('*')
    .single();

  handleSupabaseError(error, 'knowledge.create');
  return data;
}

async function update(userId, id, { type, title, content, position }) {
  const payload = { updated_at: new Date().toISOString() };
  if (type !== undefined) payload.type = type;
  if (title !== undefined) payload.title = title;
  if (content !== undefined) payload.content = content;
  if (position !== undefined) payload.position = position;

  // O filtro por user_id junto do id impede que um usuário edite a
  // entrada de outro mesmo conhecendo o uuid.
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  handleSupabaseError(error, 'knowledge.update');
  return data;
}

async function remove(userId, id) {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('id', id);
  handleSupabaseError(error, 'knowledge.remove');
}

module.exports = { listByUserId, findById, create, update, remove };
