import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSession, SESSION_COOKIE, SESSION_DURATION, TEMP_SESSION_DURATION } from '../../../../lib/session';
import { getFinancialAccess } from '../../../../lib/finance-access';
import { getDatabase, getTursoClient } from '../../../../lib/mongodb';
import { normalizeUsername } from '../../../../lib/usernames';
import { clearLoginFailures, checkLoginRateLimit, recordLoginFailure } from '../../../../lib/login-rate-limit';
import { writeAuditLog } from '../../../../lib/audit';
import { verifyPassword } from '../../../../lib/identity-service.mjs';
import { createHash, randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });
    const { username, password } = payload;
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername || typeof password !== 'string' || !password) return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });

    const database = await getDatabase();
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rate = await checkLoginRateLimit(normalizedUsername, ipAddress);
    if (rate.limited) return NextResponse.json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
    let user = await database.collection('users').findOne({ username: normalizedUsername });
    let validPassword = user && user.active !== false && await bcrypt.compare(String(password), user.passwordHash || '');
    if (!user) {
      const client = await getTursoClient();
      const identity = await client.execute({ sql: `SELECT u.id,u.full_name,u.username,u.role,u.status,c.password_hash FROM identity_users u JOIN identity_credentials c ON c.user_id=u.id WHERE u.username=? COLLATE NOCASE LIMIT 1`, args: [normalizedUsername] });
      const row = identity.rows[0];
      if (row) {
        user = { id: row.id, name: row.full_name, username: row.username, role: row.role === 'PERSONAL' ? 'trainer' : 'student', active: row.status === 'ACTIVE', sessionVersion: 0, identityV2: true };
        validPassword = user.active && Buffer.byteLength(password, 'utf8') <= 256 && await verifyPassword(password, row.password_hash);
      }
    }
    if (!user || user.active === false || !validPassword) {
      await recordLoginFailure(rate.key);
      if (user?.role === 'SUPER_ADMIN') await writeAuditLog(database, { userId: user.id, action: 'super_admin_login_failed', resource: 'auth', resourceId: user.id, metadata: { ipAddress } });
      return NextResponse.json({ error: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    await clearLoginFailures(rate.key);
    if (user.role === 'SUPER_ADMIN') await writeAuditLog(database, { userId: user.id, action: 'super_admin_login', resource: 'auth', resourceId: user.id, metadata: { ipAddress } });
    const financialAccess = await getFinancialAccess(user);
    if (financialAccess.blocked || financialAccess.restricted) return NextResponse.json({ error: 'Acesso suspenso por inadimplência. Entre em contato com o responsável financeiro.' }, { status: 423 });
    const rememberMe = payload.rememberMe !== false;
    const maxAge = rememberMe ? SESSION_DURATION : TEMP_SESSION_DURATION;
    const token = await createSession(user, maxAge);
    if (user.identityV2) {
      const client = await getTursoClient();
      const now = new Date();
      await client.execute({ sql: 'INSERT INTO identity_sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)', args: [randomUUID(), user.id, createHash('sha256').update(token).digest('hex'), new Date(now.getTime() + maxAge * 1000).toISOString(), now.toISOString()] });
    }
    const response = NextResponse.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      ...(rememberMe ? { maxAge } : {}),
    });
    return response;
  } catch (error) {
    const status = /TURSO_DATABASE_URL|TURSO_AUTH_TOKEN|SESSION_SECRET/.test(error.message || '') ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? error.message : 'Não foi possível entrar.' }, { status });
  }
}
