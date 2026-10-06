import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { enforceSameOrigin } from '../../../../lib/csrf';
import { financeErrorResponse, parseFinanceRequest, requestInvoiceCheckout } from '../../../../lib/finance-service';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;
  try {
    return NextResponse.json(await requestInvoiceCheckout(user, await parseFinanceRequest(request)));
  } catch (error) {
    return financeErrorResponse(error, 'Não foi possível iniciar o pagamento.');
  }
}