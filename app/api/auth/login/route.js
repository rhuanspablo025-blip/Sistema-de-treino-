import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSession, SESSION_COOKIE } from '../../../../lib/session';
import { getDatabase } from '../../../../lib/mongodb';
import { normalizeUsername } from '../../../../lib/usernames';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const usernameKey = normalizeUsername(username);
    if (!usernameKey || typeof password !== 'string' || !password) return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });

    const database = await getDatabase();
    const user = await database.collection('users').findOne({ usernameKey });
    if (!user || user.active === false || !(await bcrypt.compare(String(password), user.passwordHash || ''))) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos, ou usuário desativado.' }, { status: 401 });
    }

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
