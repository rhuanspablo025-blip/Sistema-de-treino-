import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';
import { hasAnyRole, isAdminUser } from '../../../lib/user-roles';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const fields = ['height', 'weight', 'shoulder', 'chest', 'waist', 'hip', 'armLeft', 'armRight', 'thighLeft', 'thighRight', 'legLeft', 'legRight'];

async function canAccess(database, user, studentId) {
  if (hasAnyRole(user, ['student']) && user.id === studentId) return Boolean(await database.collection('students').findOne({ userId: studentId, active: true }));
  if (isAdminUser(user)) return true;
  return hasAnyRole(user, ['trainer']) && Boolean(await database.collection('students').findOne({ userId: studentId, trainerId: user.id, active: true }));
}

function normalizedMeasurement(field, value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const maximum = field === 'height' ? 250 : field === 'weight' ? 500 : 300;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= maximum ? number : null;
}

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const requested = new URL(request.url).searchParams.get('studentId');
    const studentId = requested || access.user.id;
    if (!idPattern.test(studentId)) return NextResponse.json({ error: 'Aluno inválido.' }, { status: 400 });
    const database = await getDatabase();
    if (!await canAccess(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const profile = await database.collection('students').findOne({ userId: studentId }, { projection: { measurements: 1 } });
    return NextResponse.json({ measurements: (profile?.measurements || []).sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt)) });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as medidas.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const studentId = typeof payload.studentId === 'string' ? payload.studentId : typeof payload.student_id === 'string' ? payload.student_id : access.user.id;
    if (!idPattern.test(studentId)) return NextResponse.json({ error: 'Aluno inválido.' }, { status: 400 });
    const database = await getDatabase();
    if (!await canAccess(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const measurement = { id: randomUUID(), measuredAt: new Date(), createdBy: access.user.id };
    for (const field of fields) {
      const legacyField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      const value = payload[field] ?? payload[legacyField];
      if (value === undefined || value === null || value === '') continue;
      const number = normalizedMeasurement(field, value);
      if (number === null) return NextResponse.json({ error: `Medida inválida: ${field}.` }, { status: 400 });
      measurement[field] = number;
    }
    if (!Object.keys(measurement).some((key) => fields.includes(key))) return NextResponse.json({ error: 'Informe ao menos uma medida.' }, { status: 400 });
    const result = await database.collection('students').updateOne({ userId: studentId, active: true }, { $push: { measurements: { $each: [measurement], $slice: -100 } }, $set: { updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Perfil do aluno não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'record_measurements', resource: 'student', resourceId: studentId });
    return NextResponse.json({ measurement }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar as medidas.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const studentId = typeof payload.studentId === 'string' ? payload.studentId : access.user.id;
    const id = typeof payload.id === 'string' ? payload.id : '';
    if (!idPattern.test(studentId) || !idPattern.test(id)) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
    const database = await getDatabase();
    if (!await canAccess(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    const update = {};
    for (const field of fields) if (payload[field] !== undefined) {
      const value = normalizedMeasurement(field, payload[field]);
      if (value === null) return NextResponse.json({ error: `Medida inválida: ${field}.` }, { status: 400 });
      update[`measurements.$[item].${field}`] = value;
    }
    if (!Object.keys(update).length) return NextResponse.json({ error: 'Nenhuma medida informada.' }, { status: 400 });
    const profile = await database.collection('students').findOne({ userId: studentId, active: true, 'measurements.id': id }, { projection: { userId: 1 } });
    if (!profile) return NextResponse.json({ error: 'Registro de medidas não encontrado.' }, { status: 404 });
    const result = await database.collection('students').updateOne({ userId: studentId }, { $set: update }, { arrayFilters: [{ 'item.id': id }] });
    if (!result.matchedCount) return NextResponse.json({ error: 'Perfil do aluno não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'update_measurements', resource: 'student', resourceId: studentId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar as medidas.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const params = new URL(request.url).searchParams;
    const studentId = params.get('studentId') || access.user.id;
    const id = params.get('id');
    if (!idPattern.test(studentId) || !idPattern.test(id || '')) return NextResponse.json({ error: 'Identificadores inválidos.' }, { status: 400 });
    const database = await getDatabase();
    if (!await canAccess(database, access.user, studentId)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    await database.collection('students').updateOne({ userId: studentId }, { $pull: { measurements: { id } }, $set: { updatedAt: new Date() } });
    await writeAuditLog(database, { userId: access.user.id, action: 'delete_measurements', resource: 'student', resourceId: studentId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir as medidas.' }, { status: 500 });
  }
}
