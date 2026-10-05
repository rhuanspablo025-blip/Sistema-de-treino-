#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, ADMIN_PASSWORD } = process.env;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

if (!MONGODB_URI || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('Configure MONGODB_URI, ADMIN_USERNAME e ADMIN_PASSWORD em .env.local.');
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
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(ADMIN_USERNAME) || !ADMIN_NAME.trim()) {
  console.error('Informe um ADMIN_USERNAME de 3 a 32 caracteres e um ADMIN_NAME.');
  process.exit(1);
}

async function createAdmin() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const database = client.db('sistema_treino');
    const users = database.collection('users');
    await users.createIndex({ usernameKey: 1 }, { unique: true });

    if (await users.findOne({ usernameKey: ADMIN_USERNAME })) throw new Error('Já existe um usuário com este username.');

    const now = new Date();
    await users.insertOne({
      id: randomUUID(),
      username: ADMIN_USERNAME,
      usernameKey: ADMIN_USERNAME,
      name: ADMIN_NAME.trim(),
      role: 'admin',
      active: true,
      sessionVersion: 0,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Administrador criado: ${ADMIN_USERNAME}`);
  } finally {
    await client.close();
  }
}

createAdmin().catch((error) => {
  console.error(error.code === 11000 ? 'Já existe um administrador com este username.' : 'Não foi possível criar o administrador. Verifique as variáveis locais e o acesso ao Atlas.');
  process.exitCode = 1;
});
