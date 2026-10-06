import { NextResponse } from 'next/server';

export function enforceSameOrigin(request) {
  const originHeader = request.headers.get('origin');
  if (!originHeader) return null;
  let origin;
  try { origin = new URL(originHeader); }
  catch { return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 }); }
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host') || new URL(request.url).host;
  if (origin.host.toLowerCase() !== host.toLowerCase()) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  return null;
}