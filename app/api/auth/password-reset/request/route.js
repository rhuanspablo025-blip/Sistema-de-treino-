import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { getDatabase } from '../../../../../lib/mongodb';

export const runtime = 'nodejs';
const genericMessage = 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.';
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function appUrl() {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
  return null;
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });

    const { RESEND_API_KEY, EMAIL_FROM } = process.env;
    const baseUrl = appUrl();
    if (!RESEND_API_KEY || !EMAIL_FROM || !baseUrl) return NextResponse.json({ error: 'A recuperação por e-mail ainda não está configurada.' }, { status: 503 });

    const database = await getDatabase();
    const users = database.collection('users');
    const user = await users.findOne({ email, active: true }, { projection: { id: 1, email: 1, passwordResetRequestedAt: 1 } });
    if (!user) return NextResponse.json({ message: genericMessage }, { status: 200 });

    const now = new Date();
    if (user.passwordResetRequestedAt && now.getTime() - new Date(user.passwordResetRequestedAt).getTime() < 60_000) {
      return NextResponse.json({ message: genericMessage }, { status: 200 });
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now.getTime() + 30 * 60_000);
    await users.updateOne({ id: user.id }, { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt, passwordResetRequestedAt: now } });

    const resetUrl = `${baseUrl}/forgot-password#token=${token}`;
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Redefinição de senha - Atlas Training',
      html: `<p>Recebemos um pedido para redefinir a senha da sua conta.</p><p><a href="${resetUrl}">Redefinir senha</a></p><p>O link expira em 30 minutos. Se você não solicitou esta alteração, ignore esta mensagem.</p>`,
    });

    if (error) {
      await users.updateOne({ id: user.id, passwordResetTokenHash: tokenHash }, { $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' } });
      return NextResponse.json({ error: 'Não foi possível enviar o e-mail de recuperação.' }, { status: 503 });
    }

    return NextResponse.json({ message: genericMessage }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível processar a solicitação.' }, { status: 500 });
  }
}
