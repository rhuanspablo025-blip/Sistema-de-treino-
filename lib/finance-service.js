import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDatabase, getMongoClient } from './mongodb';
import { writeAuditLog } from './audit';
import calculator from './finance-calculator.cjs';
import accessPolicy from './access-policy.cjs';
import { getFinancialAccess } from './finance-access';
import { getPaymentProvider } from './payment-provider';
import financeErrors from './finance-errors.cjs';
import paymentContract from './payment-contract.cjs';
import { listPlansSqlService, savePlanSqlService, deletePlanSqlService, createSubscriptionSqlService, getSubscriptionSqlService, updateSubscriptionSqlService, listSubscriptionsSqlService, createInvoiceSqlService, listInvoicesSqlService, updateInvoiceSqlService, getRulesSqlService, updateRulesSqlService, createBlockSqlService, listBlocksSqlService, releaseBlockSqlService } from './finance-service-sql.mjs';
import { listPlansSql, upsertFinancialPlan, deletePlanSql } from './financial-repository.mjs';

const { calculateInvoiceAmounts } = calculator;
const { deriveAccessLevel } = accessPolicy;
const { normalizeChargeResult } = paymentContract;
const { FinanceError } = financeErrors;
const PLAN_PERIODS = new Set(['monthly', 'annual', 'both']);
const SUBSCRIPTION_PERIODS = new Set(['test', 'weekly', 'monthly', 'bimonthly', 'annual', 'perpetual']);
const INVOICE_STATUSES = new Set(['PENDING', 'AWAITING_PAYMENT', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', 'BLOCKED', 'PROCESSING', 'REVIEW_REQUIRED']);

export function financeErrorResponse(error, fallback = 'Não foi possível concluir a operação financeira.') {
  const status = error instanceof FinanceError ? error.status : error.code === 11000 ? 409 : 500;
  return NextResponse.json({ error: status < 500 ? error.message : fallback }, { status });
}

export async function parseFinanceRequest(request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    return payload;
  } catch {
    throw new FinanceError('Dados inválidos.');
  }
}

function text(value, label, maximum = 240) {
  if (typeof value !== 'string') throw new FinanceError(`${label} inválido.`);
  const result = value.trim();
  if (!result || result.length > maximum) throw new FinanceError(`${label} inválido.`);
  return result;
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new FinanceError(`${label} inválido.`);
  return number;
}

function percent(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new FinanceError(`${label} deve ficar entre 0 e 100.`);
  return Math.round(number * 10000) / 10000;
}

function cents(value, label) {
  return integer(value ?? 0, label, 0, 100_000_000_00);
}

function percentCents(decimal) { return Math.round(Number(decimal || 0) * 100); }

function planSlug(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function sanitizePlan(payload, existing = {}) {
  const name = text(payload.name ?? existing.name, 'Nome do plano', 100);
  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 500) : existing.description || '';
  const billingPeriod = payload.billingPeriod ?? existing.billingPeriod ?? 'both';
  if (!PLAN_PERIODS.has(billingPeriod)) throw new FinanceError('Período do plano inválido.');
  const booleanField = (key) => payload[key] === undefined ? existing[key] === true : payload[key] === true;
  return {
    name,
    slug: planSlug(name),
    description,
    billingPeriod,
    billingModel: ['ADMIN_SUBSCRIPTION', 'STUDENT_FEE', 'HYBRID'].includes(payload.billingModel) ? payload.billingModel : existing.billingModel || 'HYBRID',
    monthlyPriceCents: cents(payload.monthlyPriceCents ?? existing.monthlyPriceCents, 'Preço mensal'),
    annualPriceCents: cents(payload.annualPriceCents ?? existing.annualPriceCents, 'Preço anual'),
    includedStudents: integer(payload.includedStudents ?? existing.includedStudents ?? 10, 'Quantidade de alunos incluídos', 0, 100000),
    extraStudentPriceCents: cents(payload.extraStudentPriceCents ?? existing.extraStudentPriceCents, 'Preço por aluno adicional'),
    includedTeachers: integer(payload.includedTeachers ?? existing.includedTeachers ?? 1, 'Quantidade de professores incluídos', 0, 10000),
    extraTeacherPriceCents: cents(payload.extraTeacherPriceCents ?? existing.extraTeacherPriceCents, 'Preço por professor adicional'),
    studentMonthlyPriceCents: cents(payload.studentMonthlyPriceCents ?? existing.studentMonthlyPriceCents, 'Mensalidade do aluno'),
    studentAnnualPriceCents: cents(payload.studentAnnualPriceCents ?? existing.studentAnnualPriceCents, 'Anuidade do aluno'),
    discountCents: cents(payload.discountCents ?? existing.discountCents, 'Desconto do plano'),
    discountPercent: percent(payload.discountPercent ?? existing.discountPercent ?? 0, 'Desconto do plano'),
    platformFeePercent: percent(payload.platformFeePercent ?? existing.platformFeePercent ?? 0, 'Taxa da plataforma'),
    dueDay: integer(payload.dueDay ?? existing.dueDay ?? 10, 'Dia de vencimento', 1, 28),
    noticeDays: integer(payload.noticeDays ?? existing.noticeDays ?? 5, 'Dias de aviso', 0, 90),
    graceDays: integer(payload.graceDays ?? existing.graceDays ?? 3, 'Dias de tolerância', 0, 90),
    restrictAfterDays: integer(payload.restrictAfterDays ?? existing.restrictAfterDays ?? 1, 'Dias até restrição', 0, 365),
    blockAfterDays: integer(payload.blockAfterDays ?? existing.blockAfterDays ?? 7, 'Dias até bloqueio', 0, 365),
    allowStudentRevenueOffset: booleanField('allowStudentRevenueOffset'),
    offsetPercent: percent(payload.offsetPercent ?? existing.offsetPercent ?? 0, 'Percentual de abatimento'),
    offsetCapCents: payload.offsetCapCents === null || payload.offsetCapCents === '' ? null : cents(payload.offsetCapCents ?? existing.offsetCapCents ?? 0, 'Teto de abatimento'),
    active: payload.active === undefined ? existing.active !== false : payload.active === true,
    updatedAt: new Date(),
  };
}

function clean(document) {
  if (!document) return null;
  const { _id, ...publicData } = document;
  return publicData;
}

async function accountDetails(database, userIds) {
  if (!userIds.length) return new Map();
  const users = await database.collection('users').find({ id: { $in: [...new Set(userIds)] } }, { projection: { id: 1, username: 1, name: 1, role: 1, active: 1, ownerAdminId: 1 } }).toArray();
  return new Map(users.map((user) => [user.id, user]));
}

async function planDetails(database, planIds) {
  if (!planIds.length) return new Map();
  const plans = await database.collection('billing_plans').find({ id: { $in: [...new Set(planIds)] } }).toArray();
  return new Map(plans.map((plan) => [plan.id, plan]));
}

export async function listPlans() {
  return listPlansSqlService();
}

export async function savePlan(actor, payload, create = false) {
  return savePlanSqlService(payload, create, sanitizePlan);
}

export async function deletePlan(actor, id) {
  return deletePlanSqlService(id);
}

export async function getSubscriptions() {
  return listSubscriptionsSqlService();
}

export async function createSubscription(actor, payload) {
  if (!actor?.tenantId) throw new FinanceError('Tenant obrigatÃ³rio para criar assinatura.', 403);
  if (!payload?.planId || !payload?.accountUserId) throw new FinanceError('Dados da assinatura invÃ¡lidos.');
  return { subscription: await createSubscriptionSqlService({ tenantId: actor.tenantId, accountUserId: payload.accountUserId, planId: payload.planId, billingPeriod: payload.billingPeriod, status: 'ACTIVE', nextDueAt: payload.nextDueAt || null }), invoice: null, message: 'Assinatura criada.' };
}

export async function updateSubscription(actor, payload) {
  if (!actor?.tenantId) throw new FinanceError('Tenant obrigatÃ³rio para atualizar assinatura.', 403);
  if (!payload?.id || !payload?.status) throw new FinanceError('Dados da assinatura invÃ¡lidos.');
  return { subscription: await updateSubscriptionSqlService({ id: payload.id, tenantId: actor.tenantId, status: payload.status, planId: payload.planId || null, nextDueAt: payload.nextDueAt || null, cancelledAt: payload.status === 'CANCELLED' ? new Date().toISOString() : null }), message: 'Status da assinatura atualizado.' };
}

function periodDates(periodKey, dueDay) {
  if (typeof periodKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
    const exactDate = new Date(`${periodKey}T12:00:00.000Z`);
    if (!Number.isNaN(exactDate.getTime())) return exactDate;
  }
  if (typeof periodKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new FinanceError('Competência inválida.');
  const [year, month] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, Math.min(28, dueDay), 12));
}

