const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const appLogStream = fs.createWriteStream(path.join(LOG_DIR, 'app.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(LOG_DIR, 'error.log'), { flags: 'a' });

const write = (stream, level, message, meta) => {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {})
  });
  stream.write(`${line}\n`);
};

const logger = {
  info: (message, meta) => {
    write(appLogStream, 'info', message, meta);
    // eslint-disable-next-line no-console
    console.log(`[info] ${message}`);
  },
  warn: (message, meta) => {
    write(appLogStream, 'warn', message, meta);
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${message}`);
  },
  error: (message, meta) => {
    write(errorLogStream, 'error', message, meta);
    // eslint-disable-next-line no-console
    console.error(`[error] ${message}`);
  },
  accessLogStream: fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' })
};

module.exports = logger;
