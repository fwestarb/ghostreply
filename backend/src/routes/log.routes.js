const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Recebe erros do lado da extensão (ex.: os seletores do WhatsApp Web
 * mudaram e o botão não pôde mais ser injetado).
 *
 * Sem isso, uma quebra do WhatsApp Web só apareceria quando a pessoa
 * que usa a extensão reclamasse. Com isso, o erro fica registrado em
 * backend/logs/error.log e dá para agir antes.
 *
 * Não exige autenticação de propósito: a falha pode acontecer antes
 * mesmo de a sessão carregar. Em compensação usa o rate limit mais
 * restrito e trunca tudo que entra.
 */
router.post(
  '/client-error',
  authLimiter,
  [
    body('code').isString().trim().notEmpty().isLength({ max: 60 }).withMessage('Código inválido.'),
    body('message').optional().isString().trim().isLength({ max: 500 }),
    body('url').optional().isString().trim().isLength({ max: 300 }),
    body('version').optional().isString().trim().isLength({ max: 20 })
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { code, message, url, version } = req.body;
    logger.error(`[extensão] ${code}`, {
      message: message || null,
      url: url || null,
      version: version || null,
      userAgent: (req.headers['user-agent'] || '').slice(0, 200)
    });
    res.status(204).send();
  })
);

module.exports = router;
