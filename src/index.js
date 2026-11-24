const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { openDatabase } = require('./db');
const { hashPassword, verifyPassword, sha256, randomSecret, randomId, timingSafeHashEqual } = require('./security');
const { sendVerificationEmail } = require('./mailer');
const { supportedProviders, openProjectStorage, ProviderUnavailableError } = require('./storage');

const app = express();
app.disable('x-powered-by');
const PORT = Number(process.env.PORT || 3000);
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'supernova.db');
const db = openDatabase(DATABASE_PATH);

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet({ contentSecurityPolicy: false, referrerPolicy: { policy: 'no-referrer' }, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) callback(null, true); else callback(new Error('Origin not allowed')); }, credentials: true }));
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });

function ok(res, data, status = 200) { res.status(status).json({ success: true, data, error: null }); }
function fail(res, code, message, status = 400) { res.status(status).json({ success: false, data: null, error: { code, message } }); }
function validateEmail(email) { return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
function addAudit(projectId, userId, action, detail = '') { db.prepare('INSERT INTO audit_logs(project_id,user_id,action,detail) VALUES (?,?,?,?)').run(projectId, userId, action, detail); }

function getDashboardUser(req) {
  const token = req.cookies.supernova_session;
  if (!token) return null;
  const session = db.prepare(`SELECT s.user_id,s.expires_at,u.email,u.email_verified FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at > datetime('now')`).get(sha256(token));
  return session || null;
}
function requireVerifiedUser(req, res, next) {
  const user = getDashboardUser(req);
  if (!user) return fail(res, 'INVALID_CREDENTIAL', 'You must be logged in.', 401);
  if (!user.email_verified) return fail(res, 'ACCESS_DENIED', 'Email verification is required.', 403);
  req.user = user;
  next();
}
function requireOwnership(req, res, next) {
  const project = db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(req.params.projectId, req.user.user_id);
  if (!project) return fail(res, 'ACCESS_DENIED', 'Project access is denied.', 403);
  req.project = project;
  next();
}

app.post('/v1/auth/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!validateEmail(email) || password.length < 12 || password.length > 128) return fail(res, 'INVALID_REQUEST', 'A valid email and password of at least 12 characters are required.');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return fail(res, 'INVALID_REQUEST', 'An account with this email already exists.', 409);
  const id = randomId('dev');
  const token = randomSecret(32);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO users(id,email,password_hash,verification_token_hash,verification_expires_at) VALUES (?,?,?,?,?)').run(id, email, hashPassword(password), sha256(token), expires);
  try {
    const mail = await sendVerificationEmail(email, token);
    if (!mail.delivered) console.log(`Email verification (development): ${mail.verificationUrl}`);
    ok(res, { email, verificationRequired: true }, 201);
  } catch (_) { fail(res, 'INTERNAL_SERVER_ERROR', 'The account was created but verification email delivery failed.', 500); }
});

app.post('/v1/auth/verify', authLimiter, (req, res) => {
  const token = String(req.body.token || '');
  if (!token) return fail(res, 'INVALID_REQUEST', 'Verification token is required.');
  const user = db.prepare(`SELECT * FROM users WHERE verification_token_hash=? AND verification_expires_at > datetime('now')`).get(sha256(token));
  if (!user) return fail(res, 'INVALID_CREDENTIAL', 'Verification token is invalid or expired.');
  db.prepare('UPDATE users SET email_verified=1,verification_token_hash=NULL,verification_expires_at=NULL WHERE id=?').run(user.id);
  ok(res, { verified: true });
});

app.post('/v1/auth/login', authLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) return fail(res, 'INVALID_CREDENTIAL', 'Email or password is incorrect.', 401);
  const token = randomSecret(32);
  db.prepare('INSERT INTO sessions(id,user_id,expires_at) VALUES (?,?,?)').run(sha256(token), user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  res.cookie('supernova_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' });
  ok(res, { email: user.email, emailVerified: Boolean(user.email_verified) });
});

app.post('/v1/auth/logout', (req, res) => {
  const token = req.cookies.supernova_session;
  if (token) db.prepare('DELETE FROM sessions WHERE id=?').run(sha256(token));
  res.clearCookie('supernova_session', { path: '/' }); ok(res, { loggedOut: true });
});
app.get('/v1/auth/me', (req, res) => {
  const user = getDashboardUser(req);
  if (!user) return fail(res, 'INVALID_CREDENTIAL', 'You must be logged in.', 401);
  ok(res, { id: user.user_id, email: user.email, emailVerified: Boolean(user.email_verified) });
});

