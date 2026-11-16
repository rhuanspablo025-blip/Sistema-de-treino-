#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');
const { initializeSchema, createTursoDatabase } = require('../lib/turso-document-store.cjs');
const { migrateTrainingSchema } = require('../lib/training-relational-repository.cjs');

async function main() {
  const dryRun = process.argv.includes('--dry-run'); const apply = process.argv.includes('--apply');
  if (!dryRun && !apply) throw new Error('Backfill abortado: use --dry-run ou --apply explicitamente.');
  if (apply && process.env.IDENTITY_BACKFILL_APPLY !== 'true') throw new Error('Backfill bloqueado: defina IDENTITY_BACKFILL_APPLY=true em ambiente local autorizado.');
  const url = process.env.TURSO_DATABASE_URL || 'file::memory:';
  if (!url.startsWith('file:') || process.env.TURSO_AUTH_TOKEN) throw new Error('Backfill permitido somente em libSQL local sem token hospedado.');
  const client = createClient({ url }); await initializeSchema(client); await migrateTrainingSchema(client); const database = createTursoDatabase(client, url);
  const users = await database.collection('users').find({}).toArray(); const students = await database.collection('students').find({}).toArray(); const trainers = await database.collection('trainers').find({}).toArray();
  const usernames = new Map(); const duplicateUsernames = []; for (const user of users) { const key = String(user.username || '').toLowerCase(); if (usernames.has(key)) duplicateUsernames.push(key); else usernames.set(key, user.id); }
  const report = { dryRun, tenantsFound: new Set(users.map((u) => u.ownerAdminId || 'default-tenant')).size, usersFound: users.length, studentsFound: students.length, trainersFound: trainers.length, duplicateUsernames, usersWithoutTenant: users.filter((u) => !u.ownerAdminId).length, studentsWithoutTrainer: students.filter((s) => !s.trainerId).length, orphanTrainerReferences: students.filter((s) => s.trainerId && !trainers.some((t) => t.userId === s.trainerId)).length, wouldImport: users.length + students.length + trainers.length, errors: [] };
  if (apply) report.errors.push('Apply deliberadamente não implementa escrita automática até o mapeamento de senha e tenant ser revisado.');
  console.log(JSON.stringify(report, null, 2)); await client.close();
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
