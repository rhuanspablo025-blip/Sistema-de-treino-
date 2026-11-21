import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { isValidCpf, normalizeCpf, normalizeEmail, normalizeBrazilPhone, normalizeUsername, protectCpf, revealCpf, hashPassword, verifyPassword, createIdentity, cpfLookupDigest, cpfNameDigest } from '../lib/identity-service.mjs';
import { issueChallenge, consumeChallenge } from '../lib/identity-challenges.mjs';

test('normalizes and validates CPF, email, username and Brazilian phone', () => {
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725');
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(normalizeEmail('  Teste@Exemplo.COM '), 'teste@exemplo.com');
  assert.equal(normalizeUsername(' User_Name '), 'user_name');
  assert.equal(normalizeUsername('x!'), null);
  assert.equal(normalizeBrazilPhone('(11) 98765-4321'), '+5511987654321');
  assert.equal(normalizeBrazilPhone('(11) 3333-4444'), null);
  assert.equal(normalizeBrazilPhone('123'), null);
});

test('creates a verified identity with its profile and acceptance events in the SQL transaction', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await migrateIdentitySchema(client);
    const keys = { encryptionKey: Buffer.alloc(32, 3), lookupKey: Buffer.alloc(32, 7) };
    await client.execute({ sql: `INSERT INTO identity_cpf_verifications(id,cpf_lookup_hmac,full_name_hmac,provider_status,expires_at,created_at) VALUES(?,?,?,?,?,?)`, args: ['cpf-proof-1', cpfLookupDigest('52998224725', keys.lookupKey), cpfNameDigest('Ana Silva', keys.lookupKey), 'VERIFIED', '2099-01-01T00:00:00.000Z', new Date().toISOString()] });
    const identity = await createIdentity(client, {
      role: 'PERSONAL', username: 'personal_ana', fullName: 'Ana Silva', email: 'ana@example.com', phone: '11987654321',
      cpf: '52998224725', password: 'Treino!Forte2026', termsAccepted: true, initialDeviceAuthorized: true,
      profile: { specialty: 'Musculação', professionalRegistration: 'CREF 12345' },
      cpfVerificationId: 'cpf-proof-1',
    }, { ...keys, verified: true });
    const account = await client.execute({ sql: 'SELECT status,email_verified_at,phone_verified_at FROM identity_users WHERE id=?', args: [identity.id] });
    const profile = await client.execute({ sql: 'SELECT specialty,professional_registration FROM identity_profiles WHERE user_id=?', args: [identity.id] });
    const events = await client.execute({ sql: 'SELECT event_type FROM identity_security_events WHERE subject_id=? ORDER BY event_type', args: [identity.id] });
    assert.equal(account.rows[0].status, 'ACTIVE');
    assert.ok(account.rows[0].email_verified_at && account.rows[0].phone_verified_at);
    assert.equal(profile.rows[0].specialty, 'Musculação');
    assert.equal(identity.status, 'ACTIVE');
    assert.deepEqual(events.rows.map((row) => row.event_type).sort(), ['IDENTITY_CREATED_VERIFIED', 'INITIAL_DEVICE_AUTHORIZED', 'TERMS_ACCEPTED'].sort());
    await assert.rejects(createIdentity(client, {
      role: 'PERSONAL', username: 'personal_ana_2', fullName: 'Ana Silva', email: 'ana2@example.com', phone: '11987654322',
      cpf: '52998224725', password: 'Treino!Forte2026', cpfVerificationId: 'cpf-proof-1', termsAccepted: true, initialDeviceAuthorized: true,
    }, { ...keys, verified: true }), /verificacao do CPF expirou/);
  } finally { await client.close(); }
});

test('encrypts CPF and derives a stable, non-reversible lookup key', () => {
  const encryptionKey = Buffer.alloc(32, 4), lookupKey = Buffer.alloc(32, 8);
  const record = protectCpf('52998224725', encryptionKey, lookupKey);
  assert.equal(revealCpf(record, encryptionKey), '52998224725');
  assert.match(record.cpfLookupHmac, /^[a-f0-9]{64}$/);
  assert.equal(record.cpfCiphertext.includes('52998224725'), false);
});

test('hashes passwords with scrypt and enforces strength', async () => {
  const hash = await hashPassword('Tr3ino!Seguro#2026');
  assert.equal(await verifyPassword('Tr3ino!Seguro#2026', hash), true);
  assert.equal(await verifyPassword('senha errada', hash), false);
  await assert.rejects(hashPassword('fraca'), /12 a 128/);
});

