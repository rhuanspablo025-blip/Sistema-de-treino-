import { getDatabase } from './mongodb';
import { isSuperAdmin } from './roles';

const levelPriority = { CANCELLED: 5, TOTAL: 4, PARTIAL: 3, RESTRICTION: 2, WARNING: 1, ACTIVE: 0 };

export async function getFinancialAccess(user) {
  if (!user || isSuperAdmin(user)) return { level: 'ACTIVE', blocked: false, restricted: false };
  const userIds = [...new Set([user.id, user.ownerAdminId].filter(Boolean))];
  const now = new Date();
  const blocks = await (await getDatabase()).collection('access_blocks').find({
    userId: { $in: userIds }, status: 'ACTIVE',
    $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gt: now } }],
  }).toArray();
  const selected = blocks.sort((left, right) => (levelPriority[right.level] || 0) - (levelPriority[left.level] || 0))[0];
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