#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { openDatabase } = require('../src/db');

const source = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'supernova.db');
const backupDirectory = process.env.BACKUP_PATH || path.join(__dirname, '..', 'backups');
const destination = path.join(backupDirectory, `supernova-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);

(async () => {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const db = openDatabase(source);
  try {
    await db.backup(destination);
    console.log(`Backup created: ${destination}`);
  } finally {
    db.close();
  }
})().catch(error => {
  console.error('Backup failed:', error.message);
  process.exitCode = 1;
});
