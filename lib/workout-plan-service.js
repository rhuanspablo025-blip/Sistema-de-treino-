import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDatabase, getMongoClient } from './mongodb';
import { writeAuditLog } from './audit';
import validation from './workout-plan-validation.cjs';

const { DAY_KEYS, LEVELS, OBJECTIVES, WorkoutPlanValidationError, normalizeWorkoutPlan, validDate } = validation;
const idPattern = /^[0-9a-f-]{36}$/i;
const dayLabels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export class WorkoutPlanServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function workoutPlanErrorResponse(error, fallback) {
  const status = error instanceof WorkoutPlanValidationError ? 400 : error.status || 500;
  const message = status < 500 ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export async function parseWorkoutPlanRequest(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new WorkoutPlanValidationError('Dados da ficha inválidos.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkoutPlanValidationError('Dados da ficha inválidos.');
  return payload;
}

function publicDocument(document) {
  if (!document) return null;
  const { _id, ...result } = document;
  return result;
}

function planFilterFor(user, id) {
  const filter = { id, deletedAt: { $exists: false } };
  if (user.role === 'student') {
    filter.studentId = user.id;
    filter.active = true;
  } else if (user.role === 'trainer') {
    filter.trainerId = user.id;
  }
  return filter;
}

function normalizedDayKey(value, fallbackIndex) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (DAY_KEYS.includes(key)) return key;
  const labelIndex = dayLabels.findIndex((label) => label.toLowerCase() === key);
  return DAY_KEYS[labelIndex >= 0 ? labelIndex : fallbackIndex % 7];
}

function parseLegacyPrescription(value, pattern, fallback) {
  const match = typeof value === 'string' ? value.match(pattern) : null;
  return match?.[1] || fallback;
}

async function legacyExerciseId(database, rawExercise) {
  if (typeof rawExercise?.exerciseId === 'string' && idPattern.test(rawExercise.exerciseId)) return rawExercise.exerciseId;
  const name = typeof rawExercise?.name === 'string' ? rawExercise.name.trim().slice(0, 120) : '';
  if (name.length < 2) throw new WorkoutPlanValidationError('Selecione um exercício cadastrado.');
  const nameKey = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const exercises = database.collection('exercises');
  let exercise = await exercises.findOne({ nameKey, active: true });
  if (exercise) return exercise.id;

  const now = new Date();
  const candidate = { id: randomUUID(), name, nameKey, muscleGroup: 'Não classificado', equipment: '', description: '', instructions: '', active: true, createdAt: now, updatedAt: now };
  try {
    await exercises.insertOne(candidate);
    return candidate.id;
  } catch (error) {
    if (error.code !== 11000) throw error;
    exercise = await exercises.findOne({ nameKey, active: true });
    if (!exercise) throw error;
    return exercise.id;
  }
}

async function withLegacyDays(database, payload, existingWorkouts) {
  if (Array.isArray(payload.days)) return payload;

  const existing = [...existingWorkouts].sort((left, right) => left.order - right.order);
  const rawExercises = Array.isArray(payload.exercises) ? payload.exercises : null;
  const dayById = new Map();
  const days = existing.map((workout, index) => {
    const day = {
      id: workout.id,
      name: workout.name,
      dayOfWeek: normalizedDayKey(workout.dayOfWeek, index),
      isRestDay: workout.isRestDay === true,
      description: workout.description || '',
      observations: workout.observations || '',
      exercises: [],
    };
    dayById.set(workout.id, day);
    return day;
  });

  if (!rawExercises && existing.length) {
    for (const [index, workout] of existing.entries()) {
      days[index].exercises = await Promise.all((workout.exercises || []).map(async (exercise) => ({
        id: exercise.id,
        exerciseId: await legacyExerciseId(database, exercise),
        sets: exercise.sets,
        repetitions: exercise.repetitions,
        load: exercise.load,
        rest: exercise.rest,
        timeSeconds: exercise.timeSeconds,
        method: exercise.method,
        observations: exercise.observations,
      })));
    }
  } else if (rawExercises?.length) {
    if (!days.length) {
      days.push({ dayOfWeek: 'monday', name: payload.title || payload.name || 'Treino A', isRestDay: false, exercises: [] });
    }
    for (const rawExercise of rawExercises) {
      const target = dayById.get(rawExercise.workoutId) || days[0];
      target.exercises.push({
        id: rawExercise.id,
        exerciseId: await legacyExerciseId(database, rawExercise),
        sets: Number(rawExercise.sets) || Number(parseLegacyPrescription(rawExercise.detail, /(\d+)\s*s[eé]ries?/i, 3)),
        repetitions: rawExercise.repetitions || parseLegacyPrescription(rawExercise.detail, /(\d+\s*[-–]\s*\d+|\d+)\s*reps?/i, '10'),
        load: rawExercise.load === '' ? null : rawExercise.load,
        rest: Number(String(rawExercise.rest ?? '').match(/\d+/)?.[0]) || 60,
        observations: rawExercise.observations || '',
      });
    }
  }

  const usedKeys = new Set();
  for (const [index, day] of days.entries()) {
    let key = normalizedDayKey(day.dayOfWeek, index);
    if (usedKeys.has(key)) key = DAY_KEYS.find((item) => !usedKeys.has(item));
    day.dayOfWeek = key;
    usedKeys.add(key);
  }

  return {
    ...payload,
    name: payload.name ?? payload.title,
    objective: payload.objective ?? payload.goal ?? existingWorkouts[0]?.objective ?? 'Personalizado',
    level: payload.level ?? 'Intermediário',
    startDate: payload.startDate ?? existingWorkouts[0]?.startDate,
    reviewDate: payload.reviewDate ?? payload.endDate,
    days,
  };
}

async function getScopedPlan(database, user, id) {
  if (!idPattern.test(id || '')) throw new WorkoutPlanValidationError('ID da ficha inválido.');
  const plan = await database.collection('workout_plans').findOne(planFilterFor(user, id));
  if (!plan) throw new WorkoutPlanServiceError('Ficha não encontrada.', 404);
  return plan;
}

export async function listWorkoutPlans(user, request) {
  const database = await getDatabase();
  const params = new URL(request.url).searchParams;
  const filter = { deletedAt: { $exists: false } };
  if (user.role === 'student') {
    filter.studentId = user.id;
    filter.active = true;
  } else if (user.role === 'trainer') {
    filter.trainerId = user.id;
  }
  const studentId = params.get('studentId');
  if (studentId && ['admin', 'dev', 'trainer'].includes(user.role)) {
    if (!idPattern.test(studentId)) throw new WorkoutPlanValidationError('ID do aluno inválido.');
    filter.studentId = studentId;
  }
  const status = params.get('status');
  if (status === 'active') filter.active = true;
  else if (status === 'inactive') {
    if (user.role === 'student') return { plans: [] };
    filter.active = false;
  }
  else if (status && status !== 'all') throw new WorkoutPlanValidationError('Filtro de status inválido.');
  const objective = params.get('objective');
  if (objective) filter.objective = objective;

  const sort = params.get('sort') === 'name' ? { name: 1 } : params.get('sort') === 'created' ? { createdAt: -1 } : { updatedAt: -1 };
  const plans = await database.collection('workout_plans').find(filter).sort(sort).limit(500).toArray();
  const ids = plans.map((plan) => plan.id);
  if (!ids.length) return { plans: [] };
  const [students, trainers, workouts] = await Promise.all([
    database.collection('students').find({ userId: { $in: [...new Set(plans.map((plan) => plan.studentId))] } }, { projection: { userId: 1, name: 1 } }).toArray(),
    database.collection('users').find({ id: { $in: [...new Set(plans.map((plan) => plan.trainerId).filter(Boolean))] } }, { projection: { id: 1, name: 1 } }).toArray(),
    database.collection('workouts').find({ workoutPlanId: { $in: ids }, archived: { $ne: true } }, { projection: { id: 1, workoutPlanId: 1, isRestDay: 1, exercises: 1, updatedAt: 1 } }).toArray(),
  ]);
  const studentNames = new Map(students.map((student) => [student.userId, student.name]));
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const planSummaries = plans.map((plan) => {
    const days = workouts.filter((workout) => workout.workoutPlanId === plan.id);
    return {
      ...publicDocument(plan),
      studentName: studentNames.get(plan.studentId) || 'Aluno',
      trainerName: trainerNames.get(plan.trainerId) || 'Equipe',
      dayCount: days.filter((day) => !day.isRestDay).length,
      exerciseCount: days.reduce((total, day) => total + (day.exercises || []).length, 0),
      lastWorkoutUpdate: days.reduce((latest, day) => !latest || day.updatedAt > latest ? day.updatedAt : latest, null),
    };
  });
  return { plans: planSummaries };
}

export async function getWorkoutPlanDetails(user, id) {
  const database = await getDatabase();
  const plan = await getScopedPlan(database, user, id);
  const [student, trainer, workouts] = await Promise.all([
    database.collection('students').findOne({ userId: plan.studentId }, { projection: { name: 1 } }),
    plan.trainerId ? database.collection('users').findOne({ id: plan.trainerId }, { projection: { name: 1 } }) : null,
    database.collection('workouts').find({ workoutPlanId: plan.id, archived: { $ne: true } }).sort({ order: 1 }).toArray(),
  ]);
  const exerciseIds = [...new Set(workouts.flatMap((workout) => (workout.exercises || []).map((item) => item.exerciseId)))];
  const catalog = exerciseIds.length ? await database.collection('exercises').find({ id: { $in: exerciseIds } }).toArray() : [];
  const exerciseById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  return {
    plan: { ...publicDocument(plan), studentName: student?.name || 'Aluno', trainerName: trainer?.name || 'Equipe' },
    days: workouts.map((workout) => ({
      ...publicDocument(workout),
      exercises: (workout.exercises || []).sort((left, right) => left.order - right.order).map((item) => ({
        ...item,
        exercise: exerciseById.has(item.exerciseId) ? publicDocument(exerciseById.get(item.exerciseId)) : null,
      })),
    })),
  };
}

export async function saveWorkoutPlan(user, payload, createOnly = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkoutPlanValidationError('Dados da ficha inválidos.');
  const database = await getDatabase();
  const requestedId = payload?.id;
  if (createOnly && requestedId) throw new WorkoutPlanValidationError('Não é possível definir o ID da ficha.');
  const existingPlan = requestedId ? await getScopedPlan(database, user, requestedId) : null;
  const existingWorkouts = existingPlan
    ? await database.collection('workouts').find({ workoutPlanId: existingPlan.id, archived: { $ne: true } }).sort({ order: 1 }).toArray()
    : [];
  const sourcePayload = existingPlan ? { ...existingPlan, ...payload, id: existingPlan.id } : payload;
  const canonicalPayload = await withLegacyDays(database, sourcePayload, existingWorkouts);
  const draft = normalizeWorkoutPlan(canonicalPayload);

  const studentFilter = { userId: draft.studentId, active: true };
  if (user.role === 'trainer') studentFilter.trainerId = user.id;
  const student = await database.collection('students').findOne(studentFilter);
  if (!student) throw new WorkoutPlanServiceError('Aluno não encontrado ou fora da sua equipe.', 404);

  const exerciseIds = [...new Set(draft.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId)))];
  const catalog = exerciseIds.length ? await database.collection('exercises').find({ id: { $in: exerciseIds }, active: true }).toArray() : [];
  if (catalog.length !== exerciseIds.length) throw new WorkoutPlanValidationError('Um ou mais exercícios não estão disponíveis no catálogo.');

  const now = new Date();
  const planId = existingPlan?.id || randomUUID();
  const plan = {
    id: planId,
    studentId: draft.studentId,
    trainerId: existingPlan?.trainerId || (user.role === 'trainer' ? user.id : student.trainerId || user.id),
    name: draft.name,
    objective: draft.objective,
    objectiveDetails: draft.objectiveDetails,
    level: draft.level,
    observations: draft.observations,
    frequency: draft.frequency,
    startDate: draft.startDate,
    endDate: draft.endDate,
    active: existingPlan ? existingPlan.active !== false : true,
    createdAt: existingPlan?.createdAt || now,
    updatedAt: now,
  };

  const existingWorkoutById = new Map(existingWorkouts.map((workout) => [workout.id, workout]));
  const existingExerciseById = new Map(existingWorkouts.flatMap((workout) => (workout.exercises || []).map((exercise) => [exercise.id, exercise])));
  const workouts = draft.days.map((day) => {
    if (day.id && !existingWorkoutById.has(day.id)) throw new WorkoutPlanValidationError('O treino informado não pertence a esta ficha.');
    const previous = day.id ? existingWorkoutById.get(day.id) : null;
    const exercises = day.exercises.map((exercise) => {
      if (exercise.id && !existingExerciseById.has(exercise.id)) throw new WorkoutPlanValidationError('O exercício informado não pertence a esta ficha.');
      const previousExercise = exercise.id ? existingExerciseById.get(exercise.id) : null;
      return {
        id: previousExercise?.id || randomUUID(),
        exerciseId: exercise.exerciseId,
        order: exercise.order,
        sets: exercise.sets,
        repetitions: exercise.repetitions,
        load: exercise.load,
        rest: exercise.rest,
        timeSeconds: exercise.timeSeconds,
        method: exercise.method,
        observations: exercise.observations,
        createdAt: previousExercise?.createdAt || now,
        updatedAt: now,
      };
    });
    return {
      id: previous?.id || randomUUID(),
      workoutPlanId: planId,
      name: day.name,
      order: day.order,
      dayOfWeek: day.dayOfWeek,
      isRestDay: day.isRestDay,
      description: day.description,
      observations: day.observations,
      exercises,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
  });

  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      if (existingPlan) {
        const filter = { id: planId };
        if (user.role === 'trainer') filter.trainerId = user.id;
        const updateResult = await database.collection('workout_plans').updateOne(filter, { $set: plan }, { session });
        if (!updateResult.matchedCount) throw new WorkoutPlanServiceError('Ficha não encontrada.', 404);
      } else {
        await database.collection('workout_plans').insertOne(plan, { session });
      }

      const keepIds = new Set(workouts.map((workout) => workout.id));
      for (const workout of workouts) {
        if (existingWorkoutById.has(workout.id)) {
          await database.collection('workouts').updateOne(
            { id: workout.id, workoutPlanId: planId },
            { $set: workout, $unset: { archived: '' } },
            { session },
          );
        } else {
          await database.collection('workouts').insertOne(workout, { session });
        }
      }

      for (const oldWorkout of existingWorkouts) {
        if (keepIds.has(oldWorkout.id)) continue;
        const hasHistory = await database.collection('workout_history').countDocuments({ workoutId: oldWorkout.id }, { session });
        if (hasHistory) {
          await database.collection('workouts').updateOne({ id: oldWorkout.id }, { $set: { archived: true, updatedAt: now } }, { session });
        } else {
          await database.collection('workouts').deleteOne({ id: oldWorkout.id }, { session });
        }
      }
      await writeAuditLog(database, {
        userId: user.id,
        action: existingPlan ? 'update' : 'create',
        resource: 'workout_plan',
        resourceId: planId,
        metadata: { studentId: plan.studentId },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  const exerciseById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  return {
    plan: { ...plan, studentName: student.name },
    days: workouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises.map((item) => ({ ...item, exercise: publicDocument(exerciseById.get(item.exerciseId)) })),
    })),
  };
}

