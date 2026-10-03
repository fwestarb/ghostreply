const env = require('../config/env');

const REFRESH_TOKEN_COOKIE = 'gr_refresh_token';

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: env.refreshTokenExpiresInDays * 24 * 60 * 60 * 1000
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie(REFRESH_TOKEN_COOKIE, token, refreshCookieOptions);
};

const clearRefreshTokenCookie = (res) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
};

module.exports = { REFRESH_TOKEN_COOKIE, setRefreshTokenCookie, clearRefreshTokenCookie };