test('executes relational migration and enforces uniqueness, foreign keys and public-role rules', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    assert.deepEqual(await migrateIdentitySchema(client), { applied: true, migration: 'identity_v2_001' });
    assert.deepEqual(await migrateIdentitySchema(client), { applied: false, migration: 'identity_v2_001' });
    const keys = { encryptionKey: Buffer.alloc(32, 1), lookupKey: Buffer.alloc(32, 2) };
    const input = { role: 'ALUNO', studentMode: 'INDEPENDENT', username: 'ana_silva', fullName: 'Ana Silva', email: 'Ana@Example.com', phone: '11987654321', cpf: '52998224725', password: 'Tr3ino!Seguro#2026' };
    const created = await createIdentity(client, input, keys);
    assert.equal(created.status, 'PENDING');
    await assert.rejects(createIdentity(client, { ...input, username: 'ana_outro' }, keys), /UNIQUE/);
    await assert.rejects(createIdentity(client, { ...input, cpf: '11111111111', username: 'ana_terceira' }, keys), /CPF inválido/);
    await assert.rejects(createIdentity(client, { ...input, role: 'DEV', studentMode: null, username: 'tentativa_dev' }, keys), /Perfil não permitido/);
    await assert.rejects(client.execute({ sql: "INSERT INTO identity_sessions(id,user_id,token_hash,expires_at,created_at) VALUES('orphan','missing','tok','2099-01-01','2026-01-01')" }), /FOREIGN KEY/);
    await assert.rejects(client.execute({ sql: "INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at) SELECT 'dup',role,student_mode,username,full_name,'other@example.com','+5511987654322',cpf_ciphertext,cpf_nonce,cpf_tag,'lookup2',created_at,updated_at FROM identity_users WHERE id=?", args: [created.id] }), /UNIQUE/);
    await assert.rejects(client.execute({ sql: "INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at) SELECT 'dup-email',role,student_mode,'other_user',full_name,email_normalized,'+5511987654322',cpf_ciphertext,cpf_nonce,cpf_tag,'lookup-email',created_at,updated_at FROM identity_users WHERE id=?", args: [created.id] }), /UNIQUE/);
    await assert.rejects(client.execute({ sql: "INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at) SELECT 'dup-phone',role,student_mode,'other_user',full_name,'other@example.com',phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,'lookup-phone',created_at,updated_at FROM identity_users WHERE id=?", args: [created.id] }), /UNIQUE/);
    await assert.rejects(client.execute({ sql: "INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at) SELECT 'dup-cpf',role,student_mode,'other_user',full_name,'other@example.com','+5511987654322',cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,created_at,updated_at FROM identity_users WHERE id=?", args: [created.id] }), /UNIQUE/);
  } finally { await client.close(); }
});

test('verification challenges expire, limit attempts and are single-use', async () => {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const client = createClient({ url: 'file::memory:' });
  try {
    await migrateIdentitySchema(client);
    let delivered;
    const challenge = await issueChallenge(client, { purpose: 'EMAIL', destination: 'ana@example.com', now: 1_800_000_000_000, deliver: async ({ code }) => { delivered = code; }, testCodeSink: () => {} });
    const wrongCode = delivered === '111111' ? '222222' : '111111';
    assert.equal((await consumeChallenge(client, { id: challenge.id, purpose: 'EMAIL', code: wrongCode, now: 1_800_000_001_000 })).reason, 'invalid_code');
    assert.equal((await consumeChallenge(client, { id: challenge.id, purpose: 'EMAIL', code: delivered, now: 1_800_000_002_000 })).ok, true);
    assert.equal((await consumeChallenge(client, { id: challenge.id, purpose: 'EMAIL', code: delivered, now: 1_800_000_003_000 })).ok, false);
    const expired = await issueChallenge(client, { purpose: 'PHONE', destination: '+5511987654321', now: 1_800_000_000_000, deliver: async () => {} });
    assert.equal((await consumeChallenge(client, { id: expired.id, purpose: 'PHONE', code: delivered, now: 1_800_000_301_000 })).reason, 'expired_or_unavailable');
  } finally { await client.close(); }
});

test('verification delivery enforces cooldown and shared per-destination hourly limits', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await migrateIdentitySchema(client);
    const destination = 'limit@example.com', start = 1_810_000_000_000;
    for (let index = 0; index < 5; index++) {
      await issueChallenge(client, { purpose: 'EMAIL', destination, now: start + index * 61_000, deliver: async () => {} });
    }
    await assert.rejects(issueChallenge(client, { purpose: 'EMAIL', destination, now: start + 5 * 61_000, deliver: async () => {} }), /Limite de solicita/);
  } finally { await client.close(); }
});
