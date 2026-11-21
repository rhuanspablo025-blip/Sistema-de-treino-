import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Kept for older clients. New accounts must complete the Identity V2 flow.
export async function POST() {
  return NextResponse.json({ error: 'Cadastro atualizado. Continue em /register.', registrationUrl: '/register' }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: 'Use o cadastro Identity V2 em /register.' }, { status: 410 });
}
