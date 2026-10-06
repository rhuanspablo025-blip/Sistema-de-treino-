const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateInvoiceAmounts, overageCount } = require('../lib/finance-calculator.cjs');
const { deriveAccessLevel } = require('../lib/access-policy.cjs');
const { normalizeChargeResult, normalizeWebhookEvent } = require('../lib/payment-contract.cjs');
const { amountToCents, mapAsaasPaymentStatus, normalizeAsaasWebhook } = require('../lib/payment-providers/asaas-contract.cjs');

const plan = {
  monthlyPriceCents: 9900, annualPriceCents: 99000,
  studentMonthlyPriceCents: 2500, studentAnnualPriceCents: 25000,
  includedStudents: 10, extraStudentPriceCents: 500,
  includedTeachers: 1, extraTeacherPriceCents: 1200,
  platformFeePercent: 5, allowStudentRevenueOffset: true, offsetPercent: 100, offsetCapCents: 10000,
};
const rules = { lateFeePercent: 2, dailyInterestPercent: 0.03, allowStudentRevenueOffset: false, creditCarryover: false };

test('charges only students above the configured free allowance', () => {
  assert.equal(overageCount(8, 10), 0);
  assert.equal(overageCount(10, 10), 0);
  assert.equal(overageCount(15, 10), 5);
  assert.equal(overageCount(20, 10), 10);
  const invoice = calculateInvoiceAmounts({ subscription: { billingPeriod: 'monthly', accountRole: 'admin' }, plan, rules, studentCount: 15, teacherCount: 1 });
  assert.equal(invoice.extraStudentCount, 5);
  assert.equal(invoice.extraStudentCents, 2500);
  assert.equal(invoice.finalAmountCents, 12400);
});

test('offset cannot make invoice negative and student subscriptions do not inherit admin overages', () => {
  const adminInvoice = calculateInvoiceAmounts({ subscription: { billingPeriod: 'monthly', accountRole: 'admin' }, plan: { ...plan, offsetCapCents: null }, rules, studentCount: 10, teacherCount: 1, studentRevenueCents: 50000 });
  assert.equal(adminInvoice.finalAmountCents, 0);
  assert.equal(adminInvoice.creditCents, 0);
  const studentInvoice = calculateInvoiceAmounts({ subscription: { billingPeriod: 'monthly', accountRole: 'student' }, plan, rules, studentCount: 100, teacherCount: 20 });
  assert.equal(studentInvoice.baseCents, 2500);
  assert.equal(studentInvoice.extraStudentCount, 0);
  assert.equal(studentInvoice.finalAmountCents, 2500);
});

test('access policy progresses from warning to restriction and total block', () => {
  const dueAt = new Date('2026-10-01T12:00:00.000Z');
  const rules = { noticeDays: 5, graceDays: 2, restrictAfterDays: 3, blockAfterDays: 7 };
  assert.equal(deriveAccessLevel({ invoiceStatus: 'PENDING', dueAt: '2026-10-10T00:00:00Z', rules, now: new Date('2026-10-06T12:00:00Z') }).level, 'WARNING');
  assert.equal(deriveAccessLevel({ invoiceStatus: 'OVERDUE', dueAt, rules, now: new Date('2026-10-05T12:00:00Z') }).level, 'RESTRICTION');
  assert.equal(deriveAccessLevel({ invoiceStatus: 'OVERDUE', dueAt, rules, now: new Date('2026-10-09T12:00:00Z') }).level, 'TOTAL');
  assert.equal(deriveAccessLevel({ invoiceStatus: 'PAID', dueAt, rules, now: new Date('2026-10-09T12:00:00Z') }).level, 'ACTIVE');
});

