const crypto = require('crypto');

const HASH_PREFIX = 'scrypt$';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${HASH_PREFIX}${salt}$${derived}`;
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string' || !encoded.startsWith(HASH_PREFIX)) return false;
  const parts = encoded.split('$');
  if (parts.length !== 3) return false;
  const [, salt, stored] = parts;
  if (!salt || !/^[a-f0-9]{128}$/i.test(stored)) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const actual = Buffer.from(stored, 'hex');
  return actual.length === derived.length && crypto.timingSafeEqual(actual, derived);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomId(prefix) {
  return `${prefix}_${randomSecret(12)}`;
}

function timingSafeHashEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateJsonSchema(value, schema = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'A JSON object is required.';
  const properties = schema.properties || {};
  if (schema.additionalProperties === false) {
    const extra = Object.keys(value).find(key => !Object.hasOwn(properties, key));
    if (extra) return `Field ${extra} is not allowed.`;
  }
  for (const key of schema.required || []) {
    if (!Object.hasOwn(value, key)) return `Missing required field: ${key}.`;
  }
  for (const [key, rule] of Object.entries(properties)) {
    if (!Object.hasOwn(value, key)) continue;
    const field = value[key];
    if (rule.type === 'string' && typeof field !== 'string') return `Field ${key} must be a string.`;
    if (rule.type === 'number' && (typeof field !== 'number' || !Number.isFinite(field))) return `Field ${key} must be a number.`;
    if (rule.type === 'integer' && !Number.isInteger(field)) return `Field ${key} must be an integer.`;
    if (rule.type === 'boolean' && typeof field !== 'boolean') return `Field ${key} must be a boolean.`;
    if (rule.type === 'array' && !Array.isArray(field)) return `Field ${key} must be an array.`;
    if (typeof field === 'string' && Number.isInteger(rule.maxLength) && field.length > rule.maxLength) return `Field ${key} is too long.`;
    if (typeof field === 'string' && Number.isInteger(rule.minLength) && field.length < rule.minLength) return `Field ${key} is too short.`;
    if (Array.isArray(rule.enum) && !rule.enum.includes(field)) return `Field ${key} has an invalid value.`;
  }
  return null;
}

module.exports = { hashPassword, verifyPassword, sha256, randomSecret, randomId, timingSafeHashEqual, validateJsonSchema };
