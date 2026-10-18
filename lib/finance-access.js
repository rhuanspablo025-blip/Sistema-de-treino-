import { randomUUID } from 'node:crypto';
import { getDatabase } from './mongodb';
import { isSuperAdmin } from './roles';

const levelPriority = { CANCELLED: 5, TOTAL: 4, PARTIAL: 3, RESTRICTION: 2, WARNING: 1, ACTIVE: 0 };

export async function getFinancialAccess(user) {
  if (!user || isSuperAdmin(user) || user.financialAccessExempt === true) return { level: 'ACTIVE', blocked: false, restricted: false, exempt: Boolean(user) };
  const userIds = [...new Set([user.id, user.ownerAdminId].filter(Boolean))];
  const now = new Date();
  const database = await getDatabase();
  const [blocks, invoice, rules] = await Promise.all([database.collection('access_blocks').find({
    userId: { $in: userIds }, status: 'ACTIVE',
    $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }],
  }).toArray(), database.collection('invoices').findOne({ payerUserId: user.id, status: { $in: ['PENDING', 'AWAITING_PAYMENT'] }, dueAt: { $gte: now } }, { sort: { dueAt: 1 } }), database.collection('billing_rules').findOne({ id: 'global' })]);
  const expiredTest = await database.collection('subscriptions').findOne({ accountUserId: user.id, billingPeriod: 'test', status: 'ACTIVE', nextDueAt: { $lte: now } });
  if (expiredTest) return { level: 'TOTAL', blocked: true, restricted: false, reason: 'Seu acesso de teste de 1 dia terminou. Fale com o responsável para vincular um plano.' };
  const selected = blocks.sort((left, right) => (levelPriority[right.level] || 0) - (levelPriority[left.level] || 0))[0];
  const noticeDays = Math.max(0, Number(rules?.noticeDays ?? 5));
  const daysUntilDue = invoice ? Math.ceil((new Date(invoice.dueAt).getTime() - now.getTime()) / 86400000) : null;
  if (invoice && daysUntilDue <= noticeDays) {
    const dedupeKey = `invoice:${invoice.id}:due-soon`;
    await database.collection('notifications').updateOne({ dedupeKey }, { $setOnInsert: {
      id: randomUUID(), dedupeKey, userId: user.id, type: 'BILLING_DUE_SOON', channel: 'system', invoiceId: invoice.id,
      title: 'Vencimento próximo', message: `Sua cobrança vence em ${daysUntilDue} dia(s), no dia ${new Date(invoice.dueAt).toLocaleDateString('pt-BR')}.`, readAt: null, createdAt: now,
    } }, { upsert: true });
    if (!selected) return { level: 'WARNING', blocked: false, restricted: false, invoiceId: invoice.id, dueAt: invoice.dueAt, daysUntilDue, reason: 'Sua cobrança está próxima do vencimento.' };
  }
  if (!selected) return { level: 'ACTIVE', blocked: false, restricted: false };
  return {
    id: selected.id,
    level: selected.level,
    blocked: ['TOTAL', 'CANCELLED'].includes(selected.level),
    restricted: ['RESTRICTION', 'PARTIAL'].includes(selected.level),
    total: ['TOTAL', 'CANCELLED'].includes(selected.level),
    reason: selected.reason || 'Cobrança pendente.',
    endsAt: selected.endsAt || null,
    invoiceId: selected.invoiceId || null,
  };
}