export async function updateWorkoutPlanFields(user, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkoutPlanValidationError('Dados da ficha inválidos.');
  const id = typeof payload?.id === 'string' ? payload.id : '';
  if (!idPattern.test(id)) throw new WorkoutPlanValidationError('ID da ficha inválido.');
  const fields = { updatedAt: new Date() };
  if (payload.active !== undefined || payload.status !== undefined) {
    let active;
    if (typeof payload.active === 'boolean') active = payload.active;
    else if (payload.status === 'active' || payload.status === 'ativa') active = true;
    else if (payload.status === 'inactive' || payload.status === 'inativa') active = false;
    else throw new WorkoutPlanValidationError('Status inválido.');
    if (typeof active !== 'boolean') throw new WorkoutPlanValidationError('Status inválido.');
    fields.active = active;
  }
  if (payload.name !== undefined) fields.name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (fields.name !== undefined && (fields.name.length < 2 || fields.name.length > 120)) throw new WorkoutPlanValidationError('Nome da ficha inválido.');
  if (payload.objective !== undefined) {
    if (!OBJECTIVES.includes(payload.objective)) throw new WorkoutPlanValidationError('Objetivo inválido.');
    fields.objective = payload.objective;
  }
  if (payload.level !== undefined) {
    if (!LEVELS.includes(payload.level)) throw new WorkoutPlanValidationError('Nível inválido.');
    fields.level = payload.level;
  }
  if (payload.observations !== undefined) fields.observations = typeof payload.observations === 'string' ? payload.observations.trim().slice(0, 2000) : '';
  if (payload.endDate !== undefined || payload.reviewDate !== undefined) fields.endDate = validDate(payload.reviewDate ?? payload.endDate);

  const database = await getDatabase();
  const filter = { id, deletedAt: { $exists: false } };
  if (user.role === 'trainer') filter.trainerId = user.id;
  const result = await database.collection('workout_plans').findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' });
  if (!result) throw new WorkoutPlanServiceError('Ficha não encontrada.', 404);
  await writeAuditLog(database, { userId: user.id, action: 'update', resource: 'workout_plan', resourceId: id });
  return { plan: publicDocument(result) };
}

export async function deleteWorkoutPlan(user, id) {
  if (!idPattern.test(id || '')) throw new WorkoutPlanValidationError('ID da ficha inválido.');
  const database = await getDatabase();
  const filter = { id, deletedAt: { $exists: false } };
  if (user.role === 'trainer') filter.trainerId = user.id;
  const plan = await database.collection('workout_plans').findOne(filter);
  if (!plan) throw new WorkoutPlanServiceError('Ficha não encontrada.', 404);
  const now = new Date();
  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      await database.collection('workout_plans').updateOne(filter, { $set: { active: false, deletedAt: now, updatedAt: now } }, { session });
      await database.collection('workouts').updateMany({ workoutPlanId: id }, { $set: { archived: true, updatedAt: now } }, { session });
      await writeAuditLog(database, { userId: user.id, action: 'delete', resource: 'workout_plan', resourceId: id, session });
    });
  } finally {
    await session.endSession();
  }
  return { message: 'Ficha excluída. O histórico de treinos foi preservado.' };
}