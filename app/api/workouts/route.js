import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff, requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

async function ownedPlanFilter(database, user, planId) {
  const plan = await database.collection('workout_plans').findOne({ id: planId });
  if (!plan) return null;
  if (user.role === 'student' && plan.studentId !== user.id) return null;
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
    const workouts = await database.collection('workouts').find({ workoutPlanId: planId }).sort({ order: 1 }).toArray();
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
    const database = await getDatabase();
    const planFilter = { id: workoutPlanId };
    if (access.user.role === 'trainer') planFilter.trainerId = access.user.id;
    const plan = await database.collection('workout_plans').findOne(planFilter);
    if (!plan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    const order = await database.collection('workouts').countDocuments({ workoutPlanId });
    const now = new Date();
    const workout = {
      id: randomUUID(), workoutPlanId, name, order: order + 1,
      dayOfWeek: text(payload.dayOfWeek ?? payload.day_of_week, 32) || null,
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
    const filter = { id };
    if (access.user.role === 'trainer') {
      const workout = await database.collection('workouts').findOne({ id });
      if (!workout) return NextResponse.json({ error: 'Treino não encontrado.' }, { status: 404 });
      filter.workoutPlanId = workout.workoutPlanId;
      const plan = await database.collection('workout_plans').findOne({ id: workout.workoutPlanId, trainerId: access.user.id });
      if (!plan) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    }
    const fields = { updatedAt: new Date() };
    if (payload.name !== undefined) {
      fields.name = text(payload.name, 120);
      if (fields.name.length < 2) return NextResponse.json({ error: 'Nome do treino inválido.' }, { status: 400 });
    }
    if (payload.dayOfWeek !== undefined || payload.day_of_week !== undefined) fields.dayOfWeek = text(payload.dayOfWeek ?? payload.day_of_week, 32) || null;
    if (payload.description !== undefined) fields.description = text(payload.description, 1000);
    if (payload.order !== undefined || payload.order_number !== undefined) fields.order = Math.max(1, Number(payload.order ?? payload.order_number) || 1);
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
