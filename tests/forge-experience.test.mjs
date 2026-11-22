import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canPlayIntro,
  filmTime,
  FORGE_DURATION,
  introPhase,
  INTRO_VERSION,
  waitingState,
} from '../lib/forge-experience.mjs';

test('first anonymous visit and a new film version can play the opening', () => {
  assert.equal(canPlayIntro({}), true);
  assert.equal(canPlayIntro({ seen: 'old-version' }), true);
  assert.equal(canPlayIntro({ seen: INTRO_VERSION }), false);
});
test('session, reduced motion and data saving each bypass the opening', () => {
  for (const flag of ['hasSession', 'reducedMotion', 'saveData'])
    assert.equal(canPlayIntro({ [flag]: true }), false);
});
test('film moves through identity, three beats and a crossfade before dismissal', () => {
  assert.deepEqual([0, 3.5, 6.8, 7.4, 8, 8.6, 9.5, FORGE_DURATION].map(introPhase), [
    'reveal',
    'identity',
    'monte',
    'acompanhe',
    'evolua',
    'brand',
    'exit',
    'done',
  ]);
});
test('slow and stalled requests have separate states and actual errors take priority', () => {
  assert.equal(waitingState(0, ''), 'loading');
  assert.equal(waitingState(6999, ''), 'loading');
  assert.equal(waitingState(7000, ''), 'slow');
  assert.equal(waitingState(30000, ''), 'timeout');
  assert.equal(waitingState(30001, 'Falha'), 'error');
});

test('cinematic playback extends the opening without slowing route loading', () => {
  assert.equal(filmTime(8), 6);
  assert.equal(filmTime(FORGE_DURATION / 0.75), FORGE_DURATION);
});
