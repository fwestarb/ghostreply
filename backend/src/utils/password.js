const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

const hashPassword = (plainText) => bcrypt.hash(plainText, SALT_ROUNDS);

const comparePassword = (plainText, hash) => bcrypt.compare(plainText, hash);

// Usado para tokens opacos (refresh token, reset token): guardamos só o
// hash no banco, nunca o valor original, mesmo sendo um token e não uma senha.
const hashToken = (token) => bcrypt.hash(token, SALT_ROUNDS);
const compareToken = (token, hash) => bcrypt.compare(token, hash);

module.exports = { hashPassword, comparePassword, hashToken, compareToken };
