const { body } = require('express-validator');

const MAX_TEXTO = 4000;

const generateRepliesValidators = [
  body('text')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Texto é obrigatório.')
    .isLength({ max: MAX_TEXTO })
    .withMessage('Texto muito longo.'),
  body('tone').optional().isString().isIn(['casual', 'confiante', 'profissional', 'direto']).withMessage('Tom inválido.'),
  body('history').optional().isArray({ max: 20 }).withMessage('Histórico inválido.'),
  body('history.*.text').optional().isString().isLength({ max: 2000 }).withMessage('Mensagem do histórico muito longa.'),
  body('history.*.outgoing').optional().isBoolean().withMessage('Campo "outgoing" inválido.')
];

const translateValidators = [
  body('text').isString().trim().notEmpty().withMessage('Texto é obrigatório.').isLength({ max: MAX_TEXTO }),
  body('from').isString().trim().notEmpty().withMessage('Idioma de origem é obrigatório.'),
  body('to').isString().trim().notEmpty().withMessage('Idioma de destino é obrigatório.')
];

const grammarValidators = [
  body('text').isString().trim().notEmpty().withMessage('Texto é obrigatório.').isLength({ max: MAX_TEXTO })
];

module.exports = { generateRepliesValidators, translateValidators, grammarValidators };
