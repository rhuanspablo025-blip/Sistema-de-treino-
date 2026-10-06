import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runDailyBillingJob } from '../../../../../lib/finance-jobs';

export const runtime = 'nodejs';

function validCronSecret(request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || request.headers.get('x-cron-secret') || '';
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request) {
  if (!validCronSecret(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...await runDailyBillingJob() });
  } catch {
    return NextResponse.json({ error: 'Job financeiro não concluído.' }, { status: 500 });
  }
}