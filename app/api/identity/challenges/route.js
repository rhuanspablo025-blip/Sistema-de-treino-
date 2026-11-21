import { NextResponse } from 'next/server';
import { getTursoClient } from '../../../../lib/mongodb';
import { normalizeEmail, normalizeBrazilPhone } from '../../../../lib/identity-service.mjs';
import { issueChallenge } from '../../../../lib/identity-challenges.mjs';
import { getChallengeDelivery } from '../../../../lib/identity-delivery.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const purpose = body?.purpose;
    if (!['EMAIL', 'PHONE'].includes(purpose)) return NextResponse.json({ error: 'Finalidade nao permitida neste fluxo.' }, { status: 400 });
    const destination = purpose === 'EMAIL' ? normalizeEmail(body?.destination) : normalizeBrazilPhone(body?.destination);
    if (!destination) return NextResponse.json({ error: purpose === 'EMAIL' ? 'Informe um e-mail válido.' : 'Informe um celular brasileiro válido.' }, { status: 400 });
    const client = await getTursoClient();
    const challenge = await issueChallenge(client, { purpose, destination, deliver: getChallengeDelivery(purpose) });
    return NextResponse.json({ message: 'Código enviado.', ...challenge }, { status: 201 });
  } catch (error) {
    const message = error.message || 'Não foi possível enviar o código.';
    const unavailable = /indisponível|não configurad|nao configurad|ausente|deve conter|credential|fetch failed|timeout/i.test(message);
    return NextResponse.json({ error: unavailable ? message : (message || 'Não foi possível enviar o código.') }, { status: unavailable ? 503 : 429 });
  }
}
