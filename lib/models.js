import { randomUUID } from 'node:crypto';
import usernameUtils from './username-utils.cjs';

const { migrateLegacyUsernames, ensureUniqueUserIndexes } = usernameUtils;

export const collectionNames = [
  'users',
  'students',
  'trainers',
  'exercises',
  'workout_plans',
  'workouts',
  'workout_history',
  'audit_logs',
  'billing_plans',
  'subscriptions',
  'invoices',
  'payments',
  'payment_webhooks',
  'billing_rules',
  'access_blocks',
  'financial_ledger',
  'payment_provider_config',
  'payment_provider_customers',
  'payment_payouts',
  'auth_attempts',
  'notifications',
];

const indexes = {
  users: [[{ createdAt: -1 }, {}]],
  students: [[{ userId: 1 }, { unique: true }], [{ trainerId: 1 }, {}], [{ createdAt: -1 }, {}]],
  trainers: [[{ userId: 1 }, { unique: true }], [{ createdAt: -1 }, {}]],
  exercises: [[{ nameKey: 1 }, { unique: true }], [{ muscleGroup: 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_plans: [[{ studentId: 1, createdAt: -1 }, {}], [{ trainerId: 1, createdAt: -1 }, {}], [{ studentId: 1, updatedAt: -1 }, {}], [{ trainerId: 1, updatedAt: -1 }, {}], [{ updatedAt: -1 }, {}], [{ createdAt: -1 }, {}]],
  workouts: [[{ workoutPlanId: 1, order: 1 }, {}], [{ 'exercises.exerciseId': 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_history: [[{ studentId: 1, date: -1 }, {}], [{ workoutId: 1, date: -1 }, {}], [{ exerciseId: 1, date: -1 }, {}], [{ createdAt: -1 }, {}]],
  audit_logs: [[{ userId: 1, timestamp: -1 }, {}], [{ resource: 1, resourceId: 1, timestamp: -1 }, {}]],
  billing_plans: [[{ slug: 1 }, { unique: true }], [{ active: 1, updatedAt: -1 }, {}]],
  subscriptions: [[{ accountUserId: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } }], [{ status: 1, nextDueAt: 1 }, {}], [{ ownerAdminId: 1, status: 1 }, {}]],
  invoices: [[{ subscriptionId: 1, periodKey: 1 }, { unique: true }], [{ status: 1, dueAt: 1 }, {}], [{ payerUserId: 1, createdAt: -1 }, {}]],
  payments: [[{ invoiceId: 1, createdAt: -1 }, {}], [{ providerPaymentId: 1 }, { unique: true, sparse: true }], [{ invoiceId: 1 }, { unique: true, partialFilterExpression: { activeAttempt: true } }]],
  payment_webhooks: [[{ providerEventId: 1 }, { unique: true }], [{ receivedAt: -1 }, {}]],
  billing_rules: [[{ id: 1 }, { unique: true }]],
  access_blocks: [[{ userId: 1, status: 1 }, {}], [{ userId: 1, source: 1 }, { unique: true, partialFilterExpression: { source: 'AUTOMATIC', status: 'ACTIVE' } }], [{ level: 1, startsAt: 1 }, {}]],
  financial_ledger: [[{ accountUserId: 1, createdAt: -1 }, {}], [{ invoiceId: 1 }, {}], [{ providerEventId: 1 }, { unique: true, sparse: true }], [{ payoutId: 1 }, { unique: true, sparse: true }]],
  payment_provider_config: [[{ id: 1 }, { unique: true }]],
  payment_provider_customers: [[{ provider: 1, environment: 1, userId: 1 }, { unique: true }], [{ provider: 1, environment: 1, providerCustomerId: 1 }, { unique: true }]],
  payment_payouts: [[{ provider: 1, paymentId: 1 }, { unique: true }], [{ status: 1, createdAt: 1 }, {}], [{ externalTransferId: 1 }, { unique: true, sparse: true }]],
  auth_attempts: [[{ key: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  notifications: [[{ userId: 1, createdAt: -1 }, {}], [{ dedupeKey: 1 }, { unique: true, sparse: true }]],
};

const seedExercises = [
  ['Supino reto', 'Peito', 'Barra'],
  ['Supino inclinado', 'Peito', 'Halteres'],
  ['Crucifixo', 'Peito', 'Halteres'],
  ['Desenvolvimento', 'Ombros', 'Halteres'],
  ['Elevação lateral', 'Ombros', 'Halteres'],
  ['Rosca direta', 'Bíceps', 'Barra'],
  ['Tríceps pulley', 'Tríceps', 'Polia'],
  ['Agachamento livre', 'Quadríceps e glúteos', 'Barra'],
  ['Leg press', 'Quadríceps e glúteos', 'Máquina'],
  ['Cadeira extensora', 'Quadríceps', 'Máquina'],
  ['Mesa flexora', 'Posteriores da coxa', 'Máquina'],
  ['Panturrilha', 'Panturrilhas', 'Máquina'],
];

async function createCollectionIfMissing(database, name) {
  if (await database.listCollections({ name }, { nameOnly: true }).hasNext()) return;
  try {
    await database.createCollection(name);
  } catch (error) {
    if (error.code !== 48) throw error;
  }
}

export async function initializeDatabase(database) {
  for (const name of collectionNames) await createCollectionIfMissing(database, name);

  await migrateLegacyUsernames(database);
  await ensureUniqueUserIndexes(database.collection('users'));

  await Promise.all(collectionNames.flatMap((name) =>
    indexes[name].map(([keys, options]) => database.collection(name).createIndex(keys, options)),
  ));
  await database.collection('users').createIndex(
    { role: 1 },
    { name: 'one_super_admin_role', unique: true, partialFilterExpression: { role: 'SUPER_ADMIN' } },
  );

  const initializedAt = new Date();
  await Promise.all([
    database.collection('billing_rules').updateOne(
      { id: 'global' },
      { $setOnInsert: { id: 'global', currency: 'BRL', dueDay: 10, noticeDays: 5, graceDays: 3, restrictAfterDays: 1, blockAfterDays: 7, lateFeePercent: 2, dailyInterestPercent: 0.033, platformFeePercent: 0, allowStudentRevenueOffset: false, offsetPercent: 0, offsetCapCents: null, creditCarryover: false, updatedAt: initializedAt } },
      { upsert: true },
    ),
    database.collection('payment_provider_config').updateOne(
      { id: 'global' },
      { $setOnInsert: { id: 'global', provider: 'unconfigured', environment: 'sandbox', methods: { pix: false, boleto: false, card: false }, updatedAt: initializedAt } },
      { upsert: true },
    ),
  ]);

  const exercises = database.collection('exercises');
  const now = new Date();
  await Promise.all(seedExercises.map(([name, muscleGroup, equipment]) => {
    const nameKey = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return exercises.updateOne(
      { nameKey },
      { $setOnInsert: { id: randomUUID(), name, nameKey, muscleGroup, equipment, description: '', instructions: '', active: true, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }));
}
