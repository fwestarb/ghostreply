/**
 * GhostReply - Background Service Worker
 * Único lugar da extensão que fala com a rede para autenticação.
 * A extensão NUNCA acessa o banco de dados diretamente — tudo passa
 * pelo backend HTTP (pasta backend/). content.js só fala com este
 * arquivo via chrome.runtime.sendMessage (ver auth-client.js).
 *
 * Para apontar para um backend em outro endereço (produção), troque
 * API_BASE_URL abaixo E o host_permissions correspondente em manifest.json.
 */

const API_BASE_URL = 'http://localhost:4000/api';

// Login com Google: a extensão obtém um id_token direto do Google via
// chrome.identity.launchWebAuthFlow (não passa mais pelo Supabase) e o
// backend só verifica esse token — não precisa de client secret aqui.
// Preencha com o Client ID (tipo "Aplicativo da Web") criado no Google
// Cloud Console, com a URI abaixo autorizada como redirect URI.

const SESSION_KEY = 'gr_session';
const REQUEST_TIMEOUT_MS = 10000;
// Geração de resposta passa por um modelo de linguagem: 10s não bastam.
const AI_REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const REFRESH_MARGIN_MS = 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableStatus = (status) => [502, 503, 504].includes(status);

/**
 * Wrapper único de fetch para o backend:
 * - timeout via AbortController;
 * - retry automático com backoff, só para falha de rede ou 5xx de
 *   gateway (nunca para 4xx — reenviar uma senha errada não a torna certa);
 * - credentials 'include' sempre, para o cookie httpOnly do refresh
 *   token viajar junto às requisições;
 * - erro sempre traduzido para uma mensagem amigável.
 */
const apiFetch = async (path, { method = 'GET', body, accessToken, retries = MAX_RETRIES, timeoutMs = REQUEST_TIMEOUT_MS } = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      if (retries > 0 && isRetryableStatus(response.status)) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return apiFetch(path, { method, body, accessToken, timeoutMs, retries: retries - 1 });
      }
      const data = await response.json().catch(() => ({}));
      const details = data?.error?.details?.map((item) => item.message).filter(Boolean);
      throw new Error(details?.length ? [...new Set(details)].join(' ') :
        data?.error?.message || `Erro do servidor (código ${response.status}).`);
    }

    if (response.status === 204) return null;
    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (retries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return apiFetch(path, { method, body, accessToken, timeoutMs, retries: retries - 1 });
      }
      throw new Error('A requisição demorou demais para responder. Verifique sua conexão e tente novamente.');
    }
    if (err instanceof TypeError) {
      // fetch lança TypeError para falha de rede (sem conexão, DNS, backend fora do ar).
      if (retries > 0) {
        await sleep(RETRY_BASE_DELAY_MS * (MAX_RETRIES - retries + 1));
        return apiFetch(path, { method, body, accessToken, timeoutMs, retries: retries - 1 });
      }
      throw new Error('O backend local está desligado ou inacessível. Abra a pasta backend e execute npm start.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

const decodeJwtExpiry = (token) => {
  try {
    const payloadBase64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(payloadBase64));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

// "Nunca confiar em respostas sem validação": checagem mínima de forma
// antes de tratar uma resposta do backend como uma sessão válida.
const assertSessionShape = (data) => {
  if (!data || typeof data.accessToken !== 'string' || !data.user || typeof data.user.id !== 'string') {
    throw new Error('Resposta inesperada do servidor.');
  }
  return data;
};

const buildSession = (data, remember) => {
  assertSessionShape(data);
  return {
    accessToken: data.accessToken,
    expiresAt: decodeJwtExpiry(data.accessToken) || Date.now() + 15 * 60 * 1000,
    user: data.user,
    remember
  };
};

// "Nunca armazenar dados sensíveis": o refresh token nem chega até
// aqui — ele vive só no cookie httpOnly do backend, inacessível ao JS.
// Guardamos apenas o access token (de vida curta) e o perfil público.
const storageArea = (remember) => (remember ? chrome.storage.local : chrome.storage.session);

const saveSession = async (session, remember) => {
  await storageArea(!remember).remove(SESSION_KEY);
  await storageArea(remember).set({ [SESSION_KEY]: { ...session, remember } });
};

const clearSession = async () => {
  await chrome.storage.local.remove(SESSION_KEY);
  await chrome.storage.session.remove(SESSION_KEY);
};

const loadStoredSession = async () => {
  const local = await chrome.storage.local.get(SESSION_KEY);
  if (local[SESSION_KEY]) return local[SESSION_KEY];
  const session = await chrome.storage.session.get(SESSION_KEY);
  return session[SESSION_KEY] || null;
};

async function refreshSession(current) {
  const data = await apiFetch('/auth/refresh', { method: 'POST', body: { userId: current.user.id } });
  const session = buildSession(data, current.remember);
  await saveSession(session, current.remember);
  return session;
}

async function getSession() {
  const current = await loadStoredSession();
  if (!current) return null;

  if (current.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
    return current;
  }

  try {
    return await refreshSession(current);
  } catch {
    await clearSession();
    return null;
  }
}

async function signUp({ name, email, password }) {
  // O formulário de cadastro já valida a confirmação de senha antes de
  // chamar esta função; reenviamos o mesmo valor para satisfazer o
  // validador do backend sem pedir o campo duas vezes aqui.
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: { name, email, password, confirmPassword: password },
    retries: 0
  });
  const session = buildSession(data, true);
  await saveSession(session, true);
  return session;
}

async function signIn({ email, password, remember = true }) {
  const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
  const session = buildSession(data, remember);
  await saveSession(session, remember);
  return session;
}

async function signOut() {
  const current = await loadStoredSession();
  if (current?.user?.id) {
    await apiFetch('/auth/logout', { method: 'POST', body: { userId: current.user.id } }).catch(() => {});
  }
  await clearSession();
  return { ok: true };
}

async function recoverPassword({ email }) {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
}

async function updatePassword({ currentPassword, newPassword }) {
  const current = await loadStoredSession();
  if (!current?.accessToken) throw new Error('Sessão inválida. Faça login novamente.');
  return apiFetch('/users/me/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
    accessToken: current.accessToken
  });
}

