#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');
const { migrateTrainingSchema } = require('../lib/training-relational-repository.cjs');

async function main() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./.atlasfit-etapa5.db';
  if (!url.startsWith('file:') && !process.env.TURSO_AUTH_TOKEN) throw new Error('Use somente libSQL local ou configure explicitamente o token.');
  const client = createClient({ url, ...(process.env.TURSO_AUTH_TOKEN && { authToken: process.env.TURSO_AUTH_TOKEN }) });
  try { await migrateTrainingSchema(client); console.log(JSON.stringify({ ok: true, migration: '0004_training_relational_etapa5', url })); }
  finally { await client.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
