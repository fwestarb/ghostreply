const express = require('express');
const env = require('../config/env');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const aiRoutes = require('./ai.routes');
const knowledgeRoutes = require('./knowledge.routes');
const logRoutes = require('./log.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    configured: env.isConfigured
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/ai', aiRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/logs', logRoutes);

module.exports = router;
