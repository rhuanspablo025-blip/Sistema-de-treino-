// An illustrative, monotonic loading indicator, not a measure of API bytes.
export const MAX_VISUAL_LOADING_PROGRESS = 92;
export const INITIAL_VISUAL_LOADING_PROGRESS = 6;

export function getVisualLoadingProgress(elapsedMs) {
  const ms = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const progress = INITIAL_VISUAL_LOADING_PROGRESS +
    (MAX_VISUAL_LOADING_PROGRESS - INITIAL_VISUAL_LOADING_PROGRESS) *
    (1 - Math.exp(-ms / 10000));

  return Math.min(MAX_VISUAL_LOADING_PROGRESS, progress);
}
