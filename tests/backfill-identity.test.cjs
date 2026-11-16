const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.join(__dirname, '..', 'scripts', 'backfill-identity.js');

test('backfill requires explicit mode and blocks hosted credentials', () => {
  const missing = spawnSync(process.execPath, [script], { env: { ...process.env, TURSO_DATABASE_URL: 'file::memory:', TURSO_AUTH_TOKEN: '' }, encoding: 'utf8' });
  assert.notEqual(missing.status, 0); assert.match(missing.stderr, /--dry-run|--apply/);
  const hosted = spawnSync(process.execPath, [script, '--dry-run'], { env: { ...process.env, TURSO_DATABASE_URL: 'libsql://example.turso.io', TURSO_AUTH_TOKEN: 'test' }, encoding: 'utf8' });
  assert.notEqual(hosted.status, 0); assert.match(hosted.stderr, /somente em libSQL local/);
});
