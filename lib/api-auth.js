import { NextResponse } from 'next/server';
import { getCurrentUser, isStaff } from './auth';
import { isAdminRole, isSuperAdmin } from './roles';
import { getFinancialAccess } from './finance-access';

export async function requireUser({ allowBlocked = false } = {}) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const financialAccess = await getFinancialAccess(user);
  if (!allowBlocked && financialAccess.blocked) return { response: NextResponse.json({ error: 'Acesso temporariamente restrito por pendência financeira.', access: financialAccess }, { status: 423 }) };
  return { user, financialAccess };
}

export async function requireStaff() {
  const access = await requireUser();
  if (access.response) return access;
  if (access.financialAccess.restricted) return { response: NextResponse.json({ error: 'Esta ação está restrita por pendência financeira.', access: access.financialAccess }, { status: 423 }) };
  if (!isStaff(access.user)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return access;
}

export async function requireAdmin() {
  const access = await requireUser();
  if (access.response) return access;
  if (access.financialAccess.restricted) return { response: NextResponse.json({ error: 'Esta ação está restrita por pendência financeira.', access: access.financialAccess }, { status: 423 }) };
  if (!isAdminRole(access.user.role)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return access;
}

export async function requireSuperAdmin() {
  const access = await requireUser();
  if (access.response) return access;
  if (!isSuperAdmin(access.user)) return { response: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) };
  return access;
}
