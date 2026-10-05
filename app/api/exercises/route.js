import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff, requireUser } from '../../../lib/api-auth';
import { writeAuditLog } from '../../../lib/audit';
import { getDatabase } from '../../../lib/mongodb';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;
const text = (value, limit = 160) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const keyFor = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function GET() {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    const exercises = await database.collection('exercises').find({ active: true }).sort({ name: 1 }).toArray();
    return NextResponse.json({ exercises });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os exercícios.' }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const name = text(payload.name, 120);
    const muscleGroup = text(payload.muscleGroup ?? payload.muscle_group, 100);
    if (name.length < 2 || !muscleGroup) return NextResponse.json({ error: 'Informe o nome e o grupo muscular.' }, { status: 400 });
    const database = await getDatabase();
    const now = new Date();
    const exercise = {
      id: randomUUID(), name, nameKey: keyFor(name), muscleGroup,
      equipment: text(payload.equipment, 100), description: text(payload.description, 1000),
      instructions: text(payload.instructions, 3000), active: true, createdAt: now, updatedAt: now,
      createdBy: access.user.id,
    };
    await database.collection('exercises').insertOne(exercise);
    await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'exercise', resourceId: exercise.id });
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) return NextResponse.json({ error: 'Já existe um exercício com esse nome.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível cadastrar o exercício.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const id = text(payload.id, 64);
    if (!idPattern.test(id)) return NextResponse.json({ error: 'ID do exercício inválido.' }, { status: 400 });
    const fields = {};
    if (payload.name !== undefined) {
      fields.name = text(payload.name, 120);
      if (fields.name.length < 2) return NextResponse.json({ error: 'Nome do exercício inválido.' }, { status: 400 });
      fields.nameKey = keyFor(fields.name);
    }
    if (payload.muscleGroup !== undefined || payload.muscle_group !== undefined) fields.muscleGroup = text(payload.muscleGroup ?? payload.muscle_group, 100);
    for (const key of ['equipment', 'description', 'instructions']) if (payload[key] !== undefined) fields[key] = text(payload[key], key === 'instructions' ? 3000 : 1000);
    if (payload.active !== undefined) fields.active = payload.active === true;
    fields.updatedAt = new Date();

    const database = await getDatabase();
    const updated = await database.collection('exercises').findOneAndUpdate({ id }, { $set: fields }, { returnDocument: 'after' });
    if (!updated) return NextResponse.json({ error: 'Exercício não encontrado.' }, { status: 404 });
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'exercise', resourceId: id });
    return NextResponse.json({ exercise: updated });
  } catch (error) {
    if (error.code === 11000) return NextResponse.json({ error: 'Já existe um exercício com esse nome.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível atualizar o exercício.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!idPattern.test(id || '')) return NextResponse.json({ error: 'ID do exercício inválido.' }, { status: 400 });
    const database = await getDatabase();
    const inUse = await database.collection('workouts').countDocuments({ 'exercises.exerciseId': id });
    if (inUse) {
      await database.collection('exercises').updateOne({ id }, { $set: { active: false, updatedAt: new Date() } });
    } else {
      await database.collection('exercises').deleteOne({ id });
    }
    await writeAuditLog(database, { userId: access.user.id, action: inUse ? 'deactivate' : 'delete', resource: 'exercise', resourceId: id });
    return NextResponse.json({ message: inUse ? 'Exercício desativado (está em uso).' : 'Exercício excluído.' });
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir o exercício.' }, { status: 500 });
  }
}
