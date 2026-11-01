const bcrypt = require('bcrypt');
const ApiError = require('./ApiError');

const SALT_ROUNDS = 12;

const MAX_PASSWORD_BYTES = 72;
const passwordFits = (plainText) => typeof plainText === 'string' && Buffer.byteLength(plainText, 'utf8') <= MAX_PASSWORD_BYTES;
const assertPasswordLength = (plainText) => {
  if (!passwordFits(plainText)) throw ApiError.badRequest('A senha deve ter no máximo 72 bytes UTF-8 (acentos podem ocupar mais de um byte).');
};
const hashPassword = async (plainText) => {
  assertPasswordLength(plainText);
  return bcrypt.hash(plainText, SALT_ROUNDS);
};

const comparePassword = async (plainText, hash) => passwordFits(plainText) && bcrypt.compare(plainText, hash);

// Usado para tokens opacos (refresh token, reset token): guardamos só o
// hash no banco, nunca o valor original, mesmo sendo um token e não uma senha.
const hashToken = (token) => bcrypt.hash(token, SALT_ROUNDS);
const compareToken = (token, hash) => bcrypt.compare(token, hash);

module.exports = { hashPassword, comparePassword, hashToken, compareToken, assertPasswordLength, MAX_PASSWORD_BYTES };
