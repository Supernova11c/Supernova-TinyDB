const fs = require('fs');

function supportedProviders() {
  return ['sqlite', 'postgresql', 'mysql', 'mongodb'];
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  return fallback;
}

class ProviderUnavailableError extends Error {
  constructor(provider) {
    super(`${provider} storage provider is not configured or unavailable`);
    this.code = 'PROVIDER_UNAVAILABLE';
  }
}

function sqliteConnection(db, projectId) {
  return {
    async health() { db.prepare('SELECT 1').get(); return true; },
    async listCollections() {
      return db.prepare('SELECT id,name,public_read,public_insert,public_update,public_delete,created_at FROM collections WHERE project_id=? ORDER BY name').all(projectId);
    },
    async createCollection(name, permissions = {}) {
      const id = require('./security').randomId('col');
      db.prepare(`INSERT INTO collections(id,project_id,name,public_read,public_insert,public_update,public_delete) VALUES (?,?,?,?,?,?,?)`)
        .run(id, projectId, name, permissions.public_read ? 1 : 0, permissions.public_insert ? 1 : 0, permissions.public_update ? 1 : 0, permissions.public_delete ? 1 : 0);
      return db.prepare('SELECT * FROM collections WHERE id=?').get(id);
    },
    async getCollection(nameOrId) {
      return db.prepare('SELECT * FROM collections WHERE project_id=? AND (name=? OR id=?)').get(projectId, nameOrId, nameOrId);
    },
    async listRecords(collectionId, limit = 50, offset = 0) {
      const rows = db.prepare('SELECT id,data,created_at,updated_at FROM records WHERE project_id=? AND collection_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(projectId, collectionId, limit, offset);
      return rows.map(row => ({ id: row.id, ...JSON.parse(row.data), createdAt: row.created_at, updatedAt: row.updated_at }));
    },
    async insertRecord(collectionId, data) {
      const id = require('./security').randomId('record');
      db.prepare('INSERT INTO records(id,project_id,collection_id,data) VALUES (?,?,?,?)').run(id, projectId, collectionId, JSON.stringify(data));
      return { id, ...data };
    },
    async updateRecord(collectionId, recordId, data) {
      const result = db.prepare(`UPDATE records SET data=?,updated_at=datetime('now') WHERE id=? AND project_id=? AND collection_id=?`).run(JSON.stringify(data), recordId, projectId, collectionId);
      return result.changes ? { id: recordId, ...data } : null;
    },
    async deleteRecord(collectionId, recordId) {
      const result = db.prepare('DELETE FROM records WHERE id=? AND project_id=? AND collection_id=?').run(recordId, projectId, collectionId);
      return Boolean(result.changes);
    }
  };
}

function postgresConnection(project) {
  let pg;
  try { pg = require('pg'); } catch (_) { throw new ProviderUnavailableError('postgresql'); }
  const { Pool } = pg;
  const pool = new Pool({ connectionString: project.database_uri, max: 10, idleTimeoutMillis: 30000, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false });
  const schema = `project_${project.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return {
    pool, schema,
    async health() { const client = await pool.connect(); try { await client.query('SELECT 1'); } finally { client.release(); } return true; }
  };
}

async function mongoConnection(project) {
  let mongodb;
  try { mongodb = require('mongodb'); } catch (_) { throw new ProviderUnavailableError('mongodb'); }
  const client = new mongodb.MongoClient(project.database_uri, { maxPoolSize: 10, retryWrites: true });
  await client.connect();
  const databaseName = project.database_name || `supernova_${project.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const db = client.db(databaseName);
  return {
    client, db,
    async health() { await db.command({ ping: 1 }); return true; },
    async close() { await client.close(); }
  };
}

async function openProjectStorage(db, project) {
  const provider = project.database_provider || 'sqlite';
  if (provider === 'sqlite') return sqliteConnection(db, project.id);
  if (provider === 'postgresql') return postgresConnection(project);
  if (provider === 'mysql') throw new ProviderUnavailableError('mysql');
  if (provider === 'mongodb') return mongoConnection(project);
  throw new ProviderUnavailableError(provider);
}

module.exports = { supportedProviders, openProjectStorage, ProviderUnavailableError, safeJson };
