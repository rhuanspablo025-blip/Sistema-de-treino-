import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/api-auth';
import { SYSTEM_DOCUMENTATION } from '../../../lib/system-documentation';

export const runtime = 'nodejs';

export async function GET() {
  const access = await requireUser({ allowBlocked: true });
  if (access.response) return access.response;

  const roles = access.user.roles || [access.user.role];
  if (!roles.some((role) => ['admin', 'SUPER_ADMIN'].includes(role))) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  return NextResponse.json({ markdown: SYSTEM_DOCUMENTATION });
}
