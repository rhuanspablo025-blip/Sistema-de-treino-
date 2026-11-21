import { NextResponse } from 'next/server';
import { getTursoClient } from '../../../../lib/mongodb';
import { createIdentity, normalizeEmail, normalizeBrazilPhone } from '../../../../lib/identity-service.mjs';
import { challengeDestinationDigest } from '../../../../lib/identity-challenges.mjs';

export const runtime = 'nodejs';

function key(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ausente.`);
  const decoded = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error(`${name} deve codificar 32 bytes.`);
  return decoded;
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Dados invalidos.' }, { status: 400 });
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = normalizeEmail(body.email), phone = normalizeBrazilPhone(body.phone);
    if (fullName.length < 2 || fullName.length > 120 || !email || !phone) return NextResponse.json({ error: 'Confira nome, e-mail e celular.' }, { status: 400 });
    if (body.termsAccepted !== true || body.initialDeviceAuthorized !== true) return NextResponse.json({ error: 'Aceite os termos e confirme este dispositivo para continuar.' }, { status: 400 });
    if (typeof body.emailChallengeId !== 'string' || typeof body.phoneChallengeId !== 'string') return NextResponse.json({ error: 'Confirme e-mail e celular antes de concluir.' }, { status: 400 });
    const client = await getTursoClient();
    const { rows } = await client.execute({
      sql: 'SELECT id,purpose,destination_hmac FROM identity_challenges WHERE id IN (?,?) AND consumed_at IS NOT NULL AND consumed_at<=expires_at AND invalidated_at IS NULL',
      args: [body.emailChallengeId, body.phoneChallengeId],
    });
    const emailDigest = challengeDestinationDigest(email), phoneDigest = challengeDestinationDigest(phone);
    if (!rows.some((row) => row.purpose === 'EMAIL' && row.destination_hmac === emailDigest) ||
        !rows.some((row) => row.purpose === 'PHONE' && row.destination_hmac === phoneDigest)) {
      return NextResponse.json({ error: 'As confirmações nao correspondem a estes dados.' }, { status: 400 });
    }
    const encryptionKey = key('IDENTITY_ENCRYPTION_KEY'), lookupKey = key('CPF_LOOKUP_HMAC_KEY');
    const identity = await createIdentity(client, {
      role: body.role,
      studentMode: body.studentMode,
      username: body.username,
      fullName,
      email,
      phone,
      cpf: body.cpf,
      cpfVerificationId: body.cpfVerificationId,
      password: body.password,
      termsAccepted: body.termsAccepted,
      initialDeviceAuthorized: body.initialDeviceAuthorized,
      profile: body.profile,
    }, { encryptionKey, lookupKey, verified: true });
    return NextResponse.json({ message: 'Conta criada e contatos confirmados.', userId: identity.id, role: identity.role, studentMode: identity.studentMode }, { status: 201 });
  } catch (error) {
    const message = error.message || 'Nao foi possivel concluir o cadastro.';
    if (/UNIQUE constraint failed/.test(message)) return NextResponse.json({ error: 'Usuario, e-mail, celular ou CPF ja cadastrado.' }, { status: 409 });
    if (/ausente|deve codificar/.test(message)) return NextResponse.json({ error: 'Cadastro indisponivel: configuracao de protecao de identidade ausente.' }, { status: 503 });
    if (/invalid|Use 12|nao permitido|Modalidade/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: 'Nao foi possivel concluir o cadastro.' }, { status: 503 });
  }
}
