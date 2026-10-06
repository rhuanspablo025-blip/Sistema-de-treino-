import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { getMyBillingAccount } from '../../../../lib/finance-service';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  try {
    return NextResponse.json(await getMyBillingAccount(user));
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as cobranças da conta.' }, { status: 500 });
  }
}