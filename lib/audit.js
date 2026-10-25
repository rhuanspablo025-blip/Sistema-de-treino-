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
async function pruneAuditLogs(collection) {
  const total = await collection.countDocuments();
  if (total <= MAX_AUDIT_LOGS) return;

  const excess = total - MAX_AUDIT_LOGS;
  const oldest = await collection
    .find({}, { projection: { _id: 1 } })
    .sort({ timestamp: 1 })
    .limit(excess)
    .toArray();

  if (oldest.length) {
    await collection.deleteMany({ _id: { $in: oldest.map((log) => log._id) } });
  }
}

// O log de auditoria vive sempre no cluster de cadastros (accounts) e é gravado
// fora de transações: o MongoDB não permite transações entre clusters, e as
// transações do sistema são abertas nos clusters de treinos e financeiro.
export async function writeAuditLog(_database, { userId, action, resource, resourceId = null, metadata = {} }) {
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
  });
  await pruneAuditLogs(collection);
}
