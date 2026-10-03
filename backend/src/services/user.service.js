const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const userRepository = require('../repositories/user.repository');
const userModel = require('../models/user.model');
const tokenService = require('./token.service');

async function getProfile(userId) {
  const userRow = await userRepository.findById(userId);
  if (!userRow) throw ApiError.notFound('Usuário não encontrado.');
  return userModel.toPublicUser(userRow);
}

async function updateProfile(userId, { name, avatarUrl }) {
  const userRow = await userRepository.updateProfile(userId, { name, avatarUrl });
  return userModel.toPublicUser(userRow);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const userRow = await userRepository.findById(userId);
  if (!userRow) throw ApiError.notFound('Usuário não encontrado.');

  if (!userRow.password_hash) {
    throw ApiError.badRequest('Esta conta usa login com Google e não possui senha local.');
  }

  const senhaAtualValida = await comparePassword(currentPassword, userRow.password_hash);
  if (!senhaAtualValida) {
    throw ApiError.unauthorized('Senha atual incorreta.');
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(userId, passwordHash);

  // Mesma lógica do reset por e-mail: trocar a senha invalida as
  // demais sessões abertas em outros dispositivos.
  await tokenService.revokeAllRefreshTokens(userId);
}

module.exports = { getProfile, updateProfile, changePassword };
