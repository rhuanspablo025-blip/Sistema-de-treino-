import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/session';
import { getCurrentUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/mongodb';
import { writeAuditLog } from '../../../../lib/audit';

export async function POST() {
  const user = await getCurrentUser();
  if (user?.role === 'SUPER_ADMIN') {
    try { await writeAuditLog(await getDatabase(), { userId: user.id, action: 'super_admin_logout', resource: 'auth', resourceId: user.id }); }
    catch { /* Logout must clear the cookie even if audit storage is unavailable. */ }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
