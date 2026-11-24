const nodemailer = require('nodemailer');

function appUrl(path = '') { return `${process.env.APP_URL || 'http://localhost:3000'}${path}`; }
async function sendVerificationEmail(email, token) {
  if (!process.env.SMTP_HOST) return { delivered:false, verificationUrl:appUrl(`/?token=${encodeURIComponent(token)}`) };
  const transporter = nodemailer.createTransport({ host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 587), secure:process.env.SMTP_SECURE==='true', auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASS} : undefined });
  const url = appUrl(`/?token=${encodeURIComponent(token)}`);
  await transporter.sendMail({from:process.env.SMTP_FROM||'Supernova DB <no-reply@example.com>',to:email,subject:'Verify your Supernova DB account',text:`Verify: ${url}`,html:`<p><a href="${url}">Verify your Supernova DB account</a></p>`});
  return {delivered:true, verificationUrl:url};
}
async function sendPasswordResetEmail(email, token) {
  if (!process.env.SMTP_HOST) return { delivered:false, resetUrl:appUrl(`/?reset=${encodeURIComponent(token)}`) };
  const transporter = nodemailer.createTransport({ host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 587), secure:process.env.SMTP_SECURE==='true', auth:process.env.SMTP_USER ? {user:process.env.SMTP_USER,pass:process.env.SMTP_PASS} : undefined });
  const url = appUrl(`/?reset=${encodeURIComponent(token)}`);
  await transporter.sendMail({from:process.env.SMTP_FROM||'Supernova DB <no-reply@example.com>',to:email,subject:'Reset your Supernova DB password',text:`Reset: ${url}`,html:`<p><a href="${url}">Reset your password</a></p>`});
  return {delivered:true, resetUrl:url};
}
module.exports = {sendVerificationEmail,sendPasswordResetEmail};