app.get('/v1/dashboard/projects', requireVerifiedUser, (req, res) => ok(res, db.prepare('SELECT id,name,description,database_provider,created_at FROM projects WHERE owner_id=? ORDER BY created_at DESC').all(req.user.user_id)));
app.post('/v1/dashboard/projects', requireVerifiedUser, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim().slice(0, 500);
  const provider = String(req.body.database_provider || 'sqlite').toLowerCase();
  if (name.length < 1 || name.length > 100) return fail(res, 'INVALID_REQUEST', 'Project name must contain 1 to 100 characters.');
  if (!supportedProviders().includes(provider)) return fail(res, 'INVALID_REQUEST', 'Unsupported database provider.');
  if (provider !== 'sqlite' && !req.body.database_uri) return fail(res, 'INVALID_REQUEST', 'A server-side database URI is required for this provider.');
  const projectId = randomId('project');
  const publicKey = randomSecret(24); const adminKey = randomSecret(48);
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO projects(id,owner_id,name,description,database_provider,database_uri,database_name) VALUES (?,?,?,?,?,?,?)')
      .run(projectId, req.user.user_id, name, description, provider, provider === 'sqlite' ? null : String(req.body.database_uri), req.body.database_name ? String(req.body.database_name) : null);
    db.prepare('INSERT INTO credentials(id,project_id,kind,secret_hash) VALUES (?,?,?,?)').run(randomId('cred'), projectId, 'public', sha256(publicKey));
    db.prepare('INSERT INTO credentials(id,project_id,kind,secret_hash) VALUES (?,?,?,?)').run(randomId('cred'), projectId, 'admin', sha256(adminKey));
  });
  try { tx(); } catch (_) { return fail(res, 'INTERNAL_SERVER_ERROR', 'The project could not be created.', 500); }
  addAudit(projectId, req.user.user_id, 'project.created', name);
  ok(res, { id: projectId, name, description, databaseProvider: provider, publicKey, adminKey }, 201);
});

app.get('/v1/dashboard/projects/:projectId', requireVerifiedUser, requireOwnership, (req, res) => ok(res, { id: req.project.id, name: req.project.name, description: req.project.description, databaseProvider: req.project.database_provider, createdAt: req.project.created_at }));
app.post('/v1/dashboard/projects/:projectId/rotate/:kind', requireVerifiedUser, requireOwnership, (req, res) => {
  const kind = req.params.kind === 'public' ? 'public' : req.params.kind === 'admin' ? 'admin' : null;
  if (!kind) return fail(res, 'INVALID_REQUEST', 'Credential kind must be public or admin.');
  const secret = randomSecret(kind === 'admin' ? 48 : 24);
  db.prepare(`UPDATE credentials SET secret_hash=?,active=1,created_at=datetime('now') WHERE project_id=? AND kind=?`).run(sha256(secret), req.project.id, kind);
  addAudit(req.project.id, req.user.user_id, 'credential.rotated', kind);
  ok(res, { kind, secret });
});

function requirePublicCredential(req, res, next) {
  const projectId = req.headers['x-project-id']; const key = req.headers['x-public-key'];
  if (!projectId || !key) return fail(res, 'INVALID_CREDENTIAL', 'The project credential is missing.', 401);
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!project) return fail(res, 'PROJECT_NOT_FOUND', 'The requested project was not found.', 404);
  const cred = db.prepare(`SELECT * FROM credentials WHERE project_id=? AND kind='public' AND active=1`).get(projectId);
  if (!cred || !timingSafeHashEqual(cred.secret_hash, sha256(key))) return fail(res, 'INVALID_CREDENTIAL', 'The supplied credential is invalid.', 401);
  if (cred.expires_at && cred.expires_at < new Date().toISOString()) return fail(res, 'EXPIRED_CREDENTIAL', 'The supplied credential has expired.', 401);
  req.project = project; next();
}

function collectionForPublic(req) { return db.prepare('SELECT * FROM collections WHERE project_id=? AND name=?').get(req.project.id, req.params.collection); }

