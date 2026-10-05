import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../../../lib/mongodb';
import { writeAuditLog } from '../../../../lib/audit';
import { normalizeUsername } from '../../../../lib/usernames';

export const runtime = 'nodejs';

const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
export async function POST(request) {
  try {
    const payload = await request.json();
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const usernameKey = normalizeUsername(username);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';
    const goal = text(payload.goal, 240);
    const phone = text(payload.phone, 40);
    if (name.length < 2 || !usernameKey) return NextResponse.json({ error: 'Informe nome completo e um username de 3 a 32 caracteres (letras, números, ponto, hífen ou sublinhado).'}, { status: 400 });
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter entre 12 e 72 bytes.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    if (await database.collection('users').findOne({ usernameKey })) return NextResponse.json({ error: 'Este username já está em uso. Escolha outro.' }, { status: 409 });
    const userId = randomUUID();
    const now = new Date();
    const user = {
      id: userId,
      name,
      username: usernameKey,
      usernameKey,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'student',
      active: true,
      sessionVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await database.collection('users').insertOne(user);
      await database.collection('students').insertOne({
        id: userId,
        userId,
        name,
        phone,
        dateOfBirth: null,
        goal,
        trainerId: null,
        measurements: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await writeAuditLog(database, { userId, action: 'self_register', resource: 'user', resourceId: userId, metadata: { role: 'student', active: true } });
      return NextResponse.json({ message: 'Cadastro concluído. Agora você pode entrar usando seu username.' }, { status: 201 });
    } catch (error) {
      await database.collection('users').deleteOne({ id: userId });
      await database.collection('students').deleteOne({ userId });
      if (error.code === 11000 && error.keyPattern?.usernameKey) return NextResponse.json({ error: 'Este username já está em uso. Escolha outro.' }, { status: 409 });
      throw error;
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro.' }, { status: 500 });
  }
}
