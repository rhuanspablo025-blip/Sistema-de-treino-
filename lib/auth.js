import { cookies } from 'next/headers';
import { getDatabase, getTursoClient } from './mongodb';
import { SESSION_COOKIE, verifySession } from './session';
import { isStaffRole } from './roles';
import { createHash } from 'node:crypto';

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.sub) return null;

  const database = await getDatabase();
  const user = await database.collection('users').findOne({ id: session.sub });
  if (user) {
    if (user.active === false || (user.sessionVersion || 0) !== (session.sessionVersion || 0)) return null;
    return user;
  }
  const client = await getTursoClient();
  const identity = await client.execute({ sql: `SELECT id,full_name,username,role,status FROM identity_users WHERE id=?`, args: [session.sub] });
  const row = identity.rows[0];
  if (!row || row.status !== 'ACTIVE' || session.role !== (row.role === 'PERSONAL' ? 'trainer' : 'student')) return null;
  const sessionRow = await client.execute({ sql: 'SELECT id FROM identity_sessions WHERE user_id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>? LIMIT 1', args: [row.id, createHash('sha256').update(cookieStore.get(SESSION_COOKIE)?.value || '').digest('hex'), new Date().toISOString()] });
  if (!sessionRow.rows[0]) return null;
  return { id: row.id, name: row.full_name, username: row.username, role: session.role, active: true, sessionVersion: 0, identityV2: true };
}

export function isStaff(user) {
  return isStaffRole(user?.role);
}
