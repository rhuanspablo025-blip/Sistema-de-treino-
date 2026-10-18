import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json({ error: 'Pagamentos online não estão habilitados. Os recebimentos são registrados manualmente pela administração.' }, { status: 410 });
}
