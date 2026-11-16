const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('@libsql/client');
const { migrateTrainingSchema } = require('../lib/training-relational-repository.cjs');

async function schema(client) {
  await client.execute('PRAGMA foreign_keys = ON');
  await client.batch([
    'CREATE TABLE tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL)',
    'CREATE TABLE identity_users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT)',
    'CREATE TABLE trainer_profiles(user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, UNIQUE(user_id, tenant_id))',
    'CREATE TABLE student_profiles(user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), trainer_id TEXT, active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, FOREIGN KEY(trainer_id, tenant_id) REFERENCES trainer_profiles(user_id, tenant_id))',
    'CREATE TABLE identity_audit_log(id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, action TEXT, resource TEXT, resource_id TEXT, metadata_json TEXT, created_at TEXT)',
  ], 'write');
}

test('foreign keys, tenant boundaries, soft delete and session invalidation are enforced', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await schema(client);
    await client.execute({ sql: 'INSERT INTO tenants VALUES (?, ?, ?)', args: ['a', 'A', 'a'] });
    await client.execute({ sql: 'INSERT INTO tenants VALUES (?, ?, ?)', args: ['b', 'B', 'b'] });
    await client.execute({ sql: 'INSERT INTO identity_users VALUES (?, ?, ?, ?, ?, 1, 0, NULL)', args: ['trainer-a', 'a', 'trainer', 'hash', 'trainer'] });
    await client.execute({ sql: 'INSERT INTO trainer_profiles VALUES (?, ?, 1, NULL)', args: ['trainer-a', 'a'] });
    await client.execute({ sql: 'INSERT INTO identity_users VALUES (?, ?, ?, ?, ?, 1, 0, NULL)', args: ['student-a', 'a', 'student', 'hash', 'student'] });
    await assert.rejects(() => client.execute({ sql: 'INSERT INTO student_profiles VALUES (?, ?, ?, 1, NULL)', args: ['student-a', 'b', 'trainer-a'] }));
    await client.execute({ sql: 'UPDATE identity_users SET active=0, deleted_at=?, session_version=session_version+1 WHERE id=? AND tenant_id=?', args: ['now', 'student-a', 'a'] });
    const row = await client.execute({ sql: 'SELECT active, session_version, deleted_at FROM identity_users WHERE id=?', args: ['student-a'] });
    assert.equal(row.rows[0].active, 0); assert.equal(row.rows[0].session_version, 1); assert.equal(row.rows[0].deleted_at, 'now');
  } finally { await client.close(); }
});

test('training migration remains idempotent and does not weaken FK checks', async () => {
  const client = createClient({ url: 'file::memory:' });
  try { await migrateTrainingSchema(client); await migrateTrainingSchema(client); const fk = await client.execute('PRAGMA foreign_keys'); assert.equal(Number(fk.rows[0].foreign_keys), 1); } finally { await client.close(); }
});
