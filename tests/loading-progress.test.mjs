import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVisualLoadingProgress,
  INITIAL_VISUAL_LOADING_PROGRESS,
  MAX_VISUAL_LOADING_PROGRESS,
} from '../lib/loading-progress.mjs';

test('loading starts above zero without claiming completion', () => {
  assert.equal(getVisualLoadingProgress(0), INITIAL_VISUAL_LOADING_PROGRESS);
  assert.equal(getVisualLoadingProgress(-1000), INITIAL_VISUAL_LOADING_PROGRESS);
  assert.equal(getVisualLoadingProgress(Number.NaN), INITIAL_VISUAL_LOADING_PROGRESS);
});

test('loading grows over time but always stays below 100%', () => {
  const elapsed = [0, 420, 1200, 5000, 7000, 12000, 30000, 120000];
  const positions = elapsed.map(getVisualLoadingProgress);
  positions.slice(1).forEach((value, index) => assert.ok(value > positions[index]));
  assert.ok(positions.every((value) => value >= 0 && value <= MAX_VISUAL_LOADING_PROGRESS));
  assert.equal(getVisualLoadingProgress(Number.MAX_VALUE), MAX_VISUAL_LOADING_PROGRESS);
});
