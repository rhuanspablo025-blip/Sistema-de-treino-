#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.env.TURSO_MIGRATE_FROM_MONGO !== 'true') {
  console.log('Migração MongoDB → Turso desativada neste build.');
  process.exit(0);
}

const migration = path.join(__dirname, 'migrate-mongodb-to-turso.js');
const result = spawnSync(process.execPath, [migration, '--resume'], { stdio: 'inherit', env: process.env });
if (result.error) {
  console.error('Não foi possível iniciar a migração MongoDB → Turso.');
  process.exit(1);
}
process.exit(result.status ?? 1);
