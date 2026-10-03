const { body } = require('express-validator');

const nameField = body('name')
  .trim()
  .notEmpty()
  .withMessage('Nome é obrigatório.')
  .isLength({ max: 120 })
  .withMessage('Nome muito longo.');

const emailField = body('email')
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage('E-mail inválido.')
  .normalizeEmail();

const passwordField = (field = 'password') =>
  body(field)
    .isString()
    .isLength({ min: 8 })
    .withMessage('A senha deve ter pelo menos 8 caracteres.');

const registerValidators = [
  nameField,
  emailField,
  passwordField('password'),
  body('confirmPassword').custom((value, { req }) => value === req.body.password).withMessage('As senhas não coincidem.')
];

const loginValidators = [emailField, body('password').notEmpty().withMessage('Senha é obrigatória.')];

const googleLoginValidators = [body('idToken').notEmpty().withMessage('idToken é obrigatório.')];

const forgotPasswordValidators = [emailField];

const resetPasswordValidators = [
  body('uid').isUUID().withMessage('Identificador de usuário inválido.'),
  body('token').notEmpty().withMessage('Token é obrigatório.'),
  passwordField('newPassword')
];

const changePasswordValidators = [
  body('currentPassword').notEmpty().withMessage('Senha atual é obrigatória.'),
  passwordField('newPassword')
];

const updateProfileValidators = [
  body('name').optional().trim().isLength({ min: 1, max: 120 }).withMessage('Nome inválido.'),
  body('avatarUrl').optional({ nullable: true }).isURL().withMessage('URL de avatar inválida.')
];

module.exports = {
  registerValidators,
  loginValidators,
  googleLoginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
  changePasswordValidators,
  updateProfileValidators
};
