const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { hashToken, compareToken } = require('../utils/password');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const passwordResetRepository = require('../repositories/passwordReset.repository');

// --- Access token: JWT de curta duração, enviado no corpo da resposta e
// usado pelo cliente no header "Authorization: Bearer <token>". ---
const signAccessToken = (user) => {
  if (!env.jwtSecret) {
    throw ApiError.serviceUnavailable('JWT_SECRET não configurado no backend.');
  }
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Token de acesso inválido ou expirado.');
  }
};

// --- Refresh token: valor opaco (uuid), devolvido em cookie httpOnly.
// Só o hash fica no banco, então pode ser revogado a qualquer momento
// e nunca é reconstruível a partir do que está armazenado. ---
const issueRefreshToken = async (userId) => {
  const token = uuidv4();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000).toISOString();

  await refreshTokenRepository.create({ userId, tokenHash, expiresAt });
  return token;
};

const verifyRefreshToken = async (userId, token) => {
  const registros = await refreshTokenRepository.findActiveByUserId(userId);

  for (const registro of registros) {
    // eslint-disable-next-line no-await-in-loop
    if (await compareToken(token, registro.token_hash)) {
      return registro;
    }
  }

  throw ApiError.unauthorized('Sessão inválida. Faça login novamente.');
};

const rotateRefreshToken = async (userId, oldTokenRecordId, oldToken) => {
  await refreshTokenRepository.revoke(oldTokenRecordId);
  return issueRefreshToken(userId);
};

const revokeRefreshToken = async (registro) => {
  await refreshTokenRepository.revoke(registro.id);
};

const revokeAllRefreshTokens = async (userId) => {
  await refreshTokenRepository.revokeAllForUser(userId);
};

// --- Password reset token: mesmo padrão do refresh token, só que
// de uso único e vida curta (1 hora). ---
const PASSWORD_RESET_EXPIRES_IN_MS = 60 * 60 * 1000;

const issuePasswordResetToken = async (userId) => {
  const token = uuidv4();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN_MS).toISOString();

  await passwordResetRepository.create({ userId, tokenHash, expiresAt });
  return token;
};

const consumePasswordResetToken = async (userId, token) => {
  const registros = await passwordResetRepository.findUnusedByUserId(userId);

  for (const registro of registros) {
    // eslint-disable-next-line no-await-in-loop
    if (await compareToken(token, registro.token_hash)) {
      await passwordResetRepository.markUsed(registro.id);
      return true;
    }
  }

  throw ApiError.badRequest('Link de redefinição de senha inválido ou expirado.');
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  issuePasswordResetToken,
  consumePasswordResetToken
};
