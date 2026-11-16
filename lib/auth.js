import { cookies } from 'next/headers';
import { findUserById } from './identity-repository.mjs';
import { SESSION_COOKIE, verifySession } from './session';
import { isStaffRole } from './roles';

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.sub) return null;

  const user = await findUserById(session.sub);
  if (!user || user.active === false || (user.sessionVersion || 0) !== (session.sessionVersion || 0)) return null;
  return user;
}

export function isStaff(user) {
  return isStaffRole(user?.role);
}
