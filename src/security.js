const crypto = require('crypto');

function csrfToken(sessionCookie) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'development-only-session-secret-change-me').update(sessionCookie).digest('base64url');
}

function dashboardCsrf(req, res, next) {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const session = req.cookies.supernova_session;
  const supplied = req.get('X-CSRF-Token');
  if (!session || !supplied || !crypto.timingSafeEqual(Buffer.from(csrfToken(session)), Buffer.from(supplied))) {
    return res.status(403).json({ success:false, data:null, error:{ code:'ACCESS_DENIED', message:'CSRF validation failed.' } });
  }
  next();
}

function validateObjectAgainstSchema(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'A JSON object is required.';
  const allowed = Object.keys(schema.properties || {});
  if (schema.additionalProperties === false) {
    const extra = Object.keys(value).find(key => !allowed.includes(key));
    if (extra) return `Field "${extra}" is not allowed.`;
  }
  for (const required of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, required)) return `Missing required field: ${required}`;
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const field = value[key];
    if (rule.type === 'string' && typeof field !== 'string') return `Field ${key} must be a string.`;
    if (rule.type === 'number' && typeof field !== 'number') return `Field ${key} must be a number.`;
    if (rule.type === 'integer' && !Number.isInteger(field)) return `Field ${key} must be an integer.`;
    if (rule.type === 'boolean' && typeof field !== 'boolean') return `Field ${key} must be a boolean.`;
    if (rule.type === 'array' && !Array.isArray(field)) return `Field ${key} must be an array.`;
    if (typeof field === 'string' && rule.maxLength && field.length > rule.maxLength) return `Field ${key} is too long.`;
  }
  return null;
}
module.exports = { ...require('./security'), csrfToken, dashboardCsrf, validateObjectAgainstSchema };
