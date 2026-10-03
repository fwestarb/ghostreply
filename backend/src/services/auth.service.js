const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const userRepository = require('../repositories/user.repository');
const userModel = require('../models/user.model');
const tokenService = require('./token.service');
const emailService = require('./email.service');
const googleService = require('./google.service');

const issueSession = async (userRow) => {
  const accessToken = tokenService.signAccessToken(userRow);
  const refreshToken = await tokenService.issueRefreshToken(userRow.id);
  return { user: userModel.toPublicUser(userRow), accessToken, refreshToken };
};

async function register({ name, email, password }) {
  const existente = await userRepository.findByEmail(email);
  if (existente) {
    throw ApiError.conflict('Já existe uma conta com este e-mail.');
  }

  const passwordHash = await hashPassword(password);
  const userRow = await userRepository.create({ name, email, passwordHash, provider: 'password' });

  return issueSession(userRow);
}

async function login({ email, password }) {
  const userRow = await userRepository.findByEmail(email);
  if (!userRow || !userRow.password_hash) {
    throw ApiError.unauthorized('E-mail ou senha inválidos.');
  }

  const senhaValida = await comparePassword(password, userRow.password_hash);
  if (!senhaValida) {
    throw ApiError.unauthorized('E-mail ou senha inválidos.');
  }

  return issueSession(userRow);
}

async function loginWithGoogle({ idToken }) {
  const perfilGoogle = await googleService.verifyGoogleIdToken(idToken);

  let userRow = await userRepository.findByEmail(perfilGoogle.email);
  if (!userRow) {
    userRow = await userRepository.create({
      name: perfilGoogle.name,
      email: perfilGoogle.email,
      passwordHash: null,
      provider: 'google',
      avatarUrl: perfilGoogle.avatarUrl
    });
  }

  return issueSession(userRow);
}

async function refresh({ userId, refreshToken }) {
  const registro = await tokenService.verifyRefreshToken(userId, refreshToken);
  const userRow = await userRepository.findById(userId);
  if (!userRow) {
    throw ApiError.unauthorized('Sessão inválida. Faça login novamente.');
  }

  const novoRefreshToken = await tokenService.rotateRefreshToken(userId, registro.id, refreshToken);
  const accessToken = tokenService.signAccessToken(userRow);

  return { user: userModel.toPublicUser(userRow), accessToken, refreshToken: novoRefreshToken };
}

async function logout({ userId, refreshToken }) {
  try {
    const registro = await tokenService.verifyRefreshToken(userId, refreshToken);
    await tokenService.revokeRefreshToken(registro);
  } catch {
    // Token já inválido/expirado: não há nada para revogar, mas o
    // logout deve ser idempotente do ponto de vista do cliente.
  }
}

async function forgotPassword({ email }) {
  const userRow = await userRepository.findByEmail(email);

  // Não revela se o e-mail existe ou não (evita enumeração de contas).
  if (!userRow) return { sent: true };

  const token = await tokenService.issuePasswordResetToken(userRow.id);
  const resetUrl = `${env.appBaseUrl}/reset-password?uid=${userRow.id}&token=${token}`;

  return emailService.sendPasswordResetEmail({ to: userRow.email, name: userRow.name, resetUrl });
}

async function resetPassword({ userId, token, newPassword }) {
  await tokenService.consumePasswordResetToken(userId, token);

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(userId, passwordHash);

  // Redefinir a senha invalida todas as sessões existentes — se alguém
  // comprometeu a senha antiga, também perde qualquer sessão já aberta.
  await tokenService.revokeAllRefreshTokens(userId);
}

module.exports = { register, login, loginWithGoogle, refresh, logout, forgotPassword, resetPassword };
