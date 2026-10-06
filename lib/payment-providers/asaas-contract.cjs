const EVENT_STATUSES = {
  PAYMENT_CREATED: 'PROCESSING',
  PAYMENT_UPDATED: 'PROCESSING',
  PAYMENT_AWAITING_RISK_ANALYSIS: 'PROCESSING',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: 'PROCESSING',
  PAYMENT_AUTHORIZED: 'PROCESSING',
  PAYMENT_REFUND_IN_PROGRESS: 'PROCESSING',
  PAYMENT_PARTIALLY_REFUNDED: 'REVIEW_REQUIRED',
  PAYMENT_CHARGEBACK_REQUESTED: 'REVIEW_REQUIRED',
  PAYMENT_CHARGEBACK_DISPUTE: 'REVIEW_REQUIRED',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'REVIEW_REQUIRED',
  PAYMENT_RECEIVED_IN_CASH_UNDONE: 'REVIEW_REQUIRED',
  PAYMENT_CONFIRMED: 'PAID',
  PAYMENT_RECEIVED: 'SETTLED',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'FAILED',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'FAILED',
  PAYMENT_OVERDUE: 'EXPIRED',
  PAYMENT_BANK_SLIP_CANCELLED: 'EXPIRED',
  PAYMENT_DELETED: 'CANCELLED',
  PAYMENT_REFUNDED: 'REFUNDED',
};
const TRANSFER_EVENT_STATUSES = {
  TRANSFER_CREATED: 'PROCESSING',
  TRANSFER_PENDING: 'PROCESSING',
  TRANSFER_IN_BANK_PROCESSING: 'PROCESSING',
  TRANSFER_BLOCKED: 'REVIEW_REQUIRED',
  TRANSFER_DONE: 'COMPLETED',
  TRANSFER_FAILED: 'FAILED',
  TRANSFER_CANCELLED: 'FAILED',
};

function amountToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) throw new Error('Valor Asaas inválido.');
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new Error('Valor Asaas inválido.');
  return cents;
}

function mapBillingType(value) {
  if (value === 'PIX') return 'PIX';
  if (value === 'BOLETO') return 'BOLETO';
  if (value === 'CREDIT_CARD') return 'CARD';
  return undefined;
}

function normalizeAsaasWebhook(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !body.id.trim() || typeof body.event !== 'string') throw new Error('Webhook Asaas inválido.');
  if (TRANSFER_EVENT_STATUSES[body.event]) {
    const transfer = body.transfer;
    if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer) || typeof transfer.id !== 'string' || !transfer.id.trim()) throw new Error('Transferência Asaas inválida.');
    const amountCents = amountToCents(transfer.value);
    const creditedAmountCents = transfer.netValue == null ? null : amountToCents(transfer.netValue);
    if (creditedAmountCents != null && creditedAmountCents > amountCents) throw new Error('Valor líquido da transferência Asaas inválido.');
    return {
      kind: 'payout',
      eventId: body.id.trim(),
      eventName: body.event,
      externalTransferId: transfer.id.trim(),
      providerReference: typeof transfer.externalReference === 'string' ? transfer.externalReference.trim() : undefined,
      amountCents,
      creditedAmountCents,
      transferStatus: TRANSFER_EVENT_STATUSES[body.event],
      transferFeeCents: transfer.transferFee == null ? null : amountToCents(transfer.transferFee),
    };
  }
  const status = EVENT_STATUSES[body.event];
  const payment = body.payment;
  if (!status) return { eventId: body.id.trim(), ignored: true, eventName: body.event.slice(0, 120) };
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) throw new Error('Pagamento Asaas inválido.');
  if (typeof payment.id !== 'string' || !payment.id.trim() || typeof payment.externalReference !== 'string' || !payment.externalReference.trim()) throw new Error('Referência do pagamento Asaas ausente.');
  if (typeof payment.customer !== 'string' || !payment.customer.trim()) throw new Error('Cliente do pagamento Asaas ausente.');
  const amountCents = amountToCents(payment.value);
  const netAmountCents = payment.netValue == null ? undefined : amountToCents(payment.netValue);
  if (body.event === 'PAYMENT_RECEIVED' && (!Number.isSafeInteger(netAmountCents) || netAmountCents <= 0 || netAmountCents > amountCents)) throw new Error('Valor líquido Asaas inválido.');
  return {
    eventId: body.id.trim(),
    eventName: body.event,
    externalPaymentId: payment.id.trim(),
    providerReference: payment.externalReference.trim(),
    providerCustomerId: payment.customer.trim(),
    amountCents,
    netAmountCents,
    currency: 'BRL',
    method: mapBillingType(payment.billingType),
    status,
  };
}

function mapAsaasPaymentStatus(status) {
  if (['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(status)) return 'PAID';
  if (['REFUNDED'].includes(status)) return 'REFUNDED';
  if (['OVERDUE'].includes(status)) return 'EXPIRED';
  if (['DELETED'].includes(status)) return 'CANCELLED';
  if (['PENDING', 'AUTHORIZED', 'AWAITING_RISK_ANALYSIS', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS'].includes(status)) return 'PROCESSING';
  throw new Error('Status de pagamento Asaas não suportado.');
}

module.exports = { EVENT_STATUSES, TRANSFER_EVENT_STATUSES, amountToCents, mapBillingType, mapAsaasPaymentStatus, normalizeAsaasWebhook };