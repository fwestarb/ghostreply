const asyncHandler = require('../utils/asyncHandler');
const knowledgeService = require('../services/knowledge.service');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await knowledgeService.getProfile(req.user.id);
  res.status(200).json({ profile });
});

const saveProfile = asyncHandler(async (req, res) => {
  const profile = await knowledgeService.saveProfile(req.user.id, req.body);
  res.status(200).json({ profile });
});

const listEntries = asyncHandler(async (req, res) => {
  const entries = await knowledgeService.listEntries(req.user.id);
  res.status(200).json({ entries });
});

const createEntry = asyncHandler(async (req, res) => {
  const entry = await knowledgeService.createEntry(req.user.id, req.body);
  res.status(201).json({ entry });
});

const updateEntry = asyncHandler(async (req, res) => {
  const entry = await knowledgeService.updateEntry(req.user.id, req.params.id, req.body);
  res.status(200).json({ entry });
});

const removeEntry = asyncHandler(async (req, res) => {
  await knowledgeService.removeEntry(req.user.id, req.params.id);
  res.status(204).send();
});

module.exports = { getProfile, saveProfile, listEntries, createEntry, updateEntry, removeEntry };