async function calculateSubscriptionInvoice(database, subscription, periodKey, invoiceId = randomUUID()) {
  const [plan, user, rules] = await Promise.all([
    database.collection('billing_plans').findOne({ id: subscription.planId }),
    database.collection('users').findOne({ id: subscription.accountUserId }, { projection: { id: 1, role: 1, ownerAdminId: 1 } }),
    database.collection('billing_rules').findOne({ id: 'global' }),
  ]);
  if (!plan || !user) throw new FinanceError('Assinatura sem plano ou conta válida.', 409);
  const effectiveRules = { ...(rules || {}) };
  const dueAt = periodDates(periodKey, plan.dueDay || effectiveRules.dueDay || 10);
  const accountAdminId = subscription.ownerAdminId || (user.role === 'admin' ? user.id : user.ownerAdminId);
  const [studentCount, teacherCount, studentSubscriptions] = await Promise.all([
    accountAdminId ? database.collection('students').countDocuments({ ownerAdminId: accountAdminId, active: true }) : Promise.resolve(0),
    accountAdminId ? database.collection('users').countDocuments({ ownerAdminId: accountAdminId, role: 'trainer', active: true }) : Promise.resolve(0),
    accountAdminId ? database.collection('subscriptions').find({ ownerAdminId: accountAdminId, accountRole: 'student', status: 'ACTIVE' }).toArray() : Promise.resolve([]),
  ]);
  const studentInvoices = subscription.accountRole !== 'student' && studentSubscriptions.length
    ? await database.collection('invoices').find({ subscriptionId: { $in: studentSubscriptions.map((item) => item.id) }, status: 'PAID' }).toArray()
    : [];
  const studentRevenueCents = studentInvoices.reduce((sum, invoice) => sum + (invoice.finalAmountCents || 0), 0);
  const overdueDays = Math.max(0, Math.floor((Date.now() - dueAt.getTime()) / 86400000));
  const amounts = calculateInvoiceAmounts({ subscription, plan, rules: effectiveRules, studentCount, teacherCount, studentRevenueCents, overdueDays });
  const status = amounts.finalAmountCents === 0 ? 'PENDING' : dueAt < new Date() ? 'OVERDUE' : 'PENDING';
  return {
    id: invoiceId, subscriptionId: subscription.id, payerUserId: subscription.accountUserId, ownerAdminId: accountAdminId || null,
    planId: plan.id, periodKey, currency: 'BRL', dueAt, status,
    ...amounts,
    paidAt: null, paymentMethod: null, providerPaymentId: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

async function enrichInvoices(database, invoices) {
  const [usersById, plansById] = await Promise.all([
    accountDetails(database, invoices.map((invoice) => invoice.payerUserId)),
    planDetails(database, invoices.map((invoice) => invoice.planId)),
  ]);
  return invoices.map((invoice) => {
    const isPastDue = ['PENDING', 'AWAITING_PAYMENT'].includes(invoice.status) && new Date(invoice.dueAt) < new Date();
    const status = isPastDue ? 'OVERDUE' : invoice.status;
    return { ...clean(invoice), status, customerName: usersById.get(invoice.payerUserId)?.name || 'Conta', username: usersById.get(invoice.payerUserId)?.username || '', planName: plansById.get(invoice.planId)?.name || 'Plano', daysOverdue: status === 'OVERDUE' ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / 86400000)) : 0 };
  });
}

