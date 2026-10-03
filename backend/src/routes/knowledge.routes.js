const express = require('express');
const knowledgeController = require('../controllers/knowledge.controller');
const validate = require('../middlewares/validate.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  saveProfileValidators,
  createEntryValidators,
  updateEntryValidators,
  entryIdValidators
} = require('../validators/knowledge.validators');

const router = express.Router();

router.use(requireAuth);

router.get('/profile', knowledgeController.getProfile);
router.put('/profile', saveProfileValidators, validate, knowledgeController.saveProfile);

router.get('/entries', knowledgeController.listEntries);
router.post('/entries', createEntryValidators, validate, knowledgeController.createEntry);
router.patch('/entries/:id', updateEntryValidators, validate, knowledgeController.updateEntry);
router.delete('/entries/:id', entryIdValidators, validate, knowledgeController.removeEntry);

module.exports = router;
