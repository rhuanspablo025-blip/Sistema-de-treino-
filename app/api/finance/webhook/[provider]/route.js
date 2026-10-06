import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDatabase, getMongoClient } from '../../../../../lib/mongodb';
import { writeAuditLog } from '../../../../../lib/audit';
import { getPaymentProvider } from '../../../../../lib/payment-provider';
import { requestAutomaticPayout } from '../../../../../lib/finance-payouts';
import paymentContract from '../../../../../lib/payment-contract.cjs';

export const runtime = 'nodejs';

const { normalizeWebhookEvent } = paymentContract;

function invoiceStatusForEvent(status, invoice, now) {
  if (status === 'PAID' || status === 'SETTLED') return 'PAID';
  if (status === 'PROCESSING') return 'PROCESSING';
  if (status === 'REFUNDED') return 'REFUNDED';
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  return new Date(invoice.dueAt) < now ? 'OVERDUE' : 'PENDING';
}

async function requireReview(database, provider, normalizedEvent, payment, invoice, reason) {
  const now = new Date();
  await database.collection('payment_webhooks').updateOne(
    { providerEventId: normalizedEvent.eventId },
    { $set: { status: 'REVIEW_REQUIRED', reviewReason: reason, processedAt: now, lockExpiresAt: null } },
  );
  if (payment) {
    await database.collection('payments').updateOne({ id: payment.id, status: { $ne: 'PAID' } }, { $set: { status: 'REVIEW_REQUIRED', activeAttempt: false, updatedAt: now } });
  }
  if (invoice && invoice.status !== 'PAID' && invoice.status !== 'REFUNDED') {
    await database.collection('invoices').updateOne({ id: invoice.id }, { $set: { status: 'REVIEW_REQUIRED', updatedAt: now } });
  }
  await writeAuditLog(database, {
    userId: 'payment-provider', action: 'payment_reconciliation_mismatch', resource: 'payment_webhook', resourceId: normalizedEvent.eventId,
    metadata: { provider, paymentId: payment?.id, invoiceId: invoice?.id || normalizedEvent.invoiceId, reason, eventAmountCents: normalizedEvent.amountCents, currency: normalizedEvent.currency },
  });
  return NextResponse.json({ error: 'Divergência financeira; revisão necessária.' }, { status: 409 });
}

async function ignoreStaleEvent(database, provider, event, payment, invoice) {
  await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId }, { $set: { status: 'PROCESSED', outcome: 'STALE_EVENT_IGNORED', processedAt: new Date(), lockExpiresAt: null } });
  await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_stale_event_ignored', resource: 'payment_webhook', resourceId: event.eventId, metadata: { provider, invoiceId: invoice.id, paymentId: payment.id, status: event.status } });
  return NextResponse.json({ ok: true, stale: true });
}

