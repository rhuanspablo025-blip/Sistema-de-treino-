import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '../../../lib/auth';
import { isAdminRole, isSuperAdmin } from '../../../lib/roles';
import { normalizeUsername } from '../../../lib/usernames';
import { getFinancialAccess } from '../../../lib/finance-access';
import { listAdminUsers, findUserById, findUserByUsername, createStudentIdentity, createTrainerIdentity, createManagedIdentity, softDeleteIdentityUser, writeIdentityAudit } from '../../../lib/identity-repository.mjs';

export const runtime = 'nodejs';
const roles = new Set(['admin', 'dev', 'trainer', 'student']);
const text = (v, n = 160) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, roles: [u.role], active: u.active, tenantId: u.tenantId, phone: u.phone || null, goal: u.goal || null, trainerId: u.trainerId || null, cref: u.cref || null, createdAt: u.createdAt, updatedAt: u.updatedAt });

async function adminAccess() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (!isAdminRole(user.role)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const access = await adminAccess(); if (access.response) return access.response;
  try { const users = await listAdminUsers({ tenantId: isSuperAdmin(access.user) ? null : access.user.tenantId, includeSuperAdmin: isSuperAdmin(access.user) }); return NextResponse.json({ users: users.map(publicUser) }); }
  catch { return NextResponse.json({ error: 'Não foi possível carregar os usuários.' }, { status: 500 }); }
}

export async function POST(request) {
  const access = await adminAccess(); if (access.response) return access.response;
  try {
    const payload = await request.json(); const name = text(payload.name, 120); const username = normalizeUsername(text(payload.username, 32)); const password = typeof payload.password === 'string' ? payload.password : ''; const role = text(payload.role, 20); const tenantId = access.user.tenantId || 'default-tenant';
    if (!name || !username || !roles.has(role) || password.length < 8 || password !== payload.confirmPassword) return NextResponse.json({ error: 'Dados do usuário inválidos.' }, { status: 400 });
    if (role === 'SUPER_ADMIN' || payload.tenantId && payload.tenantId !== tenantId) return NextResponse.json({ error: 'Tenant ou role não permitidos.' }, { status: 403 });
    if (role === 'admin' && !isSuperAdmin(access.user) && access.user.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (await findUserByUsername(username)) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const passwordHash = await bcrypt.hash(password, 12); const trainerId = role === 'student' && text(payload.trainerId, 64) !== 'avulso' ? text(payload.trainerId, 64) || null : null;
    const user = role === 'trainer' ? await createTrainerIdentity({ name, username, passwordHash, cref: text(payload.cref, 40), tenantId }) : role === 'student' ? await createStudentIdentity({ name, username, passwordHash, phone: text(payload.phone, 40), goal: text(payload.goal, 240), trainerId, tenantId }) : await createManagedIdentity({ name, username, passwordHash, role, tenantId });
    await writeIdentityAudit({ tenantId, userId: access.user.id, action: 'USER_CREATED', resource: 'user', resourceId: user.id, metadata: { role, username } });
    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (error) { if (error.code === 'SQLITE_CONSTRAINT') return NextResponse.json({ error: 'Dados conflitantes.' }, { status: 409 }); return NextResponse.json({ error: 'Não foi possível criar o usuário.' }, { status: 500 }); }
}

export async function PATCH(request) {
  const access = await adminAccess(); if (access.response) return access.response;
  try {
    const payload = await request.json(); const id = text(payload.id, 64); const target = await findUserById(id); if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    if (!isSuperAdmin(access.user) && target.tenantId !== access.user.tenantId) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    if (target.role === 'SUPER_ADMIN' || text(payload.role, 20) === 'SUPER_ADMIN') return NextResponse.json({ error: 'A role SUPER_ADMIN é protegida.' }, { status: 403 });
    const client = await (await import('../../../lib/identity-repository.mjs')).ensureIdentitySchema(); const nextName = text(payload.name, 120) || target.name; const nextUsername = normalizeUsername(text(payload.username, 32) || target.username); const nextActive = typeof payload.active === 'boolean' ? payload.active : target.active; const nextRole = text(payload.role, 20) || target.role;
    if (!roles.has(nextRole)) return NextResponse.json({ error: 'Role inválida.' }, { status: 400 });
    const sensitive = nextRole !== target.role || nextActive !== target.active || typeof payload.password === 'string'; const hash = typeof payload.password === 'string' && payload.password ? await bcrypt.hash(payload.password, 12) : target.passwordHash; const sessionVersion = target.sessionVersion + (sensitive ? 1 : 0); const now = new Date().toISOString();
    await client.execute({ sql: 'UPDATE identity_users SET name=?, username=?, password_hash=?, role=?, active=?, session_version=?, updated_at=? WHERE id=? AND tenant_id=?', args: [nextName, nextUsername, hash, nextRole, nextActive ? 1 : 0, sessionVersion, now, id, target.tenantId] });
    if (nextRole === 'student') await client.execute({ sql: 'UPDATE student_profiles SET phone=?, goal=?, trainer_id=?, active=?, updated_at=? WHERE user_id=?', args: [text(payload.phone, 40) || null, text(payload.goal, 240) || null, text(payload.trainerId, 64) === 'avulso' ? null : text(payload.trainerId, 64) || null, nextActive ? 1 : 0, now, id] });
    await writeIdentityAudit({ tenantId: target.tenantId, userId: access.user.id, action: sensitive ? 'USER_UPDATED_SENSITIVE' : 'USER_UPDATED', resource: 'user', resourceId: id, metadata: { role: nextRole, active: nextActive } });
    return NextResponse.json({ user: publicUser({ ...target, name: nextName, username: nextUsername, role: nextRole, active: nextActive, sessionVersion, updatedAt: now }) });
  } catch { return NextResponse.json({ error: 'Não foi possível atualizar o usuário.' }, { status: 500 }); }
}

export async function DELETE(request) {
  const access = await adminAccess(); if (access.response) return access.response;
  try { const id = new URL(request.url).searchParams.get('id'); const target = await findUserById(id); if (!target || (!isSuperAdmin(access.user) && target.tenantId !== access.user.tenantId)) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 }); await softDeleteIdentityUser(id, access.user); return NextResponse.json({ ok: true }); }
  catch (error) { const status = error.message === 'IDENTITY_DELETE_FORBIDDEN' ? 403 : 500; return NextResponse.json({ error: status === 403 ? 'Não é possível excluir este usuário.' : 'Não foi possível desativar o usuário.' }, { status }); }
}
