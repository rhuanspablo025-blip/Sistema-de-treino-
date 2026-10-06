import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff, requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';
import validation from '../../../lib/workout-plan-validation.cjs';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const { DAY_KEYS } = validation;

async function ownedPlanFilter(database, user, planId) {
  const plan = await database.collection('workout_plans').findOne({ id: planId });
  if (!plan) return null;
  if (user.role === 'student' && (plan.studentId !== user.id || plan.active === false || plan.deletedAt)) return null;
  if (user.role === 'trainer' && plan.trainerId !== user.id) return null;
  return plan;
}

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const planId = new URL(request.url).searchParams.get('workoutPlanId');
    if (!idPattern.test(planId || '')) return NextResponse.json({ error: 'workoutPlanId inválido.' }, { status: 400 });
    const database = await getDatabase();
    const plan = await ownedPlanFilter(database, access.user, planId);
    if (!plan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    const workouts = await database.collection('workouts').find({ workoutPlanId: planId, archived: { $ne: true } }).sort({ order: 1 }).toArray();
    return NextResponse.json({ workouts });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os treinos.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const workoutPlanId = text(payload.workoutPlanId ?? payload.workout_plan_id, 64);
    const name = text(payload.name, 120);
    if (!idPattern.test(workoutPlanId) || name.length < 2) return NextResponse.json({ error: 'Informe uma ficha e um nome válidos.' }, { status: 400 });
    const dayOfWeek = text(payload.dayOfWeek ?? payload.day_of_week, 20).toLowerCase() || null;
    if (dayOfWeek && !DAY_KEYS.includes(dayOfWeek)) return NextResponse.json({ error: 'Dia da semana inválido.' }, { status: 400 });
    if (payload.isRestDay !== undefined && typeof payload.isRestDay !== 'boolean') return NextResponse.json({ error: 'Tipo de dia inválido.' }, { status: 400 });
    const database = await getDatabase();
    const planFilter = { id: workoutPlanId, deletedAt: { $exists: false } };
    if (access.user.role === 'trainer') planFilter.trainerId = access.user.id;
    const plan = await database.collection('workout_plans').findOne(planFilter);
    if (!plan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    if (dayOfWeek && await database.collection('workouts').findOne({ workoutPlanId, dayOfWeek, archived: { $ne: true } })) return NextResponse.json({ error: 'Já existe um treino configurado para esse dia.' }, { status: 409 });
    const order = await database.collection('workouts').countDocuments({ workoutPlanId, archived: { $ne: true } });
    if (order >= 7) return NextResponse.json({ error: 'Uma ficha pode ter até sete dias configurados.' }, { status: 400 });
    const now = new Date();
    const workout = {
      id: randomUUID(), workoutPlanId, name, order: order + 1,
      dayOfWeek,
      isRestDay: payload.isRestDay === true,
      description: text(payload.description, 1000), observations: text(payload.observations, 2000),
      exercises: [], createdAt: now, updatedAt: now,
    };
    await database.collection('workouts').insertOne(workout);
    await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'workout', resourceId: workout.id, metadata: { workoutPlanId } });
    return NextResponse.json({ workout }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar o treino.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const id = text(payload.id, 64);
    if (!idPattern.test(id)) return NextResponse.json({ error: 'ID do treino inválido.' }, { status: 400 });
    const database = await getDatabase();
    const existingWorkout = await database.collection('workouts').findOne({ id, archived: { $ne: true } });
    if (!existingWorkout) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });
    const filter = { id, workoutPlanId: existingWorkout.workoutPlanId };
    const planFilter = { id: existingWorkout.workoutPlanId };
    if (access.user.role === 'trainer') planFilter.trainerId = access.user.id;
    if (!await database.collection('workout_plans').findOne(planFilter)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const fields = { updatedAt: new Date() };
    if (payload.name !== undefined) {
      fields.name = text(payload.name, 120);
      if (fields.name.length < 2) return NextResponse.json({ error: 'Nome do treino inválido.' }, { status: 400 });
    }
    if (payload.dayOfWeek !== undefined || payload.day_of_week !== undefined) {
      fields.dayOfWeek = text(payload.dayOfWeek ?? payload.day_of_week, 20).toLowerCase() || null;
      if (fields.dayOfWeek && !DAY_KEYS.includes(fields.dayOfWeek)) return NextResponse.json({ error: 'Dia da semana inválido.' }, { status: 400 });
      if (fields.dayOfWeek && await database.collection('workouts').findOne({ workoutPlanId: existingWorkout.workoutPlanId, dayOfWeek: fields.dayOfWeek, id: { $ne: id }, archived: { $ne: true } })) return NextResponse.json({ error: 'Já existe um treino configurado para esse dia.' }, { status: 409 });
    }
    if (payload.description !== undefined) fields.description = text(payload.description, 1000);
    if (payload.isRestDay !== undefined) {
      if (typeof payload.isRestDay !== 'boolean') return NextResponse.json({ error: 'Tipo de dia inválido.' }, { status: 400 });
      if (payload.isRestDay && (existingWorkout.exercises || []).length) return NextResponse.json({ error: 'Remova os exercícios antes de marcar descanso.' }, { status: 400 });
      fields.isRestDay = payload.isRestDay;
    }
    if (payload.order !== undefined || payload.order_number !== undefined) {
      fields.order = Number(payload.order ?? payload.order_number);
      if (!Number.isInteger(fields.order) || fields.order < 1 || fields.order > 7) return NextResponse.json({ error: 'Ordem do treino inválida.' }, { status: 400 });
    }
    if (payload.observations !== undefined) fields.observations = text(payload.observations, 2000);
    const workout = await database.collection('workouts').findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' });
    if (!workout) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'workout', resourceId: id });
    return NextResponse.json({ workout });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar o treino.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!idPattern.test(id || '')) return NextResponse.json({ error: 'ID do treino inválido.' }, { status: 400 });
    const database = await getDatabase();
    const workout = await database.collection('workouts').findOne({ id });
    if (!workout) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });
    if (access.user.role === 'trainer' && !await database.collection('workout_plans').findOne({ id: workout.workoutPlanId, trainerId: access.user.id })) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    await database.collection('workouts').deleteOne({ id });
    await database.collection('workout_history').updateMany({ workoutId: id }, { $set: { workoutName: workout.name } });
    await writeAuditLog(database, { userId: access.user.id, action: 'delete', resource: 'workout', resourceId: id });
    return NextResponse.json({ message: 'Treino excluído.' });
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir o treino.' }, { status: 500 });
  }
}
