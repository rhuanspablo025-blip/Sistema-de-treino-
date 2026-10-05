#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Configure MONGODB_URI, ADMIN_EMAIL e ADMIN_PASSWORD em .env.local.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 12) {
  console.error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
  process.exit(1);
}
if (Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
  console.error('ADMIN_PASSWORD deve ter no máximo 72 bytes para bcrypt.');
  process.exit(1);
}
if (!/^\S+@\S+\.\S+$/.test(ADMIN_EMAIL) || !ADMIN_NAME.trim()) {
  console.error('Informe um ADMIN_EMAIL válido e um ADMIN_NAME.');
  process.exit(1);
}

async function createAdmin() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const database = client.db('sistema_treino');
    const users = database.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    const email = ADMIN_EMAIL.trim().toLowerCase();
    if (await users.findOne({ email })) throw new Error('Já existe um usuário com este e-mail.');

    const now = new Date();
    await users.insertOne({
      id: randomUUID(),
      email,
      name: ADMIN_NAME.trim(),
      role: 'admin',
      active: true,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Administrador criado: ${email}`);
  } finally {
    await client.close();
  }
}

createAdmin().catch((error) => {
  console.error(error.code === 11000 ? 'Já existe um administrador com este e-mail.' : 'Não foi possível criar o administrador. Verifique as variáveis locais e o acesso ao Atlas.');
  process.exitCode = 1;
});
