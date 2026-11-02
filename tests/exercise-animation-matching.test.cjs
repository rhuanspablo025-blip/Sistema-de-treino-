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
  ];

  for (const [name, expected] of cases) {
    assert.equal(findAnimation({ name }, records)?.name, expected, name);
  }
});

test('does not use a generic shared word to suggest a different exercise', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');

  assert.equal(findAnimation({ name: 'Agachamento na parede' }, records), null);
  assert.equal(findAnimation({ name: 'Agachamento búlgaro' }, records), null);
  assert.equal(findAnimation({ name: 'Abdominal desconhecido' }, records), null);
});

test('ignores records without usable animation frames', async () => {
  const { findAnimation } = await import('../lib/exercise-animation-matching.mjs');
  const unusable = [{ name: 'crunch floor', mediaStatus: 'instructions-only', animation: null }];

  assert.equal(findAnimation({ name: 'Abdominal crunch' }, unusable), null);
});
