import { randomUUID } from 'node:crypto';
import usernameUtils from './username-utils.cjs';

const { migrateLegacyUsernames, ensureUniqueUserIndexes } = usernameUtils;

// Cada domínio vive em um cluster MongoDB separado.
// O log de auditoria fica sempre no cluster de cadastros (accounts).
export const domainCollections = {
  accounts: ['users', 'students', 'trainers', 'auth_attempts', 'app_settings', 'audit_logs'],
  exercises: ['exercises'],
  training: ['workout_plans', 'workout_templates', 'workouts', 'workout_history'],
  finance: [
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
    'notifications',
  ],
};

export const collectionNames = Object.values(domainCollections).flat();

const indexes = {
  users: [[{ createdAt: -1 }, {}]],
  students: [[{ userId: 1 }, { unique: true }], [{ trainerId: 1 }, {}], [{ createdAt: -1 }, {}]],
  trainers: [[{ userId: 1 }, { unique: true }], [{ createdAt: -1 }, {}]],
  exercises: [[{ nameKey: 1 }, { unique: true }], [{ muscleGroup: 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_plans: [[{ studentId: 1, createdAt: -1 }, {}], [{ trainerId: 1, createdAt: -1 }, {}], [{ studentId: 1, updatedAt: -1 }, {}], [{ trainerId: 1, updatedAt: -1 }, {}], [{ updatedAt: -1 }, {}], [{ createdAt: -1 }, {}]],
  workout_templates: [[{ updatedAt: -1 }, {}], [{ active: 1, updatedAt: -1 }, {}], [{ deletedAt: 1 }, { name: 'deleted_workout_templates_ttl_30d', expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { deletedAt: { $type: 'date' } } }]],
  workouts: [[{ workoutPlanId: 1, order: 1 }, {}], [{ 'exercises.exerciseId': 1 }, {}], [{ createdAt: -1 }, {}]],
  workout_history: [[{ studentId: 1, date: -1 }, {}], [{ workoutId: 1, date: -1 }, {}], [{ exerciseId: 1, date: -1 }, {}], [{ createdAt: -1 }, {}]],
  audit_logs: [[{ userId: 1, timestamp: -1 }, {}], [{ resource: 1, resourceId: 1, timestamp: -1 }, {}], [{ timestamp: 1 }, { name: 'audit_logs_ttl_30d', expireAfterSeconds: 30 * 24 * 60 * 60 }]],
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
  notifications: [[{ userId: 1, createdAt: -1 }, {}], [{ dedupeKey: 1 }, { unique: true, sparse: true }], [{ createdAt: 1 }, { name: 'notifications_read_ttl_30d', expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { readAt: { $type: 'date' } } }]],
};

const seedExercises = [
  {
    "name": "Supino reto",
    "muscleGroup": "Peito",
    "equipment": "Barra",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Supino inclinado",
    "muscleGroup": "Peito",
    "equipment": "Barra ou halteres",
    "primaryMuscles": [
      "Peitoral superior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Supino declinado",
    "muscleGroup": "Peito",
    "equipment": "Barra",
    "primaryMuscles": [
      "Peitoral inferior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Supino com halteres",
    "muscleGroup": "Peito",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "ombros"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crucifixo reto",
    "muscleGroup": "Peito",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crucifixo inclinado",
    "muscleGroup": "Peito",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Peitoral superior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crossover alto",
    "muscleGroup": "Peito",
    "equipment": "Polia",
    "primaryMuscles": [
      "Peitoral inferior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crossover médio",
    "muscleGroup": "Peito",
    "equipment": "Polia",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crossover baixo",
    "muscleGroup": "Peito",
    "equipment": "Polia",
    "primaryMuscles": [
      "Peitoral superior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Flexão de braços",
    "muscleGroup": "Peito",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Peck deck",
    "muscleGroup": "Peito",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Pullover",
    "muscleGroup": "Peito",
    "equipment": "Halter",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Grande dorsal",
      "tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Desenvolvimento militar",
    "muscleGroup": "Ombros",
    "equipment": "Barra",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "core"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Desenvolvimento com halteres",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Deltoide lateral",
      "tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação lateral",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide lateral"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação lateral na polia",
    "muscleGroup": "Ombros",
    "equipment": "Polia",
    "primaryMuscles": [
      "Deltoide lateral"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação frontal",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Peitoral superior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Crucifixo inverso",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide posterior"
    ],
    "secondaryMuscles": [
      "Trapézio",
      "romboides"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Face pull",
    "muscleGroup": "Ombros",
    "equipment": "Polia",
    "primaryMuscles": [
      "Deltoide posterior"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Encolhimento",
    "muscleGroup": "Trapézio",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Trapézio superior"
    ],
    "secondaryMuscles": [
      "Levantador da escápula"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Puxada frontal",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "romboides"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Puxada neutra",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Barra fixa",
    "muscleGroup": "Costas",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "core"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada curvada",
    "muscleGroup": "Costas",
    "equipment": "Barra",
    "primaryMuscles": [
      "Romboides",
      "grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "eretores da coluna"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada unilateral",
    "muscleGroup": "Costas",
    "equipment": "Halter",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "romboides"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada baixa",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Romboides",
      "grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "trapézio médio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada cavalinho",
    "muscleGroup": "Costas",
    "equipment": "Barra T",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Romboides",
      "bíceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Pulldown braços retos",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Redondo maior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Levantamento terra",
    "muscleGroup": "Costas e pernas",
    "equipment": "Barra",
    "primaryMuscles": [
      "Eretor da coluna",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "trapézio"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Hiperextensão lombar",
    "muscleGroup": "Lombar",
    "equipment": "Banco romano",
    "primaryMuscles": [
      "Eretor da coluna"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "posteriores"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca direta",
    "muscleGroup": "Bíceps",
    "equipment": "Barra",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial",
      "braquiorradial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca alternada",
    "muscleGroup": "Bíceps",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca martelo",
    "muscleGroup": "Bíceps",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Braquial",
      "braquiorradial"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca concentrada",
    "muscleGroup": "Bíceps",
    "equipment": "Halter",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca Scott",
    "muscleGroup": "Bíceps",
    "equipment": "Banco Scott",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca inversa",
    "muscleGroup": "Antebraço",
    "equipment": "Barra",
    "primaryMuscles": [
      "Braquiorradial"
    ],
    "secondaryMuscles": [
      "Extensores do punho"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Tríceps pulley",
    "muscleGroup": "Tríceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Tríceps corda",
    "muscleGroup": "Tríceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Tríceps testa",
    "muscleGroup": "Tríceps",
    "equipment": "Barra EZ",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Tríceps francês",
    "muscleGroup": "Tríceps",
    "equipment": "Halter",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Mergulho entre bancos",
    "muscleGroup": "Tríceps",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [
      "Deltoide anterior",
      "peitoral"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Coice de tríceps",
    "muscleGroup": "Tríceps",
    "equipment": "Halter",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento livre",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Barra",
    "primaryMuscles": [
      "Quadríceps",
      "glúteo máximo"
    ],
    "secondaryMuscles": [
      "Core",
      "posteriores"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento goblet",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Halter",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento smith",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Smith",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Leg press 45",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "posteriores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Cadeira extensora",
    "muscleGroup": "Quadríceps",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Afundo",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Passada caminhando",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento búlgaro",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Cadeira adutora",
    "muscleGroup": "Adutores",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Adutores"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Cadeira abdutora",
    "muscleGroup": "Glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Glúteo mínimo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação pélvica",
    "muscleGroup": "Glúteos",
    "equipment": "Barra ou máquina",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Stiff",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Barra ou halteres",
    "primaryMuscles": [
      "Posteriores",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Eretor da coluna"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Mesa flexora",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [
      "Gastrocnêmio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Cadeira flexora",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [
      "Gastrocnêmio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Flexora em pé",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Panturrilha em pé",
    "muscleGroup": "Panturrilhas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Gastrocnêmio"
    ],
    "secondaryMuscles": [
      "Sóleo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Panturrilha sentada",
    "muscleGroup": "Panturrilhas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Sóleo"
    ],
    "secondaryMuscles": [
      "Gastrocnêmio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Panturrilha no leg press",
    "muscleGroup": "Panturrilhas",
    "equipment": "Leg press",
    "primaryMuscles": [
      "Gastrocnêmio",
      "sóleo"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Abdominal crunch",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Oblíquos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Prancha isométrica",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal"
    ],
    "secondaryMuscles": [
      "Reto abdominal",
      "glúteos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Prancha lateral",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Oblíquos"
    ],
    "secondaryMuscles": [
      "Transverso abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação de pernas",
    "muscleGroup": "Abdômen",
    "equipment": "Barra ou banco",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Abdominal na polia",
    "muscleGroup": "Abdômen",
    "equipment": "Polia",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Oblíquos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Abdominal bicicleta",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Reto abdominal",
      "oblíquos"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rotação de tronco",
    "muscleGroup": "Abdômen",
    "equipment": "Polia",
    "primaryMuscles": [
      "Oblíquos"
    ],
    "secondaryMuscles": [
      "Transverso abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Farmer walk",
    "muscleGroup": "Core e antebraço",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Antebraços",
      "core"
    ],
    "secondaryMuscles": [
      "Trapézio",
      "glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca de punho",
    "muscleGroup": "Antebraço",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Flexores do punho"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Extensão de punho",
    "muscleGroup": "Antebraço",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Extensores do punho"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Extensão de quadril na polia",
    "muscleGroup": "Glúteos",
    "equipment": "Polia",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Coice na máquina",
    "muscleGroup": "Glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Abdução de quadril na polia",
    "muscleGroup": "Glúteos",
    "equipment": "Polia",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Glúteo mínimo"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Step-up",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Caixa e halteres",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Panturrilhas",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento sumô",
    "muscleGroup": "Glúteos e adutores",
    "equipment": "Halter ou barra",
    "primaryMuscles": [
      "Glúteos",
      "adutores"
    ],
    "secondaryMuscles": [
      "Quadríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Bom dia",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Barra",
    "primaryMuscles": [
      "Eretor da coluna",
      "posteriores"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada serrote",
    "muscleGroup": "Costas",
    "equipment": "Halter",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "romboides"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Pullover na polia",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Redondo maior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Supino máquina",
    "muscleGroup": "Peito",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Chest press convergente",
    "muscleGroup": "Peito",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "deltoide anterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Flexão inclinada",
    "muscleGroup": "Peito",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Flexão declinada",
    "muscleGroup": "Peito",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Peitoral superior"
    ],
    "secondaryMuscles": [
      "Tríceps",
      "deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Arnold press",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Deltoide lateral",
      "tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Elevação lateral inclinada",
    "muscleGroup": "Ombros",
    "equipment": "Halter",
    "primaryMuscles": [
      "Deltoide lateral"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Puxada supinada",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Remada articulada",
    "muscleGroup": "Costas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Grande dorsal",
      "romboides"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca na polia",
    "muscleGroup": "Bíceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Rosca spider",
    "muscleGroup": "Bíceps",
    "equipment": "Banco inclinado",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Agachamento frontal",
    "muscleGroup": "Quadríceps",
    "equipment": "Barra",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Core",
      "glúteos"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Hack squat",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Leg press horizontal",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Flexão nórdica assistida",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Avançado",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Panturrilha unilateral",
    "muscleGroup": "Panturrilhas",
    "equipment": "Peso corporal ou halter",
    "primaryMuscles": [
      "Gastrocnêmio",
      "sóleo"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  },
  {
    "name": "Abdominal infra reverso",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Oblíquos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Posicione-se corretamente, estabilize o tronco e realize o movimento de forma controlada, respeitando uma amplitude confortável.",
    "executionTips": "Mantenha o controle durante as fases de ida e volta, evite compensações e ajuste a carga à sua capacidade.",
    "contraindications": "Interrompa o exercício se houver dor. A execução e a carga devem respeitar a orientação de um profissional qualificado."
  }
];

seedExercises.push(...[
  {
    "name": "Supino com pegada fechada",
    "muscleGroup": "Peito e tríceps",
    "equipment": "Barra",
    "primaryMuscles": [
      "Peitoral maior",
      "tríceps"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Supino unilateral na polia",
    "muscleGroup": "Peito",
    "equipment": "Polia",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Core",
      "deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Press inclinado na máquina",
    "muscleGroup": "Peito",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Peitoral superior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexão diamante",
    "muscleGroup": "Peito e tríceps",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Tríceps",
      "peitoral maior"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexão com apoio nos joelhos",
    "muscleGroup": "Peito",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexão com elástico",
    "muscleGroup": "Peito",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Crucifixo na polia unilateral",
    "muscleGroup": "Peito",
    "equipment": "Polia",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Press horizontal unilateral",
    "muscleGroup": "Peito",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Landmine press",
    "muscleGroup": "Ombros",
    "equipment": "Barra landmine",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Peitoral superior",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Desenvolvimento na máquina",
    "muscleGroup": "Ombros",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Deltoide lateral",
      "tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Desenvolvimento Arnold sentado",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Deltoide lateral",
      "tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Elevação lateral na máquina",
    "muscleGroup": "Ombros",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Deltoide lateral"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Elevação lateral com pausa",
    "muscleGroup": "Ombros",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Deltoide lateral"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Elevação frontal com anilha",
    "muscleGroup": "Ombros",
    "equipment": "Anilha",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Peitoral superior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Y raise",
    "muscleGroup": "Ombros",
    "equipment": "Halteres leves",
    "primaryMuscles": [
      "Trapézio inferior"
    ],
    "secondaryMuscles": [
      "Deltoide posterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rotação externa de ombro",
    "muscleGroup": "Manguito rotador",
    "equipment": "Elástico ou polia",
    "primaryMuscles": [
      "Rotadores externos"
    ],
    "secondaryMuscles": [
      "Deltoide posterior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rotação interna de ombro",
    "muscleGroup": "Manguito rotador",
    "equipment": "Elástico ou polia",
    "primaryMuscles": [
      "Rotadores internos"
    ],
    "secondaryMuscles": [
      "Peitoral maior"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada alta com corda",
    "muscleGroup": "Ombros e trapézio",
    "equipment": "Polia",
    "primaryMuscles": [
      "Deltoide lateral",
      "trapézio"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Puxada aberta pronada",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "romboides"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Puxada unilateral ajoelhada",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Puxada na máquina articulada",
    "muscleGroup": "Costas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Barra fixa supinada",
    "muscleGroup": "Costas e bíceps",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Grande dorsal",
      "bíceps"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Barra fixa neutra",
    "muscleGroup": "Costas",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "braquial"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada curvada supinada",
    "muscleGroup": "Costas",
    "equipment": "Barra",
    "primaryMuscles": [
      "Grande dorsal",
      "romboides"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada cavalinho apoiada",
    "muscleGroup": "Costas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Romboides",
      "grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada baixa unilateral",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Romboides",
      "bíceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada com peito apoiado",
    "muscleGroup": "Costas",
    "equipment": "Halteres ou máquina",
    "primaryMuscles": [
      "Romboides",
      "grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada invertida",
    "muscleGroup": "Costas",
    "equipment": "Barra fixa",
    "primaryMuscles": [
      "Romboides",
      "grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Pullover com corda",
    "muscleGroup": "Costas",
    "equipment": "Polia",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Redondo maior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Good morning com elástico",
    "muscleGroup": "Posteriores e lombar",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Posteriores",
      "eretores da coluna"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca direta na polia baixa",
    "muscleGroup": "Bíceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca alternada sentada",
    "muscleGroup": "Bíceps",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca inclinada",
    "muscleGroup": "Bíceps",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca bayesian",
    "muscleGroup": "Bíceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca martelo na corda",
    "muscleGroup": "Bíceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Braquial",
      "braquiorradial"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca preacher na máquina",
    "muscleGroup": "Bíceps",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca 21",
    "muscleGroup": "Bíceps",
    "equipment": "Barra",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tríceps na polia unilateral",
    "muscleGroup": "Tríceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tríceps acima da cabeça na corda",
    "muscleGroup": "Tríceps",
    "equipment": "Polia",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tríceps banco",
    "muscleGroup": "Tríceps",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [
      "Deltoide anterior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Supino fechado no smith",
    "muscleGroup": "Tríceps",
    "equipment": "Smith",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [
      "Peitoral maior"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Extensão de tríceps na máquina",
    "muscleGroup": "Tríceps",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento com pausa",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Barra",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento caixa",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Caixa e barra",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento frontal com halteres",
    "muscleGroup": "Quadríceps",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento hack invertido",
    "muscleGroup": "Quadríceps",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Leg press unilateral",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Cadeira extensora unilateral",
    "muscleGroup": "Quadríceps",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Sissy squat assistido",
    "muscleGroup": "Quadríceps",
    "equipment": "Apoio ou máquina",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Avanço reverso",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Halteres",
    "primaryMuscles": [
      "Glúteos",
      "quadríceps"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Avanço lateral",
    "muscleGroup": "Adutores e glúteos",
    "equipment": "Peso corporal ou halter",
    "primaryMuscles": [
      "Adutores",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Quadríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Step-down",
    "muscleGroup": "Quadríceps",
    "equipment": "Caixa baixa",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "panturrilhas"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento na parede",
    "muscleGroup": "Quadríceps",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Ponte de glúteos",
    "muscleGroup": "Glúteos",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Ponte unilateral",
    "muscleGroup": "Glúteos",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Hip thrust na máquina",
    "muscleGroup": "Glúteos",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Pull-through",
    "muscleGroup": "Glúteos",
    "equipment": "Polia",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Posteriores"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Abdução de quadril deitado",
    "muscleGroup": "Glúteos",
    "equipment": "Peso corporal ou miniband",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Glúteo mínimo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Caminhada lateral com miniband",
    "muscleGroup": "Glúteos",
    "equipment": "Miniband",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Glúteo mínimo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Clamshell",
    "muscleGroup": "Glúteos",
    "equipment": "Miniband",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Rotadores externos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Extensão de quadril quatro apoios",
    "muscleGroup": "Glúteos",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Glúteo máximo"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexora deslizante",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Slider",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Nordic curl",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Levantamento terra romeno unilateral",
    "muscleGroup": "Posteriores e glúteos",
    "equipment": "Halter",
    "primaryMuscles": [
      "Posteriores",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Stiff unilateral",
    "muscleGroup": "Posteriores e glúteos",
    "equipment": "Halter",
    "primaryMuscles": [
      "Posteriores",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Eretor da coluna"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Good morning sentado",
    "muscleGroup": "Lombar e posteriores",
    "equipment": "Máquina ou barra",
    "primaryMuscles": [
      "Eretor da coluna",
      "posteriores"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Panturrilha no smith",
    "muscleGroup": "Panturrilhas",
    "equipment": "Smith",
    "primaryMuscles": [
      "Gastrocnêmio"
    ],
    "secondaryMuscles": [
      "Sóleo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Panturrilha no leg press unilateral",
    "muscleGroup": "Panturrilhas",
    "equipment": "Leg press",
    "primaryMuscles": [
      "Gastrocnêmio",
      "sóleo"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Panturrilha donkey",
    "muscleGroup": "Panturrilhas",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Gastrocnêmio"
    ],
    "secondaryMuscles": [
      "Sóleo"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tibial anterior na parede",
    "muscleGroup": "Tibial anterior",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Tibial anterior"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tibial anterior na máquina",
    "muscleGroup": "Tibial anterior",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Tibial anterior"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Abdominal canivete",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Abdominal V-up",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Dead bug",
    "muscleGroup": "Core",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal"
    ],
    "secondaryMuscles": [
      "Reto abdominal"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Bird dog",
    "muscleGroup": "Core e lombar",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Eretores da coluna"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "core"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Hollow body hold",
    "muscleGroup": "Core",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal"
    ],
    "secondaryMuscles": [
      "Reto abdominal"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Pallof press",
    "muscleGroup": "Core",
    "equipment": "Polia ou elástico",
    "primaryMuscles": [
      "Oblíquos",
      "transverso"
    ],
    "secondaryMuscles": [
      "Reto abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Woodchopper alto para baixo",
    "muscleGroup": "Core",
    "equipment": "Polia",
    "primaryMuscles": [
      "Oblíquos"
    ],
    "secondaryMuscles": [
      "Transverso abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Woodchopper baixo para alto",
    "muscleGroup": "Core",
    "equipment": "Polia",
    "primaryMuscles": [
      "Oblíquos"
    ],
    "secondaryMuscles": [
      "Transverso abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Abdominal na máquina",
    "muscleGroup": "Abdômen",
    "equipment": "Máquina",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Oblíquos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Abdominal declinado",
    "muscleGroup": "Abdômen",
    "equipment": "Banco declinado",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Elevação de joelhos na barra",
    "muscleGroup": "Abdômen",
    "equipment": "Barra fixa",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Elevação de joelhos na paralela",
    "muscleGroup": "Abdômen",
    "equipment": "Cadeira romana",
    "primaryMuscles": [
      "Reto abdominal"
    ],
    "secondaryMuscles": [
      "Flexores do quadril"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Prancha com toque no ombro",
    "muscleGroup": "Core",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal"
    ],
    "secondaryMuscles": [
      "Deltoides",
      "oblíquos"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Prancha com elevação de perna",
    "muscleGroup": "Core e glúteos",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Reto abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Extensão lombar no solo",
    "muscleGroup": "Lombar",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Eretor da coluna"
    ],
    "secondaryMuscles": [
      "Glúteos"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Superman",
    "muscleGroup": "Lombar",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Eretor da coluna"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "posteriores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rotação russa",
    "muscleGroup": "Abdômen",
    "equipment": "Peso corporal ou anilha",
    "primaryMuscles": [
      "Oblíquos"
    ],
    "secondaryMuscles": [
      "Reto abdominal"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Suitcase carry",
    "muscleGroup": "Core e antebraço",
    "equipment": "Halter",
    "primaryMuscles": [
      "Oblíquos",
      "antebraços"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Dead hang",
    "muscleGroup": "Antebraço e costas",
    "equipment": "Barra fixa",
    "primaryMuscles": [
      "Flexores dos dedos"
    ],
    "secondaryMuscles": [
      "Grande dorsal",
      "trapézio"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Wrist roller",
    "muscleGroup": "Antebraço",
    "equipment": "Rolo de punho",
    "primaryMuscles": [
      "Flexores e extensores do punho"
    ],
    "secondaryMuscles": [],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Pronação de antebraço",
    "muscleGroup": "Antebraço",
    "equipment": "Halter ou martelo",
    "primaryMuscles": [
      "Pronadores do antebraço"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Supinação de antebraço",
    "muscleGroup": "Antebraço",
    "equipment": "Halter ou martelo",
    "primaryMuscles": [
      "Supinadores do antebraço"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexão plantar com elástico",
    "muscleGroup": "Panturrilhas",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Gastrocnêmio",
      "sóleo"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Extensão de joelho com elástico",
    "muscleGroup": "Quadríceps",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Quadríceps"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Flexão de joelho com elástico",
    "muscleGroup": "Posteriores da coxa",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Isquiotibiais"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Remada com elástico",
    "muscleGroup": "Costas",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Grande dorsal",
      "romboides"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Puxada alta com elástico",
    "muscleGroup": "Costas",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Grande dorsal"
    ],
    "secondaryMuscles": [
      "Bíceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Supino com elástico",
    "muscleGroup": "Peito",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Peitoral maior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Desenvolvimento com elástico",
    "muscleGroup": "Ombros",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Deltoide anterior"
    ],
    "secondaryMuscles": [
      "Tríceps"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Rosca bíceps com elástico",
    "muscleGroup": "Bíceps",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Bíceps braquial"
    ],
    "secondaryMuscles": [
      "Braquial"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Tríceps com elástico",
    "muscleGroup": "Tríceps",
    "equipment": "Elástico",
    "primaryMuscles": [
      "Tríceps braquial"
    ],
    "secondaryMuscles": [],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Agachamento com miniband",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Miniband",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Abdutores"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Monster walk",
    "muscleGroup": "Glúteos",
    "equipment": "Miniband",
    "primaryMuscles": [
      "Glúteo médio"
    ],
    "secondaryMuscles": [
      "Glúteo mínimo"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Bear crawl",
    "muscleGroup": "Core e ombros",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Transverso abdominal",
      "deltoides"
    ],
    "secondaryMuscles": [
      "Quadríceps"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Mountain climber",
    "muscleGroup": "Core e condicionamento",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Core",
      "flexores do quadril"
    ],
    "secondaryMuscles": [
      "Deltoides"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Burpee",
    "muscleGroup": "Corpo inteiro",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Quadríceps",
      "peitoral",
      "core"
    ],
    "secondaryMuscles": [
      "Glúteos",
      "ombros"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Kettlebell swing",
    "muscleGroup": "Posteriores e glúteos",
    "equipment": "Kettlebell",
    "primaryMuscles": [
      "Glúteos",
      "posteriores"
    ],
    "secondaryMuscles": [
      "Core",
      "deltoides"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Kettlebell goblet squat",
    "muscleGroup": "Quadríceps e glúteos",
    "equipment": "Kettlebell",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Kettlebell deadlift",
    "muscleGroup": "Posteriores e glúteos",
    "equipment": "Kettlebell",
    "primaryMuscles": [
      "Glúteos",
      "posteriores"
    ],
    "secondaryMuscles": [
      "Eretor da coluna"
    ],
    "difficulty": "Iniciante",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Turkish get-up",
    "muscleGroup": "Corpo inteiro",
    "equipment": "Kettlebell",
    "primaryMuscles": [
      "Core",
      "ombros",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Quadríceps"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Battle rope alternado",
    "muscleGroup": "Condicionamento",
    "equipment": "Corda naval",
    "primaryMuscles": [
      "Ombros",
      "core"
    ],
    "secondaryMuscles": [
      "Braços"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Battle rope ondas duplas",
    "muscleGroup": "Condicionamento",
    "equipment": "Corda naval",
    "primaryMuscles": [
      "Ombros",
      "core"
    ],
    "secondaryMuscles": [
      "Braços"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Box jump",
    "muscleGroup": "Potência de pernas",
    "equipment": "Caixa",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Panturrilhas"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Salto vertical",
    "muscleGroup": "Potência de pernas",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Panturrilhas"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Salto lateral",
    "muscleGroup": "Potência e estabilidade",
    "equipment": "Peso corporal",
    "primaryMuscles": [
      "Glúteos",
      "quadríceps"
    ],
    "secondaryMuscles": [
      "Panturrilhas",
      "core"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Caminhada do fazendeiro unilateral",
    "muscleGroup": "Core e antebraço",
    "equipment": "Halter",
    "primaryMuscles": [
      "Oblíquos",
      "antebraços"
    ],
    "secondaryMuscles": [
      "Trapézio"
    ],
    "difficulty": "Intermediário",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Sled push",
    "muscleGroup": "Condicionamento e pernas",
    "equipment": "Trenó",
    "primaryMuscles": [
      "Quadríceps",
      "glúteos"
    ],
    "secondaryMuscles": [
      "Panturrilhas",
      "core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  },
  {
    "name": "Sled pull",
    "muscleGroup": "Costas e condicionamento",
    "equipment": "Trenó",
    "primaryMuscles": [
      "Grande dorsal",
      "bíceps"
    ],
    "secondaryMuscles": [
      "Posteriores",
      "core"
    ],
    "difficulty": "Avançado",
    "instructions": "Ajuste a posição inicial, estabilize o corpo e execute o movimento com controle, sem forçar uma amplitude desconfortável.",
    "executionTips": "Priorize a técnica antes de aumentar a carga. Controle a fase de retorno e evite movimentos bruscos.",
    "contraindications": "Interrompa se houver dor. Adapte o exercício à condição individual com orientação profissional."
  }
]);;

async function createCollectionIfMissing(database, name) {
  if (await database.listCollections({ name }, { nameOnly: true }).hasNext()) return;
  try {
    await database.createCollection(name);
  } catch (error) {
    if (error.code !== 48) throw error;
  }
}

// Inicializa apenas as coleções e índices do domínio informado,
// pois cada domínio aponta para um cluster MongoDB diferente.
export async function initializeDatabase(database, domain = 'accounts') {
  const names = domainCollections[domain] || domainCollections.accounts;
  for (const name of names) await createCollectionIfMissing(database, name);

  if (domain === 'accounts') {
    await migrateLegacyUsernames(database);
    await ensureUniqueUserIndexes(database.collection('users'));
  }

  await Promise.all(names.flatMap((name) =>
    (indexes[name] || []).map(([keys, options]) => database.collection(name).createIndex(keys, options)),
  ));

  if (domain === 'accounts') {
    await database.collection('users').createIndex(
      { role: 1 },
      { name: 'one_super_admin_role', unique: true, partialFilterExpression: { role: 'SUPER_ADMIN' } },
    );
  }

  if (domain === 'finance') {
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
  }

  if (domain !== 'exercises') return;

  const exercises = database.collection('exercises');
  const now = new Date();
  for (let offset = 0; offset < seedExercises.length; offset += 20) {
    const batch = seedExercises.slice(offset, offset + 20);
    await Promise.all(batch.map(async (item) => {
      const nameKey = item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const metadata = {
        primaryMuscles: item.primaryMuscles, secondaryMuscles: item.secondaryMuscles,
        difficulty: item.difficulty, instructions: item.instructions,
        executionTips: item.executionTips, contraindications: item.contraindications,
      };
      await exercises.updateOne(
        { nameKey },
        { $setOnInsert: { ...item, id: randomUUID(), nameKey, description: '', active: true, createdAt: now, updatedAt: now } },
        { upsert: true },
      );
      await exercises.updateOne(
        { nameKey, primaryMuscles: { $exists: false } },
        { $set: { ...metadata, updatedAt: now } },
      );
    }));
  }
}
