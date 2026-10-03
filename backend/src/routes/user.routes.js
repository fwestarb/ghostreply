const express = require('express');
const userController = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { changePasswordValidators, updateProfileValidators } = require('../validators/auth.validators');

const router = express.Router();

router.use(requireAuth);

router.get('/me', userController.getMe);
router.patch('/me', updateProfileValidators, validate, userController.updateMe);
router.post('/me/password', changePasswordValidators, validate, userController.changePassword);

module.exports = router;
