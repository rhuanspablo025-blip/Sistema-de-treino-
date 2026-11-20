import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { isValidCpf, normalizeCpf, normalizeEmail, normalizeBrazilPhone, normalizeUsername, protectCpf, revealCpf, hashPassword, verifyPassword, createIdentity } from '../lib/identity-service.mjs';
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
  assert.equal(normalizeBrazilPhone('123'), null);
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
