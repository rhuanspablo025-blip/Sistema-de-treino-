import { NextResponse } from 'next/server';
import { getCurrentUser, isStaff } from './auth';

export async function requireUser() {
  const user = await getCurrentUser();
  return user
    ? { user }
    : { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
}

export async function requireStaff() {
  const access = await requireUser();
  if (access.response) return access;
  if (!isStaff(access.user)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return access;
}

export async function requireAdmin() {
  const access = await requireUser();
  if (access.response) return access;
  if (!['admin', 'dev'].includes(access.user.role)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return access;
}
