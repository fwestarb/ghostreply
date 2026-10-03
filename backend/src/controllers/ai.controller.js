const asyncHandler = require('../utils/asyncHandler');
const aiService = require('../services/ai.service');

const generateReplies = asyncHandler(async (req, res) => {
  const { text, history, tone } = req.body;
  const resultado = await aiService.generateReplies(req.user.id, { text, history, tone });
  res.status(200).json(resultado);
});

const translate = asyncHandler(async (req, res) => {
  const { text, from, to } = req.body;
  const resultado = await aiService.translateText(req.user.id, { text, from, to });
  res.status(200).json(resultado);
});

const improveGrammar = asyncHandler(async (req, res) => {
  const resultado = await aiService.improveGrammar(req.user.id, { text: req.body.text });
  res.status(200).json(resultado);
});

const status = asyncHandler(async (req, res) => {
  res.status(200).json(aiService.describeModel());
});

module.exports = { generateReplies, translate, improveGrammar, status };
