import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff, requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

async function canAccessWorkout(database, user, workout) {
  if (!workout || workout.archived === true) return false;
  const plan = await database.collection('workout_plans').findOne({ id: workout.workoutPlanId });
  if (!plan) return false;
  if (user.role === 'student') return plan.studentId === user.id && plan.active !== false && !plan.deletedAt;
  if (user.role === 'trainer') return plan.trainerId === user.id;
  return ['admin', 'dev'].includes(user.role);
}

async function withExerciseNames(database, workout) {
  const ids = [...new Set((workout.exercises || []).map((item) => item.exerciseId))];
  const docs = await database.collection('exercises').find({ id: { $in: ids } }).toArray();
  const byId = new Map(docs.map((item) => [item.id, item]));
  return (workout.exercises || []).sort((a, b) => a.order - b.order).map((item) => ({ ...item, exercise: byId.get(item.exerciseId) || null }));
}

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const workoutId = new URL(request.url).searchParams.get('workoutId');
    if (!idPattern.test(workoutId || '')) return NextResponse.json({ error: 'workoutId inválido.' }, { status: 400 });
    const database = await getDatabase();
    const workout = await database.collection('workouts').findOne({ id: workoutId });
    if (!await canAccessWorkout(database, access.user, workout)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    return NextResponse.json({ exercises: await withExerciseNames(database, workout) });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os exercícios do treino.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const workoutId = text(payload.workoutId ?? payload.workout_id, 64);
    const exerciseId = text(payload.exerciseId ?? payload.exercise_id, 64);
    if (!idPattern.test(workoutId) || !idPattern.test(exerciseId)) return NextResponse.json({ error: 'IDs inválidos.' }, { status: 400 });
    const database = await getDatabase();
    const workout = await database.collection('workouts').findOne({ id: workoutId });
    if (!await canAccessWorkout(database, access.user, workout)) return NextResponse.json({ error: 'Treino não encontrado ou sem permissão.' }, { status: 404 });
    if (workout.isRestDay) return NextResponse.json({ error: 'Não é possível adicionar exercícios em um dia de descanso.' }, { status: 400 });
    const exercise = await database.collection('exercises').findOne({ id: exerciseId, active: true });
    if (!exercise) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    const sets = Number(payload.sets ?? payload.series ?? 3);
    const rest = Number(payload.rest ?? payload.restSeconds ?? payload.rest_seconds ?? 60);
    if (!Number.isInteger(sets) || sets < 1 || sets > 20 || !Number.isInteger(rest) || rest < 0 || rest > 3600) return NextResponse.json({ error: 'Séries ou descanso inválidos.' }, { status: 400 });
    const load = payload.load ?? payload.weight ?? payload.carga ?? null;
    const numericLoad = load === null || load === '' ? null : Number(load);
    const timeSeconds = payload.timeSeconds === undefined || payload.timeSeconds === '' ? null : Number(payload.timeSeconds);
    if ((numericLoad !== null && (!Number.isFinite(numericLoad) || numericLoad < 0 || numericLoad > 10000)) || (timeSeconds !== null && (!Number.isInteger(timeSeconds) || timeSeconds < 0 || timeSeconds > 14400))) return NextResponse.json({ error: 'Carga ou tempo inválidos.' }, { status: 400 });
    const now = new Date();
    const item = {
      id: randomUUID(), exerciseId, order: (workout.exercises || []).length + 1,
      sets, repetitions: text(payload.repetitions ?? payload.repeticoes, 40) || '10',
      load: numericLoad, rest, timeSeconds,
      method: text(payload.method ?? payload.technique, 100),
      observations: text(payload.observations ?? payload.observacoes, 1000), createdAt: now, updatedAt: now,
    };
    await database.collection('workouts').updateOne({ id: workoutId }, { $push: { exercises: item }, $set: { updatedAt: now } });
    await writeAuditLog(database, { userId: access.user.id, action: 'add_exercise', resource: 'workout', resourceId: workoutId, metadata: { exerciseId } });
    return NextResponse.json({ exercise: { ...item, exercise } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível adicionar o exercício.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const id = text(payload.id, 64);
    if (!idPattern.test(id)) return NextResponse.json({ error: 'ID do exercício na ficha inválido.' }, { status: 400 });
    const database = await getDatabase();
    const workout = await database.collection('workouts').findOne({ 'exercises.id': id });
    if (!await canAccessWorkout(database, access.user, workout)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const fields = { 'exercises.$[item].updatedAt': new Date(), updatedAt: new Date() };
    const sets = payload.sets ?? payload.series;
    const rest = payload.rest ?? payload.restSeconds ?? payload.rest_seconds;
    if (sets !== undefined) {
      const value = Number(sets);
      if (!Number.isInteger(value) || value < 1 || value > 20) return NextResponse.json({ error: 'Número de séries inválido.' }, { status: 400 });
      fields['exercises.$[item].sets'] = value;
    }
    if (payload.repetitions !== undefined || payload.repeticoes !== undefined) fields['exercises.$[item].repetitions'] = text(payload.repetitions ?? payload.repeticoes, 40);
    if (payload.load !== undefined || payload.weight !== undefined || payload.carga !== undefined) {
      const load = payload.load ?? payload.weight ?? payload.carga;
      const value = load === null || load === '' ? null : Number(load);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > 10000)) return NextResponse.json({ error: 'Carga inválida.' }, { status: 400 });
      fields['exercises.$[item].load'] = value;
    }
    if (rest !== undefined) {
      const value = Number(rest);
      if (!Number.isInteger(value) || value < 0 || value > 3600) return NextResponse.json({ error: 'Descanso inválido.' }, { status: 400 });
      fields['exercises.$[item].rest'] = value;
    }
    if (payload.observations !== undefined || payload.observacoes !== undefined) fields['exercises.$[item].observations'] = text(payload.observations ?? payload.observacoes, 1000);
    if (payload.method !== undefined || payload.technique !== undefined) fields['exercises.$[item].method'] = text(payload.method ?? payload.technique, 100);
    if (payload.timeSeconds !== undefined) {
      const value = payload.timeSeconds === '' || payload.timeSeconds === null ? null : Number(payload.timeSeconds);
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 14400)) return NextResponse.json({ error: 'Tempo inválido.' }, { status: 400 });
      fields['exercises.$[item].timeSeconds'] = value;
    }
    if (payload.order !== undefined) {
      const value = Number(payload.order);
      if (!Number.isInteger(value) || value < 1 || value > 50) return NextResponse.json({ error: 'Ordem inválida.' }, { status: 400 });
      fields['exercises.$[item].order'] = value;
    }
    await database.collection('workouts').updateOne({ id: workout.id }, { $set: fields }, { arrayFilters: [{ 'item.id': id }] });
    const updatedWorkout = await database.collection('workouts').findOne({ id: workout.id });
    const item = (await withExerciseNames(database, updatedWorkout)).find((entry) => entry.id === id);
    await writeAuditLog(database, { userId: access.user.id, action: 'update_exercise', resource: 'workout', resourceId: workout.id, metadata: { exerciseId: item.exerciseId } });
    return NextResponse.json({ exercise: item });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar o exercício.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!idPattern.test(id || '')) return NextResponse.json({ error: 'ID do exercício na ficha inválido.' }, { status: 400 });
    const database = await getDatabase();
    const workout = await database.collection('workouts').findOne({ 'exercises.id': id });
    if (!await canAccessWorkout(database, access.user, workout)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    await database.collection('workouts').updateOne({ id: workout.id }, { $pull: { exercises: { id } }, $set: { updatedAt: new Date() } });
    await writeAuditLog(database, { userId: access.user.id, action: 'remove_exercise', resource: 'workout', resourceId: workout.id });
    return NextResponse.json({ message: 'Exercício removido do treino.' });
  } catch {
    return NextResponse.json({ error: 'Não foi possível remover o exercício.' }, { status: 500 });
  }
}
