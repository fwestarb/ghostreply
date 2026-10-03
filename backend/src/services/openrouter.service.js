const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Cliente da OpenRouter — roda SÓ no servidor.
 *
 * Antes, esta chamada vivia em api.js dentro da extensão, com a chave
 * escrita em texto puro no content script. Isso significava que
 * qualquer pessoa com o DevTools aberto (ou com acesso ao repositório)
 * conseguia extrair a chave. Agora a chave nunca sai daqui: a extensão
 * chama /api/ai/* autenticada, e o backend é quem fala com a OpenRouter.
 */

const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRIES = 0;
const RETRY_BASE_DELAY_MS = 600;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableStatus = (status) => [408, 429, 500, 502, 503, 504].includes(status);

const extrairMensagemDeErro = async (response) => {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || null;
  } catch {
    return null;
  }
};

async function chatCompletion(messages, options = {}) {
  if (!env.openrouter.apiKey) {
    throw ApiError.serviceUnavailable(
      'OPENROUTER_API_KEY não configurada no backend. Preencha o arquivo .env antes de gerar respostas.'
    );
  }

  const {
    temperature = 0.7,
    maxTokens = 700,
    model = env.openrouter.model,
    responseFormat = null,
    retries = MAX_RETRIES
  } = options;

  if (model !== 'openrouter/free' && !model.endsWith(':free')) {
    throw ApiError.serviceUnavailable('Use openrouter/free ou um modelo com sufixo :free. Modelos pagos estão bloqueados.');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(env.openrouter.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openrouter.apiKey}`,
        // A OpenRouter usa estes headers só para atribuição/ranking.
        'HTTP-Referer': env.appBaseUrl,
        'X-Title': 'GhostReply'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        reasoning: { enabled: false },
        ...(responseFormat ? { response_format: responseFormat } : {})
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      if (retries > 0 && isRetryableStatus(response.status)) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return chatCompletion(messages, { ...options, retries: retries - 1 });
      }

      const detalhe = await extrairMensagemDeErro(response);
      logger.error('Falha na chamada à OpenRouter', { status: response.status });

      if (response.status === 401 || response.status === 403) {
        throw ApiError.serviceUnavailable('Chave da OpenRouter inválida ou sem permissão. Verifique o .env do backend.');
      }
      if (response.status === 402) {
        throw ApiError.serviceUnavailable('O provedor gratuito está indisponível. Nenhum modelo pago foi acionado.');
      }
      if (response.status === 429) {
        throw ApiError.tooManyRequests('Limite de uso da OpenRouter atingido. Tente novamente em instantes.');
      }
      throw ApiError.serviceUnavailable(`IA gratuita indisponível (HTTP ${response.status}). Tente mais tarde.`);
    }

    const payload = await response.json();
    if (payload.error) throw ApiError.serviceUnavailable('O provedor gratuito não concluiu a geração. Tente mais tarde.');
    if (payload.choices?.[0]?.finish_reason === 'length') throw ApiError.serviceUnavailable('A resposta da IA ficou incompleta. Tente uma mensagem mais curta.');
    const content = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text;

    if (!content || !String(content).trim()) {
      throw ApiError.serviceUnavailable('A IA retornou uma resposta vazia. Tente novamente.');
    }

    return String(content).trim();
  } catch (err) {
    if (err instanceof ApiError) throw err;

    if (err.name === 'AbortError') {
      if (retries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return chatCompletion(messages, { ...options, retries: retries - 1 });
      }
      throw ApiError.serviceUnavailable('A IA demorou demais para responder. Tente novamente.');
    }

    if (err instanceof TypeError) {
      // fetch lança TypeError para falha de rede (DNS, sem conexão, etc.)
      if (retries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return chatCompletion(messages, { ...options, retries: retries - 1 });
      }
      throw ApiError.serviceUnavailable('Não foi possível conectar à OpenRouter. Verifique a conexão do servidor.');
    }

    logger.error('Erro inesperado na chamada à OpenRouter', { message: err.message });
    throw ApiError.serviceUnavailable('Erro inesperado ao falar com a IA. Tente novamente.');
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { chatCompletion };
