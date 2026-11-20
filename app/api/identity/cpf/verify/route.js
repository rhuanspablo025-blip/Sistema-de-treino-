import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getTursoClient } from '../../../../../lib/mongodb';
import { isValidCpf, normalizeCpf, cpfLookupDigest, cpfNameDigest } from '../../../../../lib/identity-service.mjs';
import { verifyCpfWithProvider } from '../../../../../lib/identity-delivery.mjs';

export const runtime = 'nodejs';

function lookupKey() {
  const value = process.env.CPF_LOOKUP_HMAC_KEY;
  if (!value) throw new Error('CPF_LOOKUP_HMAC_KEY ausente.');
  const key = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('CPF_LOOKUP_HMAC_KEY deve codificar 32 bytes.');
  return key;
}

export async function POST(request) {
  let id;
  try {
    const body = await request.json();
    const cpf = normalizeCpf(body?.cpf), fullName = typeof body?.fullName === 'string' ? body.fullName.normalize('NFKC').trim() : '';
    if (!isValidCpf(cpf) || fullName.length < 2 || fullName.length > 120) return NextResponse.json({ error: 'Informe CPF valido e nome completo.' }, { status: 400 });
    const key = lookupKey(), cpfHash = cpfLookupDigest(cpf, key), nameHash = cpfNameDigest(fullName, key);
    const client = await getTursoClient(), now = new Date(), timestamp = now.toISOString();
    const tx = await client.transaction('write');
    try {
      const count = await tx.execute({ sql: 'SELECT COUNT(*) AS count FROM identity_cpf_verifications WHERE cpf_lookup_hmac=? AND created_at>? ', args: [cpfHash, new Date(now.getTime() - 15 * 60_000).toISOString()] });
      if (Number(count.rows[0].count) >= 5) throw new Error('RATE_LIMIT');
      id = randomUUID();
      await tx.execute({ sql: 'INSERT INTO identity_cpf_verifications(id,cpf_lookup_hmac,full_name_hmac,provider_status,expires_at,created_at) VALUES(?,?,?,\'PENDING\',?,?)', args: [id, cpfHash, nameHash, new Date(now.getTime() + 10 * 60_000).toISOString(), timestamp] });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
    const result = await verifyCpfWithProvider({ cpf, fullName });
    if (!result.verified) return NextResponse.json({ status: result.status, error: result.status === 'unavailable' ? 'Verificacao cadastral temporariamente indisponivel.' : 'Os dados nao foram confirmados pelo provedor.' }, { status: result.status === 'unavailable' ? 503 : 422 });
    await client.execute({ sql: 'UPDATE identity_cpf_verifications SET provider_status=\'VERIFIED\' WHERE id=? AND provider_status=\'PENDING\'', args: [id] });
    return NextResponse.json({ status: 'verified', verificationId: id, expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString() });
  } catch (error) {
    if (id) {
      try { await (await getTursoClient()).execute({ sql: 'UPDATE identity_cpf_verifications SET provider_status=\'REJECTED\' WHERE id=? AND provider_status=\'PENDING\'', args: [id] }); } catch { /* Preserve the provider error response. */ }
    }
    if (error.message === 'RATE_LIMIT') return NextResponse.json({ error: 'Muitas tentativas de verificacao. Aguarde 15 minutos.' }, { status: 429 });
    if (/CPF_LOOKUP_HMAC_KEY/.test(error.message || '')) return NextResponse.json({ error: 'Verificacao indisponivel: chave segura nao configurada.' }, { status: 503 });
    return NextResponse.json({ status: 'unavailable', error: 'Nao foi possivel consultar o provedor de identidade.' }, { status: 503 });
  }
}
