import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { normalizeEmail } from './identity-service.mjs';
import { IdentityAccessError, requirePersonalAccess, requireStudentAccess } from './identity-authorization.mjs';

function digest(value) {
  const key = process.env.OTP_HMAC_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new Error('OTP_HMAC_KEY indisponivel.');
  return createHmac('sha256', key).update(String(value)).digest('hex');
}
const nowIso = () => new Date().toISOString();

export async function createRelationshipInvite(client, actor, { email = '', studentId = null } = {}) {
  requirePersonalAccess(actor);
  const normalizedEmail = email ? normalizeEmail(email) : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new IdentityAccessError('E-mail invalido.', 400);
  if (studentId) {
    const student = await client.execute({ sql: `SELECT id FROM identity_users WHERE id=? AND role='ALUNO' AND status='ACTIVE'`, args: [studentId] });
    if (!student.rows[0]) throw new IdentityAccessError('Aluno indisponivel.', 404);
  }
  const token = randomBytes(32).toString('base64url');
  const code = randomBytes(10).toString('hex').toUpperCase();
  const id = randomUUID(), createdAt = nowIso(), expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  await client.execute({ sql: `INSERT INTO identity_invites(id,personal_id,token_hmac,destination_hmac,expires_at,created_at,code_hmac,purpose,student_id) VALUES(?,?,?,?,?,?,?,?,?)`, args: [id, actor.id, digest(token), digest(normalizedEmail), expiresAt, createdAt, digest(code), 'RELATIONSHIP', studentId] });
  return { id, token, code, expiresAt, status: 'PENDING' };
}

export async function getRelationshipInvite(client, credential) {
  const hash = digest(credential);
  const result = await client.execute({ sql: `SELECT i.id,i.personal_id,i.student_id,i.destination_hmac,i.expires_at,i.accepted_at,i.revoked_at,p.full_name AS personal_name FROM identity_invites i JOIN identity_users p ON p.id=i.personal_id WHERE i.token_hmac=? OR i.code_hmac=? LIMIT 1`, args: [hash, hash] });
  const invite = result.rows[0];
  if (!invite) throw new IdentityAccessError('Convite indisponivel.', 404);
  const status = invite.revoked_at ? 'CANCELLED' : invite.accepted_at ? 'ACCEPTED' : invite.expires_at <= nowIso() ? 'EXPIRED' : 'PENDING';
  return { id: invite.id, personalId: invite.personal_id, personalName: invite.personal_name, expiresAt: invite.expires_at, status };
}

export async function contractedCapacity(tx, personalId) {
  const result = await tx.execute({ sql: `SELECT CAST(json_extract(p.document,'$.includedStudents') AS INTEGER) AS capacity FROM turso_documents s JOIN turso_documents p ON p.collection='billing_plans' AND json_extract(p.document,'$.id')=json_extract(s.document,'$.planId') WHERE s.collection='subscriptions' AND json_extract(s.document,'$.accountUserId')=? AND json_extract(s.document,'$.status')='ACTIVE' AND json_extract(p.document,'$.active')=1 ORDER BY json_extract(s.document,'$.createdAt') DESC LIMIT 1`, args: [personalId] });
  return result.rows[0]?.capacity == null ? null : Math.max(0, Number(result.rows[0].capacity));
}

