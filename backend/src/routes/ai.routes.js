const express = require('express');
const aiController = require('../controllers/ai.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const { aiLimiter } = require('../middlewares/rateLimit.middleware');
const {
  generateRepliesValidators,
  translateValidators,
  grammarValidators
} = require('../validators/ai.validators');

const router = express.Router();

// Toda a IA fica atrás de autenticação: a chave da OpenRouter é do
// dono do backend, então nenhuma rota daqui pode ser anônima.
router.use(requireAuth);
router.use(aiLimiter);

router.get('/status', aiController.status);
router.post('/replies', generateRepliesValidators, validate, aiController.generateReplies);
router.post('/translate', translateValidators, validate, aiController.translate);
router.post('/grammar', grammarValidators, validate, aiController.improveGrammar);

module.exports = router;
