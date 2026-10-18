import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: 'Webhooks de pagamento não estão habilitados. Registre os recebimentos manualmente no Financeiro.' }, { status: 410 });
}
