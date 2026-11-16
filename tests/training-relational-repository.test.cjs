const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('@libsql/client');
const { migrateTrainingSchema, reconcileExerciseId, createMeasurement } = require('../lib/training-relational-repository.cjs');

test('Etapa 5 schema is idempotent and reconciliation preserves orphan IDs', async () => {
  const client = createClient({ url: 'file::memory:' });
  try {
    await migrateTrainingSchema(client); await migrateTrainingSchema(client);
    const first = await reconcileExerciseId(client, { tenantId: 'academy-a', legacyId: 'legacy-x', status: 'ORPHAN', reason: 'not-found' });
    assert.equal(first.rows[0].status, 'ORPHAN');
    await reconcileExerciseId(client, { tenantId: 'academy-a', legacyId: 'legacy-x', sqlExerciseId: 'exercise-1', status: 'MATCHED' });
    const row = await client.execute({ sql: 'SELECT * FROM exercise_id_reconciliation WHERE tenant_id=? AND legacy_id=?', args: ['academy-a', 'legacy-x'] });
    assert.equal(row.rows.length, 1); assert.equal(row.rows[0].sql_exercise_id, 'exercise-1');
    const measurement = await createMeasurement(client, { tenantId: 'academy-a', studentId: 'student-1', createdBy: 'trainer-1', values: { weight: 80 } });
    assert.equal(measurement.values.weight, 80);
    assert.equal((await client.execute('SELECT COUNT(*) AS count FROM body_measurements')).rows[0].count, 1);
  } finally { await client.close(); }
});
