import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

const allowedPurposes = new Set(['EMAIL', 'PHONE', 'DEVICE', 'PASSWORD_RECOVERY', 'MFA']);
function secret() {
  const value = process.env.OTP_HMAC_KEY;
  if (!value) throw new Error('OTP_HMAC_KEY ausente.');
  if (Buffer.byteLength(value, 'utf8') < 32) throw new Error('OTP_HMAC_KEY deve conter pelo menos 32 bytes.');
  return value;
}
const digest = (value, key = secret()) => createHmac('sha256', key).update(String(value)).digest('hex');
const equal = (left, right) => { const a = Buffer.from(left, 'hex'), b = Buffer.from(right, 'hex'); return a.length === b.length && timingSafeEqual(a, b); };

export async function issueChallenge(client, { purpose, userId = null, destination, deliver, now = Date.now(), testCodeSink = null }) {
  if (!allowedPurposes.has(purpose)) throw new Error('Finalidade do desafio inválida.');
  if (typeof deliver !== 'function') throw new Error('Provedor de entrega não configurado.');
  if (process.env.NODE_ENV === 'production' && testCodeSink) throw new Error('Adaptador de teste proibido em produção.');
  const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now + (purpose === 'EMAIL' ? 10 : 5) * 60_000).toISOString();
  const resendAfter = new Date(now + 60_000).toISOString();
  const tx = await client.transaction('write');
  try {
    // Opportunistic retention cleanup keeps the shared challenge table bounded without
    // requiring a second scheduler or a deployment-specific cron service.
    await tx.execute({ sql: 'DELETE FROM identity_challenges WHERE expires_at<?', args: [new Date(now - 30 * 24 * 60 * 60_000).toISOString()] });
    const recent = await tx.execute({ sql: `SELECT COUNT(*) AS count FROM identity_challenges WHERE destination_hmac=? AND purpose=? AND created_at>?`, args: [digest(destination), purpose, new Date(now - 60 * 60_000).toISOString()] });
    if (Number(recent.rows[0].count) >= 5) throw new Error('Limite de solicitações atingido. Tente mais tarde.');
    const cooldown = await tx.execute({ sql: 'SELECT created_at FROM identity_challenges WHERE destination_hmac=? AND purpose=? ORDER BY created_at DESC LIMIT 1', args: [digest(destination), purpose] });
    if (cooldown.rows[0] && Date.parse(cooldown.rows[0].created_at) + 60_000 > now) throw new Error('Aguarde antes de solicitar outro código.');
    await tx.execute({ sql: 'UPDATE identity_challenges SET invalidated_at=? WHERE destination_hmac=? AND purpose=? AND consumed_at IS NULL AND invalidated_at IS NULL', args: [new Date(now).toISOString(), digest(destination), purpose] });
    await tx.execute({ sql: `INSERT INTO identity_challenges(id,user_id,purpose,destination_hmac,code_hmac,resend_after,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)`, args: [id, userId, purpose, digest(destination), digest(`${id}:${code}`), resendAfter, expiresAt, new Date(now).toISOString()] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  try {
    await deliver({ purpose, destination, code, expiresAt });
    if (testCodeSink && process.env.NODE_ENV !== 'production') testCodeSink(code);
  } catch (error) {
    await client.execute({ sql: 'UPDATE identity_challenges SET invalidated_at=? WHERE id=? AND consumed_at IS NULL', args: [new Date().toISOString(), id] });
    throw new Error('Não foi possível entregar o código de verificação.');
  }
  return { id, expiresAt, resendAfter };
}

export function challengeDestinationDigest(destination) { return digest(destination); }

export async function consumeChallenge(client, { id, purpose, code, now = Date.now() }) {
  const tx = await client.transaction('write');
  try {
    const result = await tx.execute({ sql: 'SELECT * FROM identity_challenges WHERE id=? AND purpose=?', args: [id, purpose] });
    const row = result.rows[0];
    if (!row || row.consumed_at || row.invalidated_at || Date.parse(row.expires_at) <= now) { await tx.rollback(); return { ok: false, reason: 'expired_or_unavailable' }; }
    if (Number(row.attempts) >= Number(row.max_attempts)) { await tx.rollback(); return { ok: false, reason: 'attempts_exhausted' }; }
    const matches = /^\d{6}$/.test(String(code)) && equal(row.code_hmac, digest(`${id}:${code}`));
    if (!matches) {
      const attempts = Number(row.attempts) + 1;
      await tx.execute({ sql: 'UPDATE identity_challenges SET attempts=?, invalidated_at=CASE WHEN ?>=max_attempts THEN ? ELSE invalidated_at END WHERE id=? AND consumed_at IS NULL AND invalidated_at IS NULL', args: [attempts, attempts, new Date(now).toISOString(), id] });
      await tx.commit();
      return { ok: false, reason: attempts >= Number(row.max_attempts) ? 'attempts_exhausted' : 'invalid_code' };
    }
    const update = await tx.execute({ sql: 'UPDATE identity_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>?', args: [new Date(now).toISOString(), id, new Date(now).toISOString()] });
    if (Number(update.rowsAffected) !== 1) { await tx.rollback(); return { ok: false, reason: 'expired_or_unavailable' }; }
    await tx.commit();
    return { ok: true, userId: row.user_id };
  } catch (error) { await tx.rollback(); throw error; }
}

export function resendChallenge(client, args) { return issueChallenge(client, args); }
