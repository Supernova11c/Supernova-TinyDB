const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db');
const { hashPassword, verifyPassword, sha256, timingSafeHashEqual } = require('../src/security');

test('password hashes verify without storing plaintext', () => {
  const encoded = hashPassword('a long test password');
  assert.notEqual(encoded, 'a long test password');
  assert.equal(verifyPassword('a long test password', encoded), true);
  assert.equal(verifyPassword('wrong password', encoded), false);
});

test('database persists records and enforces project/collection scope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supernova-test-'));
  const file = path.join(dir, 'test.db');
  let db = openDatabase(file);
  db.prepare("INSERT INTO users(id,email,password_hash,email_verified) VALUES ('u1','one@example.test','hash',1),('u2','two@example.test','hash',1)").run();
  db.prepare("INSERT INTO projects(id,owner_id,name) VALUES ('p1','u1','One'),('p2','u2','Two')").run();
  db.prepare("INSERT INTO collections(id,project_id,name) VALUES ('c1','p1','notes'),('c2','p2','notes')").run();
  db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('r1','p1','c1','{\"title\":\"private\"}')").run();
  assert.throws(() => db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('bad','p1','c2','{}')").run());
  assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE project_id='p2'").get().n, 0);
  db.close(); db = openDatabase(file);
  assert.equal(db.prepare("SELECT json_extract(data,'$.title') AS title FROM records WHERE project_id='p1' AND collection_id='c1'").get().title, 'private');
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('credential comparison operates on hashes and rejects unequal values', () => {
  assert.equal(timingSafeHashEqual(sha256('secret'), sha256('secret')), true);
  assert.equal(timingSafeHashEqual(sha256('secret'), sha256('different')), false);
  assert.equal(timingSafeHashEqual('x', undefined), false);
});

test('record collection index is present for scoped pagination', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supernova-index-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  const indexes = db.prepare("PRAGMA index_list('records')").all().map(row => row.name);
  assert.ok(indexes.includes('idx_records_scope_created'));
  db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
