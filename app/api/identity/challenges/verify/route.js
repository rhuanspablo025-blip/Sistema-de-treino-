import { NextResponse } from 'next/server';
import { getTursoClient } from '../../../../../lib/mongodb';
import { normalizeEmail, normalizeBrazilPhone } from '../../../../../lib/identity-service.mjs';
import { consumeChallenge, challengeDestinationDigest } from '../../../../../lib/identity-challenges.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const purpose = body?.purpose;
    if (!['EMAIL', 'PHONE'].includes(purpose)) return NextResponse.json({ error: 'Finalidade nao permitida neste fluxo.' }, { status: 400 });
    const destination = purpose === 'EMAIL' ? normalizeEmail(body?.destination) : normalizeBrazilPhone(body?.destination);
    if (!destination || typeof body?.challengeId !== 'string' || typeof body?.code !== 'string') {
      return NextResponse.json({ error: 'Informe destino, desafio e código.' }, { status: 400 });
    }
    const client = await getTursoClient();
    // Check purpose and destination before consuming to avoid burning someone else's code.
    const challenge = await client.execute({ sql: 'SELECT destination_hmac FROM identity_challenges WHERE id=? AND purpose=?', args: [body.challengeId, purpose] });
    if (challenge.rows[0]?.destination_hmac !== challengeDestinationDigest(destination)) {
      return NextResponse.json({ error: 'O código não corresponde ao destino informado.' }, { status: 400 });
    }
    const result = await consumeChallenge(client, { id: body.challengeId, purpose, code: body.code });
    if (!result.ok) return NextResponse.json({ error: result.reason === 'invalid_code' ? 'Código incorreto.' : 'Código expirado ou indisponível.' }, { status: 400 });
    return NextResponse.json({ verified: true, purpose, challengeId: body.challengeId });
  } catch {
    return NextResponse.json({ error: 'Não foi possível validar o código.' }, { status: 503 });
  }
}
