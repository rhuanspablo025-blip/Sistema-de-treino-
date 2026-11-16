import { createClient } from '@libsql/client';
import { randomUUID } from 'node:crypto';

const globalState = globalThis;
const schema = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS identity_users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS identity_profiles (user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), profile_type TEXT NOT NULL, trainer_id TEXT, phone TEXT, goal TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trainer_profiles (user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), cref TEXT, active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, tenant_id))`,
  `CREATE TABLE IF NOT EXISTS student_profiles (user_id TEXT PRIMARY KEY REFERENCES identity_users(id), tenant_id TEXT NOT NULL REFERENCES tenants(id), trainer_id TEXT, phone TEXT, goal TEXT, active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(trainer_id, tenant_id) REFERENCES trainer_profiles(user_id, tenant_id))`,
  `CREATE TABLE IF NOT EXISTS auth_attempts_sql (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS identity_audit_log (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_identity_users_tenant ON identity_users(tenant_id, active)`,
  `CREATE INDEX IF NOT EXISTS idx_identity_profiles_tenant ON identity_profiles(tenant_id, profile_type, active)`,
  `CREATE INDEX IF NOT EXISTS idx_student_profiles_trainer ON student_profiles(tenant_id, trainer_id, active)`,
  `CREATE INDEX IF NOT EXISTS idx_identity_audit_tenant_date ON identity_audit_log(tenant_id, created_at)`,
];

function config() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL não configurada.');
  if (!url.startsWith('file:') && !authToken) throw new Error('TURSO_AUTH_TOKEN não configurado.');
  return { url, ...(authToken && { authToken }) };
}

async function db() {
  const cfg = config(); const key = JSON.stringify(cfg);
  if (!globalState.identitySql || globalState.identitySql.key !== key) globalState.identitySql = { key, client: createClient(cfg), ready: null };
  if (!globalState.identitySql.ready) globalState.identitySql.ready = (async () => { await globalState.identitySql.client.execute('PRAGMA foreign_keys = ON'); await globalState.identitySql.client.batch(schema, 'write'); })();
  await globalState.identitySql.ready;
  return globalState.identitySql.client;
}

export async function ensureIdentitySchema() { return db(); }

export async function findUserByUsername(username) {
  const client = await db();
  const result = await client.execute({ sql: 'SELECT * FROM identity_users WHERE username = ? AND deleted_at IS NULL LIMIT 1', args: [username] });
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function findUserById(id) {
  const client = await db();
  const result = await client.execute({ sql: 'SELECT * FROM identity_users WHERE id = ? AND deleted_at IS NULL LIMIT 1', args: [id] });
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function createStudentIdentity({ name, username, passwordHash, phone, goal, trainerId = null, tenantId = 'default-tenant' }) {
  const client = await db(); const now = new Date().toISOString(); const userId = randomUUID();
  await client.execute({ sql: 'INSERT OR IGNORE INTO tenants(id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [tenantId, 'Academia padrão', tenantId, now, now] });
  const tx = await client.transaction('write');
  try {
    await tx.execute({ sql: 'INSERT INTO identity_users(id, tenant_id, name, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [userId, tenantId, name, username, passwordHash, 'student', now, now] });
    if (trainerId) {
      const trainer = await tx.execute({ sql: 'SELECT user_id FROM trainer_profiles WHERE user_id = ? AND tenant_id = ? AND active = 1', args: [trainerId, tenantId] });
      if (!trainer.rows.length) throw new Error('TRAINER_TENANT_MISMATCH');
    }
    await tx.execute({ sql: 'INSERT INTO identity_profiles(user_id, tenant_id, profile_type, trainer_id, phone, goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [userId, tenantId, 'student', trainerId, phone || null, goal || null, now, now] });
    await tx.execute({ sql: 'INSERT INTO student_profiles(user_id, tenant_id, trainer_id, phone, goal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [userId, tenantId, trainerId, phone || null, goal || null, now, now] });
    await tx.commit();
    return { id: userId, tenantId, name, username, role: 'student', active: true, sessionVersion: 0, passwordHash };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function listActiveTrainers(tenantId = 'default-tenant') { const client = await db(); const r = await client.execute({ sql: 'SELECT u.id, u.name FROM identity_users u JOIN trainer_profiles t ON t.user_id=u.id WHERE u.tenant_id=? AND u.active=1 AND t.active=1 ORDER BY u.name', args: [tenantId] }); return r.rows; }
export async function listAdminUsers({ tenantId = null, includeSuperAdmin = false } = {}) { const client = await db(); const sql = `SELECT u.*, s.phone AS student_phone, s.goal AS student_goal, s.trainer_id, t.cref FROM identity_users u LEFT JOIN student_profiles s ON s.user_id=u.id LEFT JOIN trainer_profiles t ON t.user_id=u.id WHERE u.deleted_at IS NULL ${tenantId ? 'AND u.tenant_id = ?' : ''} ${includeSuperAdmin ? '' : "AND u.role <> 'SUPER_ADMIN'"} ORDER BY u.created_at DESC LIMIT 1000`; const r = await client.execute({ sql, args: tenantId ? [tenantId] : [] }); return r.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, username: row.username, name: row.name, role: row.role, active: Boolean(row.active), sessionVersion: Number(row.session_version || 0), phone: row.student_phone || null, goal: row.student_goal || null, trainerId: row.trainer_id || null, cref: row.cref || null, createdAt: row.created_at, updatedAt: row.updated_at })); }
export async function softDeleteIdentityUser(id, actor) { const client = await db(); const target = await findUserById(id); if (!target || target.role === 'SUPER_ADMIN' || id === actor.id) throw new Error('IDENTITY_DELETE_FORBIDDEN'); const timestamp = new Date().toISOString(); await client.execute({ sql: 'UPDATE identity_users SET active=0, deleted_at=?, session_version=session_version+1, updated_at=? WHERE id=? AND tenant_id=?', args: [timestamp, timestamp, id, actor.tenantId] }); await client.execute({ sql: 'UPDATE student_profiles SET active=0, deleted_at=?, updated_at=? WHERE user_id=?', args: [timestamp, timestamp, id] }); await client.execute({ sql: 'UPDATE trainer_profiles SET active=0, deleted_at=?, updated_at=? WHERE user_id=?', args: [timestamp, timestamp, id] }); await writeIdentityAudit({ tenantId: actor.tenantId, userId: actor.id, action: 'delete', resource: 'user', resourceId: id, metadata: { softDelete: true } }); }
export async function createTrainerIdentity({ name, username, passwordHash, cref = null, tenantId = 'default-tenant' }) {
  const client = await db(); const now = new Date().toISOString(); const userId = randomUUID();
  await client.execute({ sql: 'INSERT OR IGNORE INTO tenants(id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [tenantId, 'Academia padrão', tenantId, now, now] });
  const tx = await client.transaction('write');
  try { await tx.execute({ sql: 'INSERT INTO identity_users(id, tenant_id, name, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [userId, tenantId, name, username, passwordHash, 'trainer', now, now] }); await tx.execute({ sql: 'INSERT INTO identity_profiles(user_id, tenant_id, profile_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [userId, tenantId, 'trainer', now, now] }); await tx.execute({ sql: 'INSERT INTO trainer_profiles(user_id, tenant_id, cref, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [userId, tenantId, cref, now, now] }); await tx.commit(); return { id: userId, tenantId, name, username, role: 'trainer', active: true, sessionVersion: 0, passwordHash }; } catch (error) { await tx.rollback(); throw error; }
}
export async function createManagedIdentity({ name, username, passwordHash, role, tenantId = 'default-tenant' }) {
  const client = await db(); const now = new Date().toISOString(); const userId = randomUUID(); await client.execute({ sql: 'INSERT OR IGNORE INTO tenants(id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [tenantId, 'Academia padrão', tenantId, now, now] }); const tx = await client.transaction('write'); try { await tx.execute({ sql: 'INSERT INTO identity_users(id, tenant_id, name, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [userId, tenantId, name, username, passwordHash, role, now, now] }); await tx.execute({ sql: 'INSERT INTO identity_profiles(user_id, tenant_id, profile_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', args: [userId, tenantId, role, now, now] }); await tx.commit(); return { id: userId, tenantId, name, username, role, active: true, sessionVersion: 0, passwordHash }; } catch (error) { await tx.rollback(); throw error; }
}

export async function writeIdentityAudit({ tenantId = null, userId = null, action, resource, resourceId = null, metadata = {} }) {
  const client = await db();
  await client.execute({ sql: 'INSERT INTO identity_audit_log(id, tenant_id, user_id, action, resource, resource_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [randomUUID(), tenantId, userId, action, resource, resourceId, JSON.stringify(metadata), new Date().toISOString()] });
}

export async function findAuthAttempt(key) { const client = await db(); const r = await client.execute({ sql: 'SELECT * FROM auth_attempts_sql WHERE key=?', args: [key] }); return r.rows[0] || null; }
export async function incrementAuthAttempt(key, expiresAt) { const client = await db(); await client.execute({ sql: 'INSERT INTO auth_attempts_sql(key, attempts, expires_at, created_at) VALUES (?, 1, ?, ?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1', args: [key, expiresAt, new Date().toISOString()] }); }
export async function clearAuthAttempt(key) { const client = await db(); await client.execute({ sql: 'DELETE FROM auth_attempts_sql WHERE key=?', args: [key] }); }

function mapUser(row) { return { id: row.id, tenantId: row.tenant_id, name: row.name, username: row.username, passwordHash: row.password_hash, role: row.role, active: Boolean(row.active), sessionVersion: Number(row.session_version || 0) }; }
