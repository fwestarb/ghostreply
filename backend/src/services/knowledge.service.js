const ApiError = require('../utils/ApiError');
const knowledgeRepository = require('../repositories/knowledge.repository');
const companyProfileRepository = require('../repositories/companyProfile.repository');
const { toPublicEntry, toPublicProfile } = require('../models/knowledge.model');

const TYPE_LABELS = {
  faq: 'PERGUNTAS FREQUENTES',
  policy: 'POLÍTICAS E PRAZOS',
  note: 'OUTRAS INFORMAÇÕES'
};

const TYPE_ORDER = ['faq', 'policy', 'note'];

async function getProfile(userId) {
  const row = await companyProfileRepository.findByUserId(userId);
  return toPublicProfile(row);
}

async function saveProfile(userId, payload) {
  const row = await companyProfileRepository.upsert(userId, payload);
  return toPublicProfile(row);
}

async function listEntries(userId) {
  const rows = await knowledgeRepository.listByUserId(userId);
  return rows.map(toPublicEntry);
}

async function createEntry(userId, payload) {
  const row = await knowledgeRepository.create(userId, payload);
  return toPublicEntry(row);
}

async function updateEntry(userId, id, payload) {
  const row = await knowledgeRepository.update(userId, id, payload);
  if (!row) throw ApiError.notFound('Entrada não encontrada.');
  return toPublicEntry(row);
}

async function removeEntry(userId, id) {
  const existente = await knowledgeRepository.findById(userId, id);
  if (!existente) throw ApiError.notFound('Entrada não encontrada.');
  await knowledgeRepository.remove(userId, id);
}

/**
 * Monta o bloco de texto que vai dentro do system prompt.
 *
 * Este é o coração da precisão do bot: é a ÚNICA fonte de verdade que
 * o modelo tem sobre a empresa. Tudo que não estiver aqui, o modelo
 * deve tratar como desconhecido (ver ai.service.js, que adiciona a
 * regra explícita de não inventar).
 *
 * Retorna também "hasKnowledge", usado pelo ai.service para decidir o
 * comportamento quando a base ainda está vazia — nesse caso o bot
 * precisa ser ainda mais conservador, porque não sabe absolutamente
 * nada sobre a empresa.
 */
async function buildContext(userId) {
  const [profileRow, entries] = await Promise.all([
    companyProfileRepository.findByUserId(userId),
    knowledgeRepository.listByUserId(userId)
  ]);

  const profile = toPublicProfile(profileRow);
  const partes = [];

  if (profile.companyName) partes.push(`Empresa: ${profile.companyName}`);
  if (profile.businessSummary) partes.push(`Sobre o negócio: ${profile.businessSummary}`);

  const porTipo = TYPE_ORDER.map((tipo) => ({
    tipo,
    itens: entries.filter((entry) => entry.type === tipo)
  })).filter((grupo) => grupo.itens.length > 0);

  for (const grupo of porTipo) {
    const linhas = grupo.itens.map((item) => {
      const titulo = (item.title || '').trim();
      const conteudo = (item.content || '').trim();
      if (grupo.tipo === 'faq' && titulo) return `- Pergunta: ${titulo}\n  Resposta: ${conteudo}`;
      if (titulo) return `- ${titulo}: ${conteudo}`;
      return `- ${conteudo}`;
    });
    partes.push(`${TYPE_LABELS[grupo.tipo]}:\n${linhas.join('\n')}`);
  }

  return {
    profile,
    knowledgeBlock: partes.join('\n\n'),
    hasKnowledge: entries.length > 0 || Boolean(profile.businessSummary)
  };
}

module.exports = {
  getProfile,
  saveProfile,
  listEntries,
  createEntry,
  updateEntry,
  removeEntry,
  buildContext
};
