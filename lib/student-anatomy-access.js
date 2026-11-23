import { getTursoClient } from './mongodb';
import { resolveAuthenticatedIdentity, canManageStudent } from './identity-authorization.mjs';
import { hasAnyRole, isAdminUser } from './user-roles';

export async function canAccessAnatomy(database, user, studentId) {
  if (user.identityV2) {
    const client = await getTursoClient();
    const actor = await resolveAuthenticatedIdentity(client, user);
    return actor.role === 'ALUNO' && actor.id === studentId || canManageStudent(client, actor, studentId);
  }
  const student = await database.collection('students').findOne({ userId: studentId, active: true });
  if (!student) return false;
  return (hasAnyRole(user, ['student']) && user.id === studentId)
    || (hasAnyRole(user, ['trainer']) && student.trainerId === user.id)
    || (isAdminUser(user) && (student.ownerAdminId === user.id || Boolean(user.tenantId && user.tenantId === student.tenantId)));
}

// Migrated students keep their previous history. V2-only accounts can record
// measurements without creating a second student identity.
export async function measurementStore(database, studentId) {
  const profiles = database.collection('body_measurement_profiles');
  const query = { userId: studentId, active: true };
  if (!await profiles.findOne(query) && await database.collection('students').findOne(query)) {
    return { records: database.collection('students'), query, upsert: false };
  }
  return { records: profiles, query, upsert: true };
}
