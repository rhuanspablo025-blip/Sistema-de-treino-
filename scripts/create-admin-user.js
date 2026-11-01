#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_PASSWORD } = process.env;
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

if (!TURSO_DATABASE_URL || (!TURSO_DATABASE_URL.startsWith('file:') && !TURSO_AUTH_TOKEN) || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('Configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (exceto file:) e credenciais do administrador em .env.local.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD deve ter pelo menos 8 caracteres.');
  process.exit(1);
}
if (Buffer.byteLength(ADMIN_PASSWORD, 'utf8') > 72) {
  console.error('ADMIN_PASSWORD deve ter no máximo 72 bytes para bcrypt.');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(ADMIN_USERNAME) || !ADMIN_NAME.trim()) {
  console.error('Informe um ADMIN_USERNAME de 3 a 30 caracteres e um ADMIN_NAME.');
  process.exit(1);
}

async function createAdmin() {
  const { getDatabase } = await import('../lib/mongodb.js');
  const database = await getDatabase('accounts');
  const users = database.collection('users');

  if (await users.findOne({ username: ADMIN_USERNAME })) throw new Error('Já existe um usuário com este username.');

  const now = new Date();
  await users.insertOne({
    id: randomUUID(),
    username: ADMIN_USERNAME,
    name: ADMIN_NAME.trim(),
    role: 'admin',
    active: true,
    sessionVersion: 0,
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Administrador criado: ${ADMIN_USERNAME}`);
}

createAdmin().catch((error) => {
  console.error(error.code === 11000 ? 'Já existe um administrador com este username.' : 'Não foi possível criar o administrador. Verifique as variáveis locais e o acesso ao Turso.');
  process.exitCode = 1;
});
