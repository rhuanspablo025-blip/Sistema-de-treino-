import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import {
  migrateIdentityRelationshipsSchema,
  migrateIdentityInviteDeliverySchema,
  migrateIdentityInviteResendSchema,
  migrateIdentityRelationshipAuditSchema,
  migrateIdentityReactivationConsentSchema,
} from '../lib/identity-relationships-schema.mjs';
import { acceptRelationshipInvite, changeRelationship, createRelationshipInvite } from '../lib/identity-relationships.mjs';
import { getRelationshipActions, runRelationshipAction } from '../lib/relationship-action-flow.mjs';

async function createActiveRelationship() {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const db = createClient({ url: 'file::memory:' });
  await migrateIdentitySchema(db);
  await migrateIdentityRelationshipsSchema(db);
  await migrateIdentityInviteDeliverySchema(db);
  await migrateIdentityInviteResendSchema(db);
  await migrateIdentityRelationshipAuditSchema(db);
  await migrateIdentityReactivationConsentSchema(db);
  await db.execute('CREATE TABLE turso_documents(collection TEXT,id TEXT,document TEXT,PRIMARY KEY(collection,id))');
  await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['billing_plans', 'plan-flow', JSON.stringify({ id: 'plan-flow', includedStudents: 1, active: true })] });
  await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['subscriptions', 'subscription-flow', JSON.stringify({ id: 'subscription-flow', accountUserId: 'personal-flow', planId: 'plan-flow', status: 'ACTIVE', createdAt: '2026-01-01' })] });
  for (const [id, role, studentMode, phone] of [
    ['personal-flow', 'PERSONAL', null, '+551199990001'],
    ['student-flow', 'ALUNO', 'INDEPENDENT', '+551199990002'],
  ]) {
    await db.execute({
      sql: 'INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, role, studentMode, id, id, `${id}@example.com`, phone, 'cipher', 'nonce', 'tag', `cpf-${id}`, 'ACTIVE', '2026-01-01', '2026-01-01'],
    });
  }
  const personal = { id: 'personal-flow', role: 'PERSONAL' };
  const student = { id: 'student-flow', role: 'ALUNO' };
  const invite = await createRelationshipInvite(db, personal, { studentId: student.id });
  const relationship = await acceptRelationshipInvite(db, student, invite.token);
  return { db, personal, student, relationship };
}

function serviceBackedRequest(db, actor, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    const { id, action } = JSON.parse(options.body);
    return changeRelationship(db, actor, id, action);
  };
}

test('Central suspends an ACTIVE relationship through the PATCH contract', async () => {
  const { db, personal, relationship } = await createActiveRelationship();
  try {
    const calls = [], events = [], busy = [];
    const result = await runRelationshipAction({
      relationship,
      action: 'SUSPEND',
      request: serviceBackedRequest(db, personal, calls),
      onUpdate: (value) => events.push(`update:${value.status}`),
      refresh: async () => events.push('refresh'),
      onBusy: (value) => busy.push(value),
    });
    assert.equal(result.status, 'SUSPENDED');
    assert.equal(calls[0].url, '/api/identity/relationships');
    assert.equal(calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].options.body), { id: relationship.id, action: 'SUSPEND' });
    assert.deepEqual(events, ['update:SUSPENDED', 'refresh']);
    assert.deepEqual(busy, [true, false]);
    assert.equal((await db.execute({ sql: 'SELECT status FROM identity_relationships WHERE id=?', args: [relationship.id] })).rows[0].status, 'SUSPENDED');
  } finally {
    await db.close();
  }
});

test('Central reactivates a SUSPENDED relationship and refreshes the listing', async () => {
  const { db, personal, relationship } = await createActiveRelationship();
  try {
    await changeRelationship(db, personal, relationship.id, 'SUSPEND');
    const calls = [], events = [];
    const result = await runRelationshipAction({
      relationship: { ...relationship, status: 'SUSPENDED' },
      action: 'REACTIVATE',
      request: serviceBackedRequest(db, personal, calls),
      onUpdate: (value) => events.push(`update:${value.status}`),
      refresh: async () => events.push('refresh'),
    });
    assert.equal(result.status, 'ACTIVE');
    assert.deepEqual(JSON.parse(calls[0].options.body), { id: relationship.id, action: 'REACTIVATE' });
    assert.deepEqual(events, ['update:ACTIVE', 'refresh']);
    assert.equal((await db.execute({ sql: 'SELECT status FROM identity_relationships WHERE id=?', args: [relationship.id] })).rows[0].status, 'ACTIVE');
  } finally {
    await db.close();
  }
});

test('Central terminates an ACTIVE relationship without deleting student data', async () => {
  const { db, personal, student, relationship } = await createActiveRelationship();
  try {
    const calls = [];
    const result = await runRelationshipAction({
      relationship,
      action: 'TERMINATE',
      request: serviceBackedRequest(db, personal, calls),
      refresh: async () => {},
    });
    assert.equal(result.status, 'TERMINATED');
    const persisted = await db.execute({ sql: 'SELECT status FROM identity_relationships WHERE id=?', args: [relationship.id] });
    assert.equal(persisted.rows[0].status, 'TERMINATED');
    assert.equal((await db.execute({ sql: 'SELECT id FROM identity_users WHERE id=?', args: [student.id] })).rows.length, 1);
  } finally {
    await db.close();
  }
});

test('Central exposes relationship actions only for eligible states', () => {
  assert.deepEqual(getRelationshipActions('ACTIVE'), ['SUSPEND', 'TERMINATE']);
  assert.deepEqual(getRelationshipActions('SUSPENDED'), ['REACTIVATE', 'TERMINATE']);
  for (const status of ['PENDING', 'REJECTED', 'EXPIRED', 'TERMINATED']) assert.deepEqual(getRelationshipActions(status), []);
});

test('Central preserves HTTP errors and releases loading state without refreshing on failure', async () => {
  const relationship = { id: 'relationship-error', status: 'ACTIVE' };
  const failure = new Error('Vínculo alterado por outra operação.');
  failure.status = 409;
  const events = [], busy = [];
  await assert.rejects(runRelationshipAction({
    relationship,
    action: 'SUSPEND',
    request: async () => { events.push('request'); throw failure; },
    onUpdate: () => events.push('update'),
    refresh: async () => events.push('refresh'),
    onBusy: (value) => busy.push(value),
  }), (error) => error === failure);
  assert.deepEqual(events, ['request']);
  assert.deepEqual(busy, [true, false]);
});

test('Central updates the selected relationship before refreshing the listing', async () => {
  const order = [];
  const result = await runRelationshipAction({
    relationship: { id: 'relationship-refresh', status: 'SUSPENDED' },
    action: 'TERMINATE',
    request: async () => ({ id: 'relationship-refresh', status: 'TERMINATED' }),
    onUpdate: (value) => order.push(`state:${value.status}`),
    refresh: async () => order.push('list'),
  });
  assert.equal(result.status, 'TERMINATED');
  assert.deepEqual(order, ['state:TERMINATED', 'list']);
});
