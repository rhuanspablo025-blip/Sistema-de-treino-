#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, DEV_PASSWORD } = process.env;
const DEV_EMAIL = (process.env.DEV_EMAIL || 'dev@atlas.training').trim().toLowerCase();
const DEV_NAME = (process.env.DEV_NAME || 'DEV').trim();

if (!MONGODB_URI || !DEV_PASSWORD) {
  console.error('Configure MONGODB_URI e DEV_PASSWORD em .env.local.');
  process.exit(1);
}
if (DEV_PASSWORD.length < 16 || Buffer.byteLength(DEV_PASSWORD, 'utf8') > 72) {
  console.error('DEV_PASSWORD deve ter entre 16 e 72 bytes.');
  process.exit(1);
}
if (!/^\S+@\S+\.\S+$/.test(DEV_EMAIL) || !DEV_NAME) {
  console.error('Informe DEV_EMAIL válido e DEV_NAME.');
  process.exit(1);
}

async function createDevUser() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const database = client.db('sistema_treino');
    const users = database.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    if (await users.findOne({ email: DEV_EMAIL })) {
      console.error('A conta DEV já existe; nenhuma alteração foi feita.');
      process.exitCode = 1;
      return;
    }

    const now = new Date();
    const id = randomUUID();
    await users.insertOne({
      id,
      email: DEV_EMAIL,
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
    console.log(`Conta DEV criada: ${DEV_EMAIL}`);
  } finally {
    await client.close();
  }
}

createDevUser().catch(() => {
  console.error('Não foi possível criar a conta DEV. Verifique a URI e o acesso ao Atlas.');
  process.exitCode = 1;
});
