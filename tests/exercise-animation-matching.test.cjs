const assert = require('node:assert/strict');
const test = require('node:test');

const records = [
  'jackknife sit-up',
  'band bicycle crunch',
  'crunch floor',
  'decline crunch',
  'reverse crunch',
  'lever seated crunch',
  'cable standing crunch',
  'suspended abdominal fallout',
  '3/4 sit-up',
  'barbell side split squat',
  'barbell split squat v. 2',
  'side hip abduction',
  'dumbbell lunge',
  'barbell lateral lunge',
  'dumbbell rear lunge',
  'dumbbell arnold press',
  'pull-up',
  'pull up (neutral grip)',
  'chin-up',
  'lever seated hip abduction',
  'lever seated hip adduction',
  'band vertical pallof press',
  'donkey calf raise',
  'lever leg extension',
  'cable upper chest crossovers',
  'cable decline fly',
  'cable standing up straight crossovers',
  'dumbbell incline fly',
  'cable lat pulldown full range of motion',
  'cable seated row',
  'lever preacher curl',
  'sled 45° leg press (side pov)',
  'dumbbell bench press',
  'dumbbell incline bench press',
  'barbell incline bench press',
].map((name) => ({
  name,
  mediaStatus: 'animated',
  animation: { frames: ['frame-00.svg', 'frame-01.svg'] },
}));

test('matches localized abdominal exercises to the corresponding animation', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');
  const cases = [
    ['Abdominal V-up', 'jackknife sit-up'],
    ['Abdominal bicicleta', 'band bicycle crunch'],
    ['Abdominal canivete', 'jackknife sit-up'],
    ['Abdominal crunch', 'crunch floor'],
    ['Abdominal declinado', 'decline crunch'],
    ['Abdominal infra reverso', 'reverse crunch'],
    ['Abdominal na máquina', 'lever seated crunch'],
    ['Abdominal na polia', 'cable standing crunch'],
    ['Abdução de quadril deitado', 'side hip abduction'],
    ['Afundo', 'dumbbell lunge'],
    ['Avanço lateral', 'barbell lateral lunge'],
    ['Avanço reverso', 'dumbbell rear lunge'],
    ['Arnold press', 'dumbbell arnold press'],
    ['Barra fixa', 'pull-up'],
    ['Barra fixa neutra', 'pull up (neutral grip)'],
    ['Barra fixa supinada', 'chin-up'],
    ['Cadeira abdutora', 'lever seated hip abduction'],
    ['Cadeira adutora', 'lever seated hip adduction'],
    ['Pallof press', 'band vertical pallof press'],
    ['Panturrilha donkey', 'donkey calf raise'],
    ['Cadeira extensora', 'lever leg extension'],
    ['Crossover alto', 'cable upper chest crossovers'],
    ['Crossover baixo', 'cable decline fly'],
    ['Crossover médio', 'cable standing up straight crossovers'],
    ['Crucifixo inclinado', 'dumbbell incline fly'],
    ['Puxada frontal', 'cable lat pulldown full range of motion'],
    ['Remada baixa', 'cable seated row'],
    ['Rosca Scott', 'lever preacher curl'],
    ['Leg press 45', 'sled 45° leg press (side pov)'],
    ['Supino com halteres', 'dumbbell bench press'],
  ];

  for (const [name, expected] of cases) {
    assert.equal(findAnimation({ name }, records)?.name, expected, name);
  }
});

test('does not use a generic shared word to suggest a different exercise', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');

  assert.equal(findAnimation({ name: 'Agachamento na parede' }, records), null);
  assert.equal(findAnimation({ name: 'Agachamento búlgaro' }, records), null);
  assert.equal(findAnimation({ name: 'Agachamento hack invertido' }, records), null);
  assert.equal(findAnimation({ name: 'Agachamento frontal com halteres' }, records), null);
  assert.equal(findAnimation({ name: 'Abdominal desconhecido' }, records), null);
});

test('prefers the exact equipment variation over a generic alias', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');

  assert.equal(findAnimation({ name: 'Supino inclinado com halteres' }, records)?.name, 'dumbbell incline bench press');
});

test('selects licensed videos only for exact name and equipment matches', async () => {
  const { findExerciseVideo } = await import('../lib/exercise-animation-matching.mjs');

  assert.equal(findExerciseVideo({ name: 'Supino reto', equipment: 'Barra' })?.license, 'CC BY-SA 4.0');
  assert.equal(findExerciseVideo({ name: 'Tríceps testa', equipment: 'Barra EZ' })?.license, 'CC BY-SA 4.0');
  assert.equal(findExerciseVideo({ name: 'Tríceps testa', equipment: 'Halteres' }), null);
  assert.equal(findExerciseVideo({ name: 'Mergulho entre bancos', equipment: 'Peso corporal' }), null);
});

test('ignores records without usable animation frames', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');
  const unusable = [{ name: 'crunch floor', mediaStatus: 'instructions-only', animation: null }];

  assert.equal(findAnimation({ name: 'Abdominal crunch' }, unusable), null);
});
