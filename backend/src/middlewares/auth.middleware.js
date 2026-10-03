const ApiError = require('../utils/ApiError');
const tokenService = require('../services/token.service');

// Extrai e valida o access token do header "Authorization: Bearer <token>",
// anexando o usuário autenticado em req.user para os controllers seguintes.
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Token de acesso não informado.'));
  }

  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireAuth };
