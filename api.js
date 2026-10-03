/**
 * GhostReply - API client (IA)
 *
 * Este arquivo NÃO fala mais com a OpenRouter diretamente.
 *
 * Antes, a chave da API estava escrita aqui em texto puro — e como
 * este arquivo roda como content script dentro da página do WhatsApp,
 * qualquer pessoa com o DevTools aberto conseguia copiá-la. Agora
 * toda a IA passa pelo backend (backend/src/services/ai.service.js),
 * que é o único lugar onde a chave existe.
 *
 * O caminho é: content.js -> aqui -> background.js -> backend -> IA.
 * O mesmo trajeto que a autenticação já fazia (ver auth-client.js).
 */

const aiSendMessage = (type, payload) => GhostReplyMessaging.send(type, payload);
/**
 * Gera 3 sugestões de resposta para a última mensagem do cliente.
 *
 * Retorna { replies: [{ text, confident, reviewReason }], hasKnowledge }.
 * O campo "confident" vem do backend e indica se a resposta se apoia
 * na base de conhecimento cadastrada — quando é false, a interface
 * marca o card e não insere o texto automaticamente no WhatsApp.
 */
async function generateReplies(input, tone) {
  const { text, history } = typeof input === 'string' ? { text: input, history: null } : (input || {});

  if (!text || !text.trim()) {
    throw new Error('Digite uma mensagem para gerar respostas.');
  }

  const data = await aiSendMessage('AI_GENERATE_REPLIES', {
    text: text.trim(),
    history: Array.isArray(history) ? history : undefined,
    tone
  });

  const replies = Array.isArray(data?.replies) ? data.replies : [];
  if (!replies.length) {
    throw new Error('Não foi possível gerar respostas. Tente novamente.');
  }

  return { replies, hasKnowledge: Boolean(data?.hasKnowledge) };
}

async function translateText(text, sourceLanguage, targetLanguage) {
  if (!text || !text.trim()) {
    throw new Error('Digite um texto para traduzir.');
  }
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  const data = await aiSendMessage('AI_TRANSLATE', {
    text: text.trim(),
    from: sourceLanguage,
    to: targetLanguage
  });

  return data?.text || '';
}

async function improveGrammar(text) {
  if (!text || !text.trim()) {
    throw new Error('Digite um texto para melhorar.');
  }

  const data = await aiSendMessage('AI_IMPROVE_GRAMMAR', { text: text.trim() });

  return {
    corrected: data?.corrected || '',
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : []
  };
}

// Usado pela aba Empresa para avisar se a IA ainda não foi configurada
// no backend (chave da OpenRouter ausente no .env).
async function getAiStatus() {
  return aiSendMessage('AI_STATUS');
}
