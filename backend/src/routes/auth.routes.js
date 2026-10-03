const express = require('express');
const authController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate.middleware');
const { authLimiter } = require('../middlewares/rateLimit.middleware');
const {
  registerValidators,
  loginValidators,
  googleLoginValidators,
  forgotPasswordValidators,
  resetPasswordValidators
} = require('../validators/auth.validators');

const router = express.Router();
const env = require('../config/env');

// O client ID é público; nenhuma chave secreta é enviada para a extensão.
router.get('/config', (req, res) => res.json({ googleEnabled: env.isConfigured.google, googleClientId: env.googleClientId }));

router.post('/register', authLimiter, registerValidators, validate, authController.register);
router.post('/login', authLimiter, loginValidators, validate, authController.login);
router.post('/google', authLimiter, googleLoginValidators, validate, authController.loginWithGoogle);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, forgotPasswordValidators, validate, authController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidators, validate, authController.resetPassword);

module.exports = router;
