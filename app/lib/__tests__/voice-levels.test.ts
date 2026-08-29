import { dbfsToLevel, barTargets, SILENCE_DBFS, BAR_COUNT } from '../voice-levels';

describe('dbfsToLevel', () => {
  it('maps the silence floor to 0 and clipping to 1', () => {
    expect(dbfsToLevel(SILENCE_DBFS)).toBe(0);
    expect(dbfsToLevel(0)).toBe(1);
  });

  it('maps the midpoint to roughly half', () => {
    expect(dbfsToLevel(SILENCE_DBFS / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps values beyond the ends', () => {
    // Some devices report above 0 dBFS when clipping, and -Infinity on
    // true digital silence.
    expect(dbfsToLevel(12)).toBe(1);
    expect(dbfsToLevel(-120)).toBe(0);
    expect(dbfsToLevel(-Infinity)).toBe(0);
  });

  it('treats a missing reading as silence rather than NaN', () => {
    // useAudioRecorderState reports undefined before its first tick, and
    // NaN would propagate into a transform and blank the whole view.
    expect(dbfsToLevel(undefined)).toBe(0);
    expect(dbfsToLevel(NaN)).toBe(0);
  });
});

describe('barTargets', () => {
  it('returns one target per bar', () => {
    expect(barTargets(0.5)).toHaveLength(BAR_COUNT);
  });

  it('keeps every target inside 0..1', () => {
    for (const level of [0, 0.13, 0.5, 0.87, 1]) {
      for (const v of barTargets(level)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never collapses to nothing, so the bars stay visible in silence', () => {
    for (const v of barTargets(0)) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('is loudest in the middle, so the shape reads as a voice', () => {
    const t = barTargets(1);
    const mid = Math.floor(BAR_COUNT / 2);
    expect(t[mid]).toBeGreaterThan(t[0]);
    expect(t[mid]).toBeGreaterThan(t[BAR_COUNT - 1]);
  });

  it('rises monotonically with the input level', () => {
    const quiet = barTargets(0.2);
    const loud = barTargets(0.9);
    for (let i = 0; i < BAR_COUNT; i++) {
      expect(loud[i]).toBeGreaterThan(quiet[i]);
    }
  });

  it('is deterministic — the same level gives the same shape', () => {
    expect(barTargets(0.42)).toEqual(barTargets(0.42));
  });
});
