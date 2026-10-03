const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['SUPABASE_URL', 'JWT_SECRET', 'OPENROUTER_API_KEY'];

const missing = required.filter((key) => !process.env[key]);
if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SECRET_KEY');
if (missing.length) {
  // Não derruba o processo: em desenvolvimento, queremos poder subir o
  // servidor e ver as rotas de saúde/estrutura antes das chaves reais
  // existirem. Qualquer rota que dependa dessas variáveis vai falhar de
  // forma controlada (ver src/utils/ApiError.js), não com um crash silencioso.
  // eslint-disable-next-line no-console
  console.warn(
    `[config] Variáveis de ambiente ausentes: ${missing.join(', ')}. ` +
      'Preencha o arquivo .env antes de usar as rotas que dependem delas.'
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4000',

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenExpiresInDays: Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 30,

  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'GhostReply <no-reply@ghostreply.app>'
  },

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // A chave da OpenRouter vive SÓ aqui, no servidor. Antes ela estava
  // escrita dentro de api.js, que roda no navegador — ou seja,
  // visível para qualquer um com o DevTools aberto.
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    endpoint: process.env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions'
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
    aiWindowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    aiMax: Number(process.env.AI_RATE_LIMIT_MAX) || 30
  },

  isConfigured: {
    supabase: Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
    jwt: Boolean(process.env.JWT_SECRET),
    smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY)
  }
};

module.exports = env;