test('grace period takes precedence over an earlier restriction threshold', () => {
  const dueAt = new Date('2026-10-01T12:00:00.000Z');
  const rules = { noticeDays: 5, graceDays: 3, restrictAfterDays: 1, blockAfterDays: 7 };
  assert.equal(deriveAccessLevel({ invoiceStatus: 'OVERDUE', dueAt, rules, now: new Date('2026-10-03T12:00:00Z') }).level, 'WARNING');
  assert.equal(deriveAccessLevel({ invoiceStatus: 'OVERDUE', dueAt, rules, now: new Date('2026-10-05T12:00:00Z') }).level, 'RESTRICTION');
});

test('provider checkout contract only accepts safe, unpaid normalized data', () => {
  const checkout = normalizeChargeResult({
    externalPaymentId: 'external-1',
    status: 'PENDING',
    checkout: { pixCopyPaste: 'pix-payload', pixQrCodeDataUrl: 'data:image/png;base64,YWJj' },
  }, 'PIX');
  assert.equal(checkout.status, 'PENDING');
  assert.equal(checkout.checkout.pixCopyPaste, 'pix-payload');
  assert.throws(() => normalizeChargeResult({ externalPaymentId: 'external-2', status: 'PAID', checkout: { redirectUrl: 'https://pay.example.test' } }, 'CARD'));
  assert.throws(() => normalizeChargeResult({ externalPaymentId: 'external-3', status: 'PENDING', checkout: { redirectUrl: 'http://unsafe.example.test' } }, 'CARD'));
  assert.equal(normalizeChargeResult({ externalPaymentId: 'external-4', status: 'PENDING', checkout: { redirectUrl: 'https://hosted.example.test' } }, 'CARD').checkout.redirectUrl, 'https://hosted.example.test/');
  assert.equal(normalizeChargeResult({ externalPaymentId: 'external-5', status: 'PENDING', checkout: { boletoLine: '1234567890' } }, 'BOLETO').checkout.boletoLine, '1234567890');
  assert.equal(normalizeChargeResult({ externalPaymentId: 'external-6', status: 'PENDING', checkout: { cardNumber: 'must not persist', redirectUrl: 'https://hosted.example.test' } }, 'CARD').checkout.cardNumber, undefined);
});

test('provider webhook contract validates idempotency and reconciliation fields', () => {
  const event = normalizeWebhookEvent({ eventId: 'event-1', externalPaymentId: 'external-1', invoiceId: 'invoice-1', amountCents: 12500, currency: 'BRL', method: 'BOLETO', status: 'PAID' });
  assert.equal(event.status, 'PAID');
  assert.equal(event.amountCents, 12500);
  assert.throws(() => normalizeWebhookEvent({ ...event, amountCents: 125.5 }));
  assert.throws(() => normalizeWebhookEvent({ ...event, amountCents: '12500' }));
  assert.throws(() => normalizeWebhookEvent({ ...event, currency: 'USD' }));
  assert.throws(() => normalizeWebhookEvent({ ...event, status: 'APPROVED' }));
});

