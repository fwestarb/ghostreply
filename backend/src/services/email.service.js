const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (!env.isConfigured.smtp) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.password }
    });
  }
  return transporter;
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const mailer = getTransporter();

  // SMTP ainda não configurado: não falha a requisição, só registra o
  // link no log para uso em desenvolvimento (nunca fazer isso em produção).
  if (!mailer) {
    logger.warn('SMTP não configurado — e-mail de redefinição de senha não enviado.', { to, resetUrl });
    return { sent: false, devResetUrl: resetUrl };
  }

  await mailer.sendMail({
    from: env.smtp.from,
    to,
    subject: 'Redefinição de senha — GhostReply',
    text: `Olá, ${name}.\n\nUse o link abaixo para redefinir sua senha (válido por 1 hora):\n${resetUrl}\n\nSe você não pediu isso, ignore este e-mail.`,
    html: `<p>Olá, ${name}.</p><p>Use o link abaixo para redefinir sua senha (válido por 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Se você não pediu isso, ignore este e-mail.</p>`
  });

  return { sent: true };
};

module.exports = { sendPasswordResetEmail };
