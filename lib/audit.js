import { randomUUID } from 'node:crypto';
import { getDatabase } from './mongodb.js';

function removeSecrets(value) {
  if (Array.isArray(value)) return value.map(removeSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(password|token|secret|hash|uri|credential)/i.test(key))
    .map(([key, item]) => [key, removeSecrets(item)]));
}

// O log de auditoria vive sempre no cluster de cadastros (accounts) e é gravado
// fora de transações: o MongoDB não permite transações entre clusters, e as
// transações do sistema são abertas nos clusters de treinos e financeiro.
export async function writeAuditLog(_database, { userId, action, resource, resourceId = null, metadata = {} }) {
  const database = await getDatabase('accounts');
  await database.collection('audit_logs').insertOne({
    id: randomUUID(),
    userId,
    action,
    resource,
    resourceId,
    timestamp: new Date(),
    metadata: removeSecrets(metadata),
  });
}
