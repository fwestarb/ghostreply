/**
 * GhostReply - Knowledge Client
 *
 * Wrapper fino sobre chrome.runtime.sendMessage para a base de
 * conhecimento da empresa (tom de voz, FAQ, políticas). Mesmo padrão
 * de auth-client.js: content.js nunca lida com mensageria bruta.
 *
 * É esse conteúdo que o backend injeta no prompt a cada geração de
 * resposta — ou seja, é ele que faz o bot responder como esta empresa
 * específica em vez de responder genérico.
 */

const knowledgeSendMessage = (type, payload) => GhostReplyMessaging.send(type, payload);
const KnowledgeClient = {
  getProfile: () => knowledgeSendMessage('KB_GET_PROFILE'),
  saveProfile: (profile) => knowledgeSendMessage('KB_SAVE_PROFILE', profile),
  listEntries: () => knowledgeSendMessage('KB_LIST_ENTRIES'),
  createEntry: (entry) => knowledgeSendMessage('KB_CREATE_ENTRY', entry),
  updateEntry: (id, entry) => knowledgeSendMessage('KB_UPDATE_ENTRY', { id, ...entry }),
  removeEntry: (id) => knowledgeSendMessage('KB_REMOVE_ENTRY', { id })
};
