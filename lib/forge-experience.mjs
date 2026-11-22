export const INTRO_VERSION = 'atlasfit-forge-1';
export const FORGE_DURATION = 10.2;

export function introPhase(t) {
  if (t >= FORGE_DURATION) return 'done';
  if (t >= 9.45) return 'exit';
  if (t >= 8.55) return 'brand';
  if (t >= 7.95) return 'evolua';
  if (t >= 7.35) return 'acompanhe';
  if (t >= 6.75) return 'monte';
  if (t >= 3.35) return 'identity';
  return 'reveal';
}

export function canPlayIntro({ seen, reducedMotion, saveData, hasSession }) {
  return !hasSession && !reducedMotion && !saveData && seen !== INTRO_VERSION;
}

export function waitingState(elapsed, error) {
  if (error) return 'error';
  if (elapsed >= 30000) return 'timeout';
  return elapsed >= 7000 ? 'slow' : 'loading';
}