app.get('/v1/data/:collection', publicLimiter, requirePublicCredential, (req, res) => {
  const collection = collectionForPublic(req); if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  if (!collection.public_read) return fail(res, 'ACCESS_DENIED', 'Read access is not enabled for this collection.', 403);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100); const offset = Math.max(Number(req.query.offset || 0), 0);
  openProjectStorage(db, req.project).then(storage => storage.listRecords(collection.id, limit, offset)).then(data => ok(res, data)).catch(error => fail(res, error.code === 'PROVIDER_UNAVAILABLE' ? 'INTERNAL_SERVER_ERROR' : 'INTERNAL_SERVER_ERROR', 'Data storage is unavailable.', 503));
});

app.post('/v1/data/:collection', publicLimiter, requirePublicCredential, (req, res) => {
  const collection = collectionForPublic(req); if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  if (!collection.public_insert) return fail(res, 'ACCESS_DENIED', 'Insert access is not enabled for this collection.', 403);
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 'INVALID_REQUEST', 'A JSON object is required.');
  openProjectStorage(db, req.project).then(storage => storage.insertRecord(collection.id, req.body)).then(data => ok(res, data, 201)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be stored.', 500));
});

app.put('/v1/data/:collection/:recordId', publicLimiter, requirePublicCredential, (req, res) => {
  const collection = collectionForPublic(req); if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  if (!collection.public_update) return fail(res, 'ACCESS_DENIED', 'Update access is not enabled for this collection.', 403);
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 'INVALID_REQUEST', 'A JSON object is required.');
  openProjectStorage(db, req.project).then(storage => storage.updateRecord(collection.id, req.params.recordId, req.body)).then(data => data ? ok(res, data) : fail(res, 'RECORD_NOT_FOUND', 'The requested record was not found.', 404)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be updated.', 500));
});

app.delete('/v1/data/:collection/:recordId', publicLimiter, requirePublicCredential, (req, res) => {
  const collection = collectionForPublic(req); if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  if (!collection.public_delete) return fail(res, 'ACCESS_DENIED', 'Delete access is not enabled for this collection.', 403);
  openProjectStorage(db, req.project).then(storage => storage.deleteRecord(collection.id, req.params.recordId)).then(deleted => deleted ? ok(res, { deleted: true, id: req.params.recordId }) : fail(res, 'RECORD_NOT_FOUND', 'The requested record was not found.', 404)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be deleted.', 500));
});

app.get('/v1/dashboard/projects/:projectId/collections', requireVerifiedUser, requireOwnership, (req, res) => ok(res, db.prepare('SELECT * FROM collections WHERE project_id=? ORDER BY name').all(req.project.id)));
app.post('/v1/dashboard/projects/:projectId/collections', requireVerifiedUser, requireOwnership, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!/^[$A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) return fail(res, 'INVALID_REQUEST', 'Collection names must start with a letter and contain only letters, numbers, underscores, or hyphens.');
  try { db.prepare('INSERT INTO collections(id,project_id,name) VALUES (?,?,?)').run(randomId('col'), req.project.id, name); }
  catch (_) { return fail(res, 'INVALID_REQUEST', 'A collection with this name already exists.', 409); }
  addAudit(req.project.id, req.user.user_id, 'collection.created', name); ok(res, db.prepare('SELECT * FROM collections WHERE project_id=? AND name=?').get(req.project.id, name), 201);
});

app.patch('/v1/dashboard/projects/:projectId/collections/:collectionId', requireVerifiedUser, requireOwnership, (req, res) => {
  const collection = db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(req.params.collectionId, req.project.id);
  if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  const fields = ['public_read','public_insert','public_update','public_delete'];
  const values = {}; fields.forEach(field => { if (typeof req.body[field] === 'boolean') values[field] = req.body[field] ? 1 : 0; });
  if (Object.keys(values).length) { const set = Object.keys(values).map(key => `${key}=?`).join(','); db.prepare(`UPDATE collections SET ${set} WHERE id=? AND project_id=?`).run(...Object.values(values), collection.id, req.project.id); }
  if (typeof req.body.name === 'string') { const name = req.body.name.trim(); if (!/^[$A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)) return fail(res, 'INVALID_REQUEST', 'Invalid collection name.'); db.prepare('UPDATE collections SET name=? WHERE id=? AND project_id=?').run(name, collection.id, req.project.id); }
  addAudit(req.project.id, req.user.user_id, 'collection.updated', collection.name); ok(res, db.prepare('SELECT * FROM collections WHERE id=?').get(collection.id));
});

