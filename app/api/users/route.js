import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '../../../lib/auth';
import { writeAuditLog } from '../../../lib/audit';
import { getDatabase, getMongoClient } from '../../../lib/mongodb';
import { normalizeUsername } from '../../../lib/usernames';
import { isAdminRole, isSuperAdmin } from '../../../lib/roles';
import { getFinancialAccess } from '../../../lib/finance-access';

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
  return { id: user.id, username: user.username, name: user.name, role: user.role, roles: Array.isArray(user.roles) ? user.roles : [user.role], active: user.active, financialAccessExempt: user.financialAccessExempt === true, deletedAt: user.deletedAt || null, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

function requestedRoles(payload, fallback = 'student') {
  if (Array.isArray(payload.roles)) return payload.roles.length && payload.roles.every((role) => typeof role === 'string' && validRoles.has(role)) ? [...new Set(payload.roles)] : [];
  const role = text(payload.role, 20) || fallback;
  return validRoles.has(role) ? [role] : [];
}
function primaryRole(roles) { return ['admin', 'dev', 'trainer', 'student'].find((role) => roles.includes(role)); }

function profileDocument(user, payload = {}, existing = {}) {
  const now = new Date();
  if (user.role === 'student') return {
    id: user.id,
    userId: user.id,
    name: user.name,
    phone: text(payload.phone ?? existing.phone, 40),
    dateOfBirth: text(payload.dateOfBirth ?? existing.dateOfBirth, 20) || null,
    goal: text(payload.goal ?? existing.goal, 240),
    trainerId: text(payload.trainerId ?? existing.trainerId, 64) === 'avulso' ? null : text(payload.trainerId ?? existing.trainerId, 64) || null,
    measurements: existing.measurements || [],
    ownerAdminId: text(payload.ownerAdminId ?? existing.ownerAdminId, 64) || null,
    active: user.active,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  if (user.role === 'trainer') return {
    id: user.id,
    userId: user.id,
    name: user.name,
    cref: text(payload.cref ?? existing.cref, 40),
    ownerAdminId: text(payload.ownerAdminId ?? existing.ownerAdminId, 64) || null,
    active: user.active,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
  return null;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (!isAdminRole(user.role)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    const roleFilter = isSuperAdmin(access.user) ? {} : { role: { $ne: 'SUPER_ADMIN' } };
    const users = await database.collection('users').find(roleFilter, { projection: { id: 1, username: 1, name: 1, role: 1, roles: 1, active: 1, financialAccessExempt: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1 }).limit(1000).toArray();
    const userIds = users.map((user) => user.id);
    const [students, trainers, allStudents, allTrainers] = await Promise.all([
      database.collection('students').find({ userId: { $in: userIds } }, { projection: { _id: 0, userId: 1, phone: 1, dateOfBirth: 1, goal: 1, trainerId: 1 } }).toArray(),
      database.collection('trainers').find({ userId: { $in: userIds } }, { projection: { _id: 0, userId: 1, cref: 1 } }).toArray(),
      database.collection('students').find({}, { projection: { _id: 0, userId: 1, name: 1, phone: 1, dateOfBirth: 1, goal: 1, trainerId: 1, ownerAdminId: 1, active: 1, deletedAt: 1 } }).limit(2000).toArray(),
      database.collection('trainers').find({}, { projection: { _id: 0, userId: 1, name: 1, cref: 1, ownerAdminId: 1, active: 1, deletedAt: 1 } }).limit(1000).toArray(),
    ]);
    const profiles = new Map([...students, ...trainers].map((profile) => [profile.userId, profile]));
    const studentProfiles = new Map(allStudents.map((profile) => [profile.userId, profile]));
    const trainerProfiles = new Map(allTrainers.map((profile) => [profile.userId, profile]));
    const visibleUsers = users.map((user) => {
      const studentProfile = studentProfiles.get(user.id);
      const trainerProfile = trainerProfiles.get(user.id);
      const profile = profiles.get(user.id) || {};
      return {
        ...(studentProfile || trainerProfile || profile),
        ...publicUser({ ...user, roles: user.roles || [...new Set([...(studentProfile ? ['student'] : []), ...(trainerProfile ? ['trainer'] : []), user.role].filter(Boolean))] }),
      };
    });
    const knownIds = new Set(userIds);
    for (const [role, directory] of [['student', allStudents], ['trainer', allTrainers]]) {
      for (const profile of directory) {
        if (!profile.userId || knownIds.has(profile.userId)) continue;
        visibleUsers.push({
          id: profile.userId,
          username: '',
          name: profile.name || (role === 'student' ? 'Aluno sem conta de acesso' : 'Professor sem conta de acesso'),
          role,
          active: profile.active !== false,
          deletedAt: profile.deletedAt || null,
          needsAccount: true,
          ...profile,
        });
        knownIds.add(profile.userId);
      }
    }
    visibleUsers.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    return NextResponse.json({ users: visibleUsers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os usuários.' }, { status: 500 });
  }
}

export async function POST(request) {
  const creator = await getCurrentUser();
  if (!creator) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const financialAccess = await getFinancialAccess(creator);
  if (financialAccess.blocked || financialAccess.restricted) return NextResponse.json({ error: 'Conta restrita por pendência financeira.' }, { status: 423 });
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'Dados do usuário inválidos.' }, { status: 400 });
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const normalizedUsername = normalizeUsername(username);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const roles = requestedRoles(payload);
    const role = primaryRole(roles);
    if (typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > 120 || typeof payload.username !== 'string' || payload.username.trim().length > 30 || name.length < 2 || !normalizedUsername) return NextResponse.json({ error: 'Informe nome com até 120 caracteres e usuário válido (3 a 30 caracteres).'}, { status: 400 });
    if (!role) return NextResponse.json({ error: 'Selecione pelo menos um perfil válido.' }, { status: 400 });
    if (!validDate(text(payload.dateOfBirth, 20))) return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
    if (['phone', 'goal', 'cref', 'trainerId'].some((key) => payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].length > ({ phone: 40, goal: 240, cref: 40, trainerId: 64 }[key])))) return NextResponse.json({ error: 'Telefone, objetivo, CREF ou personal excede o limite permitido.' }, { status: 400 });
    if (!isAdminRole(creator.role) && !(creator.role === 'trainer' && roles.length === 1 && roles[0] === 'student')) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' }, { status: 400 });
    if (password !== payload.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    if (await database.collection('users').findOne({ username: normalizedUsername })) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const requestedTrainerId = roles.includes('student') && creator.role === 'trainer' ? creator.id : text(payload.trainerId, 64);
    if (roles.includes('student') && roles.includes('trainer') && !requestedTrainerId) { /* self-training profile remains avulso */ }
    else if (roles.includes('student') && creator.role !== 'trainer' && (!Object.prototype.hasOwnProperty.call(payload, 'trainerId') || !requestedTrainerId)) return NextResponse.json({ error: 'Selecione um personal ou marque aluno avulso, sem personal.' }, { status: 400 });
    if (roles.includes('student') && requestedTrainerId && requestedTrainerId !== 'avulso' && !await database.collection('trainers').findOne({ userId: requestedTrainerId, active: true })) return NextResponse.json({ error: 'Personal não encontrado.' }, { status: 400 });
    if (creator.role === 'trainer' && !await database.collection('trainers').findOne({ userId: creator.id, active: true })) return NextResponse.json({ error: 'Perfil de professor não encontrado.' }, { status: 403 });
    const now = new Date();
    const userId = randomUUID();
    const ownerAdminId = roles.includes('admin')
      ? (creator.role === 'SUPER_ADMIN' ? userId : creator.role === 'admin' ? creator.id : null)
      : creator.role === 'trainer'
        ? (creator.ownerAdminId || creator.id)
        : creator.role === 'admin' ? creator.id : null;
    if (payload.active !== undefined && typeof payload.active !== 'boolean') return NextResponse.json({ error: 'Status de usuário inválido.' }, { status: 400 });
    const user = { id: userId, name, username: normalizedUsername, ownerAdminId, passwordHash: await bcrypt.hash(password, 12), role, roles, financialAccessExempt: roles.some((item) => ['admin','dev'].includes(item)) && payload.financialAccessExempt === true, active: payload.active !== false, sessionVersion: 0, createdAt: now, updatedAt: now };
    const ownerPayload = { ...payload, ownerAdminId };
    await database.collection('users').insertOne(user);
    try {
      if (roles.includes('student')) await database.collection('students').insertOne(profileDocument({ ...user, role: 'student' }, { ...ownerPayload, trainerId: requestedTrainerId === 'avulso' ? null : requestedTrainerId || null }));
      if (roles.includes('trainer')) await database.collection('trainers').insertOne(profileDocument({ ...user, role: 'trainer' }, ownerPayload));
      await writeAuditLog(database, { userId: creator.id, action: 'create', resource: 'user', resourceId: user.id, metadata: { role, roles, username: normalizedUsername } });
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
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'Dados do usuário inválidos.' }, { status: 400 });
    const id = text(payload.id, 64);
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const normalizedUsername = normalizeUsername(username);
    const roles = requestedRoles(payload, 'student');
    const role = primaryRole(roles);
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > 120 || typeof payload.username !== 'string' || payload.username.trim().length > 30 || name.length < 2 || !normalizedUsername || !role) return NextResponse.json({ error: 'Dados do usuário inválidos. Verifique o nome, usuário e perfis.' }, { status: 400 });
    if (!validDate(text(payload.dateOfBirth, 20))) return NextResponse.json({ error: 'Data de nascimento inválida.' }, { status: 400 });
    if (['phone', 'goal', 'cref', 'trainerId'].some((key) => payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].length > ({ phone: 40, goal: 240, cref: 40, trainerId: 64 }[key])))) return NextResponse.json({ error: 'Telefone, objetivo, CREF ou personal excede o limite permitido.' }, { status: 400 });
    if (password && (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' }, { status: 400 });
    if (password && password !== payload.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    const users = database.collection('users');
    if (await users.findOne({ username: normalizedUsername, id: { $ne: id } })) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const existing = await users.findOne({ id });
    if (!existing) {
      const students = database.collection('students');
      const profile = await students.findOne({ userId: id });
      if (!profile || !roles.includes('student')) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
      if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'Defina uma senha com pelo menos 8 caracteres e no máximo 72 bytes para ativar o acesso.' }, { status: 400 });
      if (password !== payload.confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });
      if (payload.active !== undefined && typeof payload.active !== 'boolean') return NextResponse.json({ error: 'Status de usuário inválido.' }, { status: 400 });
      const now = new Date();
      const user = { id, name, username: normalizedUsername, ownerAdminId: profile.ownerAdminId || access.user.id, passwordHash: await bcrypt.hash(password, 12), role, roles, active: payload.active !== false, sessionVersion: 0, createdAt: profile.createdAt || now, updatedAt: now };
      if (!Object.prototype.hasOwnProperty.call(payload, 'trainerId') || !text(payload.trainerId, 64)) return NextResponse.json({ error: 'Selecione um personal ou marque aluno avulso, sem personal.' }, { status: 400 });
      const requestedTrainerId = text(payload.trainerId, 64);
      if (requestedTrainerId && requestedTrainerId !== 'avulso' && !await database.collection('trainers').findOne({ userId: requestedTrainerId, active: true })) return NextResponse.json({ error: 'Personal não encontrado.' }, { status: 400 });
      const trainerId = requestedTrainerId === 'avulso' ? null : requestedTrainerId || null;
      if (trainerId && !await database.collection('trainers').findOne({ userId: trainerId, active: true })) return NextResponse.json({ error: 'Personal não encontrado.' }, { status: 400 });
      await users.insertOne(user);
      await students.updateOne({ userId: id }, { $set: profileDocument({ ...user, role: 'student' }, { ...payload, trainerId }, profile) });
      if (roles.includes('trainer')) await database.collection('trainers').updateOne({ userId: id }, { $set: profileDocument({ ...user, role: 'trainer' }, payload, {}) }, { upsert: true });
      await writeAuditLog(database, { userId: access.user.id, action: 'create', resource: 'user', resourceId: id, metadata: { role: 'student', username: normalizedUsername, restoredProfile: true } });
      return NextResponse.json({ user: publicUser(user) }, { status: 201 });
    }
    if (existing.deletedAt) return NextResponse.json({ error: 'Este cadastro foi excluído e não pode mais ser alterado.' }, { status: 410 });
    if (existing.role === 'SUPER_ADMIN' || role === 'SUPER_ADMIN') return NextResponse.json({ error: 'A role SUPER_ADMIN é protegida e não pode ser alterada por esta API.' }, { status: 403 });
    if (payload.active !== undefined && typeof payload.active !== 'boolean') return NextResponse.json({ error: 'Status de usuário inválido.' }, { status: 400 });
    const updated = { ...existing, name, username: normalizedUsername, role, roles, financialAccessExempt: roles.some((item) => ['admin','dev'].includes(item)) && payload.financialAccessExempt === true, active: payload.active === undefined ? existing.active !== false : payload.active, updatedAt: new Date() };
    if (existing.role !== role || (existing.active !== false) !== updated.active) updated.sessionVersion = (existing.sessionVersion || 0) + 1;
    if (password) {
      updated.passwordHash = await bcrypt.hash(password, 12);
      updated.sessionVersion = (existing.sessionVersion || 0) + 1;
    }
    delete updated._id;

    const students = database.collection('students');
    const trainers = database.collection('trainers');
    const priorStudent = await students.findOne({ userId: id });
    const priorTrainer = await trainers.findOne({ userId: id });
    let trainerId = payload.trainerId;
    if (roles.includes('student')) {
      if (!Object.prototype.hasOwnProperty.call(payload, 'trainerId')) return NextResponse.json({ error: 'Selecione um personal ou marque aluno avulso, sem personal.' }, { status: 400 });
      trainerId = text(payload.trainerId, 64);
      if (trainerId && trainerId !== 'avulso' && !await trainers.findOne({ userId: trainerId, active: true })) return NextResponse.json({ error: 'Personal não encontrado.' }, { status: 400 });
      if (trainerId === 'avulso') trainerId = null;
    }
    await users.replaceOne({ id }, updated);
    if (roles.includes('student')) await students.updateOne({ userId: id }, { $set: profileDocument({ ...updated, role: 'student' }, { ...payload, trainerId }, priorStudent || {}) }, { upsert: true });
    else if (priorStudent) await students.updateOne({ userId: id }, { $set: { active: false, updatedAt: new Date() } });
    if (roles.includes('trainer')) await trainers.updateOne({ userId: id }, { $set: profileDocument({ ...updated, role: 'trainer' }, payload, priorTrainer || {}) }, { upsert: true });
    else if (priorTrainer) await trainers.updateOne({ userId: id }, { $set: { active: false, updatedAt: new Date() } });
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'user', resourceId: id, metadata: { role, roles, active: updated.active } });
    if (JSON.stringify(existing.roles || [existing.role]) !== JSON.stringify(roles)) await writeAuditLog(database, { userId: access.user.id, action: 'permission_change', resource: 'user', resourceId: id, metadata: { previousRoles: existing.roles || [existing.role], roles } });
    if (password) await writeAuditLog(database, { userId: access.user.id, action: 'password_change', resource: 'user', resourceId: id, metadata: { accountUsername: normalizedUsername } });
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
    const target = await database.collection('users').findOne({ id }, { projection: { role: 1, roles: 1 } });
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (target?.role === 'SUPER_ADMIN') return NextResponse.json({ error: 'A conta proprietária não pode ser desativada por esta API.' }, { status: 403 });
    const now = new Date();
    const client = await getMongoClient('accounts');
    const session = client.startSession();
    let studentProfile = null;
    try {
      await session.withTransaction(async () => {
        studentProfile = await database.collection('students').findOne({ userId: id }, { session, projection: { name: 1 } });
        await database.collection('students').updateMany({ trainerId: id }, { $set: { trainerId: null, updatedAt: now } }, { session });
        await database.collection('users').deleteOne({ id }, { session });
        await database.collection('students').deleteOne({ userId: id }, { session });
        await database.collection('trainers').deleteOne({ userId: id }, { session });
      });
    } finally { await session.endSession(); }
    // As fichas ficam em outro cluster (training), então o ajuste do nome do aluno
    // é feito fora da transação: o MongoDB não suporta transações entre clusters.
    if (studentProfile) {
      await database.collection('workout_plans').updateMany({ studentId: id }, { $set: { studentNameSnapshot: studentProfile.name || '' } });
    }
    await writeAuditLog(database, { userId: access.user.id, action: 'delete', resource: 'user', resourceId: id, metadata: { removedRoles: target.roles || [target.role], relatedWorkoutAndFinancialHistoryPreserved: true } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Não foi possível desativar o usuário.' }, { status: 500 });
  }
}
