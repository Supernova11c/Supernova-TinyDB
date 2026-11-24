const { randomId } = require('./security');

const PROVIDERS = ['sqlite', 'postgresql', 'mysql', 'mongodb'];

function supportedProviders() {
  return PROVIDERS;
}

class ProviderUnavailableError extends Error {
  constructor(provider) {
    super(`${provider} storage provider is unavailable`);
    this.code = 'PROVIDER_UNAVAILABLE';
    this.provider = provider;
  }
}

function parseRecord(row) {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { id: row.id, ...data, createdAt: row.created_at, updatedAt: row.updated_at };
}

function sqliteStorage(db, projectId) {
  return {
    provider: 'sqlite',
    async health() { db.prepare('SELECT 1').get(); return true; },
    async listCollections() { return db.prepare('SELECT * FROM collections WHERE project_id=? ORDER BY name').all(projectId); },
    async getCollection(nameOrId) { return db.prepare('SELECT * FROM collections WHERE project_id=? AND (name=? OR id=?)').get(projectId, nameOrId, nameOrId); },
    async createCollection(name, permissions = {}, schema = {}) {
      const id = randomId('col');
      db.prepare('INSERT INTO collections(id,project_id,name,public_read,public_insert,public_update,public_delete,schema_json) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, projectId, name, permissions.public_read === false ? 0 : 1, permissions.public_insert ? 1 : 0, permissions.public_update ? 1 : 0, permissions.public_delete ? 1 : 0, JSON.stringify(schema));
      return db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(id, projectId);
    },
    async updateCollection(id, updates) {
      const allowed = ['name', 'public_read', 'public_insert', 'public_update', 'public_delete', 'schema_json'];
      const entries = Object.entries(updates).filter(([key]) => allowed.includes(key));
      if (!entries.length) return db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(id, projectId);
      const set = entries.map(([key]) => `${key}=?`).join(',');
      db.prepare(`UPDATE collections SET ${set} WHERE id=? AND project_id=?`).run(...entries.map(([, value]) => value), id, projectId);
      return db.prepare('SELECT * FROM collections WHERE id=? AND project_id=?').get(id, projectId);
    },
    async deleteCollection(id) { return Boolean(db.prepare('DELETE FROM collections WHERE id=? AND project_id=?').run(id, projectId).changes); },
    async listRecords(collectionId, limit = 50, offset = 0, search = '') {
      const rows = search ? db.prepare("SELECT id,data,created_at,updated_at FROM records WHERE project_id=? AND collection_id=? AND data LIKE ? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?").all(projectId, collectionId, `%${search}%`, limit, offset) : db.prepare('SELECT id,data,created_at,updated_at FROM records WHERE project_id=? AND collection_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(projectId, collectionId, limit, offset);
      return rows.map(parseRecord);
    },
    async insertRecord(collectionId, data) {
      const id = randomId('record');
      db.prepare('INSERT INTO records(id,project_id,collection_id,data) VALUES (?,?,?,?)').run(id, projectId, collectionId, JSON.stringify(data));
      return { id, ...data };
    },
    async updateRecord(collectionId, recordId, data) {
      const result = db.prepare("UPDATE records SET data=?,updated_at=datetime('now') WHERE id=? AND project_id=? AND collection_id=?").run(JSON.stringify(data), recordId, projectId, collectionId);
      return result.changes ? { id: recordId, ...data } : null;
    },
    async deleteRecord(collectionId, recordId) { return Boolean(db.prepare('DELETE FROM records WHERE id=? AND project_id=? AND collection_id=?').run(recordId, projectId, collectionId).changes); },
    async countRecords() { return db.prepare('SELECT count(*) AS count FROM records WHERE project_id=?').get(projectId).count; }
  };
}

function configuredUri(provider) {
  return ({ postgresql: process.env.POSTGRES_URL, mysql: process.env.MYSQL_URL, mongodb: process.env.MONGODB_URL })[provider];
}

function openProjectStorage(db, project) {
  const provider = project.database_provider || 'sqlite';
  if (provider === 'sqlite') return Promise.resolve(sqliteStorage(db, project.id));
  // External providers are deliberately opt-in and use server-side configuration.
  // They are not exposed as enabled merely because a provider is named in a request.
  const uri = configuredUri(provider) || project.database_uri;
  if (!uri) return Promise.reject(new ProviderUnavailableError(provider));
  if (provider === 'postgresql') return openPostgres(project.id, uri);
  if (provider === 'mysql') return openMysql(project.id, uri);
  if (provider === 'mongodb') return openMongo(project.id, uri, project.database_name);
  return Promise.reject(new ProviderUnavailableError(provider));
}

async function openPostgres(projectId, uri) {
  let Pool; try { ({ Pool } = require('pg')); } catch (_) { throw new ProviderUnavailableError('postgresql'); }
  const pool = new Pool({ connectionString: uri, max: Number(process.env.DB_POOL_SIZE || 10), idleTimeoutMillis: 30000, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined });
  await pool.query('CREATE TABLE IF NOT EXISTS supernova_records (id text PRIMARY KEY, project_id text NOT NULL, collection_id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())');
  return sqlExternalStorage({ projectId, provider: 'postgresql', query: (text, values) => pool.query(text, values), close: () => pool.end(), parameter: (index) => `$${index}` });
}

async function openMysql(projectId, uri) {
  let mysql; try { mysql = require('mysql2/promise'); } catch (_) { throw new ProviderUnavailableError('mysql'); }
  const pool = mysql.createPool({ uri, connectionLimit: Number(process.env.DB_POOL_SIZE || 10), waitForConnections: true });
  await pool.query('CREATE TABLE IF NOT EXISTS supernova_records (id varchar(100) PRIMARY KEY, project_id varchar(150) NOT NULL, collection_id varchar(150) NOT NULL, data JSON NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_sn_scope(project_id,collection_id,created_at))');
  return sqlExternalStorage({ projectId, provider: 'mysql', query: (text, values) => pool.execute(text.replace(/\$(\d+)/g, '?'), values), close: () => pool.end(), parameter: () => '?' });
}

function sqlExternalStorage({ projectId, provider, query, close, parameter }) {
  const p = i => parameter(i);
  return {
    provider,
    close,
    async listRecords(collectionId, limit, offset, search = '') {
      const filter = search ? ` AND CAST(data AS TEXT) LIKE ${p(3)}` : '';
      const values = search ? [projectId, collectionId, `%${search}%`, limit, offset] : [projectId, collectionId, limit, offset];
      const result = await query(`SELECT id,data,created_at,updated_at FROM supernova_records WHERE project_id=${p(1)} AND collection_id=${p(2)}${filter} ORDER BY created_at DESC,id DESC LIMIT ${p(search ? 4 : 3)} OFFSET ${p(search ? 5 : 4)}`, values);
      return (result.rows || result[0]).map(parseRecord);
    },
    async insertRecord(collectionId, data) { const id = randomId('record'); await query(`INSERT INTO supernova_records(id,project_id,collection_id,data) VALUES(${p(1)},${p(2)},${p(3)},${p(4)})`, [id, projectId, collectionId, JSON.stringify(data)]); return { id, ...data }; },
    async updateRecord(collectionId, id, data) { const result = await query(`UPDATE supernova_records SET data=${p(1)},updated_at=CURRENT_TIMESTAMP WHERE id=${p(2)} AND project_id=${p(3)} AND collection_id=${p(4)}`, [JSON.stringify(data), id, projectId, collectionId]); const changed = result.rowCount ?? result[0]?.affectedRows; return changed ? { id, ...data } : null; },
    async deleteRecord(collectionId, id) { const result = await query(`DELETE FROM supernova_records WHERE id=${p(1)} AND project_id=${p(2)} AND collection_id=${p(3)}`, [id, projectId, collectionId]); return Boolean(result.rowCount ?? result[0]?.affectedRows); }
  };
}

async function openMongo(projectId, uri, databaseName) {
  let MongoClient; try { ({ MongoClient } = require('mongodb')); } catch (_) { throw new ProviderUnavailableError('mongodb'); }
  const client = new MongoClient(uri, { maxPoolSize: Number(process.env.DB_POOL_SIZE || 10), retryWrites: true });
  await client.connect();
  const collection = client.db(databaseName || 'supernova').collection('supernova_records');
  return { provider: 'mongodb', close: () => client.close(), async listRecords(collectionId, limit, offset, search = '') { const filter = { project_id: projectId, collection_id: collectionId }; if (search) filter['data'] = { $regex: search, $options: 'i' }; return (await collection.find(filter).sort({ created_at: -1 }).skip(offset).limit(limit).toArray()).map(parseRecord); }, async insertRecord(collectionId, data) { const id = randomId('record'); const now = new Date(); await collection.insertOne({ id, project_id: projectId, collection_id: collectionId, data, created_at: now, updated_at: now }); return { id, ...data }; }, async updateRecord(collectionId, id, data) { const result = await collection.updateOne({ id, project_id: projectId, collection_id: collectionId }, { $set: { data, updated_at: new Date() } }); return result.matchedCount ? { id, ...data } : null; }, async deleteRecord(collectionId, id) { const result = await collection.deleteOne({ id, project_id: projectId, collection_id: collectionId }); return result.deletedCount > 0; } };
}

module.exports = { supportedProviders, openProjectStorage, ProviderUnavailableError };
