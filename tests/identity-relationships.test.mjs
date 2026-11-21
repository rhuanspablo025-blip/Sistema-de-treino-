import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { migrateIdentityRelationshipsSchema, migrateIdentityInviteDeliverySchema, migrateIdentityInviteResendSchema, migrateIdentityRelationshipAuditSchema } from '../lib/identity-relationships-schema.mjs';
import { createRelationshipInvite, acceptRelationshipInvite, changeRelationship, getRelationshipInvite, rejectRelationshipInvite, resendRelationshipInvite } from '../lib/identity-relationships.mjs';
import { canManageStudent } from '../lib/identity-authorization.mjs';

async function createAuditFixture() {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const db = createClient({ url: 'file::memory:' });
  await db.execute('PRAGMA busy_timeout=3000');
  await migrateIdentitySchema(db);
  await migrateIdentityRelationshipsSchema(db);
  await migrateIdentityInviteDeliverySchema(db);
  await migrateIdentityInviteResendSchema(db);
  await migrateIdentityRelationshipAuditSchema(db);
  await db.execute('CREATE TABLE turso_documents(collection TEXT,id TEXT,document TEXT,PRIMARY KEY(collection,id))');
  await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['billing_plans', 'plan-audit', JSON.stringify({ id: 'plan-audit', includedStudents: 1, active: true })] });
  await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['subscriptions', 'subscription-audit', JSON.stringify({ id: 'subscription-audit', accountUserId: 'personal-audit', planId: 'plan-audit', status: 'ACTIVE', createdAt: '2026-01-01' })] });
  for (const [id, role, mode] of [['personal-audit', 'PERSONAL', null], ['student-audit', 'ALUNO', 'INDEPENDENT']]) {
    await db.execute({
      sql: 'INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, role, mode, id, id, `${id}@example.com`, role === 'PERSONAL' ? '+5511999990001' : '+5511999990002', 'x', 'x', 'x', id, 'ACTIVE', '2026-01-01', '2026-01-01'],
    });
  }
  const personal = { id: 'personal-audit', role: 'PERSONAL' };
  const student = { id: 'student-audit', role: 'ALUNO' };
  return { db, personal, student };
}

async function readRelationshipEvents(db, relationshipId) {
  return (await db.execute({
    sql: 'SELECT relationship_id,actor_id,event_type,created_at,previous_status,next_status,reason FROM identity_relationship_events WHERE relationship_id=? ORDER BY created_at,id',
    args: [relationshipId],
  })).rows;
}

async function createActiveAuditRelationship(db, personal, student) {
  const invite = await createRelationshipInvite(db, personal, { studentId: student.id });
  return acceptRelationshipInvite(db, student, invite.token);
}

