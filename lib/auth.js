import { cookies } from 'next/headers';
import { getDatabase } from './mongodb';
import { SESSION_COOKIE, verifySession } from './session';
import { isStaffRole } from './roles';

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.sub) return null;

  const database = await getDatabase();
  const user = await database.collection('users').findOne({ id: session.sub });
  if (!user || user.active === false || (user.sessionVersion || 0) !== (session.sessionVersion || 0)) return null;
  return user;
}

export function isStaff(user) {
  return isStaffRole(user?.role);
}
