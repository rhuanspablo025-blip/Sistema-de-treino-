import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../../../../lib/mongodb';
import { writeAuditLog } from '../../../../lib/audit';

export const runtime = 'nodejs';

const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const accepted = () => NextResponse.json({ message: 'Se este e-mail ainda não estiver cadastrado, o pedido será enviado para aprovação do administrador.' }, { status: 202 });

export async function POST(request) {
  try {
    const payload = await request.json();
    const name = text(payload.name, 120);
    const email = text(payload.email, 254).toLowerCase();
    const password = typeof payload.password === 'string' ? payload.password : '';
    const confirmPassword = typeof payload.confirmPassword === 'string' ? payload.confirmPassword : '';
    const goal = text(payload.goal, 240);
    const phone = text(payload.phone, 40);
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Informe nome e e-mail válidos.' }, { status: 400 });
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return NextResponse.json({ error: 'A senha deve ter entre 12 e 72 bytes.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As senhas não conferem.' }, { status: 400 });

    const database = await getDatabase();
    const userId = randomUUID();
    const now = new Date();
    const user = {
      id: userId,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'student',
      active: false,
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
        active: false,
        createdAt: now,
        updatedAt: now,
      });
      await writeAuditLog(database, { userId, action: 'self_register', resource: 'user', resourceId: userId, metadata: { role: 'student' } });
      return accepted();
    } catch (error) {
      await database.collection('users').deleteOne({ id: userId });
      await database.collection('students').deleteOne({ userId });
      if (error.code === 11000) return accepted();
      throw error;
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro.' }, { status: 500 });
  }
}
