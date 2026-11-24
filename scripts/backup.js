const fs = require('fs');
const path = require('path');
const { openDatabase } = require('../src/db');
const source = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'supernova.db');
const targetDir = process.env.BACKUP_PATH || path.join(__dirname, '..', 'backups');
const target = path.join(targetDir, `supernova-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
fs.mkdirSync(targetDir, { recursive: true });
const db = openDatabase(source);
(async () => { try { await db.backup(target); console.log(`Backup created: ${target}`); } finally { db.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
