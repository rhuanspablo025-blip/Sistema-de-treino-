const { randomUUID } = require('node:crypto');

const MIGRATION_KEY = '0004_training_relational_etapa5';

async function migrateTrainingSchema(client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS training_plans (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, trainer_id TEXT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS training_workouts (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES training_plans(id), tenant_id TEXT NOT NULL, weekday INTEGER, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS training_prescriptions (id TEXT PRIMARY KEY, workout_id TEXT NOT NULL REFERENCES training_workouts(id), exercise_id TEXT NOT NULL, legacy_exercise_id TEXT, position INTEGER NOT NULL DEFAULT 0, sets INTEGER, repetitions TEXT, load REAL, interval_seconds INTEGER, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS training_templates (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS training_sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, workout_id TEXT NOT NULL REFERENCES training_workouts(id), status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS training_session_sets (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES training_sessions(id), prescription_id TEXT NOT NULL REFERENCES training_prescriptions(id), series INTEGER NOT NULL, repetitions INTEGER NOT NULL, load REAL NOT NULL, rest_seconds INTEGER, notes TEXT, completed_at TEXT, UNIQUE(session_id, prescription_id, series))`,
    `CREATE TABLE IF NOT EXISTS exercise_id_reconciliation (tenant_id TEXT NOT NULL, legacy_id TEXT NOT NULL, sql_exercise_id TEXT, status TEXT NOT NULL, reason TEXT, first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id, legacy_id))`,
    `CREATE TABLE IF NOT EXISTS body_measurements (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, measured_at TEXT NOT NULL, created_by TEXT NOT NULL, payload TEXT NOT NULL, deleted_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS physical_evaluations (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, student_id TEXT NOT NULL, evaluated_at TEXT NOT NULL, created_by TEXT NOT NULL, payload TEXT NOT NULL, deleted_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS idx_training_plans_tenant_student ON training_plans(tenant_id, student_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_training_workouts_plan_position ON training_workouts(plan_id, position)`,
    `CREATE INDEX IF NOT EXISTS idx_training_history_student ON training_sessions(tenant_id, student_id, started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_measurements_student_date ON body_measurements(tenant_id, student_id, measured_at)`,
    `CREATE INDEX IF NOT EXISTS idx_evaluations_student_date ON physical_evaluations(tenant_id, student_id, evaluated_at)`,
    `CREATE TABLE IF NOT EXISTS relational_migrations (migration_key TEXT PRIMARY KEY, completed_at TEXT NOT NULL)`,
  ], 'write');
  await client.execute({ sql: 'INSERT OR IGNORE INTO relational_migrations(migration_key, completed_at) VALUES (?, ?)', args: [MIGRATION_KEY, new Date().toISOString()] });
}

function now() { return new Date().toISOString(); }
function json(value) { return JSON.stringify(value ?? {}); }

async function reconcileExerciseId(client, { tenantId, legacyId, sqlExerciseId = null, status, reason = null }) {
  if (!tenantId || !legacyId) throw new Error('tenantId e legacyId são obrigatórios.');
  const timestamp = now();
  await client.execute({ sql: `INSERT INTO exercise_id_reconciliation(tenant_id, legacy_id, sql_exercise_id, status, reason, first_seen_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, legacy_id) DO UPDATE SET sql_exercise_id=excluded.sql_exercise_id, status=excluded.status, reason=excluded.reason, updated_at=excluded.updated_at`, args: [tenantId, legacyId, sqlExerciseId, status, reason, timestamp, timestamp] });
  return client.execute({ sql: 'SELECT * FROM exercise_id_reconciliation WHERE tenant_id = ? AND legacy_id = ?', args: [tenantId, legacyId] });
}

async function createMeasurement(client, { tenantId, studentId, createdBy, measuredAt = now(), values }) {
  const id = randomUUID();
  await client.execute({ sql: 'INSERT INTO body_measurements(id, tenant_id, student_id, measured_at, created_by, payload) VALUES (?, ?, ?, ?, ?, ?)', args: [id, tenantId, studentId, measuredAt, createdBy, json(values)] });
  return { id, tenantId, studentId, measuredAt, createdBy, values };
}

module.exports = { MIGRATION_KEY, migrateTrainingSchema, reconcileExerciseId, createMeasurement };
