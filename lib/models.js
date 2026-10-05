import { randomUUID } from 'node:crypto';

export const collectionNames = [
  'users',
  'students',
  'trainers',
  'exercises',
  'workout_plans',
  'workouts',
  'workout_history',
  'audit_logs',
];

const indexes = {
  users: [[{ email: 1 }, { unique: true }], [{ createdAt: -1 }, {}]],
  students: [[{ userId: 1 }, { unique: true }], [{ trainerId: 1 }, {}], [{ createdAt: -1 }, {}]],
  trainers: [[{ userId: 1 }, { unique: true }], [{ createdAt: -1 }, {}]],
  exercises: [[{ nameKey: 1 }, { unique: true }], [{ muscleGroup: 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_plans: [[{ studentId: 1, createdAt: -1 }, {}], [{ trainerId: 1, createdAt: -1 }, {}], [{ createdAt: -1 }, {}]],
  workouts: [[{ workoutPlanId: 1, order: 1 }, {}], [{ 'exercises.exerciseId': 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_history: [[{ studentId: 1, date: -1 }, {}], [{ workoutId: 1, date: -1 }, {}], [{ exerciseId: 1, date: -1 }, {}], [{ createdAt: -1 }, {}]],
  audit_logs: [[{ userId: 1, timestamp: -1 }, {}], [{ resource: 1, resourceId: 1, timestamp: -1 }, {}]],
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

  await Promise.all(collectionNames.flatMap((name) =>
    indexes[name].map(([keys, options]) => database.collection(name).createIndex(keys, options)),
  ));

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
