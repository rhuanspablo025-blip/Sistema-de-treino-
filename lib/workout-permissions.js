import bcrypt from 'bcryptjs';
import { getDatabase, getTursoClient } from './mongodb';
import { verifyPassword } from './identity-service.mjs';
import { resolveAuthenticatedIdentity, canUpdateWorkout } from './identity-authorization.mjs';

export class WorkoutAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function assertWorkoutEditor(user, studentId, password, existingPlan = null) {
  if (user?.identityV2) {
    const client = await getTursoClient();
    const actor = await resolveAuthenticatedIdentity(client, user);
    const plan = existingPlan || { studentId, trainerId: actor.role === 'PERSONAL' ? actor.id : null };
    if (!await canUpdateWorkout(client, actor, plan)) throw new WorkoutAccessError('Acesso a ficha negado.', 403);
    if (typeof password !== 'string' || !password) throw new WorkoutAccessError('Informe sua senha para confirmar a alteracao.', 400);
    const credential = await client.execute({ sql: 'SELECT password_hash FROM identity_credentials WHERE user_id=?', args: [actor.id] });
    if (!credential.rows[0] || !await verifyPassword(password, credential.rows[0].password_hash)) throw new WorkoutAccessError('Senha de confirmacao incorreta.', 401);
    return { database: await getDatabase(), student: { userId: studentId } };
  }
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
  const isAdmin = roles.some((role) => ['admin', 'dev', 'SUPER_ADMIN'].includes(role));
  if (!isAdmin && !roles.some((role) => ['student', 'trainer'].includes(role))) throw new WorkoutAccessError('Somente o personal responsável ou o aluno avulso pode alterar esta ficha.', 403);
  const database = await getDatabase();
  const student = await database.collection('students').findOne({ userId: studentId, active: true });
  if (!student) throw new WorkoutAccessError('Aluno não encontrado ou inativo.', 404);
  const allowed = isAdmin
    || (roles.includes('trainer') && student.trainerId === user.id)
    || (roles.includes('student') && student.userId === user.id && !student.trainerId);
  if (!allowed) throw new WorkoutAccessError('Você não tem permissão para alterar esta ficha.', 403);
  if (typeof password !== 'string' || !password) throw new WorkoutAccessError('Informe sua senha para confirmar a alteração.', 400);
  if (!user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) throw new WorkoutAccessError('Senha de confirmação incorreta.', 401);
  return { database, student };
}

export async function assertWorkoutPlanEditor(user, planId, password, expectedStudentId) {
  const database = await getDatabase();
  const plan = planId ? await database.collection('workout_plans').findOne({ id: planId, deletedAt: { $exists: false } }) : null;
  if (planId && !plan) throw new WorkoutAccessError('Ficha não encontrada.', 404);
  const studentId = plan?.studentId || expectedStudentId;
  if (!studentId || (expectedStudentId && plan && plan.studentId !== expectedStudentId)) throw new WorkoutAccessError('Aluno da ficha inválido.', 400);
  const access = await assertWorkoutEditor(user, studentId, password, plan);
  return { ...access, plan };
}

