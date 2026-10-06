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

const { calculateInvoiceAmounts } = calculator;
const { deriveAccessLevel } = accessPolicy;
const { normalizeChargeResult } = paymentContract;
const { FinanceError } = financeErrors;
const PLAN_PERIODS = new Set(['monthly', 'annual', 'both']);
const SUBSCRIPTION_PERIODS = new Set(['monthly', 'annual']);
const FINANCIAL_ROLES = new Set(['admin', 'trainer', 'student']);
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
  const database = await getDatabase();
  const plans = await database.collection('billing_plans').find({}).sort({ createdAt: -1 }).limit(500).toArray();
  return { plans: plans.map(clean) };
}

export async function savePlan(actor, payload, create = false) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new FinanceError('Dados do plano inválidos.');
  const plans = (await getDatabase()).collection('billing_plans');
  const existing = create ? null : await plans.findOne({ id: text(payload.id, 'ID do plano', 64) });
  if (!create && !existing) throw new FinanceError('Plano não encontrado.', 404);
  const fields = sanitizePlan(payload, existing || {});
  const plan = { id: existing?.id || randomUUID(), ...fields, createdAt: existing?.createdAt || new Date() };
  if (existing) await plans.updateOne({ id: existing.id }, { $set: fields });
  else await plans.insertOne(plan);
  await writeAuditLog(await getDatabase(), { userId: actor.id, action: existing ? 'finance_plan_update' : 'finance_plan_create', resource: 'billing_plan', resourceId: plan.id, metadata: { before: existing && { name: existing.name, monthlyPriceCents: existing.monthlyPriceCents }, after: { name: plan.name, monthlyPriceCents: plan.monthlyPriceCents } } });
  return { plan: clean(plan), message: existing ? 'Plano atualizado.' : 'Plano criado.' };
}

export async function deletePlan(actor, id) {
  const database = await getDatabase();
  const plan = await database.collection('billing_plans').findOne({ id });
  if (!plan) throw new FinanceError('Plano não encontrado.', 404);
  if (await database.collection('subscriptions').countDocuments({ planId: id })) throw new FinanceError('O plano possui assinaturas vinculadas; desative-o em vez de excluir.', 409);
  await database.collection('billing_plans').deleteOne({ id });
  await writeAuditLog(database, { userId: actor.id, action: 'finance_plan_delete', resource: 'billing_plan', resourceId: id, metadata: { name: plan.name } });
  return { message: 'Plano excluído.' };
}

async function listSubscriptions(database, filter = {}) {
  const subscriptions = await database.collection('subscriptions').find(filter).sort({ createdAt: -1 }).limit(1000).toArray();
  const usersById = await accountDetails(database, subscriptions.map((subscription) => subscription.accountUserId));
  const plansById = await planDetails(database, subscriptions.map((subscription) => subscription.planId));
  return subscriptions.map((subscription) => ({
    ...clean(subscription),
    accountName: usersById.get(subscription.accountUserId)?.name || 'Conta',
    username: usersById.get(subscription.accountUserId)?.username || '',
    planName: plansById.get(subscription.planId)?.name || 'Plano',
  }));
}

export async function getSubscriptions() {
  const database = await getDatabase();
  const users = await database.collection('users').find({ role: { $in: ['admin', 'trainer', 'student'] }, active: true }, { projection: { id: 1, username: 1, name: 1, role: 1, ownerAdminId: 1 } }).sort({ name: 1 }).limit(1000).toArray();
  const plans = await database.collection('billing_plans').find({ active: true }, { projection: { id: 1, name: 1 } }).sort({ name: 1 }).toArray();
  return { subscriptions: await listSubscriptions(database), users, plans };
}

