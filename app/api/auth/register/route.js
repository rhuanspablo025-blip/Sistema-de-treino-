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
    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Dados de cadastro inválidos.' }, { status: 400 });
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return NextResponse.json({ error: 'Dados de cadastro inválidos.' }, { status: 400 });
    const name = text(payload.name, 120);
    const username = text(payload.username, 32);
    const normalizedUsername = normalizeUsername(username);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';
    const goal = text(payload.goal, 240);
    const phone = text(payload.phone, 40);
    if (name.length < 2 || !normalizedUsername) return NextResponse.json({ error: 'Informe nome, usuário válido (3 a 30 caracteres: letras, números, hífen ou sublinhado) e senha.' }, { status: 400 });
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    if (await database.collection('users').findOne({ username: normalizedUsername })) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
    const userId = randomUUID();
    const now = new Date();
    const user = {
      id: userId,
      name,
      username: normalizedUsername,
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
      if (error.code === 11000 && error.keyPattern?.username) return NextResponse.json({ error: 'Este nome de usuário já está em uso.' }, { status: 409 });
      throw error;
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro.' }, { status: 500 });
  }
}
