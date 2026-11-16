const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('@libsql/client');

test('identity relational schema enforces tenant, unique username and transaction atomicity', async () => {
  const client = createClient({ url: 'file::memory:' });
  await client.batch([
    'CREATE TABLE tenants(id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL)',
    'CREATE TABLE identity_users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)',
    'CREATE TABLE identity_profiles(user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id))',
  ], 'write');
  await client.execute({ sql: 'INSERT INTO tenants VALUES (?, ?, ?)', args: ['t1', 'Academia 1', 'academia-1'] });
  await client.execute({ sql: 'INSERT INTO identity_users VALUES (?, ?, ?, ?)', args: ['u1', 't1', 'alice', 'hash'] });
  await assert.rejects(() => client.execute({ sql: 'INSERT INTO identity_users VALUES (?, ?, ?, ?)', args: ['u2', 't1', 'alice', 'hash'] }));
  await assert.rejects(() => client.execute({ sql: 'INSERT INTO identity_users VALUES (?, ?, ?, ?)', args: ['u3', 'missing', 'bob', 'hash'] }));
  await client.close();
});