export async function createSubscription(actor, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new FinanceError('Dados da assinatura inválidos.');
  const accountUserId = text(payload.accountUserId, 'Conta', 64);
  const planId = text(payload.planId, 'Plano', 64);
  const billingPeriod = payload.billingPeriod;
  if (!SUBSCRIPTION_PERIODS.has(billingPeriod)) throw new FinanceError('Período da assinatura inválido.');
  const database = await getDatabase();
  const user = await database.collection('users').findOne({ id: accountUserId, active: true });
  if (!user || !FINANCIAL_ROLES.has(user.role)) throw new FinanceError('Conta não encontrada ou não faturável.', 404);
  const plan = await database.collection('billing_plans').findOne({ id: planId, active: true });
  if (!plan) throw new FinanceError('Plano não encontrado ou inativo.', 404);
  const isAnnual = billingPeriod === 'annual';
  if ((isAnnual && plan.billingPeriod === 'monthly') || (!isAnnual && plan.billingPeriod === 'annual')) throw new FinanceError('Este plano não oferece o período selecionado.');
  if (await database.collection('subscriptions').findOne({ accountUserId, status: 'ACTIVE' })) throw new FinanceError('Esta conta já possui uma assinatura ativa.', 409);
  const accountRole = user.role;
  const ownerAdminId = accountRole === 'admin' ? accountUserId : user.ownerAdminId || null;
  const dueDay = plan.dueDay || 10;
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(dueDay, 28), 12));
  if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  const subscription = {
    id: randomUUID(), accountUserId, accountRole, ownerAdminId, planId, billingPeriod,
    status: 'ACTIVE', startAt: now, nextDueAt: candidate, discountCents: 0,
    createdAt: now, updatedAt: now,
  };
  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      await database.collection('subscriptions').insertOne(subscription, { session });
      await writeAuditLog(database, { userId: actor.id, action: 'subscription_create', resource: 'subscription', resourceId: subscription.id, metadata: { accountUserId, planId, billingPeriod }, session });
    });
  } finally { await session.endSession(); }
  return { subscription: clean(subscription), message: 'Assinatura criada.' };
}

export async function updateSubscription(actor, payload) {
  const id = text(payload?.id, 'Assinatura', 64);
  const status = payload?.status;
  if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status)) throw new FinanceError('Status da assinatura inválido.');
  const database = await getDatabase();
  const existing = await database.collection('subscriptions').findOne({ id });
  if (!existing) throw new FinanceError('Assinatura não encontrada.', 404);
  const now = new Date();
  await database.collection('subscriptions').updateOne({ id }, { $set: { status, updatedAt: now, ...(status === 'CANCELLED' && { cancelledAt: now, cancelledBy: actor.id }) } });
  await writeAuditLog(database, { userId: actor.id, action: `subscription_${status.toLowerCase()}`, resource: 'subscription', resourceId: id, metadata: { previousStatus: existing.status, status } });
  return { message: 'Status da assinatura atualizado.' };
}

function periodDates(periodKey, dueDay) {
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
  return invoices.map((invoice) => ({ ...clean(invoice), customerName: usersById.get(invoice.payerUserId)?.name || 'Conta', username: usersById.get(invoice.payerUserId)?.username || '', planName: plansById.get(invoice.planId)?.name || 'Plano', daysOverdue: invoice.status === 'OVERDUE' ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / 86400000)) : 0 }));
}

export async function getInvoices(status = null) {
  const database = await getDatabase();
  const filter = status ? { status } : {};
  const invoices = await database.collection('invoices').find(filter).sort({ dueAt: -1 }).limit(1000).toArray();
  return { invoices: await enrichInvoices(database, invoices) };
}

