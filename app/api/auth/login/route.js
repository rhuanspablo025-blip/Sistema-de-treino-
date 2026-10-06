import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSession, SESSION_COOKIE } from '../../../../lib/session';
import { getDatabase } from '../../../../lib/mongodb';
import { normalizeUsername } from '../../../../lib/usernames';
import { clearLoginFailures, checkLoginRateLimit, recordLoginFailure } from '../../../../lib/login-rate-limit';
import { writeAuditLog } from '../../../../lib/audit';

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
    const user = await database.collection('users').findOne({ username: normalizedUsername });
    if (!user || user.active === false || !(await bcrypt.compare(String(password), user.passwordHash || ''))) {
      await recordLoginFailure(rate.key);
      if (user?.role === 'SUPER_ADMIN') await writeAuditLog(database, { userId: user.id, action: 'super_admin_login_failed', resource: 'auth', resourceId: user.id, metadata: { ipAddress } });
      return NextResponse.json({ error: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    await clearLoginFailures(rate.key);
    if (user.role === 'SUPER_ADMIN') await writeAuditLog(database, { userId: user.id, action: 'super_admin_login', resource: 'auth', resourceId: user.id, metadata: { ipAddress } });
    const token = await createSession(user);
    const response = NextResponse.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role } });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    const status = error.message?.includes('MONGODB_URI') ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? error.message : 'Não foi possível entrar.' }, { status });
  }
}
