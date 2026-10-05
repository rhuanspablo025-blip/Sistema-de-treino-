import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { getDatabase } from '../../../../../lib/mongodb';
import { writeAuditLog } from '../../../../../lib/audit';

export const runtime = 'nodejs';
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function POST(request) {
  try {
    const payload = await request.json();
    const token = typeof payload.token === 'string' ? payload.token : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';
    if (token.length < 32 || token.length > 200) return NextResponse.json({ error: 'Link de recuperação inválido ou expirado.' }, { status: 400 });
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter entre 12 e 72 bytes.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    const now = new Date();
    const user = await database.collection('users').findOneAndUpdate(
      { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: { $gt: now }, active: true },
      {
        $set: { passwordHash: await bcrypt.hash(password, 12), updatedAt: now },
        $inc: { sessionVersion: 1 },
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' },
      },
      { returnDocument: 'after', projection: { id: 1, email: 1 } },
    );
    if (!user) return NextResponse.json({ error: 'Link de recuperação inválido ou expirado.' }, { status: 400 });

    await writeAuditLog(database, { userId: user.id, action: 'password_reset', resource: 'user', resourceId: user.id });
    return NextResponse.json({ message: 'Senha redefinida. Entre com a nova senha.' });
  } catch {
    return NextResponse.json({ error: 'Não foi possível redefinir a senha.' }, { status: 500 });
  }
}