test('invites activate once, enforce contracted capacity, and termination revokes access', async () => {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const databaseUrl = `file:identity-relationships-${Date.now()}.db`;
  const db = createClient({ url: databaseUrl });
  const concurrentDb = createClient({ url: databaseUrl });
  try {
    await db.execute('PRAGMA journal_mode=WAL');
    await db.execute('PRAGMA busy_timeout=3000');
    await concurrentDb.execute('PRAGMA busy_timeout=3000');
    await migrateIdentitySchema(db);
    assert.equal((await migrateIdentityRelationshipsSchema(db)).applied, true);
    assert.equal((await migrateIdentityRelationshipsSchema(db)).applied, false);
    assert.equal((await migrateIdentityInviteDeliverySchema(db)).applied, true);
    assert.equal((await migrateIdentityInviteResendSchema(db)).applied, true);
    assert.equal((await migrateIdentityRelationshipAuditSchema(db)).applied, true);
    await db.execute(`CREATE TABLE turso_documents(collection TEXT,id TEXT,document TEXT,PRIMARY KEY(collection,id))`);
    const insert = (collection, id, data) => db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: [collection, id, JSON.stringify(data)] });
    await insert('billing_plans', 'plan1', { id: 'plan1', includedStudents: 1, active: true });
    await insert('subscriptions', 'sub1', { id: 'sub1', accountUserId: 'personal1', planId: 'plan1', status: 'ACTIVE', createdAt: '2026-01-01' });
    for (const [id, role, mode] of [['personal1','PERSONAL',null], ['student1','ALUNO','INDEPENDENT'], ['student2','ALUNO','INDEPENDENT']]) {
      await db.execute({ sql: `INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id,role,mode,id,id,`${id}@example.com`,`+551198765432${id === 'personal1' ? '1' : id === 'student1' ? '2' : '3'}`,'x','x','x',id,'ACTIVE','2026-01-01','2026-01-01'] });
    }
    const personal = { id: 'personal1', role: 'PERSONAL' }, student1 = { id: 'student1', role: 'ALUNO' }, student2 = { id: 'student2', role: 'ALUNO' };
    const targeted = await createRelationshipInvite(db, personal, { studentId: student2.id });
    await assert.rejects(rejectRelationshipInvite(db, student1, targeted.code), (error) => error.status === 403);
    const rejects = await Promise.allSettled([rejectRelationshipInvite(db, student2, targeted.code), rejectRelationshipInvite(concurrentDb, student2, targeted.code)]);
    assert.ok(rejects.every((item) => item.status === 'fulfilled' || item.reason.status === 409));
    assert.equal(rejects.filter((item) => item.status === 'fulfilled').length, 2);
    assert.equal(rejects.filter((item) => item.status === 'fulfilled' && !item.value.repeated).length, 1);
    assert.deepEqual(await rejectRelationshipInvite(db, student2, targeted.code), { status: 'REJECTED', repeated: true });
    await assert.rejects(acceptRelationshipInvite(db, student2, targeted.token), /indisponivel/);
    const resendable=await createRelationshipInvite(db,personal,{email:'student2@example.com'});
    let delivered;
    assert.deepEqual(await resendRelationshipInvite(db,personal,resendable.id,async (payload)=>{delivered=payload;return {status:'SENT'};}),{status:'SENT'});
    assert.equal(delivered.destination,'student2@example.com');
    assert.equal((await db.execute({sql:'SELECT last_sent_at FROM identity_invites WHERE id=?',args:[resendable.id]})).rows[0].last_sent_at!=null,true);
    await assert.rejects(resendRelationshipInvite(db,personal,resendable.id,async()=>({status:'SENT'})),(e)=>e.status===429);
    await assert.rejects(resendRelationshipInvite(db,{id:'other',role:'PERSONAL'},resendable.id,async()=>({status:'SENT'})),(e)=>e.status===404);
    const failedSend=await createRelationshipInvite(db,personal,{email:'other@example.com'});
    await assert.rejects(resendRelationshipInvite(db,personal,failedSend.id,async()=>({status:'FAILED'})),(e)=>e.status===503);
    const failedState=await db.execute({sql:'SELECT last_sent_at,resend_claimed_at FROM identity_invites WHERE id=?',args:[failedSend.id]});
    assert.equal(failedState.rows[0].last_sent_at,null);assert.equal(failedState.rows[0].resend_claimed_at,null);
    const expiredResend=await createRelationshipInvite(db,personal,{email:'expired@example.com'});await db.execute({sql:'UPDATE identity_invites SET expires_at=? WHERE id=?',args:['2000-01-01',expiredResend.id]});
    await assert.rejects(resendRelationshipInvite(db,personal,expiredResend.id,async()=>({status:'SENT'})),(e)=>e.status===410);
    const rejectedForResend=await createRelationshipInvite(db,personal,{studentId:student2.id});await rejectRelationshipInvite(db,student2,rejectedForResend.token);
    await assert.rejects(resendRelationshipInvite(db,personal,rejectedForResend.id,async()=>({status:'SENT'})),(e)=>e.status===409);
    let finishDelivery;const gate=new Promise(resolve=>{finishDelivery=resolve;});const concurrentInvite=await createRelationshipInvite(db,personal,{email:'concurrent@example.com'});
    const sendPromise=resendRelationshipInvite(db,personal,concurrentInvite.id,async()=>{await gate;return {status:'SENT'};});
    for(let tries=0;tries<20;tries++){const row=await db.execute({sql:'SELECT resend_claimed_at FROM identity_invites WHERE id=?',args:[concurrentInvite.id]});if(row.rows[0].resend_claimed_at)break;await new Promise(resolve=>setTimeout(resolve,5));}
    await assert.rejects(resendRelationshipInvite(concurrentDb,personal,concurrentInvite.id,async()=>({status:'SENT'})),(e)=>e.status===429);
    finishDelivery();await sendPromise;
    const invite = await createRelationshipInvite(db, personal);
    assert.equal((await getRelationshipInvite(db, invite.code)).status, 'PENDING');
    const attempts = await Promise.allSettled([acceptRelationshipInvite(db, student1, invite.token), acceptRelationshipInvite(concurrentDb, student1, invite.token)]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal((await db.execute({ sql: 'SELECT COUNT(*) AS total FROM identity_relationships WHERE status=?', args: ['ACTIVE'] })).rows[0].total, 1);
    const linked = attempts.find((result) => result.status === 'fulfilled').value;
    assert.equal(linked.studentId, student1.id);
    assert.equal(linked.status, 'ACTIVE');
    assert.equal(await canManageStudent(db, personal, student1.id), true);
    const stored = await db.execute({ sql: 'SELECT token_hmac,code_hmac FROM identity_invites WHERE id=?', args: [invite.id] });
    assert.notEqual(stored.rows[0].token_hmac, invite.token);
    assert.notEqual(stored.rows[0].code_hmac, invite.code);
    await assert.rejects(acceptRelationshipInvite(db, student1, invite.code), /consumido|indisponivel/);
    const second = await createRelationshipInvite(db, personal);
    assert.equal((await changeRelationship(db, personal, linked.id, 'SUSPEND')).status, 'SUSPENDED');
    assert.equal(await canManageStudent(db, personal, student1.id), false);
    await assert.rejects(acceptRelationshipInvite(db, student2, second.code), /Capacidade/);
    assert.equal((await changeRelationship(db, personal, linked.id, 'REACTIVATE')).status, 'ACTIVE');
    assert.equal(await canManageStudent(db, personal, student1.id), true);
    const ended = await changeRelationship(db, student1, linked.id, 'TERMINATE');
    assert.equal(ended.status, 'TERMINATED');
    assert.equal(await canManageStudent(db, personal, student1.id), false);
    const acceptedSecond = await acceptRelationshipInvite(db, student2, second.code);
    assert.equal(acceptedSecond.status, 'ACTIVE');
    await assert.rejects(resendRelationshipInvite(db,personal,second.id,async()=>({status:'SENT'})),(e)=>e.status===409);
    const student2Relationship=await db.execute({sql:"SELECT id FROM identity_relationships WHERE student_id=? AND status='ACTIVE'",args:[student2.id]});
    await changeRelationship(db, personal, student2Relationship.rows[0].id, 'TERMINATE');
    const raceInvite = await createRelationshipInvite(db, personal, { studentId: student2.id });
    const race = await Promise.allSettled([acceptRelationshipInvite(db, student2, raceInvite.token), rejectRelationshipInvite(concurrentDb, student2, raceInvite.token)]);
    assert.ok(race.every((item) => item.status === 'fulfilled' || item.reason.status === 409));
    assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
    const finalInviteState=(await getRelationshipInvite(db, raceInvite.token)).status;
    assert.ok(['ACCEPTED', 'REJECTED'].includes(finalInviteState));
    assert.equal((await db.execute({sql:"SELECT COUNT(*) AS total FROM identity_relationships WHERE student_id=? AND status='ACTIVE'",args:[student2.id]})).rows[0].total,finalInviteState==='ACCEPTED'?1:0);
    const expired = await createRelationshipInvite(db, personal);
    await db.execute({ sql: 'UPDATE identity_invites SET expires_at=? WHERE id=?', args: ['2000-01-01', expired.id] });
    await assert.rejects(acceptRelationshipInvite(db, student1, expired.token), /expirado/);
  } finally { await db.close(); await concurrentDb.close(); }
});

test('accepting an invite persists exactly one relationship audit event', async () => {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const db = createClient({ url: 'file::memory:' });

  try {
    await db.execute('PRAGMA journal_mode=WAL');
    await db.execute('PRAGMA busy_timeout=3000');
    await migrateIdentitySchema(db);
    await migrateIdentityRelationshipsSchema(db);
    await migrateIdentityInviteDeliverySchema(db);
    await migrateIdentityInviteResendSchema(db);
    await migrateIdentityRelationshipAuditSchema(db);
    await db.execute('CREATE TABLE turso_documents(collection TEXT,id TEXT,document TEXT,PRIMARY KEY(collection,id))');
    await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['billing_plans', 'plan-audit', JSON.stringify({ id: 'plan-audit', includedStudents: 1, active: true })] });
    await db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: ['subscriptions', 'subscription-audit', JSON.stringify({ id: 'subscription-audit', accountUserId: 'personal-audit', planId: 'plan-audit', status: 'ACTIVE', createdAt: '2026-01-01' })] });

    for (const [id, role, mode] of [['personal-audit', 'PERSONAL', null], ['student-audit', 'ALUNO', 'INDEPENDENT']]) {
      await db.execute({
        sql: 'INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        args: [id, role, mode, id, id, `${id}@example.com`, role === 'PERSONAL' ? '+5511999990001' : '+5511999990002', 'x', 'x', 'x', id, 'ACTIVE', '2026-01-01', '2026-01-01'],
      });
    }

    const personal = { id: 'personal-audit', role: 'PERSONAL' };
    const student = { id: 'student-audit', role: 'ALUNO' };
    const invite = await createRelationshipInvite(db, personal, { studentId: student.id });
    const relationship = await acceptRelationshipInvite(db, student, invite.token);
    const events = await db.execute({
      sql: 'SELECT relationship_id,actor_id,event_type,created_at,previous_status,next_status FROM identity_relationship_events WHERE relationship_id=?',
      args: [relationship.id],
    });

    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].relationship_id, relationship.id);
    assert.equal(events.rows[0].actor_id, student.id);
    assert.equal(events.rows[0].event_type, 'ACCEPTED');
    assert.equal(events.rows[0].previous_status, 'PENDING');
    assert.equal(events.rows[0].next_status, 'ACTIVE');
    assert.ok(events.rows[0].created_at);
  } finally {
    await db.close();
  }
});

test('rejecting a pending invite persists one PENDING to REJECTED audit event without an active relationship', async () => {
  const { db, personal, student } = await createAuditFixture();
  try {
    const invite = await createRelationshipInvite(db, personal, { studentId: student.id });
    await rejectRelationshipInvite(db, student, invite.token);
    const relationship = (await db.execute({
      sql: 'SELECT id,status FROM identity_relationships WHERE personal_id=? AND student_id=? ORDER BY created_at DESC LIMIT 1',
      args: [personal.id, student.id],
    })).rows[0];
    assert.ok(relationship);
    assert.equal(relationship.status, 'REJECTED');
    const events = await readRelationshipEvents(db, relationship.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].relationship_id, relationship.id);
    assert.equal(events[0].actor_id, student.id);
    assert.equal(events[0].event_type, 'REJECTED');
    assert.equal(events[0].previous_status, 'PENDING');
    assert.equal(events[0].next_status, 'REJECTED');
    assert.ok(events[0].created_at);
    assert.equal((await db.execute({ sql: "SELECT COUNT(*) AS total FROM identity_relationships WHERE student_id=? AND status='ACTIVE'", args: [student.id] })).rows[0].total, 0);
  } finally {
    await db.close();
  }
});

test('suspending an active relationship persists one ACTIVE to SUSPENDED audit event and retains relationship data', async () => {
  const { db, personal, student } = await createAuditFixture();
  try {
    const relationship = await createActiveAuditRelationship(db, personal, student);
    await changeRelationship(db, personal, relationship.id, 'SUSPEND');
    const persisted = (await db.execute({ sql: 'SELECT * FROM identity_relationships WHERE id=?', args: [relationship.id] })).rows[0];
    assert.equal(persisted.status, 'SUSPENDED');
    assert.equal(persisted.personal_id, personal.id);
    assert.equal(persisted.student_id, student.id);
    assert.ok(persisted.accepted_at);
    const events = await readRelationshipEvents(db, relationship.id);
    assert.equal(events.length, 2);
    const event = events.find((item) => item.event_type === 'SUSPEND');
    assert.ok(event);
    assert.equal(event.relationship_id, relationship.id);
    assert.equal(event.actor_id, personal.id);
    assert.equal(event.previous_status, 'ACTIVE');
    assert.equal(event.next_status, 'SUSPENDED');
    assert.ok(event.created_at);
  } finally {
    await db.close();
  }
});

test('reactivating a suspended relationship persists one SUSPENDED to ACTIVE event without duplicating prior audit events', async () => {
  const { db, personal, student } = await createAuditFixture();
  try {
    const relationship = await createActiveAuditRelationship(db, personal, student);
    await changeRelationship(db, personal, relationship.id, 'SUSPEND');
    const before = await readRelationshipEvents(db, relationship.id);
    await changeRelationship(db, personal, relationship.id, 'REACTIVATE');
    const after = await readRelationshipEvents(db, relationship.id);
    assert.equal(after.length, before.length + 1);
    const event = after.find((item) => item.event_type === 'REACTIVATE');
    assert.ok(event);
    assert.equal(event.relationship_id, relationship.id);
    assert.equal(event.actor_id, personal.id);
    assert.equal(event.previous_status, 'SUSPENDED');
    assert.equal(event.next_status, 'ACTIVE');
    assert.ok(event.created_at);
    assert.equal(after.filter((item) => item.event_type === 'ACCEPTED').length, 1);
    assert.equal(after.filter((item) => item.event_type === 'SUSPEND').length, 1);
    assert.equal(after.filter((item) => item.event_type === 'REACTIVATE').length, 1);
  } finally {
    await db.close();
  }
});

test('terminating an active relationship persists one ACTIVE to TERMINATED event and revokes dependent permissions', async () => {
  const { db, personal, student } = await createAuditFixture();
  try {
    const relationship = await createActiveAuditRelationship(db, personal, student);
    assert.equal(await canManageStudent(db, personal, student.id), true);
    await changeRelationship(db, student, relationship.id, 'TERMINATE');
    const persisted = (await db.execute({ sql: 'SELECT * FROM identity_relationships WHERE id=?', args: [relationship.id] })).rows[0];
    assert.equal(persisted.status, 'TERMINATED');
    assert.equal(persisted.personal_id, personal.id);
    assert.equal(persisted.student_id, student.id);
    assert.ok(persisted.terminated_at);
    const events = await readRelationshipEvents(db, relationship.id);
    assert.equal(events.length, 2);
    const event = events.find((item) => item.event_type === 'TERMINATE');
    assert.ok(event);
    assert.equal(event.relationship_id, relationship.id);
    assert.equal(event.actor_id, student.id);
    assert.equal(event.previous_status, 'ACTIVE');
    assert.equal(event.next_status, 'TERMINATED');
    assert.ok(event.created_at);
    assert.equal(await canManageStudent(db, personal, student.id), false);
  } finally {
    await db.close();
  }
});
