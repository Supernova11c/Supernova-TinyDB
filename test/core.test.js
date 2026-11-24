const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db');
const { validateObjectAgainstSchema } = require('../src/security');

test('malformed or cross-project collection records are rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supernova-'));
  const db = openDatabase(path.join(dir, 'test.db'));
  db.prepare("INSERT INTO users(id,email,password_hash,email_verified) VALUES ('u','test@example.com','hash',1)").run();
  db.prepare("INSERT INTO projects(id,owner_id,name,database_provider) VALUES ('p','u','A','sqlite'),('q','u','B','sqlite')").run();
  db.prepare("INSERT INTO collections(id,project_id,name) VALUES ('c','p','notes'),('d','q','notes')").run();
  db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('r','p','c','{\"title\":\"ok\"}')").run();
  assert.throws(() => db.prepare("INSERT INTO records(id,project_id,collection_id,data) VALUES ('bad','p','d','{}')").run());
  assert.equal(db.prepare("SELECT count(*) n FROM records WHERE project_id='p' AND collection_id='c'").get().n, 1);
  db.close(); fs.rmSync(dir, { recursive:true, force:true });
});

test('JSON schemas validate types and required fields', () => {
  const schema = { type:'object', additionalProperties:false, required:['title'], properties:{ title:{type:'string',maxLength:20}, count:{type:'integer'} } };
  assert.equal(validateObjectAgainstSchema({title:'Hello',count:2}, schema), null);
  assert.match(validateObjectAgainstSchema({}, schema), /Missing required/);
  assert.match(validateObjectAgainstSchema({title:123}, schema), /must be a string/);
  assert.match(validateObjectAgainstSchema({title:'Hello',extra:true}, schema), /not allowed/);
});
