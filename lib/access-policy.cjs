const BLOCK_LEVELS = ['ACTIVE', 'WARNING', 'RESTRICTION', 'PARTIAL', 'TOTAL', 'CANCELLED'];

function daysBetween(start, end) {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endDay - startDay) / 86400000);
}

function deriveAccessLevel({ invoiceStatus, dueAt, rules, now = new Date() }) {
  if (invoiceStatus === 'PAID' || invoiceStatus === 'CANCELLED' || !dueAt) return { level: 'ACTIVE', daysOverdue: 0 };
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) throw new Error('Invalid due date');
  const daysOverdue = Math.max(0, daysBetween(due, now));
  const daysUntilDue = Math.max(0, -daysBetween(due, now));
  const graceDays = Math.max(0, Number(rules.graceDays) || 0);
  const restrictAfterDays = Math.max(graceDays + 1, Number(rules.restrictAfterDays) || 0);
  const blockAfterDays = Math.max(restrictAfterDays, graceDays + 1, Number(rules.blockAfterDays) || 0);
  if (daysOverdue >= blockAfterDays && daysOverdue > 0) return { level: 'TOTAL', daysOverdue };
  if (daysOverdue >= restrictAfterDays && daysOverdue > 0) return { level: 'RESTRICTION', daysOverdue };
  if (daysOverdue > graceDays) return { level: 'PARTIAL', daysOverdue };
  if (daysUntilDue <= Math.max(0, Number(rules.noticeDays) || 0) || daysOverdue > 0) return { level: 'WARNING', daysOverdue };
  return { level: 'ACTIVE', daysOverdue: 0 };
}

module.exports = { BLOCK_LEVELS, deriveAccessLevel };