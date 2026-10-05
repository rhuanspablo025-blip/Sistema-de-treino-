import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSession, SESSION_COOKIE } from '../../../../lib/session';
import { getDatabase } from '../../../../lib/mongodb';

export const runtime = 'nodejs';
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const submittedLogin = String(username || '').trim().toLowerCase();
    if (!submittedLogin || submittedLogin.length > 254 || !password) return NextResponse.json({ error: 'Informe usuário e senha.' }, { status: 400 });

    const database = await getDatabase();
    const users = database.collection('users');
    let user;
    if (submittedLogin.includes('@')) {
      user = await users.findOne({ email: submittedLogin });
    } else {
      const localPartPattern = new RegExp(`^${escapeRegex(submittedLogin)}@`, 'i');
      const matches = await users.find({ email: { $regex: localPartPattern } }).limit(2).toArray();
      if (matches.length > 1) return NextResponse.json({ error: 'Há mais de uma conta com esse usuário. Entre usando o e-mail completo.' }, { status: 400 });
      user = matches[0] || await users.findOne({ email: `${submittedLogin}@atlas.training` });
    }
    if (!user || user.active === false || !(await bcrypt.compare(String(password), user.passwordHash || ''))) {
      return NextResponse.json({ error: 'Usuário ou senha inválidos, ou usuário desativado.' }, { status: 401 });
    }

    const token = await createSession(user);
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
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
