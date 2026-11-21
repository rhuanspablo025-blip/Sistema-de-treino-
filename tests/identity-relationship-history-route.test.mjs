import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import {
  migrateIdentityRelationshipsSchema,
  migrateIdentityInviteDeliverySchema,
  migrateIdentityInviteResendSchema,
  migrateIdentityRelationshipAuditSchema,
} from '../lib/identity-relationships-schema.mjs';
import { createHistoryGetHandler } from '../lib/identity-relationship-history-handler.mjs';

const relationshipId = 'relationship-history-a';

async function createHistoryFixture(eventRows = [
  { id: 'event-accepted', actorId: 'student-a', type: 'ACCEPTED', createdAt: '2026-02-01T10:00:00.000Z', previous: 'PENDING', next: 'ACTIVE' },
  { id: 'event-suspended', actorId: 'personal-a', type: 'SUSPEND', createdAt: '2026-02-02T10:00:00.000Z', previous: 'ACTIVE', next: 'SUSPENDED' },
]) {
  const db = createClient({ url: 'file::memory:' });
  await migrateIdentitySchema(db);
  await migrateIdentityRelationshipsSchema(db);
  await migrateIdentityInviteDeliverySchema(db);
  await migrateIdentityInviteResendSchema(db);
  await migrateIdentityRelationshipAuditSchema(db);

  const identities = [
    ['personal-a', 'PERSONAL', null],
    ['student-a', 'ALUNO', 'LINKED'],
    ['personal-b', 'PERSONAL', null],
    ['student-b', 'ALUNO', 'LINKED'],
    ['student-outsider', 'ALUNO', 'INDEPENDENT'],
  ];
  for (const [index, [id, role, studentMode]] of identities.entries()) {
    await db.execute({
      sql: 'INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, role, studentMode, id, `Name ${id}`, `${id}@example.com`, `+55119999${String(index + 1).padStart(6, '0')}`, 'ciphertext', 'nonce', 'tag', `cpf-${id}`, 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
    });
  }

  const relationships = [
    [relationshipId, 'personal-a', 'student-a'],
    ['relationship-history-b', 'personal-b', 'student-b'],
  ];
  for (const [id, personalId, studentId] of relationships) {
    await db.execute({
      sql: "INSERT INTO identity_relationships(id,personal_id,student_id,status,created_at,updated_at,accepted_at) VALUES(?,?,?,'ACTIVE',?,?,?)",
      args: [id, personalId, studentId, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
    });
  }
  for (const event of eventRows) {
    await db.execute({
      sql: 'INSERT INTO identity_relationship_events(id,relationship_id,actor_id,event_type,created_at,previous_status,next_status,reason) VALUES(?,?,?,?,?,?,?,?)',
      args: [event.id, relationshipId, event.actorId, event.type, event.createdAt, event.previous, event.next, event.reason ?? null],
    });
  }
  await db.execute({
    sql: "INSERT INTO identity_relationship_events(id,relationship_id,actor_id,event_type,created_at,previous_status,next_status) VALUES('event-other-tenant','relationship-history-b','student-b','ACCEPTED','2026-02-01T10:00:00.000Z','PENDING','ACTIVE')",
  });

  const handlerFor = (identityId) => createHistoryGetHandler({
    requireUserFn: async () => ({ user: { id: identityId, identityV2: true } }),
    getClient: async () => db,
  });
  return { db, handlerFor };
}

async function getHistory(handler, id = relationshipId, query = '') {
  const request = new Request(`http://localhost/api/identity/relationships/${encodeURIComponent(id)}/history${query}`);
  return handler(request, { params: Promise.resolve({ relationshipId: id }) });
}

test('history route allows the participating Personal and returns safe events', async () => {
  const { db, handlerFor } = await createHistoryFixture();
  try {
    const response = await getHistory(handlerFor('personal-a'));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.events.length, 2);
    assert.deepEqual(body.events.map((event) => event.event_type), ['ACCEPTED', 'SUSPEND']);
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /cpf|ciphertext|nonce|tag|email_normalized|phone_e164|@example\.com/i);
  } finally {
    await db.close();
  }
});

test('history route allows the participating Student to read their events', async () => {
  const { db, handlerFor } = await createHistoryFixture();
  try {
    const response = await getHistory(handlerFor('student-a'));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.events.length, 2);
    assert.deepEqual(body.events.map((event) => event.event_type), ['ACCEPTED', 'SUSPEND']);
  } finally {
    await db.close();
  }
});

test('history route denies a nonparticipant without returning events', async () => {
  const { db, handlerFor } = await createHistoryFixture();
  try {
    const response = await getHistory(handlerFor('student-outsider'));
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.events, undefined);
    assert.ok(body.error);
  } finally {
    await db.close();
  }
});

test('history route rejects a request without a valid session', async () => {
  const { db } = await createHistoryFixture();
  try {
    const handler = createHistoryGetHandler({
      requireUserFn: async () => ({ response: new Response(JSON.stringify({ error: 'Não autenticado.' }), { status: 401 }) }),
      getClient: async () => db,
    });
    const response = await getHistory(handler);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).events, undefined);
  } finally {
    await db.close();
  }
});

test('history route paginates without duplicates and sorts by created_at then id', async () => {
  const eventRows = [
    { id: 'event-d', actorId: 'personal-a', type: 'SUSPEND', createdAt: '2026-02-02T10:00:00.000Z', previous: 'ACTIVE', next: 'SUSPENDED' },
    { id: 'event-b', actorId: 'student-a', type: 'ACCEPTED', createdAt: '2026-02-01T10:00:00.000Z', previous: 'PENDING', next: 'ACTIVE' },
    { id: 'event-e', actorId: 'personal-a', type: 'TERMINATE', createdAt: '2026-02-03T10:00:00.000Z', previous: 'ACTIVE', next: 'TERMINATED' },
    { id: 'event-a', actorId: 'student-a', type: 'ACCEPTED', createdAt: '2026-02-01T10:00:00.000Z', previous: 'PENDING', next: 'ACTIVE' },
    { id: 'event-c', actorId: 'personal-a', type: 'REACTIVATE', createdAt: '2026-02-01T12:00:00.000Z', previous: 'SUSPENDED', next: 'ACTIVE' },
  ];
  const { db, handlerFor } = await createHistoryFixture(eventRows);
  try {
    const pages = [];
    for (const page of [1, 2, 3]) {
      const response = await getHistory(handlerFor('personal-a'), relationshipId, `?page=${page}&pageSize=2`);
      assert.equal(response.status, 200);
      pages.push((await response.json()).events);
    }
    assert.deepEqual(pages.map((events) => events.length), [2, 2, 1]);
    const ids = pages.flat().map((event) => event.id);
    assert.deepEqual(ids, ['event-a', 'event-b', 'event-c', 'event-d', 'event-e']);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    await db.close();
  }
});

test('history route isolates tenants and denies another Personal access to the relationship', async () => {
  const { db, handlerFor } = await createHistoryFixture();
  try {
    const response = await getHistory(handlerFor('personal-b'), relationshipId);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.events, undefined);
    assert.ok(body.error);
  } finally {
    await db.close();
  }
});
