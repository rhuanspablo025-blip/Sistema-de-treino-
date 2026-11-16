import { getFinancialAccessSql } from './financial-repository.mjs';
import { isSuperAdmin } from './roles';

export async function getFinancialAccess(user) {
  if (!user || isSuperAdmin(user) || user.financialAccessExempt === true) return { level: 'ACTIVE', blocked: false, restricted: false, exempt: Boolean(user) };
  return getFinancialAccessSql({ tenantId: user.tenantId || user.ownerAdminId || 'default-tenant', userId: user.id, exempt: user.financialAccessExempt === true });
}