test('Asaas webhook events normalize official payment fields and statuses', () => {
  const event = normalizeAsaasWebhook({
    id: 'evt-1', event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay-1', externalReference: 'payment:1', customer: 'cus-1', value: 123.45, netValue: 120.00, billingType: 'BOLETO' },
  });
  assert.equal(event.eventId, 'evt-1');
  assert.equal(event.externalPaymentId, 'pay-1');
  assert.equal(event.providerReference, 'payment:1');
  assert.equal(event.providerCustomerId, 'cus-1');
  assert.equal(event.amountCents, 12345);
  assert.equal(event.method, 'BOLETO');
  assert.equal(event.status, 'SETTLED');
  assert.equal(event.netAmountCents, 12000);
  assert.equal(amountToCents('0.10'), 10);
  assert.equal(mapAsaasPaymentStatus('CONFIRMED'), 'PAID');
  assert.equal(mapAsaasPaymentStatus('OVERDUE'), 'EXPIRED');
  assert.equal(normalizeAsaasWebhook({ id: 'evt-review', event: 'PAYMENT_PARTIALLY_REFUNDED', payment: { id: 'pay-review', externalReference: 'payment:review', customer: 'cus-review', value: 123.45, billingType: 'PIX' } }).status, 'REVIEW_REQUIRED');
  assert.deepEqual(normalizeAsaasWebhook({ id: 'evt-ignored', event: 'PAYMENT_CHECKOUT_VIEWED' }), { eventId: 'evt-ignored', ignored: true, eventName: 'PAYMENT_CHECKOUT_VIEWED' });
  assert.deepEqual(normalizeAsaasWebhook({ id: 'evt-transfer', event: 'TRANSFER_DONE', transfer: { id: 'transfer-1', externalReference: 'payout:payment-1', value: 120, netValue: 119, transferFee: 1 } }), {
    kind: 'payout', eventId: 'evt-transfer', eventName: 'TRANSFER_DONE', externalTransferId: 'transfer-1', providerReference: 'payout:payment-1', amountCents: 12000, creditedAmountCents: 11900, transferStatus: 'COMPLETED', transferFeeCents: 100,
  });
  assert.deepEqual(normalizeAsaasWebhook({ id: 'evt-2', event: 'UNKNOWN' }), { eventId: 'evt-2', ignored: true, eventName: 'UNKNOWN' });
});