app.delete('/v1/dashboard/projects/:projectId/collections/:collectionId', requireVerifiedUser, requireOwnership, (req, res) => {
  const result = db.prepare('DELETE FROM collections WHERE id=? AND project_id=?').run(req.params.collectionId, req.project.id);
  if (!result.changes) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  addAudit(req.project.id, req.user.user_id, 'collection.deleted', req.params.collectionId); ok(res, { deleted: true });
});

app.get('/v1/dashboard/projects/:projectId/collections/:collectionId/records', requireVerifiedUser, requireOwnership, (req, res) => {
  const collection = db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(req.params.collectionId, req.project.id);
  if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100); const offset = Math.max(Number(req.query.offset || 0), 0);
  openProjectStorage(db, req.project).then(storage => storage.listRecords(collection.id, limit, offset)).then(data => ok(res, data)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'Data storage is unavailable.', 503));
});
app.post('/v1/dashboard/projects/:projectId/collections/:collectionId/records', requireVerifiedUser, requireOwnership, (req, res) => {
  const collection = db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(req.params.collectionId, req.project.id);
  if (!collection) return fail(res, 'COLLECTION_NOT_FOUND', 'The requested collection was not found.', 404);
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 'INVALID_REQUEST', 'A JSON object is required.');
  openProjectStorage(db, req.project).then(storage => storage.insertRecord(collection.id, req.body)).then(data => { addAudit(req.project.id, req.user.user_id, 'record.created', collection.name); ok(res, data, 201); }).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be stored.', 500));
});
app.put('/v1/dashboard/projects/:projectId/collections/:collectionId/records/:recordId', requireVerifiedUser, requireOwnership, (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 'INVALID_REQUEST', 'A JSON object is required.');
  openProjectStorage(db, req.project).then(storage => storage.updateRecord(req.params.collectionId, req.params.recordId, req.body)).then(data => data ? (addAudit(req.project.id, req.user.user_id, 'record.updated', req.params.recordId), ok(res, data)) : fail(res, 'RECORD_NOT_FOUND', 'The requested record was not found.', 404)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be updated.', 500));
});
app.delete('/v1/dashboard/projects/:projectId/collections/:collectionId/records/:recordId', requireVerifiedUser, requireOwnership, (req, res) => {
  openProjectStorage(db, req.project).then(storage => storage.deleteRecord(req.params.collectionId, req.params.recordId)).then(deleted => deleted ? (addAudit(req.project.id, req.user.user_id, 'record.deleted', req.params.recordId), ok(res, { deleted: true })) : fail(res, 'RECORD_NOT_FOUND', 'The requested record was not found.', 404)).catch(() => fail(res, 'INTERNAL_SERVER_ERROR', 'The record could not be deleted.', 500));
});

app.get('/v1/dashboard/projects/:projectId/credentials', requireVerifiedUser, requireOwnership, (req, res) => ok(res, db.prepare('SELECT kind,active,expires_at,created_at FROM credentials WHERE project_id=?').all(req.project.id)));
app.get('/v1/dashboard/projects/:projectId/activity', requireVerifiedUser, requireOwnership, (req, res) => ok(res, db.prepare('SELECT action,detail,created_at FROM audit_logs WHERE project_id=? ORDER BY id DESC LIMIT 100').all(req.project.id)));

app.get('/v1/storage/providers', requireVerifiedUser, (req, res) => ok(res, supportedProviders().map(provider => ({ provider, implemented: provider === 'sqlite' }))));
app.get('/health', (req, res) => { try { db.prepare('SELECT 1').get(); ok(res, { status: 'ok', storage: 'persistent', providers: supportedProviders() }); } catch (_) { fail(res, 'INTERNAL_SERVER_ERROR', 'Storage is unavailable.', 503); } });
app.use((err, req, res, next) => { if (err.message === 'Origin not allowed') return fail(res, 'ACCESS_DENIED', 'Origin is not allowed.', 403); console.error(err); if (err.type === 'entity.too.large') return fail(res, 'INVALID_REQUEST', 'Request body is too large.', 413); fail(res, 'INTERNAL_SERVER_ERROR', 'An unexpected server error occurred.', 500); });

if (require.main === module) app.listen(PORT, () => console.log(`Supernova DB listening on http://localhost:${PORT}`));
module.exports = { app, db, openDatabase };
