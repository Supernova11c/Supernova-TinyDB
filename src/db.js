const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token_hash TEXT, verification_expires_at TEXT,
      created_at TEXT NOT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
      secret_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, kind)
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      public_read INTEGER NOT NULL DEFAULT 1, public_insert INTEGER NOT NULL DEFAULT 0,
      public_update INTEGER NOT NULL DEFAULT 0, public_delete INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, name)
    );
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, collection_id TEXT NOT NULL,
      data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_records_scope ON records(project_id, collection_id);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, user_id TEXT,
      action TEXT NOT N");
  `);
  return db;
}

module.exports = { openDatabase };
