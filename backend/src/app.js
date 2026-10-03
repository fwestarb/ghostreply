const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const logger = require('./utils/logger');
const routes = require('./routes');
const { generalLimiter } = require('./middlewares/rateLimit.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.corsAllowedOrigins.length ? env.corsAllowedOrigins : false,
    credentials: true
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(morgan('combined', { stream: logger.accessLogStream }));
if (env.nodeEnv !== 'production') {
  app.use(morgan('dev'));
}

app.use(generalLimiter);

// Página estática de redefinição de senha (link enviado por e-mail).
// "extensions: ['html']" permite que /reset-password resolva para
// reset-password.html sem precisar da extensão na URL do e-mail.
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
