import { randomUUID } from 'node:crypto';
import { listPlansSql, upsertFinancialPlan, deletePlanSql, createSubscriptionSql, getSubscriptionSql, updateSubscriptionSql, listSubscriptionsSql, createInvoiceSql, getInvoiceSql, listInvoicesSql, updateInvoiceSql, getRulesSql, upsertRulesSql, createAccessBlockSql, listAccessBlocksSql, releaseAccessBlockSql } from './financial-repository.mjs';

export const listPlansSqlService = async () => ({ plans: await listPlansSql() });
export const savePlanSqlService = async (payload, create = false, sanitize) => ({ plan: await upsertFinancialPlan({ id: create ? randomUUID() : payload.id, tenantId: null, fields: sanitize(payload, {}) }), message: create ? 'Plano criado.' : 'Plano atualizado.' });
export const deletePlanSqlService = async (id) => { try { await deletePlanSql(id); return { message: 'Plano excluído.' }; } catch (error) { if (error.message === 'PLAN_HAS_SUBSCRIPTIONS') { const e = new Error('O plano possui assinaturas vinculadas; desative-o em vez de excluir.'); e.status = 409; throw e; } throw error; } };
const mapSubscription = (row) => row ? ({ ...row, tenantId: row.tenant_id, accountUserId: row.account_user_id, planId: row.plan_id, billingPeriod: row.billing_period, nextDueAt: row.next_due_at, startAt: row.start_at, cancelledAt: row.cancelled_at, createdAt: row.created_at, updatedAt: row.updated_at }) : row;
export const createSubscriptionSqlService = async (input) => {
  try { return mapSubscription(await createSubscriptionSql(input)); }
  catch (error) { if (/UNIQUE|constraint/i.test(error.message || '')) { const e = new Error('Esta conta jÃ¡ possui uma assinatura ativa.'); e.status = 409; throw e; } throw error; }
};
export const getSubscriptionSqlService = getSubscriptionSql;
export const updateSubscriptionSqlService = async (input) => mapSubscription(await updateSubscriptionSql(input));
export const listSubscriptionsSqlService = async (tenantId = null) => ({ subscriptions: (await listSubscriptionsSql(tenantId)).map(mapSubscription) });
const mapInvoice = (r) => r && ({ ...r, tenantId:r.tenant_id, subscriptionId:r.subscription_id, payerUserId:r.payer_user_id, amountCents:r.amount_cents, dueAt:r.due_at, externalReference:r.external_reference, providerPaymentId:r.provider_payment_id, paymentMethod:r.payment_method, paidAt:r.paid_at, createdAt:r.created_at, updatedAt:r.updated_at });
export const createInvoiceSqlService = async (input) => { try{return { invoice: mapInvoice(await createInvoiceSql(input)), message:'Cobrança criada.' };}catch(e){if(e.message==='SUBSCRIPTION_NOT_FOUND'){e.status=404;e.message='Assinatura não encontrada.'}else if(/UNIQUE/i.test(e.message||'')){e.status=409;e.message='External reference já utilizada.'}throw e;} };
export const getInvoiceSqlService = async (id,tenantId) => ({ invoice: mapInvoice(await getInvoiceSql(id,tenantId)) });
export const listInvoicesSqlService = async (tenantId,status) => ({ invoices:(await listInvoicesSql(tenantId,status)).map(mapInvoice) });
export const updateInvoiceSqlService = async (input) => ({ invoice: mapInvoice(await updateInvoiceSql(input)), message:'Cobrança atualizada.' });
export const getRulesSqlService = async (tenantId='global') => ({ rules: await getRulesSql(tenantId) });
export const updateRulesSqlService = async (input) => ({ rules: await upsertRulesSql(input), message:'Regras atualizadas.' });
const mapBlock=(r)=>r&&({...r,tenantId:r.tenant_id,userId:r.user_id,startsAt:r.starts_at,endsAt:r.ends_at,releasedAt:r.released_at,createdAt:r.created_at,updatedAt:r.updated_at});
export const createBlockSqlService=async(input)=>({block:mapBlock(await createAccessBlockSql(input)),message:'Bloqueio registrado.'});
export const listBlocksSqlService=async(tenantId)=>({blocks:(await listAccessBlocksSql(tenantId)).map(mapBlock)});
export const releaseBlockSqlService=async(input)=>({block:mapBlock(await releaseAccessBlockSql(input)),message:'Acesso desbloqueado.'});