async function updateProfile({ name }) {
  const current = await loadStoredSession();
  if (!current?.accessToken) throw new Error('Sessão inválida. Faça login novamente.');

  const data = await apiFetch('/users/me', { method: 'PATCH', body: { name }, accessToken: current.accessToken });
  if (!data?.user?.id) throw new Error('Resposta inesperada do servidor.');

  await saveSession({ ...current, user: data.user }, current.remember);
  return data.user;
}

async function authCapabilities() {
  return apiFetch('/auth/config', { retries: 0 });
}

async function signInWithGoogle() {
  const config = await authCapabilities();
  if (!config.googleClientId) {
    throw new Error('O login Google precisa ser configurado no servidor. Use cadastro/login com e-mail por enquanto.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: crypto.randomUUID(),
    prompt: 'select_account'
  });

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    interactive: true
  });

  const fragment = new URL(responseUrl).hash.replace(/^#/, '');
  const parsedParams = new URLSearchParams(fragment);

  const erro = parsedParams.get('error');
  if (erro) throw new Error(`Não foi possível concluir o login com Google (${erro}).`);

  const idToken = parsedParams.get('id_token');
  if (!idToken) throw new Error('Não foi possível concluir o login com Google.');

  const data = await apiFetch('/auth/google', { method: 'POST', body: { idToken } });
  const session = buildSession(data, true);
  await saveSession(session, true);
  return session;
}

// ============================================================
// IA e base de conhecimento
// ============================================================

/**
 * Toda rota de IA e de base de conhecimento exige um access token
 * válido. getSession() já renova o token sozinho quando ele está
 * perto de expirar, então basta pedi-lo aqui antes de cada chamada.
 */
const withAccessToken = async () => {
  const session = await getSession();
  if (!session?.accessToken) {
    throw new Error('Faça login na aba Conta para usar a IA.');
  }
  return session.accessToken;
};

async function aiGenerateReplies({ text, history, tone }) {
  const accessToken = await withAccessToken();
  return apiFetch('/ai/replies', {
    method: 'POST',
    body: { text, history, tone },
    accessToken,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    // Sem retry automático: uma geração custa créditos da OpenRouter,
    // e o backend já tenta de novo internamente quando faz sentido.
    retries: 0
  });
}

