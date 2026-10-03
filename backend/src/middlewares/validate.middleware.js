const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Roda depois das cadeias do express-validator; se houver erro de
// validação, responde 400 com todos os erros de uma vez em vez de
// deixar cada controller reimplementar essa checagem.
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((err) => ({ field: err.path, message: err.msg }));
  return next(ApiError.badRequest('Dados inválidos.', details));
};

module.exports = validate;
