import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ error: 'A rotina automática de cobrança e bloqueio está desativada.' }, { status: 410 });
}