async function aiTranslate({ text, from, to }) {
  const accessToken = await withAccessToken();
  return apiFetch('/ai/translate', {
    method: 'POST',
    body: { text, from, to },
    accessToken,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    retries: 0
  });
}

async function aiImproveGrammar({ text }) {
  const accessToken = await withAccessToken();
  return apiFetch('/ai/grammar', {
    method: 'POST',
    body: { text },
    accessToken,
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    retries: 0
  });
}

async function aiStatus() {
  const accessToken = await withAccessToken();
  return apiFetch('/ai/status', { accessToken });
}

async function kbGetProfile() {
  const accessToken = await withAccessToken();
  const data = await apiFetch('/knowledge/profile', { accessToken });
  return data?.profile || null;
}

async function kbSaveProfile(profile) {
  const accessToken = await withAccessToken();
  const data = await apiFetch('/knowledge/profile', { method: 'PUT', body: profile, accessToken });
  return data?.profile || null;
}

async function kbListEntries() {
  const accessToken = await withAccessToken();
  const data = await apiFetch('/knowledge/entries', { accessToken });
  return data?.entries || [];
}

async function kbCreateEntry(entry) {
  const accessToken = await withAccessToken();
  const data = await apiFetch('/knowledge/entries', { method: 'POST', body: entry, accessToken });
  return data?.entry || null;
}

async function kbUpdateEntry({ id, ...entry }) {
  const accessToken = await withAccessToken();
  const data = await apiFetch(`/knowledge/entries/${id}`, { method: 'PATCH', body: entry, accessToken });
  return data?.entry || null;
}

async function kbRemoveEntry({ id }) {
  const accessToken = await withAccessToken();
  await apiFetch(`/knowledge/entries/${id}`, { method: 'DELETE', accessToken });
  return { ok: true };
}

/**
 * Registra no backend uma falha do lado da extensão (ex.: os
 * seletores do WhatsApp Web mudaram). Nunca lança: um problema ao
 * reportar um problema não pode virar um segundo problema visível
 * para quem está atendendo.
 */
async function reportClientError({ code, message, url }) {
  try {
    await apiFetch('/logs/client-error', {
      method: 'POST',
      body: {
        code,
        message,
        url,
        version: chrome.runtime.getManifest()?.version
      },
      retries: 0
    });
  } catch {
    // silencioso de propósito
  }
  return { ok: true };
}

const HANDLERS = {
  AUTH_CAPABILITIES: authCapabilities,
  AUTH_GET_SESSION: getSession,
  AUTH_SIGNUP: signUp,
  AUTH_LOGIN: signIn,
  AUTH_LOGOUT: signOut,
  AUTH_RECOVER: recoverPassword,
  AUTH_UPDATE_PASSWORD: updatePassword,
  AUTH_UPDATE_PROFILE: updateProfile,
  AUTH_GOOGLE: signInWithGoogle,

  AI_GENERATE_REPLIES: aiGenerateReplies,
  AI_TRANSLATE: aiTranslate,
  AI_IMPROVE_GRAMMAR: aiImproveGrammar,
  AI_STATUS: aiStatus,

  KB_GET_PROFILE: kbGetProfile,
  KB_SAVE_PROFILE: kbSaveProfile,
  KB_LIST_ENTRIES: kbListEntries,
  KB_CREATE_ENTRY: kbCreateEntry,
  KB_UPDATE_ENTRY: kbUpdateEntry,
  KB_REMOVE_ENTRY: kbRemoveEntry,

  LOG_CLIENT_ERROR: reportClientError
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: 'Recarregue o GhostReply e atualize o WhatsApp Web para usar a versão atual.' });
    return false;
  }

  // A IA pode levar mais de 30 s. Uma chamada à API do Chrome a cada
  // 20 s mantém o worker vivo apenas enquanto esta operação está ativa.
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, 20000);
  Promise.resolve().then(() => handler(message.payload || {}))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || 'Falha ao processar a solicitação.' }))
    .finally(() => clearInterval(keepAlive));

  return true;
});

console.log('[GhostReply] Redirect URI para o Google OAuth Client:', chrome.identity.getRedirectURL());