test('Asaas provider creates Pix, boleto, and card-hosted charges without storing taxpayer data', async () => {
  const { AsaasPaymentProvider } = await import('../lib/payment-providers/asaas.mjs');
  const customerMappings = new Map();
  const database = async () => ({
    collection: () => ({
      findOne: async (filter) => customerMappings.get(`${filter.environment}:${filter.userId}`) || null,
      updateOne: async (filter, update) => {
        const key = `${filter.environment}:${filter.userId}`;
        if (!customerMappings.has(key)) customerMappings.set(key, update.$setOnInsert);
        return { upsertedCount: 1 };
      },
    }),
  });
  const requests = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url: parsed, options, body });
    if (parsed.pathname === '/v3/customers' && options.method === 'GET') return Response.json({ data: [] });
    if (parsed.pathname === '/v3/customers' && options.method === 'POST') return Response.json({ id: 'cus-test', externalReference: body.externalReference });
    if (parsed.pathname === '/v3/payments' && options.method === 'GET') return Response.json({ data: [] });
    if (parsed.pathname === '/v3/payments' && options.method === 'POST') return Response.json({
      id: `pay-${body.billingType.toLowerCase()}`, customer: body.customer, externalReference: body.externalReference,
      billingType: body.billingType, value: body.value, status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/test',
      bankSlipUrl: 'https://sandbox.asaas.com/b/pdf/test',
    });
    if (parsed.pathname.endsWith('/pixQrCode')) return Response.json({ encodedImage: 'YWJj', payload: 'pix-copy-paste', expirationDate: '2026-10-07T00:00:00.000Z' });
    if (parsed.pathname.endsWith('/identificationField')) return Response.json({ identificationField: 'boleto-line', barCode: 'boleto-barcode' });
    if (parsed.pathname === '/v3/transfers' && options.method === 'POST') return Response.json({ id: 'transfer-test', externalReference: body.externalReference, value: body.value, netValue: body.value - 0.5, status: 'PENDING', transferFee: 0.5 });
    throw new Error(`Unexpected request ${options.method} ${parsed.pathname}`);
  };
  const provider = new AsaasPaymentProvider({ apiKey: 'unit-test-key', webhookToken: 'x'.repeat(32), environment: 'sandbox', fetchImpl, database });
  const payer = { id: 'user-1', name: 'Test User', cpfCnpj: '123.456.789-01' };
  const pix = await provider.createCharge({ invoice: { id: 'invoice-1', finalAmountCents: 12500, currency: 'BRL', dueAt: new Date('2026-10-07T00:00:00Z') }, method: 'PIX', idempotencyKey: 'payment:pix', payer });
  assert.equal(pix.externalPaymentId, 'pay-pix');
  assert.equal(pix.checkout.pixCopyPaste, 'pix-copy-paste');
  assert.equal(pix.checkout.pixQrCodeDataUrl, 'data:image/png;base64,YWJj');
  assert.equal(pix.status, 'PENDING');
  const card = await provider.createCharge({ invoice: { id: 'invoice-2', finalAmountCents: 5000, currency: 'BRL', dueAt: new Date('2026-10-07T00:00:00Z') }, method: 'CARD', idempotencyKey: 'payment:card', payer: { id: 'user-1', name: 'Test User' } });
  assert.equal(card.checkout.redirectUrl, 'https://sandbox.asaas.com/i/test');
  const boleto = await provider.createCharge({ invoice: { id: 'invoice-3', finalAmountCents: 3500, currency: 'BRL', dueAt: new Date('2026-10-07T00:00:00Z') }, method: 'BOLETO', idempotencyKey: 'payment:boleto', payer: { id: 'user-1', name: 'Test User' } });
  assert.equal(boleto.checkout.boletoUrl, 'https://sandbox.asaas.com/b/pdf/test');
  assert.equal(boleto.checkout.boletoLine, 'boleto-line');
  assert.equal(requests[0].url.origin, 'https://api-sandbox.asaas.com');
  assert.equal(requests[0].options.headers.access_token, 'unit-test-key');
  assert.equal(customerMappings.get('sandbox:user-1').providerCustomerId, 'cus-test');
  assert.equal(JSON.stringify(customerMappings).includes('12345678901'), false);
  const rawWebhook = JSON.stringify({ id: 'evt-1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay-pix', externalReference: 'payment:pix', customer: 'cus-test', value: 125, netValue: 122.5, billingType: 'PIX' } });
  const event = await provider.validateWebhook(rawWebhook, new Headers({ 'asaas-access-token': 'x'.repeat(32) }));
  assert.equal(event.status, 'SETTLED');
  assert.equal(event.providerReference, 'payment:pix');
  await assert.rejects(() => provider.validateWebhook(rawWebhook, new Headers({ 'asaas-access-token': 'bad-token' })), { status: 401 });
  const payoutProvider = new AsaasPaymentProvider({
    apiKey: 'unit-test-key', webhookToken: 'x'.repeat(32), environment: 'sandbox', autoPayoutEnabled: 'true',
    payoutBankAccountJson: JSON.stringify({ bank: { code: 'test-bank' }, ownerName: 'Test Owner', cpfCnpj: '12345678901', agency: 'agency', account: 'account', accountDigit: 'digit', bankAccountType: 'CONTA_CORRENTE' }),
    fetchImpl, database,
  });
  const disabledPayoutProvider = new AsaasPaymentProvider({ apiKey: 'unit-test-key', webhookToken: 'x'.repeat(32), environment: 'sandbox', autoPayoutEnabled: 'false', payoutBankAccountJson: '{}' });
  const requestCountBeforeDisabledPayout = requests.length;
  await assert.rejects(() => disabledPayoutProvider.createPayout({ payout: { paymentId: 'pay-disabled', amountCents: 1000, currency: 'BRL' } }), { status: 503 });
  assert.equal(requests.length, requestCountBeforeDisabledPayout);
  assert.equal(disabledPayoutProvider.status.payoutDestinationConfigured, false);
  const payout = await payoutProvider.createPayout({ payout: { paymentId: 'pay-pix', amountCents: 12250, currency: 'BRL' } });
  assert.equal(payout.externalTransferId, 'transfer-test');
  assert.equal(payout.amountCents, 12250);
  assert.equal(payout.creditedAmountCents, 12200);
  assert.equal(payout.status, 'PENDING');
  assert.equal(JSON.stringify(payout).includes('12345678901'), false);
});