export async function createInvoice(actor, payload) {
  const subscriptionId = text(payload?.subscriptionId, 'Assinatura', 64);
  const periodKey = text(payload?.periodKey, 'Competência', 7);
  const database = await getDatabase();
  const subscription = await database.collection('subscriptions').findOne({ id: subscriptionId, status: 'ACTIVE' });
  if (!subscription) throw new FinanceError('Assinatura ativa não encontrada.', 404);
  const invoice = await calculateSubscriptionInvoice(database, subscription, periodKey);
  const ledgerEntry = { id: randomUUID(), accountUserId: subscription.accountUserId, invoiceId: invoice.id, type: 'INVOICE_CREATED', amountCents: invoice.finalAmountCents, createdAt: new Date() };
  const session = (await getMongoClient()).startSession();
  try {
    await session.withTransaction(async () => {
      await database.collection('invoices').insertOne(invoice, { session });
      await database.collection('financial_ledger').insertOne(ledgerEntry, { session });
      await database.collection('notifications').updateOne(
        { dedupeKey: `invoice:${invoice.id}:created` },
        { $setOnInsert: { id: randomUUID(), dedupeKey: `invoice:${invoice.id}:created`, userId: invoice.payerUserId, type: 'BILLING_INVOICE_CREATED', channel: 'system', invoiceId: invoice.id, title: 'Nova cobrança disponível', message: `Uma cobrança de ${(invoice.finalAmountCents / 100).toFixed(2)} BRL vence em ${invoice.dueAt.toISOString().slice(0, 10)}.`, readAt: null, createdAt: new Date() } },
        { upsert: true, session },
      );
      await writeAuditLog(database, { userId: actor.id, action: 'invoice_create', resource: 'invoice', resourceId: invoice.id, metadata: { subscriptionId, periodKey, finalAmountCents: invoice.finalAmountCents }, session });
    });
  } finally { await session.endSession(); }
  return { invoice: clean(invoice), message: 'Cobrança gerada com cálculo do servidor.' };
}

