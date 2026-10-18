import { randomUUID } from 'node:crypto';
import { getDatabase } from './mongodb';
import { deriveAccessLevel } from './access-policy.cjs';
import { createInvoice } from './finance-service';
import { writeAuditLog } from './audit';
import { processPendingAutomaticPayouts } from './finance-payouts';

function periodKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addAccessPeriod(value, period) {
  const days = Number.isSafeInteger(Number(period)) && Number(period) > 0
    ? Number(period)
    : { test: 1, weekly: 7, monthly: 30, bimonthly: 60, annual: 365 }[period] || 30;
  return new Date(new Date(value).getTime() + days * 86400000);
}

async function applyAutomaticBlock(database, userId, level, invoice, now) {
  const blocks = database.collection('access_blocks');
  const existing = await blocks.findOne({ userId, source: 'AUTOMATIC', status: 'ACTIVE' });
  if (level === 'ACTIVE') {
    if (existing) {
      await blocks.updateOne({ id: existing.id }, { $set: { status: 'RELEASED', releasedAt: now, reason: 'Cobrança regularizada', updatedAt: now } });
      await writeAuditLog(database, { userId: 'billing-system', action: 'automatic_access_release', resource: 'access_block', resourceId: existing.id, metadata: { invoiceId: invoice?.id } });
    }
    return;
  }

  const values = {
    level,
    invoiceId: invoice?.id || null,
    reason: invoice ? `Cobrança ${invoice.status.toLowerCase()}` : 'Pendência financeira',
    startsAt: existing?.startsAt || now,
    endsAt: invoice?.dueAt ? new Date(new Date(invoice.dueAt).getTime() + 3650 * 86400000) : null,
    updatedAt: now,
  };
  if (existing) {
    if (existing.level !== level) await writeAuditLog(database, { userId: 'billing-system', action: 'automatic_access_level_change', resource: 'access_block', resourceId: existing.id, metadata: { previousLevel: existing.level, level, invoiceId: invoice?.id } });
    await blocks.updateOne({ id: existing.id }, { $set: values });
    return;
  }

  const id = randomUUID();
  try {
    await blocks.updateOne(
      { userId, source: 'AUTOMATIC', status: 'ACTIVE' },
      { $setOnInsert: { id, userId, source: 'AUTOMATIC', status: 'ACTIVE', createdAt: now }, $set: values },
      { upsert: true },
    );
    await writeAuditLog(database, { userId: 'billing-system', action: 'automatic_access_block', resource: 'access_block', resourceId: id, metadata: { targetUserId: userId, level, invoiceId: invoice?.id } });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
}

export async function runDailyBillingJob(now = new Date()) {
  const database = await getDatabase();
  const rules = await database.collection('billing_rules').findOne({ id: 'global' }) || {};
  const subscriptions = await database.collection('subscriptions').find({ status: 'ACTIVE' }).toArray();
  const result = { invoicesCreated: 0, invoicesOverdue: 0, accessChanges: 0, expiredBlocks: 0 };
  const cutoff = new Date(now.getTime() + Math.max(0, Number(rules.noticeDays) || 0) * 86400000);

  for (const subscription of subscriptions) {
    if (subscription.perpetual || subscription.billingPeriod === 'perpetual' || subscription.billingPeriod === 'test') continue;
    const nextDueAt = new Date(subscription.nextDueAt);
    if (Number.isNaN(nextDueAt.getTime())) continue;
    if (nextDueAt <= cutoff) {
      try {
        await createInvoice({ id: 'billing-system' }, { subscriptionId: subscription.id, periodKey: periodKey(nextDueAt) });
        result.invoicesCreated += 1;
      } catch (error) {
        if (error.code !== 11000 && error.status !== 409) throw error;
      }
      await database.collection('subscriptions').updateOne({ id: subscription.id, nextDueAt: subscription.nextDueAt }, { $set: { nextDueAt: addAccessPeriod(nextDueAt, subscription.accessDays || subscription.billingPeriod), updatedAt: now } });
    }
  }

  const dueUpdate = await database.collection('invoices').updateMany(
    { status: { $in: ['PENDING', 'AWAITING_PAYMENT'] }, dueAt: { $lt: now } },
    { $set: { status: 'OVERDUE', updatedAt: now } },
  );
  result.invoicesOverdue = dueUpdate.modifiedCount || 0;

  await database.collection('access_blocks').updateMany(
    { source: 'MANUAL', status: 'ACTIVE', endsAt: { $lte: now } },
    { $set: { status: 'EXPIRED', updatedAt: now } },
  );
  result.expiredBlocks = (await database.collection('access_blocks').countDocuments({ source: 'MANUAL', status: 'EXPIRED', updatedAt: { $gte: new Date(now.getTime() - 60_000) } }));

  for (const subscription of subscriptions) {
    const invoice = await database.collection('invoices').findOne(
      { subscriptionId: subscription.id, status: { $in: ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'PROCESSING'] } },
      { sort: { dueAt: 1 } },
    );
    const policy = deriveAccessLevel({ invoiceStatus: invoice?.status || 'PAID', dueAt: invoice?.dueAt, rules, now });
    const accountIds = new Set([subscription.accountUserId]);
    if (subscription.accountRole === 'admin') {
      const members = await database.collection('users').find({ ownerAdminId: subscription.accountUserId, active: true }, { projection: { id: 1 } }).toArray();
      const students = await database.collection('students').find({ ownerAdminId: subscription.accountUserId, active: true }, { projection: { userId: 1 } }).toArray();
      for (const member of members) accountIds.add(member.id);
      for (const student of students) accountIds.add(student.userId);
    }
    for (const userId of accountIds) {
      await applyAutomaticBlock(database, userId, policy.level, invoice, now);
      result.accessChanges += 1;
    }
  }
  result.payoutsProcessed = await processPendingAutomaticPayouts();
  return result;
}
