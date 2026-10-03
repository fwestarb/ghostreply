const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const authService = require('../services/auth.service');
const { setRefreshTokenCookie, clearRefreshTokenCookie, REFRESH_TOKEN_COOKIE } = require('../utils/cookies');

const respondWithSession = (res, statusCode, { user, accessToken, refreshToken }) => {
  setRefreshTokenCookie(res, refreshToken);
  res.status(statusCode).json({ user, accessToken });
};

const register = asyncHandler(async (req, res) => {
  const session = await authService.register(req.body);
  respondWithSession(res, 201, session);
});

const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body);
  respondWithSession(res, 200, session);
});

const loginWithGoogle = asyncHandler(async (req, res) => {
  const session = await authService.loginWithGoogle(req.body);
  respondWithSession(res, 200, session);
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const userId = req.body.userId;

  if (!refreshToken || !userId) {
    throw ApiError.unauthorized('Sessão inválida. Faça login novamente.');
  }

  const session = await authService.refresh({ userId, refreshToken });
  respondWithSession(res, 200, session);
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const userId = req.body.userId;

  if (refreshToken && userId) {
    await authService.logout({ userId, refreshToken });
  }

  clearRefreshTokenCookie(res);
  res.status(204).send();
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  res.status(200).json({
    message: 'Se este e-mail existir, um link de redefinição foi enviado.',
    ...(process.env.NODE_ENV !== 'production' && result?.devResetUrl ? { devResetUrl: result.devResetUrl } : {})
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { uid, token, newPassword } = req.body;
  await authService.resetPassword({ userId: uid, token, newPassword });
  res.status(200).json({ message: 'Senha redefinida com sucesso.' });
});

module.exports = { register, login, loginWithGoogle, refresh, logout, forgotPassword, resetPassword };
