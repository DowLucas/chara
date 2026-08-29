/**
 * Level maths for the recording vocalizer.
 *
 * IMPORTANT: expo-audio gives us a single loudness reading (dBFS), not a
 * frequency spectrum. The multi-bar display is a stylisation of amplitude,
 * not an analysis of pitch — there is no spectrum data behind it, and
 * getting one would need native work well beyond this feature.
 *
 * Kept free of React and native imports so the edge cases that actually
 * bite — -Infinity on digital silence, undefined before the recorder's
 * first tick, readings above 0 dBFS when clipping — are testable directly.
 */

/** Quietest reading we render as "nothing". Below this is inaudible. */
export const SILENCE_DBFS = -60;

/** How many bars the vocalizer draws. Odd, so there is a true middle. */
export const BAR_COUNT = 7;

/** Bars never fully collapse: a flat line reads as "broken", not "quiet". */
const FLOOR = 0.08;

/**
 * Convert a dBFS reading to 0..1.
 *
 * Returns 0 for a missing or non-finite reading. NaN must never escape
 * here — it would flow into an Animated transform and blank the view.
 */
export function dbfsToLevel(dbfs: number | undefined | null): number {
  if (dbfs === undefined || dbfs === null || !Number.isFinite(dbfs)) return 0;
  const norm = (dbfs - SILENCE_DBFS) / -SILENCE_DBFS;
  return Math.max(0, Math.min(1, norm));
}

/**
 * Per-bar heights for a given level.
 *
 * Weighted so the centre bars carry more of the level than the edges,
 * which is what makes the row read as a voice rather than a progress bar.
 * Deterministic — the animation supplies the motion, not randomness here,
 * so the same input always draws the same shape and the tests can pin it.
 */
export function barTargets(level: number): number[] {
  const clamped = Math.max(0, Math.min(1, level));
  const mid = (BAR_COUNT - 1) / 2;

  return Array.from({ length: BAR_COUNT }, (_, i) => {
    // 1 at the centre, tapering toward the ends.
    const distance = Math.abs(i - mid) / mid;
    const weight = 1 - 0.55 * distance * distance;
    return FLOOR + (1 - FLOOR) * clamped * weight;
  });
}
