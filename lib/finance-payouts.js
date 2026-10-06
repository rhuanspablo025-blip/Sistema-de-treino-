import { randomUUID } from 'node:crypto';
import { getDatabase } from './mongodb.js';
import { writeAuditLog } from './audit.js';
import { getPaymentProvider } from './payment-provider.js';

export async function requestAutomaticPayout(payoutId, database = getDatabase()) {
  const db = await database;
  if (process.env.PAYMENT_PROVIDER !== 'asaas' || process.env.ASAAS_AUTO_PAYOUT_ENABLED !== 'true') return { status: 'PENDING', skipped: true };

  const payouts = db.collection('payment_payouts');
  const payout = await payouts.findOne({ id: payoutId, provider: 'asaas', status: 'PENDING' });
  if (!payout) return { skipped: true };

  const workerToken = randomUUID();
  const now = new Date();
  const claim = await payouts.updateOne(
    { id: payout.id, status: 'PENDING' },
    { $set: { status: 'PROCESSING', workerToken, transferStartedAt: now, updatedAt: now } },
  );
  if (claim.modifiedCount !== 1) return { skipped: true };

  const provider = getPaymentProvider();
  try {
    const result = await provider.createPayout({ payout });
    const status = result.status === 'DONE' ? 'COMPLETED' : 'PROCESSING';
    const completedAt = status === 'COMPLETED' ? new Date() : null;
    await payouts.updateOne(
      { id: payout.id, workerToken, status: 'PROCESSING' },
      { $set: { status, externalTransferId: result.externalTransferId, transferFeeCents: result.transferFeeCents, transferStatus: result.status, completedAt, updatedAt: new Date() }, $unset: { workerToken: '' } },
    );
    const latestPayout = await payouts.findOne({ id: payout.id });
    await db.collection('financial_ledger').updateOne(
      { payoutId: payout.id },
      { $setOnInsert: { id: randomUUID(), payoutId: payout.id, paymentId: payout.paymentId, invoiceId: payout.invoiceId, accountUserId: payout.payerUserId, provider: 'asaas', type: latestPayout?.status === 'COMPLETED' ? 'PAYOUT_COMPLETED' : latestPayout?.status === 'FAILED' ? 'PAYOUT_FAILED' : 'PAYOUT_REQUESTED', amountCents: -payout.amountCents, creditedAmountCents: result.creditedAmountCents, transferFeeCents: result.transferFeeCents, externalTransferId: result.externalTransferId, createdBy: 'payment-provider', createdAt: new Date() } },
      { upsert: true },
    );
    const finalStatus = latestPayout?.status || status;
    await writeAuditLog(db, { userId: 'payment-provider', action: finalStatus === 'COMPLETED' ? 'automatic_payout_completed' : finalStatus === 'FAILED' ? 'automatic_payout_failed' : 'automatic_payout_requested', resource: 'payment_payout', resourceId: payout.id, metadata: { paymentId: payout.paymentId, invoiceId: payout.invoiceId, amountCents: payout.amountCents, creditedAmountCents: result.creditedAmountCents, transferFeeCents: result.transferFeeCents, externalTransferId: result.externalTransferId, transferStatus: result.status } });
    return { status: finalStatus, externalTransferId: result.externalTransferId };
  } catch (error) {
    const isConfigurationMissing = error.status === 503;
    const status = isConfigurationMissing ? 'PENDING' : error.status >= 400 && error.status < 500 ? 'FAILED' : 'REVIEW_REQUIRED';
    await payouts.updateOne(
      { id: payout.id, workerToken, status: 'PROCESSING' },
      { $set: { status, lastErrorStatus: Number.isInteger(error.status) ? error.status : 502, updatedAt: new Date() }, $unset: { workerToken: '' } },
    );
    await writeAuditLog(db, { userId: 'payment-provider', action: status === 'PENDING' ? 'automatic_payout_waiting_configuration' : status === 'FAILED' ? 'automatic_payout_failed' : 'automatic_payout_review_required', resource: 'payment_payout', resourceId: payout.id, metadata: { paymentId: payout.paymentId, invoiceId: payout.invoiceId, amountCents: payout.amountCents, httpStatus: Number.isInteger(error.status) ? error.status : 502 } });
    return { status };
  }
}

export async function processPendingAutomaticPayouts({ limit = 25, now = new Date() } = {}) {
  if (process.env.PAYMENT_PROVIDER !== 'asaas' || process.env.ASAAS_AUTO_PAYOUT_ENABLED !== 'true') return { processed: 0, skipped: true };
  const db = await getDatabase();
  const payouts = await db.collection('payment_payouts').find({ status: 'PENDING' }).sort({ createdAt: 1 }).limit(limit).toArray();
  let processed = 0;
  for (const payout of payouts) {
    await requestAutomaticPayout(payout.id, db);
    processed += 1;
  }
  return { processed, at: now };
}