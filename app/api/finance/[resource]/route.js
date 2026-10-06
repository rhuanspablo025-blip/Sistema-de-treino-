import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '../../../../lib/api-auth';
import {
  createInvoice,
  createManualBlock,
  createSubscription,
  deletePlan,
  financeErrorResponse,
  getBillingRules,
  getFinanceDashboard,
  getInvoices,
  getLedger,
  getPayments,
  getPayouts,
  getProviderStatus,
  getSubscriptions,
  listBlocks,
  listPlans,
  parseFinanceRequest,
  savePlan,
  updateBillingRules,
  updateInvoice,
  updateManualBlock,
  updateProviderConfig,
  updateSubscription,
} from '../../../../lib/finance-service';
import { enforceSameOrigin } from '../../../../lib/csrf';

export const runtime = 'nodejs';

async function authorize(request) {
  const access = await requireSuperAdmin();
  if (access.response) return access;
  const csrf = enforceSameOrigin(request);
  if (csrf) return { response: csrf };
  return access;
}

export async function GET(request, { params }) {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;
  try {
    const { resource } = await params;
    switch (resource) {
      case 'dashboard': return NextResponse.json(await getFinanceDashboard());
      case 'plans': return NextResponse.json(await listPlans());
      case 'subscriptions': return NextResponse.json(await getSubscriptions());
      case 'invoices': return NextResponse.json(await getInvoices(new URL(request.url).searchParams.get('status')));
      case 'payments': return NextResponse.json(await getPayments());
      case 'payouts': return NextResponse.json(await getPayouts());
      case 'blocks': return NextResponse.json(await listBlocks());
      case 'rules': return NextResponse.json(await getBillingRules());
      case 'provider': return NextResponse.json(await getProviderStatus());
      case 'ledger': return NextResponse.json(await getLedger());
      default: return NextResponse.json({ error: 'Recurso financeiro não encontrado.' }, { status: 404 });
    }
  } catch (error) { return financeErrorResponse(error); }
}

export async function POST(request, { params }) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const { resource } = await params;
    const payload = await parseFinanceRequest(request);
    switch (resource) {
      case 'plans': return NextResponse.json(await savePlan(access.user, payload, true), { status: 201 });
      case 'subscriptions': return NextResponse.json(await createSubscription(access.user, payload), { status: 201 });
      case 'invoices': return NextResponse.json(await createInvoice(access.user, payload), { status: 201 });
      case 'blocks': return NextResponse.json(await createManualBlock(access.user, payload, request), { status: 201 });
      default: return NextResponse.json({ error: 'Operação não permitida.' }, { status: 404 });
    }
  } catch (error) { return financeErrorResponse(error); }
}

export async function PUT(request, { params }) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const { resource } = await params;
    const payload = await parseFinanceRequest(request);
    if (resource === 'rules') return NextResponse.json(await updateBillingRules(access.user, payload));
    if (resource === 'provider') return NextResponse.json(await updateProviderConfig(access.user, payload));
    return NextResponse.json({ error: 'Operação não permitida.' }, { status: 404 });
  } catch (error) { return financeErrorResponse(error); }
}

export async function PATCH(request, { params }) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const { resource } = await params;
    const payload = await parseFinanceRequest(request);
    if (resource === 'plans') return NextResponse.json(await savePlan(access.user, payload));
    if (resource === 'subscriptions') return NextResponse.json(await updateSubscription(access.user, payload));
    if (resource === 'invoices') return NextResponse.json(await updateInvoice(access.user, payload));
    if (resource === 'blocks') return NextResponse.json(await updateManualBlock(access.user, payload));
    return NextResponse.json({ error: 'Operação não permitida.' }, { status: 404 });
  } catch (error) { return financeErrorResponse(error); }
}

export async function DELETE(request, { params }) {
  const access = await authorize(request);
  if (access.response) return access.response;
  try {
    const { resource } = await params;
    if (resource !== 'plans') return NextResponse.json({ error: 'Operação não permitida.' }, { status: 404 });
    const id = new URL(request.url).searchParams.get('id');
    return NextResponse.json(await deletePlan(access.user, id));
  } catch (error) { return financeErrorResponse(error); }
}