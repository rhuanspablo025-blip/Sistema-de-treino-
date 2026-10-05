import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser, requireStaff } from '../../../lib/api-auth';
import { isStaff } from '../../../lib/auth';
import { writeAuditLog } from '../../../lib/audit';
import { getDatabase } from '../../../lib/mongodb';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId') || searchParams.get('student_id');
    const filter = {};
    if (access.user.role === 'student') filter.studentId = access.user.id;
    else if (access.user.role === 'trainer') filter.trainerId = access.user.id;
    if (studentId && isStaff(access.user)) filter.studentId = studentId;
    const plans = await database.collection('workout_plans').find(filter).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ plans });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as fichas.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const studentId = text(payload.studentId ?? payload.student_id, 64);
    const name = text(payload.name, 120);
    const objective = text(payload.objective ?? payload.goal, 500);
    if (!idPattern.test(studentId) || name.length < 2) return NextResponse.json({ error: 'Informe aluno e nome da ficha válidos.' }, { status: 400 });

    const database = await getDatabase();
    const student = await database.collection('students').findOne({ userId: studentId, active: true });
    if (!student || (access.user.role === 'trainer' && student.trainerId !== access.user.id)) return NextResponse.json({ error: 'Aluno não encontrado ou fora da sua equipe.' }, { status: 404 });
    const now = new Date();
    const plan = {
      id: randomUUID(), studentId, trainerId: access.user.id, name, objective,
      observations: text(payload.observations, 2000), active: payload.status !== 'inativa',
      frequency: text(payload.frequency, 80), startDate: text(payload.startDate ?? payload.start_date, 20) || now.toISOString().slice(0, 10),
      endDate: text(payload.endDate ?? payload.end_date, 20) || null, createdAt: now, updatedAt: now,
    };
    await database.collection('workout_plans').insertOne(plan);
    await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'workout_plan', resourceId: plan.id, metadata: { studentId } });
    return NextResponse.json({ plan }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar a ficha.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const studentId = text(payload.studentId, 64);
    const name = text(payload.title, 120);
    const frequency = text(payload.frequency, 80);
    const objective = text(payload.goal, 500);
    const rawExercises = Array.isArray(payload.exercises) ? payload.exercises.slice(0, 100) : [];
    const suppliedId = text(payload.id, 64);
    if (!idPattern.test(studentId) || name.length < 2 || (suppliedId && !idPattern.test(suppliedId))) return NextResponse.json({ error: 'Dados da ficha inválidos.' }, { status: 400 });

    const database = await getDatabase();
    const student = await database.collection('students').findOne({ userId: studentId, active: true });
    if (!student || (access.user.role === 'trainer' && student.trainerId !== access.user.id)) return NextResponse.json({ error: 'Aluno não encontrado ou sem permissão.' }, { status: 404 });
    const plans = database.collection('workout_plans');
    const existingPlan = suppliedId ? await plans.findOne({ id: suppliedId, studentId }) : null;
    if (suppliedId && !existingPlan) return NextResponse.json({ error: 'Ficha não encontrada para este aluno.' }, { status: 404 });
    const now = new Date();
    const plan = {
      id: existingPlan?.id || randomUUID(), studentId, trainerId: access.user.id,
      name, objective, observations: '', frequency, active: true,
      startDate: existingPlan?.startDate || now.toISOString().slice(0, 10),
      endDate: existingPlan?.endDate || null, createdAt: existingPlan?.createdAt || now, updatedAt: now,
    };
    await plans.replaceOne({ id: plan.id }, plan, { upsert: true });

    const workouts = database.collection('workouts');
    const existingWorkout = await workouts.findOne({ workoutPlanId: plan.id }, { sort: { order: 1 } });
    const catalog = database.collection('exercises');
    const exercises = [];
    for (const [index, raw] of rawExercises.entries()) {
      const exerciseName = text(raw?.name, 120);
      if (exerciseName.length < 2) continue;
      const key = exerciseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      let exercise = await catalog.findOne({ nameKey: key });
      if (!exercise) {
        const created = { id: randomUUID(), name: exerciseName, nameKey: key, muscleGroup: 'Não classificado', equipment: '', description: '', instructions: '', active: true, createdAt: now, updatedAt: now, createdBy: access.user.id };
        try {
          await catalog.insertOne(created);
          exercise = created;
        } catch (error) {
          if (error.code !== 11000) throw error;
          exercise = await catalog.findOne({ nameKey: key });
        }
      }
      const detail = text(raw.detail, 120);
      const sets = Number(detail.match(/(\d+)\s*s[eé]ries?/i)?.[1]) || 3;
      const repetitions = detail.match(/(\d+\s*[-–]\s*\d+|\d+)\s*reps?/i)?.[1] || '10';
      const rest = Number(text(raw.rest, 20).match(/\d+/)?.[0]) || 60;
      const load = typeof raw.load === 'string' || typeof raw.load === 'number' ? raw.load : null;
      exercises.push({ id: randomUUID(), exerciseId: exercise.id, order: index + 1, sets: Math.min(20, Math.max(1, sets)), repetitions, load, rest: Math.min(3600, rest), observations: '', createdAt: now, updatedAt: now });
    }

    const workout = {
      id: existingWorkout?.id || randomUUID(), workoutPlanId: plan.id,
      name, order: existingWorkout?.order || 1, dayOfWeek: null,
      description: '', observations: '', exercises,
      createdAt: existingWorkout?.createdAt || now, updatedAt: now,
    };
    await workouts.replaceOne({ id: workout.id }, workout, { upsert: true });
    await writeAuditLog(database, { userId: access.user.id, action: existingPlan ? 'update' : 'create', resource: 'workout_plan', resourceId: plan.id, metadata: { studentId } });
    return NextResponse.json({ workout: { id: plan.id, title: plan.name, studentId, goal: plan.objective, frequency, exerciseList: rawExercises } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a ficha.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const id = text(payload.id, 64);
    if (!idPattern.test(id)) return NextResponse.json({ error: 'ID da ficha inválido.' }, { status: 400 });
    const fields = { updatedAt: new Date() };
    if (payload.name !== undefined) {
      fields.name = text(payload.name, 120);
      if (fields.name.length < 2) return NextResponse.json({ error: 'Nome da ficha inválido.' }, { status: 400 });
    }
    if (payload.goal !== undefined || payload.objective !== undefined) fields.objective = text(payload.objective ?? payload.goal, 500);
    if (payload.status !== undefined) fields.active = payload.status === 'ativa';
    if (payload.observations !== undefined) fields.observations = text(payload.observations, 2000);
    if (payload.endDate !== undefined || payload.end_date !== undefined) fields.endDate = text(payload.endDate ?? payload.end_date, 20) || null;
    if (payload.frequency !== undefined) fields.frequency = text(payload.frequency, 80);

    const database = await getDatabase();
    const filter = { id };
    if (access.user.role === 'trainer') filter.trainerId = access.user.id;
    const plan = await database.collection('workout_plans').findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' });
    if (!plan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'workout_plan', resourceId: id });
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar a ficha.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!idPattern.test(id || '')) return NextResponse.json({ error: 'ID da ficha inválido.' }, { status: 400 });
    const filter = { id };
    if (access.user.role === 'trainer') filter.trainerId = access.user.id;
    const database = await getDatabase();
    const result = await database.collection('workout_plans').updateOne(filter, { $set: { active: false, updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'deactivate', resource: 'workout_plan', resourceId: id });
    return NextResponse.json({ message: 'Ficha desativada.' });
  } catch {
    return NextResponse.json({ error: 'Não foi possível desativar a ficha.' }, { status: 500 });
  }
}
