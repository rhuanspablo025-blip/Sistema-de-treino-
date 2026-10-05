import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 1000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

async function mayAccessStudent(database, user, studentId) {
  if (user.role === 'student') return user.id === studentId;
  if (user.role === 'admin' || user.role === 'dev') return true;
  return Boolean(await database.collection('students').findOne({ userId: studentId, trainerId: user.id, active: true }));
}

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || access.user.id;
    const workoutId = searchParams.get('workoutId');
    if (!idPattern.test(studentId) || (workoutId && !idPattern.test(workoutId))) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const database = await getDatabase();
    if (!await mayAccessStudent(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const filter = { studentId };
    if (workoutId) filter.workoutId = workoutId;
    const history = await database.collection('workout_history').find(filter).sort({ date: -1 }).limit(200).toArray();
    return NextResponse.json({ history });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const studentId = text(payload.studentId, 64) || access.user.id;
    const workoutId = text(payload.workoutId, 64);
    const exerciseId = text(payload.exerciseId, 64);
    if (![studentId, workoutId, exerciseId].every((id) => idPattern.test(id))) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
    const sets = Array.isArray(payload.sets) ? payload.sets : [];
    if (!sets.length || sets.length > 20) return NextResponse.json({ error: 'Informe de 1 a 20 séries realizadas.' }, { status: 400 });
    const normalizedSets = [];
    for (const [index, set] of sets.entries()) {
      const repetitions = Number(set.repetitions ?? set.repeticoes);
      const load = Number(set.load ?? set.carga ?? 0);
      if (!Number.isInteger(repetitions) || repetitions < 0 || repetitions > 500 || !Number.isFinite(load) || load < 0 || load > 10000) return NextResponse.json({ error: `Dados inválidos na série ${index + 1}.` }, { status: 400 });
      normalizedSets.push({ series: index + 1, repetitions, load });
    }

    const database = await getDatabase();
    if (!await mayAccessStudent(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const workout = await database.collection('workouts').findOne({ id: workoutId, 'exercises.exerciseId': exerciseId });
    if (!workout) return NextResponse.json({ error: 'O exercício não pertence ao treino informado.' }, { status: 400 });
    const plan = await database.collection('workout_plans').findOne({ id: workout.workoutPlanId, studentId });
    if (!plan) return NextResponse.json({ error: 'O treino não pertence à ficha deste aluno.' }, { status: 400 });

    const now = new Date();
    const record = {
      id: randomUUID(), studentId, workoutId, exerciseId, sets: normalizedSets,
      date: payload.date ? new Date(payload.date) : now,
      observations: text(payload.observations), createdAt: now,
    };
    if (Number.isNaN(record.date.getTime()) || record.date > new Date(Date.now() + 60_000)) return NextResponse.json({ error: 'Data do treino inválida.' }, { status: 400 });
    await database.collection('workout_history').insertOne(record);
    await writeAuditLog(database, { userId: access.user.id, action: 'record_workout', resource: 'workout_history', resourceId: record.id, metadata: { studentId, workoutId, exerciseId } });
    return NextResponse.json({ record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível registrar o treino.' }, { status: 500 });
  }
}