export async function POST(request, { params }) {
  const { provider: requestedProvider } = await params;
  const provider = getPaymentProvider();
  if (!provider.status.available || requestedProvider !== provider.status.provider) {
    return NextResponse.json({ error: 'Provider de pagamento não configurado.' }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 64000) return NextResponse.json({ error: 'Evento inválido.' }, { status: 413 });

  let providerEvent;
  try { providerEvent = await provider.validateWebhook(rawBody, request.headers); }
  catch (error) {
    const status = error.status === 401 ? 401 : 400;
    return NextResponse.json({ error: status === 401 ? 'Webhook não autenticado pelo provedor.' : 'Payload de webhook inválido.' }, { status });
  }

  if (providerEvent?.kind === 'payout') return receivePayoutWebhook(await getDatabase(), providerEvent, rawBody);

  if (providerEvent?.ignored) {
    const database = await getDatabase();
    const now = new Date();
    try {
      await database.collection('payment_webhooks').insertOne({ id: randomUUID(), provider: requestedProvider, providerEventId: providerEvent.eventId, eventType: providerEvent.eventName, status: 'PROCESSED', outcome: 'UNSUPPORTED_EVENT_IGNORED', payloadHash: createHash('sha256').update(rawBody).digest('hex'), receivedAt: now, processedAt: now, createdAt: now });
      await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_webhook_ignored', resource: 'payment_webhook', resourceId: providerEvent.eventId, metadata: { provider: requestedProvider, eventName: providerEvent.eventName } });
    } catch (error) {
      if (error.code === 11000) return NextResponse.json({ ok: true, duplicate: true });
      return NextResponse.json({ error: 'Não foi possível registrar o evento.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ignored: true });
  }

  let event;
  try { event = normalizeWebhookEvent(providerEvent); }
  catch {
    const database = await getDatabase();
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    try {
      await database.collection('payment_webhooks').insertOne({ id: randomUUID(), provider: requestedProvider, providerEventId: `invalid:${payloadHash}`, eventType: 'NORMALIZATION_REJECTED', status: 'REJECTED', payloadHash, receivedAt: new Date(), createdAt: new Date() });
      await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_webhook_rejected', resource: 'payment_webhook', resourceId: `invalid:${payloadHash}`, metadata: { provider: requestedProvider, payloadHash, reason: 'invalid_normalized_event' } });
    } catch (error) {
      if (error.code !== 11000) return NextResponse.json({ error: 'Não foi possível registrar a rejeição do evento.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Evento normalizado inválido.' }, { status: 400 });
  }

  const database = await getDatabase();
  const now = new Date();
  const workerToken = randomUUID();
  const lockExpiresAt = new Date(now.getTime() + 5 * 60_000);
  let ownsEvent = false;
  try {
    await database.collection('payment_webhooks').insertOne({
      id: randomUUID(), provider: requestedProvider, providerEventId: event.eventId,
      eventType: event.status, status: 'PROCESSING', payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      receivedAt: now, lockExpiresAt, workerToken, createdAt: now,
    });
    ownsEvent = true;
    await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_webhook_received', resource: 'payment_webhook', resourceId: event.eventId, metadata: { provider: requestedProvider, payloadHash: createHash('sha256').update(rawBody).digest('hex') } });
  } catch (error) {
    if (error.code !== 11000) return NextResponse.json({ error: 'Não foi possível registrar o evento.' }, { status: 500 });
    const previous = await database.collection('payment_webhooks').findOne({ providerEventId: event.eventId });
    if (previous?.status === 'PROCESSED') {
      await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_webhook_duplicate', resource: 'payment_webhook', resourceId: event.eventId, metadata: { provider: requestedProvider, invoiceId: previous.invoiceId || null } });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (previous?.status === 'REVIEW_REQUIRED') return NextResponse.json({ error: 'Evento retido para revisão.', duplicate: true }, { status: 409 });
    if (previous?.status === 'PROCESSING' && new Date(previous.lockExpiresAt) > now) return NextResponse.json({ ok: true, processing: true }, { status: 202 });
    const claimFilter = previous?.status === 'RETRYABLE_ERROR'
      ? { id: previous.id, status: 'RETRYABLE_ERROR' }
      : { id: previous?.id, status: 'PROCESSING', $or: [{ lockExpiresAt: { $lte: now } }, { lockExpiresAt: { $exists: false } }] };
    const claim = await database.collection('payment_webhooks').updateOne(claimFilter, { $set: { status: 'PROCESSING', workerToken, lockExpiresAt, retryAt: now } });
    if (claim.modifiedCount !== 1) return NextResponse.json({ ok: true, processing: true }, { status: 202 });
    ownsEvent = true;
  }
  if (!ownsEvent) return NextResponse.json({ ok: true, processing: true }, { status: 202 });

  let payment = await database.collection('payments').findOne({ provider: requestedProvider, providerPaymentId: event.externalPaymentId });
  if (!payment && event.providerReference) payment = await database.collection('payments').findOne({ provider: requestedProvider, idempotencyKey: event.providerReference });
  const invoice = payment ? await database.collection('invoices').findOne({ id: payment.invoiceId }) : null;
  const customerMapping = invoice && event.providerCustomerId
    ? await database.collection('payment_provider_customers').findOne({ provider: requestedProvider, environment: process.env.PAYMENT_ENVIRONMENT, userId: invoice.payerUserId })
    : null;
  const mismatch = !payment || !invoice
    || (event.providerReference && event.providerReference !== payment.idempotencyKey)
    || (payment.providerPaymentId && payment.providerPaymentId !== event.externalPaymentId)
    || (event.invoiceId && event.invoiceId !== invoice.id)
    || (event.payerUserId && event.payerUserId !== invoice.payerUserId)
    || (event.providerCustomerId && customerMapping?.providerCustomerId !== event.providerCustomerId)
    || payment.payerUserId !== invoice.payerUserId
    || payment.amountCents !== event.amountCents
    || invoice.finalAmountCents !== event.amountCents
    || payment.currency !== event.currency
    || invoice.currency !== event.currency
    || (event.method && payment.method !== event.method);
  if (mismatch) return requireReview(database, requestedProvider, event, payment, invoice, 'external_payment_mismatch');
  if (invoice.status === 'REVIEW_REQUIRED' || payment.status === 'REVIEW_REQUIRED') return requireReview(database, requestedProvider, event, payment, invoice, 'existing_review_required');
  if (event.status === 'REVIEW_REQUIRED') return requireReview(database, requestedProvider, event, payment, invoice, event.eventName || 'provider_event_requires_review');

  if (event.status === 'REFUNDED' && invoice.providerPaymentId !== event.externalPaymentId) return requireReview(database, requestedProvider, event, payment, invoice, 'refund_payment_mismatch');
  if (invoice.status === 'PAID' && event.status === 'PAID') {
    if (invoice.providerPaymentId === event.externalPaymentId) return ignoreStaleEvent(database, requestedProvider, event, payment, invoice);
    return requireReview(database, requestedProvider, event, payment, invoice, 'additional_settlement_candidate');
  }
  if (invoice.status === 'PAID' && event.status === 'SETTLED' && invoice.providerPaymentId !== event.externalPaymentId) return requireReview(database, requestedProvider, event, payment, invoice, 'settlement_payment_mismatch');
  if ((invoice.status === 'PAID' && !['REFUNDED', 'SETTLED'].includes(event.status)) || (invoice.status === 'REFUNDED' && event.status !== 'REFUNDED')) return ignoreStaleEvent(database, requestedProvider, event, payment, invoice);
  if ((payment.status === 'FAILED' || payment.status === 'EXPIRED' || payment.status === 'CANCELLED' || payment.status === 'REFUNDED') && event.status === 'PROCESSING') return ignoreStaleEvent(database, requestedProvider, event, payment, invoice);
  if (invoice.paymentAttemptId && invoice.paymentAttemptId !== payment.id && !['PAID', 'REFUNDED'].includes(event.status)) return ignoreStaleEvent(database, requestedProvider, event, payment, invoice);

  const nextInvoiceStatus = invoiceStatusForEvent(event.status, invoice, now);
  const terminal = event.status !== 'PROCESSING';
  const paymentStatus = event.status === 'SETTLED' ? 'PAID' : event.status;
  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const currentPayment = await database.collection('payments').findOne({ id: payment.id }, { session });
      const currentInvoice = await database.collection('invoices').findOne({ id: invoice.id }, { session });
      const currentEvent = await database.collection('payment_webhooks').findOne({ providerEventId: event.eventId, workerToken, status: 'PROCESSING' }, { session });
      if (!currentPayment || !currentInvoice || !currentEvent) throw new Error('PAYMENT_EVENT_LOCK_LOST');
      await database.collection('payments').updateOne({ id: payment.id }, { $set: { providerPaymentId: event.externalPaymentId, status: paymentStatus, activeAttempt: !terminal, paidAt: ['PAID', 'SETTLED'].includes(event.status) ? now : null, updatedAt: now } }, { session });
      await database.collection('invoices').updateOne({ id: invoice.id }, { $set: {
        status: nextInvoiceStatus,
        paidAt: ['PAID', 'SETTLED'].includes(event.status) ? now : null,
        paymentMethod: payment.method,
        paymentAttemptId: terminal ? null : payment.id,
        providerPaymentId: ['PAID', 'SETTLED', 'REFUNDED'].includes(event.status) ? event.externalPaymentId : null,
        updatedAt: now,
      } }, { session });
      if (['PAID', 'SETTLED'].includes(event.status)) {
        const superseded = await database.collection('payments').updateMany(
          { invoiceId: invoice.id, id: { $ne: payment.id }, activeAttempt: true },
          { $set: { status: 'REVIEW_REQUIRED', activeAttempt: false, updatedAt: now } },
          { session },
        );
        if (superseded.modifiedCount) await writeAuditLog(database, { userId: 'payment-provider', action: 'multiple_payment_attempts_review_required', resource: 'invoice', resourceId: invoice.id, metadata: { paidPaymentId: payment.id, reviewRequiredAttempts: superseded.modifiedCount }, session });
        await database.collection('access_blocks').updateMany({ invoiceId: invoice.id, source: 'AUTOMATIC', status: 'ACTIVE' }, { $set: { status: 'RELEASED', releasedAt: now, reason: 'Pagamento confirmado', updatedAt: now } }, { session });
        await database.collection('subscriptions').updateOne({ id: invoice.subscriptionId, status: { $ne: 'CANCELLED' } }, { $set: { status: 'ACTIVE', updatedAt: now } }, { session });
      }
      await database.collection('financial_ledger').insertOne({ id: randomUUID(), providerEventId: event.eventId, accountUserId: invoice.payerUserId, invoiceId: invoice.id, paymentId: payment.id, type: `PAYMENT_${event.status}`, amountCents: event.amountCents, createdBy: 'payment-provider', createdAt: now }, { session });
      if (requestedProvider === 'asaas' && event.status === 'SETTLED') {
        const payout = {
          id: randomUUID(), provider: 'asaas', paymentId: payment.id, invoiceId: invoice.id,
          payerUserId: invoice.payerUserId, amountCents: event.netAmountCents, currency: event.currency,
          externalReference: `payout:${payment.id}`, status: 'PENDING', sourceEventId: event.eventId,
          createdAt: now, updatedAt: now,
        };
        await database.collection('payment_payouts').updateOne({ provider: 'asaas', paymentId: payment.id }, { $setOnInsert: payout }, { upsert: true, session });
      }
      await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken, status: 'PROCESSING' }, { $set: { status: 'PROCESSED', invoiceId: invoice.id, paymentId: payment.id, processedAt: now, lockExpiresAt: null } }, { session });
      await writeAuditLog(database, { userId: 'payment-provider', action: `payment_${event.status.toLowerCase()}`, resource: 'invoice', resourceId: invoice.id, metadata: { eventId: event.eventId, paymentId: payment.id, status: event.status, amountCents: event.amountCents, currency: event.currency }, session });
    });
  } catch {
    await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken }, { $set: { status: 'RETRYABLE_ERROR', retryAt: new Date(), lockExpiresAt: null } });
    return NextResponse.json({ error: 'Falha temporária ao conciliar; o evento pode ser reenviado.' }, { status: 500 });
  } finally {
    await session.endSession();
  }
  if (requestedProvider === 'asaas' && event.status === 'SETTLED' && process.env.ASAAS_AUTO_PAYOUT_ENABLED === 'true') {
    const payout = await database.collection('payment_payouts').findOne({ provider: 'asaas', paymentId: payment.id });
    if (payout?.status === 'PENDING') await requestAutomaticPayout(payout.id, database);
  }
  return NextResponse.json({ ok: true });
}

