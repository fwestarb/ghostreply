const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

app.listen(env.port, () => {
  logger.info(`GhostReply backend rodando na porta ${env.port} (${env.nodeEnv}).`);

  const pendentes = Object.entries(env.isConfigured)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  if (pendentes.length) {
    logger.warn(`Configuração pendente em .env: ${pendentes.join(', ')}.`);
  }
});
