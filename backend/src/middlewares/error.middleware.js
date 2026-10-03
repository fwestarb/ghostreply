const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const notFound = (req, res, next) => {
  next(ApiError.notFound(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
};

// Middleware final da cadeia (4 argumentos = Express reconhece como
// error handler). Qualquer erro passado via next(err) cai aqui.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;

  if (!isApiError) {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl });
  }

  res.status(statusCode).json({
    error: {
      message: isApiError ? err.message : 'Erro interno do servidor.',
      ...(isApiError && err.details ? { details: err.details } : {})
    }
  });
};

module.exports = { notFound, errorHandler };
