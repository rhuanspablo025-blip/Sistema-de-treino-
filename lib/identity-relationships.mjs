import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { normalizeEmail } from './identity-service.mjs';
import { IdentityAccessError, requirePersonalAccess, requireStudentAccess } from './identity-authorization.mjs';

function digest(value) {
  const key = process.env.OTP_HMAC_KEY;
  if (!key || Buffer.byteLength(key) < 32) throw new Error('OTP_HMAC_KEY indisponivel.');
  return createHmac('sha256', key).update(String(value)).digest('hex');
}
const nowIso = () => new Date().toISOString();
async function beginWrite(client) {
  for (let attempt=0;;attempt++) {
    try { return await client.transaction('write'); }
    catch (error) {
      if (attempt >= 5 || !String(error?.code || error?.message).includes('SQLITE_BUSY')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}
function seal(value) { const key=createHash('sha256').update(process.env.OTP_HMAC_KEY || '').digest(); const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const data=Buffer.concat([cipher.update(String(value)),cipher.final()]); return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.'); }
function unseal(value) { if(!value) return ''; const [iv,tag,data]=value.split('.'); const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update(process.env.OTP_HMAC_KEY || '').digest(),Buffer.from(iv,'base64url')); decipher.setAuthTag(Buffer.from(tag,'base64url')); return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString(); }

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
  await client.execute({ sql: `INSERT INTO identity_invites(id,personal_id,token_hmac,destination_hmac,expires_at,created_at,code_hmac,purpose,student_id,destination_ciphertext,token_ciphertext,code_ciphertext) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id, actor.id, digest(token), digest(normalizedEmail), expiresAt, createdAt, digest(code), 'RELATIONSHIP', studentId, normalizedEmail ? seal(normalizedEmail) : null, seal(token), seal(code)] });
  return { id, token, code, expiresAt, status: 'PENDING' };
}

export async function getRelationshipInvite(client, credential) {
  const hash = digest(credential);
  const result = await client.execute({ sql: `SELECT i.id,i.personal_id,i.student_id,i.destination_hmac,i.expires_at,i.accepted_at,i.revoked_at,i.rejected_at,p.full_name AS personal_name FROM identity_invites i JOIN identity_users p ON p.id=i.personal_id WHERE i.token_hmac=? OR i.code_hmac=? LIMIT 1`, args: [hash, hash] });
  const invite = result.rows[0];
  if (!invite) throw new IdentityAccessError('Convite indisponivel.', 404);
  const status = invite.revoked_at ? 'CANCELLED' : invite.rejected_at ? 'REJECTED' : invite.accepted_at ? 'ACCEPTED' : invite.expires_at <= nowIso() ? 'EXPIRED' : 'PENDING';
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
    if (!invite || invite.revoked_at || invite.rejected_at || invite.accepted_at || invite.expires_at <= now) throw new IdentityAccessError('Convite expirado ou indisponivel.', 410);
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
    const consumed = await tx.execute({ sql: 'UPDATE identity_invites SET accepted_at=? WHERE id=? AND accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expires_at>?', args: [now, invite.id, now] });
    if (Number(consumed.rowsAffected) !== 1) throw new IdentityAccessError('Convite ja consumido.', 409);
    const id = randomUUID();
    await tx.execute({ sql: `INSERT INTO identity_relationships(id,personal_id,student_id,status,created_at,updated_at,accepted_at) VALUES(?,?,?,'ACTIVE',?,?,?)`, args: [id, invite.personal_id, actor.id, now, now, now] });
    await tx.execute({ sql: `UPDATE identity_users SET student_mode='LINKED',updated_at=? WHERE id=?`, args: [now, actor.id] });
    await tx.execute({ sql: 'INSERT INTO identity_relationship_events(id,relationship_id,actor_id,event_type,created_at) VALUES(?,?,?,?,?)', args: [randomUUID(), id, actor.id, 'ACCEPTED', now] });
    await tx.commit();
    return { id, personalId: invite.personal_id, studentId: actor.id, status: 'ACTIVE' };
  } catch (error) { await tx.rollback(); if (String(error?.code || error?.message).includes('SQLITE_BUSY')) throw new IdentityAccessError('Convite consumido por outra operacao.',409); throw error; }
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

export async function rejectRelationshipInvite(client, actor, credential) {
  requireStudentAccess(actor);
  const hash=digest(credential), now=nowIso();
  try {
    const found=await client.execute({sql:'SELECT id,student_id,destination_hmac,expires_at,accepted_at,rejected_at,revoked_at FROM identity_invites WHERE token_hmac=? OR code_hmac=? LIMIT 1',args:[hash,hash]});
    const invite=found.rows[0];
    if(!invite) throw new IdentityAccessError('Convite indisponivel.',404);
    const student=await client.execute({sql:"SELECT email_normalized FROM identity_users WHERE id=? AND role='ALUNO' AND status='ACTIVE'",args:[actor.id]});
    if(!student.rows[0] || (invite.student_id && invite.student_id!==actor.id) || (invite.destination_hmac!==digest('') && invite.destination_hmac!==digest(student.rows[0].email_normalized))) throw new IdentityAccessError('Destinatario nao autorizado.',403);
    if(invite.rejected_at) return {status:'REJECTED',repeated:true};
    if(invite.revoked_at || invite.accepted_at || invite.expires_at<=now) throw new IdentityAccessError('Convite nao esta pendente.',409);
    const changed=await client.execute({sql:'UPDATE identity_invites SET rejected_at=? WHERE id=? AND rejected_at IS NULL AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>?',args:[now,invite.id,now]});
    if(Number(changed.rowsAffected)!==1) {
      const latest=await client.execute({sql:'SELECT rejected_at FROM identity_invites WHERE id=?',args:[invite.id]});
      if(latest.rows[0]?.rejected_at) return {status:'REJECTED',repeated:true};
      throw new IdentityAccessError('Convite consumido por outra operacao.',409);
    }
    return {status:'REJECTED',repeated:false};
  } catch(error) {
    if(String(error?.code||error?.message).includes('SQLITE_BUSY')) throw new IdentityAccessError('Convite consumido por outra operacao.',409);
    throw error;
  }
}

export async function resendRelationshipInvite(client, actor, inviteId, deliver) {
 requirePersonalAccess(actor); const now=nowIso(); const tx=await client.transaction('write'); let invite;
 try { const found=await tx.execute({sql:'SELECT i.*,p.full_name FROM identity_invites i JOIN identity_users p ON p.id=i.personal_id WHERE i.id=? AND i.personal_id=?',args:[inviteId,actor.id]}); invite=found.rows[0]; if(!invite)throw new IdentityAccessError('Convite indisponivel.',404); if(invite.revoked_at||invite.rejected_at||invite.accepted_at)throw new IdentityAccessError('Convite inelegivel.',409); if(invite.expires_at<=now)throw new IdentityAccessError('Convite expirado.',410); if(invite.last_sent_at&&Date.now()-Date.parse(invite.last_sent_at)<60000)throw new IdentityAccessError('Aguarde antes de reenviar.',429); if(invite.resend_claimed_at&&Date.now()-Date.parse(invite.resend_claimed_at)<60000)throw new IdentityAccessError('Reenvio em andamento.',429); const recipientRecent=await tx.execute({sql:"SELECT e.created_at FROM identity_invite_events e JOIN identity_invites i ON i.id=e.invite_id WHERE i.destination_hmac=? AND e.event_type IN ('RESENT','RESEND_FAILED') ORDER BY e.created_at DESC LIMIT 1",args:[invite.destination_hmac]}); if(recipientRecent.rows[0]&&Date.now()-Date.parse(recipientRecent.rows[0].created_at)<60000)throw new IdentityAccessError('Limite de reenvio para este destinatario.',429); const claim=await tx.execute({sql:'UPDATE identity_invites SET resend_claimed_at=? WHERE id=? AND (resend_claimed_at IS NULL OR resend_claimed_at<?)',args:[now,invite.id,new Date(Date.now()-60000).toISOString()]}); if(Number(claim.rowsAffected)!==1)throw new IdentityAccessError('Reenvio em andamento.',429); await tx.commit(); }
 catch(e){await tx.rollback();throw e;}
 try { const email=unseal(invite.destination_ciphertext),token=unseal(invite.token_ciphertext),code=unseal(invite.code_ciphertext); if(!email||!token||!code)throw new IdentityAccessError('Dados de envio indisponiveis.',409); const base=process.env.NEXT_PUBLIC_APP_URL||'https://www.atlasfit.com.br'; const result=await deliver({destination:email,personalName:invite.full_name||'Seu Personal',link:base+'/convite?credential='+encodeURIComponent(token),code,expiresAt:invite.expires_at}); if(result?.status!=='SENT')throw new IdentityAccessError('Provedor nao confirmou o envio.',503); }
 catch(e){await client.execute({sql:'UPDATE identity_invites SET resend_claimed_at=NULL WHERE id=? AND resend_claimed_at=?',args:[invite.id,now]});await client.execute({sql:'INSERT INTO identity_invite_events(id,invite_id,actor_id,event_type,created_at) VALUES(?,?,?,?,?)',args:[randomUUID(),invite.id,actor.id,'RESEND_FAILED',nowIso()]});throw e;}
 const sentAt=nowIso();const saved=await client.execute({sql:'UPDATE identity_invites SET last_sent_at=?,resend_claimed_at=NULL WHERE id=? AND personal_id=? AND accepted_at IS NULL AND rejected_at IS NULL AND revoked_at IS NULL AND expires_at>? AND resend_claimed_at=?',args:[sentAt,invite.id,actor.id,sentAt,now]});if(Number(saved.rowsAffected)!==1)throw new IdentityAccessError('Convite alterado durante envio.',409);await client.execute({sql:'INSERT INTO identity_invite_events(id,invite_id,actor_id,event_type,created_at) VALUES(?,?,?,?,?)',args:[randomUUID(),invite.id,actor.id,'RESENT',sentAt]});return {status:'SENT'};
}
