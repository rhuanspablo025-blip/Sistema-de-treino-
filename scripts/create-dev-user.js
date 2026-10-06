#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
const { migrateLegacyUsernames, ensureUniqueUserIndexes } = require('../lib/username-utils.cjs');

const { MONGODB_URI, DEV_PASSWORD } = process.env;
const DEV_USERNAME = (process.env.DEV_USERNAME || 'dev').trim().toLowerCase();
const DEV_NAME = (process.env.DEV_NAME || 'DEV').trim();

if (!MONGODB_URI || !DEV_PASSWORD) {
  console.error('Configure MONGODB_URI e DEV_PASSWORD em .env.local.');
  process.exit(1);
}
if (DEV_PASSWORD.length < 8 || Buffer.byteLength(DEV_PASSWORD, 'utf8') > 72) {
  console.error('DEV_PASSWORD deve ter pelo menos 8 caracteres e no máximo 72 bytes.');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(DEV_USERNAME) || !DEV_NAME) {
  console.error('Informe um DEV_USERNAME de 3 a 30 caracteres e DEV_NAME.');
  process.exit(1);
}

async function createDevUser() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const database = client.db('sistema_treino');
    const users = database.collection('users');
    await migrateLegacyUsernames(database);
    await ensureUniqueUserIndexes(users);

    if (await users.findOne({ username: DEV_USERNAME })) {
      console.error('A conta DEV já existe; nenhuma alteração foi feita.');
      process.exitCode = 1;
      return;
    }

    const now = new Date();
    const id = randomUUID();
    await users.insertOne({
      id,
      username: DEV_USERNAME,
      name: DEV_NAME,
      role: 'dev',
      active: true,
      sessionVersion: 0,
      passwordHash: await bcrypt.hash(DEV_PASSWORD, 12),
      createdAt: now,
      updatedAt: now,
    });
    await database.collection('audit_logs').insertOne({
      id: randomUUID(),
      userId: id,
      action: 'bootstrap',
      resource: 'user',
      resourceId: id,
      timestamp: now,
      metadata: { role: 'dev' },
    });
    console.log(`Conta DEV criada: ${DEV_USERNAME}`);
  } finally {
    await client.close();
  }
}

createDevUser().catch(() => {
  console.error('Não foi possível criar a conta DEV. Verifique a URI e o acesso ao Atlas.');
  process.exitCode = 1;
});
