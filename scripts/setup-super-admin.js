#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, SUPER_ADMIN_PASSWORD } = process.env;
const SUPER_ADMIN_USERNAME = (process.env.SUPER_ADMIN_USERNAME || 'rhuanspablo025').trim().toLowerCase();
const SUPER_ADMIN_NAME = (process.env.SUPER_ADMIN_NAME || 'Proprietário').trim();

if (!MONGODB_URI || SUPER_ADMIN_USERNAME !== 'rhuanspablo025') {
  console.error('Configure MONGODB_URI e SUPER_ADMIN_USERNAME=rhuanspablo025.');
  process.exit(1);
}
if (SUPER_ADMIN_PASSWORD && (SUPER_ADMIN_PASSWORD.length < 8 || Buffer.byteLength(SUPER_ADMIN_PASSWORD, 'utf8') > 72)) {
  console.error('SUPER_ADMIN_PASSWORD deve ter entre 8 e 72 bytes.');
  process.exit(1);
}

async function setupSuperAdmin() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const database = client.db('sistema_treino');
    const users = database.collection('users');
    await users.createIndex({ role: 1 }, { name: 'one_super_admin_role', unique: true, partialFilterExpression: { role: 'SUPER_ADMIN' } });

    const existing = await users.findOne({ username: SUPER_ADMIN_USERNAME });
    const currentOwner = await users.findOne({ role: 'SUPER_ADMIN', username: { $ne: SUPER_ADMIN_USERNAME } }, { projection: { id: 1 } });
    if (currentOwner) throw new Error('Outra conta SUPER_ADMIN já existe.');

    if (existing) {
      if (existing.role === 'SUPER_ADMIN') {
        if (existing.active === false) {
          await users.updateOne({ id: existing.id, role: 'SUPER_ADMIN', active: false }, { $set: { active: true, updatedAt: new Date() }, $inc: { sessionVersion: 1 } });
          console.log('Conta SUPER_ADMIN reativada; sessões anteriores invalidadas.');
        } else {
          console.log('SUPER_ADMIN já configurado; nenhuma alteração realizada.');
        }
        return;
      }
      const result = await users.updateOne(
        { id: existing.id, username: SUPER_ADMIN_USERNAME, role: { $ne: 'SUPER_ADMIN' } },
        { $set: { role: 'SUPER_ADMIN', active: true, updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
      );
      if (result.modifiedCount) {
        await database.collection('audit_logs').insertOne({ id: randomUUID(), userId: existing.id, action: 'promote_super_admin', resource: 'user', resourceId: existing.id, timestamp: new Date(), metadata: { role: 'SUPER_ADMIN' } });
      }
      console.log('SUPER_ADMIN configurado para a conta existente; sessões anteriores invalidadas.');
      return;
    }

    if (!SUPER_ADMIN_PASSWORD) throw new Error('Para criar a conta inicial, configure SUPER_ADMIN_PASSWORD no ambiente seguro.');
    const now = new Date();
    await users.insertOne({
      id: randomUUID(), username: SUPER_ADMIN_USERNAME, name: SUPER_ADMIN_NAME,
      role: 'SUPER_ADMIN', active: true, ownerAdminId: null, sessionVersion: 0,
      passwordHash: await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12), createdAt: now, updatedAt: now,
    });
    console.log('Conta SUPER_ADMIN criada; a senha nunca foi exibida.');
  } finally {
    await client.close();
  }
}

setupSuperAdmin().catch(() => {
  console.error('Não foi possível configurar o SUPER_ADMIN. Nenhum segredo foi impresso.');
  process.exitCode = 1;
});