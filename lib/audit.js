import { randomUUID } from 'node:crypto';

function removeSecrets(value) {
  if (Array.isArray(value)) return value.map(removeSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(password|token|secret|hash|uri|credential)/i.test(key))
    .map(([key, item]) => [key, removeSecrets(item)]));
}

export async function writeAuditLog(database, { userId, action, resource, resourceId = null, metadata = {}, session }) {
  const options = session ? { session } : {};
  await database.collection('audit_logs').insertOne({
    id: randomUUID(),
    userId,
    action,
    resource,
    resourceId,
    timestamp: new Date(),
    metadata: removeSecrets(metadata),
  }, options);
}
