const KEY = 'identity_v2_002_relationships';
const INVITES_KEY = 'identity_v2_003_invite_delivery';

export async function migrateIdentityRelationshipsSchema(client) {
  const applied = await client.execute({ sql: 'SELECT key FROM identity_schema_migrations WHERE key=?', args: [KEY] });
  if (applied.rows.length) return { applied: false, migration: KEY };
  const tx = await client.transaction('write');
  try {
    await tx.execute(`CREATE TABLE identity_relationships_new (id TEXT PRIMARY KEY, personal_id TEXT NOT NULL REFERENCES identity_users(id), student_id TEXT NOT NULL REFERENCES identity_users(id), status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','SUSPENDED','REJECTED','EXPIRED','TERMINATED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, accepted_at TEXT, terminated_at TEXT, CHECK(personal_id<>student_id))`);
    await tx.execute(`INSERT INTO identity_relationships_new(id,personal_id,student_id,status,created_at,updated_at) SELECT id,personal_id,student_id,CASE WHEN status='ENDED' THEN 'TERMINATED' ELSE status END,created_at,updated_at FROM identity_relationships`);
    await tx.execute('DROP TABLE identity_relationships');
    await tx.execute('ALTER TABLE identity_relationships_new RENAME TO identity_relationships');
    await tx.execute(`CREATE UNIQUE INDEX identity_active_relationship ON identity_relationships(student_id) WHERE status IN ('PENDING','ACTIVE','SUSPENDED')`);
    await tx.execute('CREATE INDEX identity_relationships_personal ON identity_relationships(personal_id,status,created_at)');
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN code_hmac TEXT');
    await tx.execute(`ALTER TABLE identity_invites ADD COLUMN purpose TEXT NOT NULL DEFAULT 'RELATIONSHIP'`);
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN student_id TEXT REFERENCES identity_users(id)');
    await tx.execute('CREATE UNIQUE INDEX identity_invites_code ON identity_invites(code_hmac)');
    await tx.execute(`CREATE TABLE identity_relationship_events (id TEXT PRIMARY KEY, relationship_id TEXT NOT NULL REFERENCES identity_relationships(id), actor_id TEXT NOT NULL REFERENCES identity_users(id), event_type TEXT NOT NULL, created_at TEXT NOT NULL)`);
    await tx.execute({ sql: 'INSERT INTO identity_schema_migrations(key,applied_at) VALUES(?,?)', args: [KEY, new Date().toISOString()] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  return { applied: true, migration: KEY };
}

export async function migrateIdentityInviteDeliverySchema(client) {
  const applied = await client.execute({ sql: 'SELECT key FROM identity_schema_migrations WHERE key=?', args: [INVITES_KEY] });
  if (applied.rows.length) return { applied: false, migration: INVITES_KEY };
  const tx = await client.transaction('write');
  try {
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN rejected_at TEXT');
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN destination_ciphertext TEXT');
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN token_ciphertext TEXT');
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN code_ciphertext TEXT');
    await tx.execute('ALTER TABLE identity_invites ADD COLUMN last_sent_at TEXT');
    await tx.execute(`CREATE TABLE identity_invite_events (id TEXT PRIMARY KEY, invite_id TEXT NOT NULL REFERENCES identity_invites(id), actor_id TEXT NOT NULL REFERENCES identity_users(id), event_type TEXT NOT NULL, created_at TEXT NOT NULL)`);
    await tx.execute({ sql: 'INSERT INTO identity_schema_migrations(key,applied_at) VALUES(?,?)', args: [INVITES_KEY, new Date().toISOString()] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  return { applied: true, migration: INVITES_KEY };
}

const RESEND_KEY='identity_v2_004_resend_claim';
export async function migrateIdentityInviteResendSchema(client){const r=await client.execute({sql:'SELECT key FROM identity_schema_migrations WHERE key=?',args:[RESEND_KEY]});if(r.rows.length)return {applied:false,migration:RESEND_KEY};const tx=await client.transaction('write');try{await tx.execute('ALTER TABLE identity_invites ADD COLUMN resend_claimed_at TEXT');await tx.execute({sql:'INSERT INTO identity_schema_migrations(key,applied_at) VALUES(?,?)',args:[RESEND_KEY,new Date().toISOString()]});await tx.commit();return {applied:true,migration:RESEND_KEY};}catch(e){await tx.rollback();throw e;}}
