// Nunca devolvemos a linha crua do banco (tem password_hash) para
// nenhuma resposta de API — sempre passar pelo toPublicUser primeiro.
const toPublicUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

module.exports = { toPublicUser };
