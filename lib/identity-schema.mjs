const MIGRATION = 'identity_v2_001';

const statements = [
  `CREATE TABLE IF NOT EXISTS identity_users (
    id TEXT PRIMARY KEY,
    legacy_user_id TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('DEV','PERSONAL','ALUNO')),
    student_mode TEXT CHECK (student_mode IN ('INDEPENDENT','LINKED')),
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    full_name TEXT NOT NULL,
    email_normalized TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email_verified_at TEXT,
    phone_e164 TEXT NOT NULL UNIQUE,
    phone_verified_at TEXT,
    cpf_ciphertext TEXT NOT NULL,
    cpf_nonce TEXT NOT NULL,
    cpf_tag TEXT NOT NULL,
    cpf_lookup_hmac TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','BLOCKED','CLOSED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((role = 'ALUNO' AND student_mode IS NOT NULL) OR (role <> 'ALUNO' AND student_mode IS NULL))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS identity_single_dev ON identity_users(role) WHERE role='DEV' AND status <> 'CLOSED'`,
  `CREATE TABLE IF NOT EXISTS identity_profiles (user_id TEXT PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE, specialty TEXT, professional_registration TEXT, student_goal TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS identity_cpf_verifications (id TEXT PRIMARY KEY, cpf_lookup_hmac TEXT NOT NULL, full_name_hmac TEXT NOT NULL, provider_status TEXT NOT NULL CHECK(provider_status IN ('PENDING','VERIFIED','REJECTED')), expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS identity_cpf_verifications_rate ON identity_cpf_verifications(cpf_lookup_hmac,created_at)`,
  `CREATE TABLE IF NOT EXISTS identity_credentials (user_id TEXT PRIMARY KEY REFERENCES identity_users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, password_updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS identity_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, device_id TEXT, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS identity_sessions_user ON identity_sessions(user_id, expires_at)`,
  `CREATE TABLE IF NOT EXISTS identity_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE, fingerprint_hmac TEXT NOT NULL, label TEXT, trusted_until TEXT, revoked_at TEXT, created_at TEXT NOT NULL, UNIQUE(user_id, fingerprint_hmac))`,
  `CREATE TABLE IF NOT EXISTS identity_challenges (id TEXT PRIMARY KEY, user_id TEXT REFERENCES identity_users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('EMAIL','PHONE','DEVICE','PASSWORD_RECOVERY','MFA')), destination_hmac TEXT NOT NULL, code_hmac TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0), max_attempts INTEGER NOT NULL DEFAULT 5, resend_after TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT, invalidated_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS identity_challenges_expiry ON identity_challenges(expires_at)`,
  `CREATE INDEX IF NOT EXISTS identity_challenges_rate ON identity_challenges(destination_hmac,purpose,created_at)`,
  `CREATE TABLE IF NOT EXISTS identity_relationships (id TEXT PRIMARY KEY, personal_id TEXT NOT NULL REFERENCES identity_users(id), student_id TEXT NOT NULL REFERENCES identity_users(id), status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','ENDED','REJECTED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(personal_id <> student_id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS identity_active_relationship ON identity_relationships(student_id) WHERE status IN ('PENDING','ACTIVE','SUSPENDED')`,
  `CREATE TABLE IF NOT EXISTS identity_invites (id TEXT PRIMARY KEY, personal_id TEXT NOT NULL REFERENCES identity_users(id), token_hmac TEXT NOT NULL UNIQUE, destination_hmac TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS identity_invites_personal ON identity_invites(personal_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS identity_security_events (id TEXT PRIMARY KEY, actor_id TEXT REFERENCES identity_users(id), subject_id TEXT REFERENCES identity_users(id), event_type TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`
];

export async function migrateIdentitySchema(client) {
  await client.execute('CREATE TABLE IF NOT EXISTS identity_schema_migrations (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const existing = await client.execute({ sql: 'SELECT key FROM identity_schema_migrations WHERE key=?', args: [MIGRATION] });
  if (existing.rows.length) return { applied: false, migration: MIGRATION };
  const tx = await client.transaction('write');
  try {
    for (const sql of statements) await tx.execute(sql);
    await tx.execute({ sql: 'INSERT INTO identity_schema_migrations(key, applied_at) VALUES (?, ?)', args: [MIGRATION, new Date().toISOString()] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  return { applied: true, migration: MIGRATION };
}

export { MIGRATION as IDENTITY_MIGRATION };
