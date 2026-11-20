import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { migrateIdentityRelationshipsSchema } from '../lib/identity-relationships-schema.mjs';
import { createRelationshipInvite, acceptRelationshipInvite, changeRelationship, getRelationshipInvite } from '../lib/identity-relationships.mjs';
import { canManageStudent } from '../lib/identity-authorization.mjs';

test('invites activate once, enforce contracted capacity, and termination revokes access', async () => {
  process.env.OTP_HMAC_KEY = Buffer.alloc(32, 9).toString('hex');
  const db = createClient({ url: 'file::memory:' });
  try {
    await migrateIdentitySchema(db);
    assert.equal((await migrateIdentityRelationshipsSchema(db)).applied, true);
    assert.equal((await migrateIdentityRelationshipsSchema(db)).applied, false);
    await db.execute(`CREATE TABLE turso_documents(collection TEXT,id TEXT,document TEXT,PRIMARY KEY(collection,id))`);
    const insert = (collection, id, data) => db.execute({ sql: 'INSERT INTO turso_documents(collection,id,document) VALUES(?,?,?)', args: [collection, id, JSON.stringify(data)] });
    await insert('billing_plans', 'plan1', { id: 'plan1', includedStudents: 1, active: true });
    await insert('subscriptions', 'sub1', { id: 'sub1', accountUserId: 'personal1', planId: 'plan1', status: 'ACTIVE', createdAt: '2026-01-01' });
    for (const [id, role, mode] of [['personal1','PERSONAL',null], ['student1','ALUNO','INDEPENDENT'], ['student2','ALUNO','INDEPENDENT']]) {
      await db.execute({ sql: `INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id,role,mode,id,id,`${id}@example.com`,`+551198765432${id === 'personal1' ? '1' : id === 'student1' ? '2' : '3'}`,'x','x','x',id,'ACTIVE','2026-01-01','2026-01-01'] });
    }
    const personal = { id: 'personal1', role: 'PERSONAL' }, student1 = { id: 'student1', role: 'ALUNO' }, student2 = { id: 'student2', role: 'ALUNO' };
    const invite = await createRelationshipInvite(db, personal);
    assert.equal((await getRelationshipInvite(db, invite.code)).status, 'PENDING');
    const attempts = await Promise.allSettled([acceptRelationshipInvite(db, student1, invite.token), acceptRelationshipInvite(db, student1, invite.token)]);
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
    const expired = await createRelationshipInvite(db, personal);
    await db.execute({ sql: 'UPDATE identity_invites SET expires_at=? WHERE id=?', args: ['2000-01-01', expired.id] });
    await assert.rejects(acceptRelationshipInvite(db, student1, expired.token), /expirado/);
  } finally { await db.close(); }
});
