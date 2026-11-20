export class IdentityAccessError extends Error {
  constructor(message = 'Acesso negado.', status = 403) { super(message); this.status = status; }
}

export async function resolveAuthenticatedIdentity(client, sessionUser) {
  if (!sessionUser?.identityV2 || !sessionUser.id) throw new IdentityAccessError('Identidade V2 requerida.', 401);
  const result = await client.execute({ sql: 'SELECT id,role,student_mode,status FROM identity_users WHERE id=?', args: [sessionUser.id] });
  const identity = result.rows[0];
  if (!identity || identity.status !== 'ACTIVE') throw new IdentityAccessError('Conta indisponivel.', 403);
  if (identity.role === 'DEV' && (!process.env.DEV_OWNER_USER_ID || identity.id !== process.env.DEV_OWNER_USER_ID)) throw new IdentityAccessError('Proprietario nao confirmado.', 403);
  if (identity.role === 'DEV') throw new IdentityAccessError('MFA do proprietario ainda nao confirmado nesta sessao.', 403);
  if (!['DEV', 'PERSONAL', 'ALUNO'].includes(identity.role)) throw new IdentityAccessError();
  return { id: identity.id, role: identity.role, studentMode: identity.student_mode, status: identity.status };
}

export function requireOwnerAccess(actor) {
  if (actor?.role !== 'DEV' || actor.mfaVerified !== true || !process.env.DEV_OWNER_USER_ID || actor.id !== process.env.DEV_OWNER_USER_ID) throw new IdentityAccessError();
  return actor;
}
export function requirePersonalAccess(actor) { if (actor?.role !== 'PERSONAL') throw new IdentityAccessError(); return actor; }
export function requireStudentAccess(actor) { if (actor?.role !== 'ALUNO') throw new IdentityAccessError(); return actor; }

export async function requireActiveRelationship(client, personalId, studentId) {
  const result = await client.execute({ sql: `SELECT r.id FROM identity_relationships r JOIN identity_users s ON s.id=r.student_id WHERE r.personal_id=? AND r.student_id=? AND r.status='ACTIVE' AND s.status='ACTIVE' LIMIT 1`, args: [personalId, studentId] });
  if (!result.rows[0]) throw new IdentityAccessError('Vinculo ativo necessario.');
  return result.rows[0];
}

export async function canManageStudent(client, actor, studentId) {
  if (!actor || !studentId) return false;
  if (actor.role === 'DEV') return Boolean(actor.mfaVerified === true && process.env.DEV_OWNER_USER_ID && actor.id === process.env.DEV_OWNER_USER_ID);
  if (actor.role !== 'PERSONAL') return false;
  try { await requireActiveRelationship(client, actor.id, studentId); return true; } catch { return false; }
}

export async function canReadWorkout(client, actor, plan) {
  if (!actor || !plan?.studentId) return false;
  if (actor.role === 'ALUNO') return plan.studentId === actor.id && plan.active !== false;
  if (actor.role === 'PERSONAL') return plan.trainerId === actor.id && await canManageStudent(client, actor, plan.studentId);
  return actor.role === 'DEV' && Boolean(actor.mfaVerified === true && process.env.DEV_OWNER_USER_ID && actor.id === process.env.DEV_OWNER_USER_ID);
}

export async function canUpdateWorkout(client, actor, plan) {
  if (!actor || !plan?.studentId) return false;
  if (actor.role === 'ALUNO') return actor.studentMode === 'INDEPENDENT' && plan.studentId === actor.id && !plan.trainerId;
  if (actor.role === 'PERSONAL') return plan.trainerId === actor.id && await canManageStudent(client, actor, plan.studentId);
  return false;
}
export const canCreateWorkout = canUpdateWorkout;
export const canDeleteWorkout = canUpdateWorkout;
export const canAccessTenant = canManageStudent;
