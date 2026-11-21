import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { migrateIdentitySchema } from '../lib/identity-schema.mjs';
import { resolveAuthenticatedIdentity, canManageStudent, canReadWorkout, canUpdateWorkout } from '../lib/identity-authorization.mjs';

test('SQL relationship controls cross-personal access and revocation immediately', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await migrateIdentitySchema(client);
    for (const [id, role, mode] of [['personal-a', 'PERSONAL', null], ['personal-b', 'PERSONAL', null], ['student-a', 'ALUNO', 'LINKED']]) {
      await client.execute({ sql: `INSERT INTO identity_users(id,role,student_mode,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id, role, mode, id, id, `${id}@example.com`, `+55119876543${id === 'personal-a' ? '21' : id === 'personal-b' ? '22' : '23'}`, 'cipher', 'nonce', 'tag', id, 'ACTIVE', '2026-01-01', '2026-01-01'] });
    }
    await client.execute({ sql: `INSERT INTO identity_relationships(id,personal_id,student_id,status,created_at,updated_at) VALUES('rel-1','personal-a','student-a','ACTIVE','2026-01-01','2026-01-01')` });
    const a = await resolveAuthenticatedIdentity(client, { id: 'personal-a', identityV2: true });
    const b = await resolveAuthenticatedIdentity(client, { id: 'personal-b', identityV2: true });
    const student = await resolveAuthenticatedIdentity(client, { id: 'student-a', identityV2: true });
    const prescribed = { studentId: student.id, trainerId: a.id, active: true };
    assert.equal(await canManageStudent(client, a, student.id), true);
    assert.equal(await canManageStudent(client, b, student.id), false);
    assert.equal(await canReadWorkout(client, b, prescribed), false);
    assert.equal(await canUpdateWorkout(client, b, prescribed), false);
    assert.equal(await canReadWorkout(client, student, prescribed), true);
    assert.equal(await canUpdateWorkout(client, student, prescribed), false);
    await client.execute(`UPDATE identity_relationships SET status='ENDED' WHERE id='rel-1'`);
    assert.equal(await canReadWorkout(client, a, prescribed), false);
    assert.equal(await canUpdateWorkout(client, a, prescribed), false);
    await client.execute(`UPDATE identity_users SET student_mode='INDEPENDENT' WHERE id='student-a'`);
    const independent = await resolveAuthenticatedIdentity(client, { id: 'student-a', identityV2: true });
    assert.equal(await canUpdateWorkout(client, independent, { studentId: independent.id, trainerId: null }), true);
    assert.equal(await canUpdateWorkout(client, independent, prescribed), false);
    await client.execute({ sql: `INSERT INTO identity_users(id,role,username,full_name,email_normalized,phone_e164,cpf_ciphertext,cpf_nonce,cpf_tag,cpf_lookup_hmac,status,created_at,updated_at) VALUES('dev-owner','DEV','dev_owner','Owner','owner@example.com','+5511987654324','cipher','nonce','tag','dev-owner','ACTIVE','2026-01-01','2026-01-01')` });
    const previousOwner = process.env.DEV_OWNER_USER_ID;
    try {
      process.env.DEV_OWNER_USER_ID = 'dev-owner';
      await assert.rejects(resolveAuthenticatedIdentity(client, { id: 'dev-owner', identityV2: true }), /MFA/);
    } finally {
      if (previousOwner === undefined) delete process.env.DEV_OWNER_USER_ID;
      else process.env.DEV_OWNER_USER_ID = previousOwner;
    }
  } finally { await client.close(); }
});
