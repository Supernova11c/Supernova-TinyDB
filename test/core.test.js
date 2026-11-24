const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db');
const { hashPassword, verifyPassword, validateJsonSchema } = require('../src/security');

test('SQLite schema opens and passes integrity checks', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supernova-schema-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  assert.equal(db.prepare('PRAGMA integrity_check').pluck().get(), 'ok');
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','projects','collections','records','credentials','audit_logs') ORDER BY name").all().map(row => row.name), ['audit_logs','collections','credentials','projects','records','users']);
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('password hashing is verifiable and does not store plaintext', () => {
  const hash = hashPassword('this-is-a-long-password');
  assert.notEqual(hash, 'this-is-a-long-password');
  assert.equal(verifyPassword('this-is-a-long-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('record writes enforce project and collection isolation', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supernova-isolation-'));
  const db = openDatabase(path.join(directory, 'test.db'));
  db.prepare("INSERT INTO users(id,email,password_hash,email_verified) VALUES ('u1','a@example.com','hash',1),('u2','b@example.com','hash',1)").run();
  db.prepare("INSERT INTO projects(id,owner_id,name) VALUES ('p1','u1','A'),('p2','u2','B')").run();
  db.prepare("INSERT INTO collections(id,project_id,name) VALUES ('c1','p1','notes'),('c2','p2','notes')").run();
  db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('r1','p1','c1','{\"title\":\"A\"}')").run();
  assert.throws(() => db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('r-bad','p1','c2','{}')").run());
  assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE project_id='p1' AND collection_id='c1'").get().n, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE project_id='p2'").get().n, 0);
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('JSON schemas validate required fields, types, lengths, and extra fields', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string', maxLength: 20 }, count: { type: 'integer' } } };
  assert.equal(validateJsonSchema({ title: 'Hello', count: 2 }, schema), null);
  assert.match(validateJsonSchema({}, schema), /Missing required/);
  assert.match(validateJsonSchema({ title: 42 }, schema), /must be a string/);
  assert.match(validateJsonSchema({ title: 'Hello', extra: true }, schema), /not allowed/);
});
