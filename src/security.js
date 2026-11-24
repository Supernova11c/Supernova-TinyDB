const crypto = require('crypto');

const HASH_PREFIX = 'scrypt$';
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${HASH_PREFIX}${salt}$${derived}`;
}
function verifyPassword(password, encoded) {
  if (!encoded || !encoded.startsWith(HASH_PREFIX)) return false;
  const [, salt, stored] = encoded.split('$');
  const derived = crypto.scryptSync(password, salt, 64);
  const actual = Buffer.from(stored, 'hex');
  return actual.length === derived.length && crypto.timingSafeEqual(actual, derived);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function randomSecret(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function randomId(prefix) { return `${prefix}_${randomSecret(12)}`; }
function timingSafeHashEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ah = Buffer.from(a); const bh = Buffer.from(b);
  return ah.length === bh.length && crypto.timingSafeEqual(ah, bh);
}
module.exports = { hashPassword, verifyPassword, sha256, randomSecret, randomId, timingSafeHashEqual };
