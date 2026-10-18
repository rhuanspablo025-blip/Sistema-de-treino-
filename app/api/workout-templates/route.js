import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';

export const runtime = 'nodejs';
const dayKeys = new Set(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
const cleanText = (value, size = 120) => typeof value === 'string' ? value.trim().slice(0, size) : '';

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
    const payload = await request.json();
    const name = cleanText(payload.name);
    const days = Array.isArray(payload.days) ? payload.days : [];
    if (name.length < 2 || days.length > 7 || days.some((day) => !dayKeys.has(day.dayOfWeek) || !Array.isArray(day.exercises) || day.exercises.length > 50)) return NextResponse.json({ error: 'Revise o nome e os dias do modelo.' }, { status: 400 });
    if (new Set(days.map((day) => day.dayOfWeek)).size !== days.length) return NextResponse.json({ error: 'Cada dia da semana pode aparecer uma única vez.' }, { status: 400 });
    const database = await getDatabase();
    const ids = [...new Set(days.flatMap((day) => day.exercises.map((item) => item.exerciseId)))];
    const available = ids.length ? await database.collection('exercises').countDocuments({ id: { $in: ids }, active: true }) : 0;
    if (available !== ids.length) return NextResponse.json({ error: 'O modelo contém exercícios indisponíveis.' }, { status: 400 });
    const now = new Date();
    const model = { id: randomUUID(), name, objective: cleanText(payload.objective, 60) || 'Personalizado', objectiveDetails: cleanText(payload.objectiveDetails, 240), level: cleanText(payload.level, 40) || 'Iniciante', observations: cleanText(payload.observations, 2000), days: days.map((day) => ({ dayOfWeek: day.dayOfWeek, name: cleanText(day.name, 80), isRestDay: day.isRestDay === true, observations: cleanText(day.observations, 2000), exercises: day.exercises.map((item, order) => ({ exerciseId: item.exerciseId, order, sets: Number(item.sets) || 3, repetitions: cleanText(String(item.repetitions || '10'), 40), load: Number.isFinite(Number(item.load)) && item.load !== '' ? Number(item.load) : null, rest: Number(item.rest) || 60, timeSeconds: Number(item.timeSeconds) || null, method: cleanText(item.method, 100), observations: cleanText(item.observations, 1000) })) })), active: true, createdBy: access.user.id, createdAt: now, updatedAt: now };
    await database.collection('workout_templates').insertOne(model);
    await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'workout_template', resourceId: model.id });
    const { _id, ...response } = model;
    return NextResponse.json({ template: response }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Não foi possível salvar o modelo.' }, { status: 500 }); }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const { id, active } = await request.json();
    if (typeof id !== 'string' || typeof active !== 'boolean') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    const database = await getDatabase();
    const result = await database.collection('workout_templates').updateOne({ id, deletedAt: { $exists: false } }, { $set: { active, updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: active ? 'activate' : 'deactivate', resource: 'workout_template', resourceId: id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível atualizar o modelo.' }, { status: 500 }); }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Modelo inválido.' }, { status: 400 });
    const database = await getDatabase();
    const result = await database.collection('workout_templates').updateOne({ id, deletedAt: { $exists: false } }, { $set: { active: false, deletedAt: new Date(), updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Modelo não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'delete', resource: 'workout_template', resourceId: id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Não foi possível excluir o modelo.' }, { status: 500 }); }
}
