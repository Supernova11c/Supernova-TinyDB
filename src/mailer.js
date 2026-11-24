const nodemailer = require('nodemailer');

function verificationUrl(token) {
  return `${process.env.APP_URL || 'http://localhost:3000'}/?token=${encodeURIComponent(token)}`;
}

async function sendVerificationEmail(email, token) {
  if (!process.env.SMTP_HOST) return { delivered: false, verificationUrl: verificationUrl(token) };
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Supernova DB <no-reply@example.com>',
    to: email,
    subject: 'Verify your Supernova DB account',
    text: `Verify your account: ${verificationUrl(token)}\nThis link expires in 24 hours.`,
    html: `<p>Verify your Supernova DB account.</p><p><a href="${verificationUrl(token)}">Verify email</a></p><p>This link expires in 24 hours.</p>`
  });
  return { delivered: true, verificationUrl: verificationUrl(token) };
}

module.exports = { sendVerificationEmail, verificationUrl };