export async function updateInvoice(actor, payload) {
  const id = text(payload?.id, 'Cobrança', 64);
  if (payload?.status !== 'CANCELLED') throw new FinanceError('Somente cobranças pendentes podem ser canceladas manualmente.');
  const database = await getDatabase();
  const invoice = await database.collection('invoices').findOne({ id });
  if (!invoice) throw new FinanceError('Cobrança não encontrada.', 404);
  if (!['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'BLOCKED'].includes(invoice.status)) throw new FinanceError('Esta cobrança já foi processada e não pode ser cancelada manualmente.', 409);
  const activePayment = await database.collection('payments').findOne({ invoiceId: id, activeAttempt: true });
  if (invoice.providerPaymentId || activePayment) throw new FinanceError('Esta fatura possui uma cobrança externa ativa; cancele-a pelo provedor e aguarde a confirmação oficial antes de cancelar a fatura.', 409);
  const now = new Date();
  await database.collection('invoices').updateOne({ id, status: invoice.status }, { $set: { status: 'CANCELLED', cancelledAt: now, cancelledBy: actor.id, updatedAt: now } });
  await database.collection('financial_ledger').insertOne({ id: randomUUID(), accountUserId: invoice.payerUserId, invoiceId: id, type: 'INVOICE_CANCELLED', amountCents: 0, createdBy: actor.id, createdAt: now });
  await writeAuditLog(database, { userId: actor.id, action: 'invoice_cancel', resource: 'invoice', resourceId: id, metadata: { previousStatus: invoice.status } });
  return { message: 'Cobrança cancelada.' };
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

export async function listBlocks() {
  const database = await getDatabase();
  const [blocks, users] = await Promise.all([
    database.collection('access_blocks').find({}).sort({ startsAt: -1 }).limit(1000).toArray(),
    database.collection('users').find({ role: { $ne: 'SUPER_ADMIN' }, active: true }, { projection: { id: 1, username: 1, name: 1, role: 1 } }).sort({ name: 1 }).limit(2000).toArray(),
  ]);
  const usersById = await accountDetails(database, blocks.map((block) => block.userId));
  return { users, blocks: blocks.map((block) => ({ ...clean(block), username: usersById.get(block.userId)?.username || '', userName: usersById.get(block.userId)?.name || 'Conta' })) };
}

export async function createManualBlock(actor, payload, request) {
  const userId = text(payload?.userId, 'Usuário', 64);
  const level = payload?.level;
  if (!['WARNING', 'RESTRICTION', 'PARTIAL', 'TOTAL'].includes(level)) throw new FinanceError('Nível de bloqueio inválido.');
  const reason = text(payload?.reason, 'Motivo', 240);
  const durationDays = integer(payload?.durationDays ?? 7, 'Duração', 1, 3650);
  const database = await getDatabase();
  const user = await database.collection('users').findOne({ id: userId, active: true, role: { $ne: 'SUPER_ADMIN' } });
  if (!user) throw new FinanceError('Conta não encontrada.', 404);
  const now = new Date();
  const block = {
    id: randomUUID(), userId, level, source: 'MANUAL', status: 'ACTIVE', reason,
    startsAt: now, endsAt: new Date(now.getTime() + durationDays * 86400000),
    createdBy: actor.id, ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    createdAt: now, updatedAt: now,
  };
  await database.collection('access_blocks').insertOne(block);
  await writeAuditLog(database, { userId: actor.id, action: 'manual_access_block', resource: 'access_block', resourceId: block.id, metadata: { targetUserId: userId, level, reason, durationDays } });
  return { block: clean(block), message: 'Bloqueio manual registrado.' };
}

export async function updateManualBlock(actor, payload) {
  const id = text(payload?.id, 'Bloqueio', 64);
  const action = payload?.action;
  if (!['release', 'extend'].includes(action)) throw new FinanceError('Ação de bloqueio inválida.');
  const database = await getDatabase();
  const block = await database.collection('access_blocks').findOne({ id, status: 'ACTIVE', source: 'MANUAL' });
  if (!block) throw new FinanceError('Bloqueio manual ativo não encontrado.', 404);
  const now = new Date();
  let update;
  if (action === 'release') update = { status: 'RELEASED', releasedAt: now, releasedBy: actor.id, updatedAt: now };
  else update = { endsAt: new Date(Math.max(now.getTime(), new Date(block.endsAt).getTime()) + integer(payload.durationDays, 'Duração', 1, 3650) * 86400000), updatedAt: now };
  await database.collection('access_blocks').updateOne({ id }, { $set: update });
  await writeAuditLog(database, { userId: actor.id, action: action === 'release' ? 'manual_access_release' : 'manual_access_extend', resource: 'access_block', resourceId: id, metadata: { targetUserId: block.userId, ...(action === 'extend' && { durationDays: payload.durationDays }) } });
  return { message: action === 'release' ? 'Acesso desbloqueado.' : 'Prazo do bloqueio prorrogado.' };
}

export async function getBillingRules() {
  return { rules: clean(await (await getDatabase()).collection('billing_rules').findOne({ id: 'global' })) };
}

export async function updateBillingRules(actor, payload) {
  const rules = {
    currency: 'BRL',
    dueDay: integer(payload.dueDay, 'Dia de vencimento', 1, 28),
    noticeDays: integer(payload.noticeDays, 'Dias de aviso', 0, 90),
    graceDays: integer(payload.graceDays, 'Dias de tolerância', 0, 90),
    restrictAfterDays: integer(payload.restrictAfterDays, 'Dias até restrição', 0, 365),
    blockAfterDays: integer(payload.blockAfterDays, 'Dias até bloqueio', 0, 365),
    lateFeePercent: percent(payload.lateFeePercent, 'Multa'),
    dailyInterestPercent: percent(payload.dailyInterestPercent, 'Juros diário'),
    platformFeePercent: percent(payload.platformFeePercent, 'Taxa da plataforma'),
    allowStudentRevenueOffset: payload.allowStudentRevenueOffset === true,
    offsetPercent: percent(payload.offsetPercent, 'Percentual de abatimento'),
    offsetCapCents: payload.offsetCapCents == null ? null : cents(payload.offsetCapCents, 'Limite de abatimento'),
    creditCarryover: payload.creditCarryover === true,
    updatedAt: new Date(), updatedBy: actor.id,
  };
  if (rules.blockAfterDays && rules.restrictAfterDays && rules.blockAfterDays < rules.restrictAfterDays) throw new FinanceError('O bloqueio total não pode ocorrer antes da restrição.');
  const database = await getDatabase();
  const previous = await database.collection('billing_rules').findOne({ id: 'global' });
  await database.collection('billing_rules').updateOne({ id: 'global' }, { $set: rules }, { upsert: true });
  await writeAuditLog(database, { userId: actor.id, action: 'billing_rules_update', resource: 'billing_rules', resourceId: 'global', metadata: { before: previous, after: rules } });
  return { rules, message: 'Regras de cobrança atualizadas.' };
}

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
    database.collection('access_blocks').find({ status: 'ACTIVE', endsAt: { $gt: now }, level: { $in: ['RESTRICTION', 'PARTIAL', 'TOTAL'] } }).toArray(),
    database.collection('students').countDocuments({ active: true }),
    database.collection('payments').find({ status: 'PAID', paidAt: { $gte: monthStart } }).toArray(),
    database.collection('billing_rules').findOne({ id: 'global' }),
    database.collection('billing_plans').find({}).sort({ createdAt: -1 }).limit(500).toArray(),
  ]);
  const currentMonthInvoices = invoices.filter((invoice) => new Date(invoice.createdAt) >= monthStart);
  const monthPayments = payments.reduce((sum, payment) => sum + (payment.amountCents || 0), 0);
  const expected = invoices.filter((invoice) => ['PENDING', 'AWAITING_PAYMENT', 'OVERDUE', 'PROCESSING'].includes(invoice.status)).reduce((sum, invoice) => sum + (invoice.finalAmountCents || 0), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE');
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
  const providerAdapter = getPaymentProvider();
  const [invoices, subscriptions, access] = await Promise.all([
    database.collection('invoices').find({ payerUserId: user.id }).sort({ createdAt: -1 }).limit(100).toArray(),
    database.collection('subscriptions').find({ accountUserId: user.id }).sort({ createdAt: -1 }).limit(50).toArray(),
    getFinancialAccess(user),
  ]);
  const activePayments = invoices.length ? await database.collection('payments').find(
    { invoiceId: { $in: invoices.map((invoice) => invoice.id) }, payerUserId: user.id, activeAttempt: true, providerPaymentId: { $type: 'string' } },
    { projection: { invoiceId: 1, providerPaymentId: 1, status: 1, method: 1, checkout: 1 } },
  ).toArray() : [];
  const checkoutByInvoice = new Map(activePayments.map((payment) => [payment.invoiceId, {
    externalPaymentId: payment.providerPaymentId,
    status: payment.status,
    method: payment.method,
    checkout: payment.checkout,
  }]));
  const enrichedInvoices = (await enrichInvoices(database, invoices)).map((invoice) => ({ ...invoice, activeCheckout: checkoutByInvoice.get(invoice.id) || null }));
  const planIds = [...new Set(subscriptions.map((subscription) => subscription.planId))];
  const plansById = await planDetails(database, planIds);
  return {
    invoices: enrichedInvoices,
    subscriptions: subscriptions.map((subscription) => ({ ...clean(subscription), planName: plansById.get(subscription.planId)?.name || 'Plano' })),
    access,
    provider: providerAdapter.status,
    customerSetup: await providerAdapter.getPayerSetup(user.id),
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
  const attempt = {
    id: randomUUID(), invoiceId: invoice.id, subscriptionId: invoice.subscriptionId, payerUserId: invoice.payerUserId,
    provider: provider.status.provider, method: payload.method, amountCents: invoice.finalAmountCents, currency: invoice.currency,
    status: 'PROCESSING', activeAttempt: true, idempotencyKey: `payment:${attempt.id}`,
    createdAt: now, updatedAt: now,
  };
  const client = await getMongoClient();
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