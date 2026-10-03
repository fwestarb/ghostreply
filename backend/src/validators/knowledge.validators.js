const { body, param } = require('express-validator');

// Limites existem para o prompt não estourar: tudo isso é injetado
// no system prompt a cada geração de resposta (ver knowledge.service).
const MAX_CONTEUDO = 2000;
const MAX_TITULO = 300;

const saveProfileValidators = [
  body('companyName').optional().isString().trim().isLength({ max: 160 }).withMessage('Nome da empresa muito longo.'),
  body('businessSummary').optional().isString().trim().isLength({ max: 1500 }).withMessage('Descrição do negócio muito longa.'),
  body('toneOfVoice').optional().isString().trim().isLength({ max: 1500 }).withMessage('Tom de voz muito longo.'),
  body('escalationNote').optional().isString().trim().isLength({ max: 1500 }).withMessage('Texto muito longo.')
];

const createEntryValidators = [
  body('type').optional().isIn(['faq', 'policy', 'note']).withMessage('Tipo inválido.'),
  body('title').optional().isString().trim().isLength({ max: MAX_TITULO }).withMessage('Título muito longo.'),
  body('content')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Conteúdo é obrigatório.')
    .isLength({ max: MAX_CONTEUDO })
    .withMessage('Conteúdo muito longo.'),
  body('position').optional().isInt({ min: 0, max: 9999 }).withMessage('Posição inválida.')
];

const updateEntryValidators = [
  param('id').isUUID().withMessage('Identificador inválido.'),
  body('type').optional().isIn(['faq', 'policy', 'note']).withMessage('Tipo inválido.'),
  body('title').optional().isString().trim().isLength({ max: MAX_TITULO }).withMessage('Título muito longo.'),
  body('content').optional().isString().trim().notEmpty().isLength({ max: MAX_CONTEUDO }).withMessage('Conteúdo inválido.'),
  body('position').optional().isInt({ min: 0, max: 9999 }).withMessage('Posição inválida.')
];

const entryIdValidators = [param('id').isUUID().withMessage('Identificador inválido.')];

module.exports = { saveProfileValidators, createEntryValidators, updateEntryValidators, entryIdValidators };
