const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Verificação via endpoint público do Google (sem precisar de client
// secret nem de biblioteca extra): ele já valida a assinatura e a
// expiração do id_token. O que sobra para nós validar é o "aud"
// (garantir que o token foi emitido para o nosso app, não para outro).
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

async function verifyGoogleIdToken(idToken) {
  if (!env.googleClientId) {
    throw ApiError.serviceUnavailable('Login Google não configurado. Use cadastro/login com e-mail.');
  }
  if (!idToken) {
    throw ApiError.badRequest('Token do Google não informado.');
  }

  const response = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw ApiError.unauthorized('Token do Google inválido ou expirado.');
  }

  const payload = await response.json();

  if (payload.aud !== env.googleClientId) {
    throw ApiError.unauthorized('Token do Google não foi emitido para este aplicativo.');
  }

  if (!payload.email || payload.email_verified !== 'true') {
    throw ApiError.unauthorized('Conta do Google sem e-mail verificado.');
  }

  return {
    email: payload.email,
    name: payload.name || payload.email,
    avatarUrl: payload.picture || null
  };
}

module.exports = { verifyGoogleIdToken };