export async function getInvoices(status = null) {
  return listInvoicesSqlService(null, status);
}

export async function createInvoice(actor, payload) {
  if (!actor?.tenantId) throw new FinanceError('Tenant required', 403);
  const amountCents = payload?.amountCents;
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new FinanceError('Invalid invoice amount.');
  return createInvoiceSqlService({ tenantId: actor.tenantId, subscriptionId: text(payload?.subscriptionId, 'Invoice', 64), payerUserId: payload?.payerUserId, amountCents, dueAt: payload?.dueAt || null, externalReference: text(payload?.externalReference || [actor.tenantId, payload.subscriptionId, payload.periodKey || Date.now()].join(':'), 'External reference', 128) });
}

export async function updateInvoice(actor, payload) {
  if (!actor?.tenantId) throw new FinanceError('Tenant required', 403);
  if (!['CANCELLED'].includes(payload?.status)) throw new FinanceError('Invalid invoice status.');
  return updateInvoiceSqlService({ id: text(payload?.id, 'Invoice', 64), tenantId: actor.tenantId, status: payload.status });
}

export async function recordManualPayment(actor, payload) {
  const invoiceId = text(payload?.invoiceId, 'Cobrança', 64);
  const method = payload?.method;
  if (!['CASH', 'PIX', 'TRANSFER', 'CARD', 'OTHER'].includes(method)) throw new FinanceError('Forma de recebimento inválida.');
  const note = typeof payload?.note === 'string' ? payload.note.trim().slice(0, 240) : '';
  const accessDays = payload?.accessDays === 'perpetual' ? null : integer(payload?.accessDays ?? 30, 'Duração do acesso', 1, 3650);
  const database = await getDatabase();
  const invoice = await database.collection('invoices').findOne({ id: invoiceId });
  if (!invoice) throw new FinanceError('Cobrança não encontrada.', 404);
  if (!['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'BLOCKED'].includes(invoice.status)) throw new FinanceError('Esta cobrança já foi processada.', 409);
  const activeAttempt = await database.collection('payments').findOne({ invoiceId, activeAttempt: true });
  if (invoice.providerPaymentId || activeAttempt) throw new FinanceError('Há uma tentativa externa ativa para esta cobrança. Resolva-a antes de registrar um recebimento manual.', 409);

  const now = new Date();
  const payment = {
    id: randomUUID(), provider: 'manual', invoiceId,
    payerUserId: invoice.payerUserId, amountCents: invoice.finalAmountCents,
    currency: invoice.currency || 'BRL', method, status: 'PAID', activeAttempt: false,
    note, accessDays, receivedBy: actor.id, paidAt: now, createdAt: now, updatedAt: now,
  };
  const clientSession = (await getMongoClient('finance')).startSession();
  try {
    await clientSession.withTransaction(async () => {
      const currentInvoice = await database.collection('invoices').findOne({ id: invoiceId }, { session: clientSession });
      if (!currentInvoice || !['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'BLOCKED'].includes(currentInvoice.status)) throw new FinanceError('Esta cobrança já foi processada.', 409);
      const currentAttempt = await database.collection('payments').findOne({ invoiceId, activeAttempt: true }, { session: clientSession });
      if (currentInvoice.providerPaymentId || currentAttempt) throw new FinanceError('Há uma tentativa externa ativa para esta cobrança. Resolva-a antes de registrar um recebimento manual.', 409);
      await database.collection('payments').insertOne(payment, { session: clientSession });
      await database.collection('invoices').updateOne({ id: invoiceId }, { $set: { status: 'PAID', paidAt: now, paymentMethod: method, manualPaymentId: payment.id, updatedAt: now } }, { session: clientSession });
      const accessUntil = accessDays == null ? null : new Date(now.getTime() + accessDays * 86400000);
      await database.collection('subscriptions').updateOne({ id: currentInvoice.subscriptionId, status: { $ne: 'CANCELLED' } }, { $set: { status: 'ACTIVE', accessDays, nextDueAt: accessUntil, perpetual: accessDays == null, updatedAt: now } }, { session: clientSession });
      await database.collection('access_blocks').updateMany({ invoiceId, source: 'AUTOMATIC', status: 'ACTIVE' }, { $set: { status: 'RELEASED', releasedAt: now, reason: 'Pagamento registrado manualmente', updatedAt: now } }, { session: clientSession });
      await database.collection('notifications').updateOne(
        { dedupeKey: `payment:${payment.id}:received` },
        { $setOnInsert: { id: randomUUID(), dedupeKey: `payment:${payment.id}:received`, userId: invoice.payerUserId, type: 'BILLING_PAYMENT_RECEIVED', channel: 'system', invoiceId, paymentId: payment.id, title: 'Recebimento confirmado', message: `Seu pagamento de ${(payment.amountCents / 100).toFixed(2)} BRL foi confirmado. Seu acesso está liberado${accessUntil ? ` até ${accessUntil.toLocaleDateString('pt-BR')}` : ', sem vencimento'}.${note ? ` Comprovante/referência: ${note}` : ''}`, readAt: null, createdAt: now } },
        { upsert: true, session: clientSession },
      );
      await database.collection('financial_ledger').insertOne({ id: randomUUID(), accountUserId: invoice.payerUserId, invoiceId, paymentId: payment.id, type: 'MANUAL_PAYMENT_RECEIVED', amountCents: payment.amountCents, createdBy: actor.id, createdAt: now }, { session: clientSession });
      await writeAuditLog(database, { userId: actor.id, action: 'manual_payment_received', resource: 'invoice', resourceId: invoiceId, metadata: { paymentId: payment.id, amountCents: payment.amountCents, method, note }, session: clientSession });
    });
  } finally { await clientSession.endSession(); }
  return { payment: clean(payment), message: 'Recebimento registrado e acesso liberado.' };
}

export async function getPayments() {
  const database = await getDatabase();
  const payments = await database.collection('payments').find({}).sort({ createdAt: -1 }).limit(1000).toArray();
  const usersById = await accountDetails(database, payments.map((payment) => payment.payerUserId));
  return { payments: payments.map((payment) => ({ ...clean(payment), customerName: usersById.get(payment.payerUserId)?.name || 'Conta' })) };
}

export async function getPayouts() {
  const database = await getDatabase();
  const payouts = await database.collection('payment_payouts').find({}).sort({ createdAt: -1 }).limit(1000).toArray();
  const usersById = await accountDetails(database, payouts.map((payout) => payout.payerUserId));
  return { payouts: payouts.map((payout) => ({ ...clean(payout), customerName: usersById.get(payout.payerUserId)?.name || 'Conta' })) };
}

export async function listBlocks(actor) { if (!actor?.tenantId) throw new FinanceError("Tenant required",403); return listBlocksSqlService(actor.tenantId); }

export async function createManualBlock(actor,payload) { if (!actor?.tenantId) throw new FinanceError("Tenant required",403); const userId=text(payload?.userId,"User",64); const level=payload?.level; if (!["WARNING","RESTRICTION","PARTIAL","TOTAL"].includes(level)) throw new FinanceError("Invalid level"); const reason=text(payload?.reason,"Reason",240); const permanent=payload?.permanent===true; const days=permanent?null:integer(payload?.durationDays??30,"Duration",1,3650); return createBlockSqlService({tenantId:actor.tenantId,userId,level,source:"MANUAL",reason,startsAt:new Date().toISOString(),endsAt:permanent?null:new Date(Date.now()+days*86400000).toISOString(),createdBy:actor.id}); }

export async function updateManualBlock(actor,payload) { if (!actor?.tenantId) throw new FinanceError("Tenant required",403); if (payload?.action!=="release") throw new FinanceError("Only release is supported."); const result=await releaseBlockSqlService({id:text(payload?.id,"Block",64),tenantId:actor.tenantId,releasedBy:actor.id}); if (!result.block) throw new FinanceError("Block not found",404); return {message:"Acesso desbloqueado."}; }

export async function getBillingRules(actor) { return getRulesSqlService(actor?.tenantId || "global"); }

export async function updateBillingRules(actor,payload) { if (actor?.role!=="SUPER_ADMIN") throw new FinanceError("Somente SUPER_ADMIN pode alterar regras globais.",403); const graceDays=integer(payload.graceDays,"Grace days",0,90), restrictAfterDays=integer(payload.restrictAfterDays,"Restrict days",0,365), blockAfterDays=integer(payload.blockAfterDays,"Block days",0,365); if(blockAfterDays && restrictAfterDays && blockAfterDays<restrictAfterDays) throw new FinanceError("Invalid rule order"); return updateRulesSqlService({tenantId:"global",graceDays,restrictAfterDays,blockAfterDays}); }

export async function getProviderStatus() {
  const adapter = getPaymentProvider();
  return { provider: { ...adapter.status, environment: adapter.status.available ? process.env.PAYMENT_ENVIRONMENT || 'sandbox' : 'unconfigured', message: adapter.status.available ? 'Provider disponível.' : 'Nenhum adapter oficial foi configurado.' } };
}

export async function updateProviderConfig(actor, payload) {
  if (payload?.provider !== 'unconfigured') throw new FinanceError('Somente o estado não configurado pode ser salvo. Configure um provider oficial via ambiente seguro.');
  const database = await getDatabase();
  await database.collection('payment_provider_config').updateOne(
    { id: 'global' },
    { $set: { provider: 'unconfigured', environment: 'sandbox', methods: { pix: false, boleto: false, card: false }, updatedAt: new Date(), updatedBy: actor.id } },
    { upsert: true },
  );
  await writeAuditLog(database, { userId: actor.id, action: 'payment_provider_config_update', resource: 'payment_provider_config', resourceId: 'global', metadata: { provider: 'unconfigured' } });
  return { message: 'Provider mantido como não configurado; nenhum pagamento falso foi habilitado.' };
}

export async function getLedger() {
  const database = await getDatabase();
  const entries = await database.collection('financial_ledger').find({}).sort({ createdAt: -1 }).limit(1000).toArray();
  const usersById = await accountDetails(database, entries.map((entry) => entry.accountUserId));
  return { entries: entries.map((entry) => ({ ...clean(entry), actorName: usersById.get(entry.createdBy)?.name || usersById.get(entry.accountUserId)?.name || 'Sistema' })) };
}

export async function getFinanceDashboard() {
  const database = await getDatabase();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  const [invoices, subscriptions, blocks, activeStudents, payments, rules, plans] = await Promise.all([
    database.collection('invoices').find({}).sort({ dueAt: 1 }).limit(10000).toArray(),
    database.collection('subscriptions').find({}).toArray(),
    database.collection('access_blocks').find({ status: 'ACTIVE', level: { $in: ['RESTRICTION', 'PARTIAL', 'TOTAL'] }, $or: [{ endsAt: { $gt: now } }, { endsAt: null }, { endsAt: { $exists: false } }] }).toArray(),
    database.collection('students').countDocuments({ active: true }),
    database.collection('payments').find({ status: 'PAID', paidAt: { $gte: monthStart } }).toArray(),
    database.collection('billing_rules').findOne({ id: 'global' }),
    database.collection('billing_plans').find({}).sort({ createdAt: -1 }).limit(500).toArray(),
  ]);
  const currentMonthInvoices = invoices.filter((invoice) => new Date(invoice.createdAt) >= monthStart);
  const monthPayments = payments.reduce((sum, payment) => sum + (payment.amountCents || 0), 0);
  const expected = invoices.filter((invoice) => ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'PROCESSING'].includes(invoice.status)).reduce((sum, invoice) => sum + (invoice.finalAmountCents || 0), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE' || (['PENDING', 'AWAITING_PAYMENT'].includes(invoice.status) && new Date(invoice.dueAt) < now));
  const overdueCents = overdueInvoices.reduce((sum, invoice) => sum + (invoice.finalAmountCents || 0), 0);
  const upcomingInvoices = await enrichInvoices(database, invoices.filter((invoice) => ['PENDING', 'AWAITING_PAYMENT'].includes(invoice.status) && new Date(invoice.dueAt) >= now && new Date(invoice.dueAt) <= sevenDays).slice(0, 12));
  const monthLabels = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const periodPayments = await database.collection('payments').find({ status: 'PAID', paidAt: { $gte: start, $lt: end } }, { projection: { amountCents: 1 } }).toArray();
    monthLabels.push({ month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`, label: start.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }), valueCents: periodPayments.reduce((sum, payment) => sum + (payment.amountCents || 0), 0) });
  }
  const feeCents = currentMonthInvoices.reduce((sum, invoice) => sum + (invoice.platformFeeCents || 0) + (invoice.lateFeeCents || 0) + (invoice.interestCents || 0), 0);
  const discountCents = currentMonthInvoices.reduce((sum, invoice) => sum + (invoice.discountCents || 0) + (invoice.appliedOffsetCents || 0), 0);
  const monthlyMaxCents = Math.max(1, ...monthLabels.map((item) => item.valueCents));
  return {
    dashboard: {
      monthlyRevenueCents: monthPayments,
      expectedRevenueCents: expected,
      receivedRevenueCents: monthPayments,
      overdueCents,
      activeSubscriptions: subscriptions.filter((item) => item.status === 'ACTIVE').length,
      dueSoonCount: upcomingInvoices.length,
      overdueSubscriptions: overdueInvoices.length,
      blockedUsers: blocks.length,
      activeStudents,
      studentRevenueCents: currentMonthInvoices.filter((invoice) => invoice.accountRole === 'student').reduce((sum, invoice) => sum + (invoice.finalAmountCents || 0), 0),
      feesAndDiscountsCents: feeCents - discountCents,
      netEstimatedCents: Math.max(0, monthPayments - feeCents),
      monthlySeries: monthLabels,
      monthlyMaxCents,
      paymentStatusCounts: Object.fromEntries(['PENDING', 'PAID', 'OVERDUE', 'PROCESSING', 'REFUNDED'].map((status) => [status, invoices.filter((invoice) => invoice.status === status).length])),
      rules,
    },
    plans: plans.map(clean), subscriptions: await listSubscriptions(database), upcomingInvoices, blocks: await listBlocks().then((result) => result.blocks),
  };
}

export async function getMyBillingAccount(user) {
  const database = await getDatabase();
  const [invoices, subscriptions, access] = await Promise.all([
    database.collection('invoices').find({ payerUserId: user.id }).sort({ createdAt: -1 }).limit(100).toArray(),
    database.collection('subscriptions').find({ accountUserId: user.id }).sort({ createdAt: -1 }).limit(50).toArray(),
    getFinancialAccess(user),
  ]);
  const planIds = [...new Set(subscriptions.map((subscription) => subscription.planId))];
  const plansById = await planDetails(database, planIds);
  return {
    invoices: await enrichInvoices(database, invoices),
    subscriptions: subscriptions.map((subscription) => ({ ...clean(subscription), planName: plansById.get(subscription.planId)?.name || 'Plano' })),
    access,
  };
}

function calculateStoredInvoiceAmount(invoice) {
  const components = ['baseCents', 'extraStudentCents', 'extraTeacherCents', 'platformFeeCents', 'lateFeeCents', 'interestCents', 'discountCents', 'appliedOffsetCents'];
  if (components.some((key) => !Number.isSafeInteger(invoice[key]) || invoice[key] < 0)) return null;
  return Math.max(0, invoice.baseCents + invoice.extraStudentCents + invoice.extraTeacherCents + invoice.platformFeeCents + invoice.lateFeeCents + invoice.interestCents - invoice.discountCents - invoice.appliedOffsetCents);
}

function existingCheckout(payment) {
  if (!payment?.providerPaymentId || !payment.checkout) throw new FinanceError('Já existe uma tentativa de pagamento em processamento; aguarde a conciliação.', 409);
  return { checkout: { externalPaymentId: payment.providerPaymentId, status: payment.status, method: payment.method, checkout: payment.checkout } };
}

export async function requestInvoiceCheckout(user, payload) {
  const invoiceId = text(payload?.invoiceId, 'Cobrança', 64);
  if (!['PIX', 'BOLETO', 'CARD'].includes(payload?.method)) throw new FinanceError('Método de pagamento inválido.');
  const database = await getDatabase();
  const invoice = await database.collection('invoices').findOne({ id: invoiceId });
  if (!invoice) throw new FinanceError('Cobrança não encontrada.', 404);
  if (invoice.payerUserId !== user.id) throw new FinanceError('Cobrança não encontrada.', 404);
  const activeAttempt = await database.collection('payments').findOne({ invoiceId, activeAttempt: true });
  if (activeAttempt) return existingCheckout(activeAttempt);
  if (!['PENDING', 'OVERDUE', 'AWAITING_PAYMENT'].includes(invoice.status)) throw new FinanceError('Esta cobrança não aceita novos pagamentos.', 409);
  const provider = getPaymentProvider();
  if (!provider.status.available) throw new FinanceError('Pagamentos online indisponíveis. O proprietário ainda precisa configurar um gateway oficial.', 503);
  if (provider.status.methods?.[payload.method.toLowerCase()] !== true) throw new FinanceError('Este método não está habilitado pelo provedor.', 503);
  if (invoice.currency !== 'BRL' || !Number.isSafeInteger(invoice.finalAmountCents) || invoice.finalAmountCents <= 0) throw new FinanceError('Valor ou moeda da cobrança inválidos.', 409);

  const calculatedAmountCents = calculateStoredInvoiceAmount(invoice);
  if (calculatedAmountCents === null || calculatedAmountCents !== invoice.finalAmountCents) {
    const now = new Date();
    await database.collection('invoices').updateOne({ id: invoice.id, status: invoice.status }, { $set: { status: 'REVIEW_REQUIRED', updatedAt: now } });
    await writeAuditLog(database, { userId: 'billing-system', action: 'invoice_amount_mismatch', resource: 'invoice', resourceId: invoice.id, metadata: { calculatedAmountCents, storedAmountCents: invoice.finalAmountCents } });
    throw new FinanceError('Divergência no valor da fatura; pagamento bloqueado para revisão.', 409);
  }

  const now = new Date();
  const paymentId = randomUUID();
  const attempt = {
    id: paymentId, invoiceId: invoice.id, subscriptionId: invoice.subscriptionId, payerUserId: invoice.payerUserId,
    provider: provider.status.provider, method: payload.method, amountCents: invoice.finalAmountCents, currency: invoice.currency,
    status: 'PROCESSING', activeAttempt: true, idempotencyKey: `payment:${paymentId}`,
    createdAt: now, updatedAt: now,
  };
  const client = await getMongoClient('finance');
  const session = client.startSession();
  let concurrentAttempt = null;
  try {
    await session.withTransaction(async () => {
      concurrentAttempt = await database.collection('payments').findOne({ invoiceId, activeAttempt: true }, { session });
      if (concurrentAttempt) return;
      const currentInvoice = await database.collection('invoices').findOne({ id: invoice.id, payerUserId: user.id }, { session });
      if (!currentInvoice || !['PENDING', 'OVERDUE', 'AWAITING_PAYMENT'].includes(currentInvoice.status) || currentInvoice.finalAmountCents !== invoice.finalAmountCents) throw new FinanceError('A fatura foi alterada e precisa ser atualizada antes do pagamento.', 409);
      const reserved = await database.collection('invoices').updateOne(
        { id: invoice.id, status: currentInvoice.status, $or: [{ providerPaymentId: null }, { providerPaymentId: { $exists: false } }] },
        { $set: { status: 'PROCESSING', paymentAttemptId: attempt.id, updatedAt: now } },
        { session },
      );
      if (reserved.modifiedCount !== 1) throw new FinanceError('A fatura já possui uma tentativa de pagamento.', 409);
      await database.collection('payments').insertOne(attempt, { session });
      await writeAuditLog(database, { userId: user.id, action: 'payment_initiated', resource: 'invoice', resourceId: invoice.id, metadata: { paymentId: attempt.id, method: attempt.method, amountCents: attempt.amountCents, currency: attempt.currency, provider: attempt.provider }, session });
    });
  } catch (error) {
    if (error.code === 11000) {
      concurrentAttempt = await database.collection('payments').findOne({ invoiceId, activeAttempt: true });
      if (!concurrentAttempt) throw error;
    }
    else throw error;
  } finally { await session.endSession(); }
  if (concurrentAttempt) return existingCheckout(concurrentAttempt);

  let normalized;
  try {
    const result = await provider.createCharge({
      invoice: { id: invoice.id, finalAmountCents: invoice.finalAmountCents, currency: invoice.currency, dueAt: invoice.dueAt, payerUserId: invoice.payerUserId },
      method: attempt.method,
      idempotencyKey: attempt.idempotencyKey,
      payer: { id: user.id, name: user.name, cpfCnpj: payload.cpfCnpj },
    });
    normalized = normalizeChargeResult(result, attempt.method);
  } catch (error) {
    if (error instanceof FinanceError && error.status >= 400 && error.status < 500) {
      const failedAt = new Date();
      await database.collection('payments').updateOne({ id: attempt.id }, { $set: { status: 'FAILED', activeAttempt: false, updatedAt: failedAt } });
      await database.collection('invoices').updateOne(
        { id: invoice.id, paymentAttemptId: attempt.id, status: 'PROCESSING' },
        { $set: { status: invoice.status, updatedAt: failedAt }, $unset: { paymentAttemptId: '' } },
      );
      await writeAuditLog(database, { userId: user.id, action: 'payment_creation_failed', resource: 'invoice', resourceId: invoice.id, metadata: { paymentId: attempt.id, provider: attempt.provider, method: attempt.method, httpStatus: error.status } });
      throw error;
    }
    await database.collection('payments').updateOne({ id: attempt.id }, { $set: { status: 'REVIEW_REQUIRED', updatedAt: new Date() } });
    await database.collection('invoices').updateOne({ id: invoice.id, paymentAttemptId: attempt.id }, { $set: { status: 'REVIEW_REQUIRED', updatedAt: new Date() } });
    await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_creation_review_required', resource: 'invoice', resourceId: invoice.id, metadata: { paymentId: attempt.id, provider: attempt.provider } });
    throw new FinanceError('O resultado da solicitação ao provedor não pôde ser conciliado; a tentativa foi retida para revisão.', 502);
  }

  const invoiceStatus = normalized.status === 'PENDING' ? 'AWAITING_PAYMENT' : 'PROCESSING';
  const payment = {
    ...attempt,
    providerPaymentId: normalized.externalPaymentId,
    status: normalized.status,
    checkout: normalized.checkout,
    updatedAt: new Date(),
  };
  const persistSession = client.startSession();
  try {
    await persistSession.withTransaction(async () => {
      const currentPayment = await database.collection('payments').findOne({ id: attempt.id }, { session: persistSession });
      const currentInvoice = await database.collection('invoices').findOne({ id: invoice.id }, { session: persistSession });
      if (!currentPayment || !currentInvoice || (currentPayment.providerPaymentId && currentPayment.providerPaymentId !== normalized.externalPaymentId)) throw new Error('PAYMENT_ATTEMPT_CHANGED');
      const paymentFields = { providerPaymentId: normalized.externalPaymentId, checkout: normalized.checkout, updatedAt: new Date() };
      if (currentPayment.activeAttempt && currentPayment.status === 'PROCESSING') paymentFields.status = normalized.status;
      const paymentUpdate = await database.collection('payments').updateOne({ id: attempt.id }, { $set: paymentFields }, { session: persistSession });
      if (paymentUpdate.matchedCount !== 1) throw new Error('PAYMENT_ATTEMPT_NOT_FOUND');
      if (currentInvoice.paymentAttemptId === attempt.id && currentInvoice.status === 'PROCESSING') {
        const invoiceUpdate = await database.collection('invoices').updateOne(
          { id: invoice.id, paymentAttemptId: attempt.id, status: 'PROCESSING' },
          { $set: { status: invoiceStatus, providerPaymentId: normalized.externalPaymentId, paymentMethod: attempt.method, updatedAt: new Date() } },
          { session: persistSession },
        );
        if (invoiceUpdate.matchedCount !== 1) throw new Error('INVOICE_ATTEMPT_CHANGED');
      } else if (!['PAID', 'REFUNDED', 'CANCELLED', 'REVIEW_REQUIRED'].includes(currentInvoice.status)) {
        throw new Error('INVOICE_ATTEMPT_CHANGED');
      }
      await writeAuditLog(database, { userId: user.id, action: 'payment_checkout_created', resource: 'invoice', resourceId: invoice.id, metadata: { paymentId: attempt.id, provider: attempt.provider, method: attempt.method, amountCents: attempt.amountCents, currency: attempt.currency }, session: persistSession });
    });
  } catch {
    await database.collection('payments').updateOne({ id: attempt.id }, { $set: { status: 'REVIEW_REQUIRED', providerPaymentId: normalized.externalPaymentId, updatedAt: new Date() } });
    await database.collection('invoices').updateOne({ id: invoice.id, paymentAttemptId: attempt.id }, { $set: { status: 'REVIEW_REQUIRED', providerPaymentId: normalized.externalPaymentId, updatedAt: new Date() } });
    await writeAuditLog(database, { userId: 'payment-provider', action: 'payment_persistence_review_required', resource: 'invoice', resourceId: invoice.id, metadata: { paymentId: attempt.id, providerPaymentId: normalized.externalPaymentId } });
    throw new FinanceError('A cobrança externa foi criada, mas precisa de conciliação antes de prosseguir.', 502);
  } finally { await persistSession.endSession(); }
  return { checkout: { externalPaymentId: normalized.externalPaymentId, status: normalized.status, method: attempt.method, checkout: normalized.checkout } };
}
