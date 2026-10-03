const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Limite geral, aplicado a toda a API.
const generalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Muitas requisições. Tente novamente em breve.' } }
});

// Limite mais restrito para rotas sensíveis a força bruta/spam
// (login, cadastro, recuperação de senha).
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Muitas tentativas. Tente novamente em breve.' } }
});

// Limite das rotas de IA. Aqui a preocupação não é força bruta, é
// custo: cada chamada gasta créditos da OpenRouter. Uma janela curta
// com teto generoso protege contra um loop acidental na extensão sem
// atrapalhar o uso normal de quem responde mensagens o dia todo.
const aiLimiter = rateLimit({
  windowMs: env.rateLimit.aiWindowMs,
  max: env.rateLimit.aiMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Muitas gerações seguidas. Aguarde alguns instantes e tente novamente.' } }
});

module.exports = { generalLimiter, authLimiter, aiLimiter };
