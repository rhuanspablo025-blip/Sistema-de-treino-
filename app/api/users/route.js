import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '../../../lib/auth';
import { writeAuditLog } from '../../../lib/audit';
import { getDatabase } from '../../../lib/mongodb';
import { normalizeUsername } from '../../../lib/usernames';

export const runtime = 'nodejs';
const validRoles = new Set(['admin', 'dev', 'trainer', 'student']);

function text(value, maximumLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
}

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date();
}

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

function profileDocument(user, payload = {}, existing = {}) {
  const now = new Date();
  if (user.role === 'student') return {
    id: user.id,
    userId: user.id,
    name: user.name,
    phone: text(payload.phone ?? existing.phone, 40),
    dateOfBirth: text(payload.dateOfBirth ?? existing.dateOfBirth, 20) || null,
    goal: text(payload.goal ?? existing.goal, 240),
    trainerId: text(payload.trainerId ?? existing.trainerId, 64) || null,
    measurements: existing.measurements || [],
    active: user.active,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  if (user.role === 'trainer') return {
    id: user.id,
    userId: user.id,
    name: user.name,
    cref: text(payload.cref ?? existing.cref, 40),
    active: user.active,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  return null;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (!['admin', 'dev'].includes(user.role)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    const users = await database.collection('users').find({}, { projection: { id: 1, username: 1, name: 1, role: 1, active: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(1000).toArray();
    return NextResponse.json({ users: users.map(publicUser) });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os usuários.' }, { status: 500 });
  }
}

export async function POST(request) {
  const creator = await getCurrentUser();
  if (!creator) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  try {
    const payload = await request.json();
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const normalizedUsername = normalizeUsername(username);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const role = text(payload.role, 20) || 'student';
    if (name.length < 2 || !normalizedUsername) return NextResponse.json({ error: 'Informe nome e usuário válidos (3 a 30 caracteres).'}, { status: 400 });
    if (!validRoles.has(role)) return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 });
    if (!validDate(text(payload.dateOfBirth, 20))) return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
    if (!['admin', 'dev'].includes(creator.role) && !(creator.role === 'trainer' && role === 'student')) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' }, { status: 400 });
    if (password !== payload.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    if (await database.collection('users').findOne({ username: normalizedUsername })) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const requestedTrainerId = text(payload.trainerId, 64);
    if (role === 'student' && requestedTrainerId && !await database.collection('trainers').findOne({ userId: requestedTrainerId, active: true })) return NextResponse.json({ error: 'Professor não encontrado.' }, { status: 400 });
    if (creator.role === 'trainer' && !await database.collection('trainers').findOne({ userId: creator.id, active: true })) return NextResponse.json({ error: 'Perfil de professor não encontrado.' }, { status: 403 });
    const now = new Date();
    const user = { id: randomUUID(), name, username: normalizedUsername, passwordHash: await bcrypt.hash(password, 12), role, active: payload.active !== false, sessionVersion: 0, createdAt: now, updatedAt: now };
    await database.collection('users').insertOne(user);
    try {
      if (role === 'student') await database.collection('students').insertOne(profileDocument(user, { ...payload, trainerId: payload.trainerId || (creator.role === 'trainer' ? creator.id : '') }));
      if (role === 'trainer') await database.collection('trainers').insertOne(profileDocument(user, payload));
      await writeAuditLog(database, { userId: creator.id, action: 'create', resource: 'user', resourceId: user.id, metadata: { role, username: normalizedUsername } });
    } catch (error) {
      await database.collection('users').deleteOne({ id: user.id });
      await database.collection('students').deleteOne({ userId: user.id });
      await database.collection('trainers').deleteOne({ userId: user.id });
      throw error;
    }
    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível criar o usuário.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const id = text(payload.id, 64);
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const normalizedUsername = normalizeUsername(username);
    const role = text(payload.role, 20);
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || name.length < 2 || !normalizedUsername || !validRoles.has(role)) return NextResponse.json({ error: 'Dados do usuário inválidos.' }, { status: 400 });
    if (!validDate(text(payload.dateOfBirth, 20))) return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
    if (password && (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' }, { status: 400 });
    if (password && password !== payload.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    const users = database.collection('users');
    if (await users.findOne({ username: normalizedUsername, id: { $ne: id } })) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const existing = await users.findOne({ id });
    if (!existing) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    const updated = { ...existing, name, username: normalizedUsername, role, active: payload.active !== false, updatedAt: new Date() };
    if (password) {
      updated.passwordHash = await bcrypt.hash(password, 12);
      updated.sessionVersion = (existing.sessionVersion || 0) + 1;
    }
    delete updated._id;

    const students = database.collection('students');
    const trainers = database.collection('trainers');
    const priorStudent = await students.findOne({ userId: id });
    const priorTrainer = await trainers.findOne({ userId: id });
    if (role === 'student' && payload.trainerId) {
      const trainer = await trainers.findOne({ userId: text(payload.trainerId, 64), active: true });
      if (!trainer) return NextResponse.json({ error: 'Professor não encontrado.' }, { status: 400 });
    }
    await users.replaceOne({ id }, updated);
    await students.deleteOne({ userId: id });
    await trainers.deleteOne({ userId: id });
    if (role === 'student') await students.insertOne(profileDocument(updated, payload, priorStudent || {}));
    if (role === 'trainer') await trainers.insertOne(profileDocument(updated, payload, priorTrainer || {}));
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'user', resourceId: id, metadata: { role, active: updated.active } });
    return NextResponse.json({ user: publicUser(updated) });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    return NextResponse.json({ error: 'Não foi possível atualizar o usuário.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id || id === access.user.id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Não é possível excluir este usuário.' }, { status: 400 });
    const database = await getDatabase();
    const result = await database.collection('users').updateOne({ id }, { $set: { active: false, updatedAt: new Date() } });
    if (!result.matchedCount) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    await database.collection('students').updateOne({ userId: id }, { $set: { active: false, updatedAt: new Date() } });
    await database.collection('trainers').updateOne({ userId: id }, { $set: { active: false, updatedAt: new Date() } });
    await writeAuditLog(database, { userId: access.user.id, action: 'deactivate', resource: 'user', resourceId: id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível desativar o usuário.' }, { status: 500 });
  }
}
