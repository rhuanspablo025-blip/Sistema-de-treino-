import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';
import { DAY_KEYS, LEVELS, OBJECTIVES, WorkoutPlanValidationError } from '../../../lib/workout-plan-validation.cjs';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;

function requiredText(value, label, max) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) throw new WorkoutPlanValidationError(`${label} deve ter de 1 a ${max} caracteres.`);
  return value.trim();
}

function optionalText(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max) throw new WorkoutPlanValidationError(`${label} deve ter até ${max} caracteres.`);
  return value.trim();
}

function boundedNumber(value, label, min, max, integer = false, nullable = false) {
  if (nullable && (value === undefined || value === null || value === '')) return null;
  if (value === '' || value === undefined || value === null || typeof value === 'boolean' || (typeof value !== 'string' && typeof value !== 'number')) throw new WorkoutPlanValidationError(`${label} inválido.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) throw new WorkoutPlanValidationError(`${label} deve estar entre ${min} e ${max}${integer ? ' (número inteiro)' : ''}.`);
  return number;
}

function normalizeTemplate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WorkoutPlanValidationError('Dados do modelo inválidos.');
  const name = requiredText(payload.name, 'Nome do modelo', 120);
  const objective = payload.objective === undefined ? 'Personalizado' : requiredText(payload.objective, 'Objetivo', 60);
  const level = payload.level === undefined ? 'Iniciante' : requiredText(payload.level, 'Nível', 32);
  if (!OBJECTIVES.includes(objective)) throw new WorkoutPlanValidationError('Objetivo inválido.');
  if (!LEVELS.includes(level)) throw new WorkoutPlanValidationError('Nível inválido.');
  const rawDays = payload.days;
  if (!Array.isArray(rawDays) || rawDays.length < 1 || rawDays.length > 7) throw new WorkoutPlanValidationError('Inclua de um a sete dias no modelo.');
  const seen = new Set();
  const days = rawDays.map((day) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) throw new WorkoutPlanValidationError('Dia de treino inválido.');
    if (typeof day.dayOfWeek !== 'string' || !DAY_KEYS.includes(day.dayOfWeek)) throw new WorkoutPlanValidationError('Dia da semana inválido.');
    if (seen.has(day.dayOfWeek)) throw new WorkoutPlanValidationError('Cada dia da semana pode aparecer uma única vez.');
    seen.add(day.dayOfWeek);
    if (day.isRestDay !== undefined && typeof day.isRestDay !== 'boolean') throw new WorkoutPlanValidationError('Tipo de dia inválido.');
    const isRestDay = day.isRestDay === true;
    const dayName = isRestDay ? (optionalText(day.name, 'Nome do dia', 80) || 'Descanso') : requiredText(day.name, 'Nome do treino', 80);
    if (!Array.isArray(day.exercises) || day.exercises.length > 50 || (isRestDay && day.exercises.length)) throw new WorkoutPlanValidationError('Cada dia pode ter até 50 exercícios; dias de descanso não podem ter exercícios.');
    return {
      dayOfWeek: day.dayOfWeek,
      name: dayName,
      isRestDay,
      observations: optionalText(day.observations, 'Observações do dia', 2000),
      exercises: day.exercises.map((item, order) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.exerciseId !== 'string' || !idPattern.test(item.exerciseId)) throw new WorkoutPlanValidationError('Exercício inválido.');
        return {
          exerciseId: item.exerciseId,
          order,
          sets: boundedNumber(item.sets ?? 3, 'Séries', 1, 20, true),
          repetitions: requiredText(item.repetitions ?? '10', 'Repetições', 40),
          load: boundedNumber(item.load, 'Carga', 0, 10000, false, true),
          rest: boundedNumber(item.rest ?? 60, 'Intervalo', 0, 3600, true),
          timeSeconds: boundedNumber(item.timeSeconds, 'Tempo', 0, 14400, true, true),
          method: optionalText(item.method, 'Método', 100),
          observations: optionalText(item.observations, 'Observações do exercício', 1000),
        };
      }),
    };
  });
  if (!days.some((day) => !day.isRestDay && day.exercises.length > 0)) throw new WorkoutPlanValidationError('Inclua ao menos um exercício em um dia de treino.');
  return {
    name,
    objective,
    objectiveDetails: optionalText(payload.objectiveDetails, 'Detalhes do objetivo', 240),
    level,
    observations: optionalText(payload.observations, 'Observações gerais', 2000),
    days,
  };
}

async function jsonBody(request) {
  try { return await request.json(); } catch { throw new WorkoutPlanValidationError('O corpo da solicitação deve ser um JSON válido.'); }
}

function invalidResponse(error) {
  if (error instanceof WorkoutPlanValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  return null;
}

export async function GET() {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const templates = await (await getDatabase()).collection('workout_templates').find({ deletedAt: { $exists: false } }).sort({ updatedAt: -1 }).limit(500).toArray();
    return NextResponse.json({ templates: templates.map(({ _id, ...item }) => item) });
  } catch { return NextResponse.json({ error: 'Não foi possível carregar os modelos.' }, { status: 500 }); }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = normalizeTemplate(await jsonBody(request));
    const database = await getDatabase();
    const ids = [...new Set(payload.days.flatMap((day) => day.exercises.map((item) => item.exerciseId)))];
    const available = ids.length ? await database.collection('exercises').countDocuments({ id: { $in: ids }, active: true }) : 0;
    if (available !== ids.length) return NextResponse.json({ error: 'O modelo contém exercícios indisponíveis.' }, { status: 400 });
    const now = new Date();
    const model = { id: randomUUID(), ...payload, active: true, createdBy: access.user.id, createdAt: now, updatedAt: now };
    await database.collection('workout_templates').insertOne(model);
    await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'workout_template', resourceId: model.id });
    const { _id, ...response } = model;
    return NextResponse.json({ template: response }, { status: 201 });
  } catch (error) { return invalidResponse(error) || NextResponse.json({ error: 'Não foi possível salvar o modelo.' }, { status: 500 }); }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const body = await jsonBody(request);
    const { id, active } = body || {};
    if (typeof id !== 'string' || !idPattern.test(id) || typeof active !== 'boolean') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    const database = await getDatabase();
    const result = await database.collection('workout_templates').updateOne({ id, deletedAt: { $exists: false } }, { $set: { active, updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: active ? 'activate' : 'deactivate', resource: 'workout_template', resourceId: id });
    return NextResponse.json({ ok: true });
  } catch (error) { return invalidResponse(error) || NextResponse.json({ error: 'Não foi possível atualizar o modelo.' }, { status: 500 }); }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !idPattern.test(id)) return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
    const database = await getDatabase();
    const now = new Date();
    const result = await database.collection('workout_templates').updateOne({ id, deletedAt: { $exists: false } }, { $set: { active: false, deletedAt: now, updatedAt: now } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'delete', resource: 'workout_template', resourceId: id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível excluir o modelo.' }, { status: 500 }); }
}
