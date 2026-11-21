import { randomUUID } from 'node:crypto';
import { getDatabase } from './mongodb.js';

function removeSecrets(value) {
  if (Array.isArray(value)) return value.map(removeSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(password|token|secret|hash|uri|credential)/i.test(key))
    .map(([key, item]) => [key, removeSecrets(item)]));
}

// Limite de retenção dos logs de auditoria: mantém apenas os 50 mais recentes.
const MAX_AUDIT_LOGS = 50;

// Remove os logs mais antigos quando o total ultrapassa o limite,
// garantindo que o mais antigo seja excluído automaticamente a cada gravação.
async function pruneAuditLogs(collection, session) {
  const total = await collection.countDocuments({}, { session });
  if (total <= MAX_AUDIT_LOGS) return;

  const excess = total - MAX_AUDIT_LOGS;
  const oldest = await collection
    .find({}, { projection: { _id: 1 }, session })
    .sort({ timestamp: 1 })
    .limit(excess)
    .toArray();

  if (oldest.length) {
    await collection.deleteMany({ _id: { $in: oldest.map((log) => log._id) } }, { session });
  }
}

// No adaptador Turso os domínios compartilham o mesmo banco. A auditoria usa a
// transação recebida para evitar uma segunda escrita concorrente no SQLite.
export async function writeAuditLog(_database, { userId, action, resource, resourceId = null, metadata = {}, session = null }) {
  const database = await getDatabase('accounts');
  const collection = database.collection('audit_logs');
  await collection.insertOne({
    id: randomUUID(),
    userId,
    action,
    resource,
    resourceId,
    timestamp: new Date(),
    metadata: removeSecrets(metadata),
  }, { session });
  await pruneAuditLogs(collection, session);
}