export async function acceptRelationshipInvite(client, actor, credential) {
  requireStudentAccess(actor);
  const hash = digest(credential), now = nowIso();
  const tx = await client.transaction('write');
  try {
    const found = await tx.execute({ sql: `SELECT * FROM identity_invites WHERE (token_hmac=? OR code_hmac=?) AND purpose='RELATIONSHIP' LIMIT 1`, args: [hash, hash] });
    const invite = found.rows[0];
    if (!invite || invite.revoked_at || invite.accepted_at || invite.expires_at <= now) throw new IdentityAccessError('Convite expirado ou indisponivel.', 410);
    if (invite.student_id && invite.student_id !== actor.id) throw new IdentityAccessError();
    const student = await tx.execute({ sql: `SELECT email_normalized FROM identity_users WHERE id=? AND role='ALUNO' AND status='ACTIVE'`, args: [actor.id] });
    if (!student.rows[0] || (invite.destination_hmac !== digest('') && invite.destination_hmac !== digest(student.rows[0].email_normalized))) throw new IdentityAccessError();
    const personal = await tx.execute({ sql: `SELECT id FROM identity_users WHERE id=? AND role='PERSONAL' AND status='ACTIVE'`, args: [invite.personal_id] });
    if (!personal.rows[0]) throw new IdentityAccessError('Personal indisponivel.', 409);
    const capacity = await contractedCapacity(tx, invite.personal_id);
    if (capacity === null) throw new IdentityAccessError('Plano ativo com capacidade definida necessario.', 409);
    const count = await tx.execute({ sql: `SELECT COUNT(*) AS total FROM identity_relationships WHERE personal_id=? AND status IN ('ACTIVE','SUSPENDED')`, args: [invite.personal_id] });
    if (Number(count.rows[0].total) >= capacity) throw new IdentityAccessError('Capacidade contratada esgotada.', 409);
    const existing = await tx.execute({ sql: `SELECT id FROM identity_relationships WHERE student_id=? AND status IN ('PENDING','ACTIVE','SUSPENDED') LIMIT 1`, args: [actor.id] });
    if (existing.rows[0]) throw new IdentityAccessError('Aluno ja possui um vinculo principal.', 409);
    const id = randomUUID();
    await tx.execute({ sql: `INSERT INTO identity_relationships(id,personal_id,student_id,status,created_at,updated_at,accepted_at) VALUES(?,?,?,'ACTIVE',?,?,?)`, args: [id, invite.personal_id, actor.id, now, now, now] });
    const consumed = await tx.execute({ sql: 'UPDATE identity_invites SET accepted_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?', args: [now, invite.id, now] });
    if (Number(consumed.rowsAffected) !== 1) throw new IdentityAccessError('Convite ja consumido.', 409);
    await tx.execute({ sql: `UPDATE identity_users SET student_mode='LINKED',updated_at=? WHERE id=?`, args: [now, actor.id] });
    await tx.execute({ sql: 'INSERT INTO identity_relationship_events(id,relationship_id,actor_id,event_type,created_at) VALUES(?,?,?,?,?)', args: [randomUUID(), id, actor.id, 'ACCEPTED', now] });
    await tx.commit();
    return { id, personalId: invite.personal_id, studentId: actor.id, status: 'ACTIVE' };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function changeRelationship(client, actor, relationshipId, action) {
  if (!['SUSPEND','REACTIVATE','TERMINATE'].includes(action)) throw new IdentityAccessError('Acao invalida.', 400);
  const tx = await client.transaction('write');
  try {
    const found = await tx.execute({ sql: 'SELECT * FROM identity_relationships WHERE id=?', args: [relationshipId] });
    const row = found.rows[0];
    if (!row || (actor.id !== row.personal_id && actor.id !== row.student_id)) throw new IdentityAccessError();
    if (action !== 'TERMINATE' && actor.id !== row.personal_id) throw new IdentityAccessError();
    const next = action === 'SUSPEND' && row.status === 'ACTIVE' ? 'SUSPENDED' : action === 'REACTIVATE' && row.status === 'SUSPENDED' ? 'ACTIVE' : action === 'TERMINATE' && ['ACTIVE','SUSPENDED'].includes(row.status) ? 'TERMINATED' : null;
    if (!next) throw new IdentityAccessError('Transicao de vinculo invalida.', 409);
    const now = nowIso();
    await tx.execute({ sql: 'UPDATE identity_relationships SET status=?,updated_at=?,terminated_at=? WHERE id=? AND status=?', args: [next, now, next === 'TERMINATED' ? now : null, relationshipId, row.status] });
    if (next === 'TERMINATED') await tx.execute({ sql: `UPDATE identity_users SET student_mode='INDEPENDENT',updated_at=? WHERE id=?`, args: [now, row.student_id] });
    await tx.execute({ sql: 'INSERT INTO identity_relationship_events(id,relationship_id,actor_id,event_type,created_at) VALUES(?,?,?,?,?)', args: [randomUUID(), relationshipId, actor.id, action, now] });
    await tx.commit();
    return { id: relationshipId, status: next };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function cancelRelationshipInvite(client, actor, inviteId) {
  requirePersonalAccess(actor);
  const result = await client.execute({ sql: 'UPDATE identity_invites SET revoked_at=? WHERE id=? AND personal_id=? AND accepted_at IS NULL AND revoked_at IS NULL', args: [nowIso(), inviteId, actor.id] });
  if (Number(result.rowsAffected) !== 1) throw new IdentityAccessError('Convite indisponivel.', 404);
}