async function receivePayoutWebhook(database, event, rawBody) {
  const now = new Date();
  const workerToken = randomUUID();
  const lockExpiresAt = new Date(now.getTime() + 5 * 60_000);
  let claimed = false;
  try {
    await database.collection('payment_webhooks').insertOne({
      id: randomUUID(), provider: 'asaas', providerEventId: event.eventId, eventType: event.eventName,
      status: 'PROCESSING', payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      receivedAt: now, lockExpiresAt, workerToken, createdAt: now,
    });
    claimed = true;
  } catch (error) {
    if (error.code !== 11000) return NextResponse.json({ error: 'Não foi possível registrar o webhook de transferência.' }, { status: 500 });
    const previous = await database.collection('payment_webhooks').findOne({ providerEventId: event.eventId });
    if (previous?.status === 'PROCESSED') return NextResponse.json({ ok: true, duplicate: true });
    if (previous?.status === 'REVIEW_REQUIRED') return NextResponse.json({ error: 'Transferência retida para revisão.' }, { status: 409 });
    if (previous?.status === 'PROCESSING' && new Date(previous.lockExpiresAt) > now) return NextResponse.json({ ok: true, processing: true }, { status: 202 });
    const claimFilter = previous?.status === 'RETRYABLE_ERROR'
      ? { id: previous.id, status: 'RETRYABLE_ERROR' }
      : { id: previous?.id, status: 'PROCESSING', $or: [{ lockExpiresAt: { $lte: now } }, { lockExpiresAt: { $exists: false } }] };
    const claim = await database.collection('payment_webhooks').updateOne(
      claimFilter,
      { $set: { workerToken, lockExpiresAt, retryAt: now } },
    );
    claimed = claim.modifiedCount === 1;
  }
  if (!claimed) return NextResponse.json({ ok: true, processing: true }, { status: 202 });

  const payout = await database.collection('payment_payouts').findOne({
    provider: 'asaas',
    $or: [{ externalTransferId: event.externalTransferId }, ...(event.providerReference ? [{ externalReference: event.providerReference }] : [])],
  });
  if (!payout) {
    await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken }, { $set: { status: 'RETRYABLE_ERROR', retryAt: new Date(), lockExpiresAt: null } });
    return NextResponse.json({ error: 'Payout ainda não registrado; o evento de transferência pode ser reenviado.' }, { status: 503 });
  }
  if (payout.amountCents !== event.amountCents) {
    await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken }, { $set: { status: 'REVIEW_REQUIRED', reviewReason: 'payout_amount_mismatch', processedAt: new Date(), lockExpiresAt: null } });
    await writeAuditLog(database, { userId: 'payment-provider', action: 'payout_reconciliation_mismatch', resource: 'payment_webhook', resourceId: event.eventId, metadata: { externalTransferId: event.externalTransferId, payoutId: payout.id, eventAmountCents: event.amountCents } });
    return NextResponse.json({ error: 'Divergência no valor da transferência; revisão necessária.' }, { status: 409 });
  }

  if (payout.status === 'COMPLETED' && event.transferStatus !== 'COMPLETED') {
    await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken }, { $set: { status: 'PROCESSED', outcome: 'STALE_TRANSFER_EVENT_IGNORED', payoutId: payout.id, processedAt: new Date(), lockExpiresAt: null } });
    await writeAuditLog(database, { userId: 'payment-provider', action: 'payout_stale_event_ignored', resource: 'payment_payout', resourceId: payout.id, metadata: { eventName: event.eventName, externalTransferId: event.externalTransferId } });
    return NextResponse.json({ ok: true, stale: true });
  }

  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      const nextStatus = event.transferStatus;
      await database.collection('payment_payouts').updateOne(
        { id: payout.id },
        { $set: { status: nextStatus, externalTransferId: event.externalTransferId, creditedAmountCents: event.creditedAmountCents, transferFeeCents: event.transferFeeCents, transferEventName: event.eventName, completedAt: nextStatus === 'COMPLETED' ? now : payout.completedAt || null, updatedAt: now } },
        { session },
      );
      await database.collection('financial_ledger').updateOne(
        { payoutId: payout.id },
        { $set: { type: nextStatus === 'COMPLETED' ? 'PAYOUT_COMPLETED' : nextStatus === 'FAILED' ? 'PAYOUT_FAILED' : 'PAYOUT_PROCESSING', amountCents: -payout.amountCents, externalTransferId: event.externalTransferId, creditedAmountCents: event.creditedAmountCents, transferFeeCents: event.transferFeeCents, updatedAt: now } },
        { session },
      );
      await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken, status: 'PROCESSING' }, { $set: { status: 'PROCESSED', payoutId: payout.id, processedAt: now, lockExpiresAt: null } }, { session });
      await writeAuditLog(database, { userId: 'payment-provider', action: `payout_${nextStatus.toLowerCase()}`, resource: 'payment_payout', resourceId: payout.id, metadata: { eventId: event.eventId, eventName: event.eventName, externalTransferId: event.externalTransferId, amountCents: event.amountCents, transferFeeCents: event.transferFeeCents }, session });
    });
  } catch {
    await database.collection('payment_webhooks').updateOne({ providerEventId: event.eventId, workerToken }, { $set: { status: 'RETRYABLE_ERROR', retryAt: new Date(), lockExpiresAt: null } });
    return NextResponse.json({ error: 'Não foi possível conciliar a transferência.' }, { status: 500 });
  } finally { await session.endSession(); }
  return NextResponse.json({ ok: true });
}