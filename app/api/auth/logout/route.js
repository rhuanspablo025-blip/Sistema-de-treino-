import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../../lib/session';
import { getCurrentUser } from '../../../../lib/auth';
import { getDatabase } from '../../../../lib/mongodb';
import { writeAuditLog } from '../../../../lib/audit';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { getTursoClient } from '../../../../lib/mongodb';

export async function POST() {
  const user = await getCurrentUser();
  if (user?.identityV2) {
    try {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (token) await (await getTursoClient()).execute({ sql: 'UPDATE identity_sessions SET revoked_at=? WHERE user_id=? AND token_hash=? AND revoked_at IS NULL', args: [new Date().toISOString(), user.id, createHash('sha256').update(token).digest('hex')] });
    } catch { /* Cookie removal still completes if the session store is unavailable. */ }
  }
  if (user?.role === 'SUPER_ADMIN') {
    try { await writeAuditLog(await getDatabase(), { userId: user.id, action: 'super_admin_logout', resource: 'auth', resourceId: user.id }); }
    catch { /* Logout must clear the cookie even if audit storage is unavailable. */ }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
