import bcrypt from 'bcryptjs';
import { getDatabase } from './mongodb';

export class WorkoutAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function assertWorkoutEditor(user, studentId, password) {
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
  const access = await assertWorkoutEditor(user, studentId, password);
  return { ...access, plan };
}

