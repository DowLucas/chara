/**
 * Pure helpers behind the monthly summary screen. This repo has no
 * component-render testing, so the logic lives here and the screen is a thin
 * dispatcher over it.
 */

import {
  currentPeriod,
  summaryServerUrl,
  shiftPeriod,
  canGoPrevious,
  canGoNext,
  hasExcludedLegs,
  netDirection,
  changeVsPrevious,
  hasContent,
  monthStrip,
  dayGrid,
  barWidthPct,
} from '../summary-view';

describe('shiftPeriod', () => {
  it('steps backwards and forwards a month', () => {
    expect(shiftPeriod('2026-08', -1)).toBe('2026-07');
    expect(shiftPeriod('2026-08', 1)).toBe('2026-09');
  });

  // The year boundary is what a naive month +/- 1 gets wrong.
  it('crosses the year boundary', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2025-12', 1)).toBe('2026-01');
  });

  it('pads single-digit months', () => {
    expect(shiftPeriod('2026-10', -1)).toBe('2026-09');
    expect(shiftPeriod('2026-09', -8)).toBe('2026-01');
  });
});

describe('canGoPrevious', () => {
  // first_period is what stops the screen paging into empty months forever.
  it('is false at the first month with any spend', () => {
    expect(canGoPrevious('2026-03', '2026-03')).toBe(false);
  });

  it('is true above it', () => {
    expect(canGoPrevious('2026-04', '2026-03')).toBe(true);
  });

  it('is false below it', () => {
    expect(canGoPrevious('2026-02', '2026-03')).toBe(false);
  });

  // A user with no expenses at all gets an empty first_period; there is
  // nothing earlier to show.
  it('is false when there is no first period', () => {
    expect(canGoPrevious('2026-04', '')).toBe(false);
  });
});

describe('canGoNext', () => {
  const now = new Date('2026-09-15T12:00:00Z');

  it('is true for a month before the current one', () => {
    expect(canGoNext('2026-08', now)).toBe(true);
  });

  // The endpoint rejects a future period with a 400, so the affordance must
  // not offer one.
  it('is false in the current month', () => {
    expect(canGoNext('2026-09', now)).toBe(false);
  });

  it('is false beyond it', () => {
    expect(canGoNext('2026-10', now)).toBe(false);
  });
});

describe('hasExcludedLegs', () => {
  it('is true when any leg was converted at a substitute rate', () => {
    expect(hasExcludedLegs({ estimated_legs: 1 })).toBe(true);
  });

  it('is false when every leg converted exactly', () => {
    expect(hasExcludedLegs({ estimated_legs: 0 })).toBe(false);
  });
});

describe('netDirection', () => {
  // Only the sign matters, and zero is its own case — colouring "0.00" as
  // either owed or owing is a lie.
  it('reads the sign of the decimal string', () => {
    expect(netDirection('120.00')).toBe('owed');
    expect(netDirection('-120.00')).toBe('owe');
    expect(netDirection('0.00')).toBe('even');
    expect(netDirection('-0.00')).toBe('even');
    expect(netDirection('0')).toBe('even');
  });
});

describe('changeVsPrevious', () => {
  it('reports the percent change in share', () => {
    expect(changeVsPrevious('120.00', '100.00')).toBe(20);
    expect(changeVsPrevious('80.00', '100.00')).toBe(-20);
    expect(changeVsPrevious('100.00', '100.00')).toBe(0);
  });

  it('rounds to a whole percent', () => {
    expect(changeVsPrevious('103.33', '100.00')).toBe(3);
  });

  // A first month has no previous, and dividing by a zero previous month is
  // an infinite increase — neither is a number worth showing.
  it('returns null when there is nothing to compare against', () => {
    expect(changeVsPrevious('120.00', null)).toBeNull();
    expect(changeVsPrevious('120.00', '0.00')).toBeNull();
  });
});

describe('hasContent', () => {
  // An empty month must render an empty state, not a page of zeroes.
  it('is false when the month had no expenses', () => {
    expect(hasContent({ counts: { expenses: 0 } })).toBe(false);
  });

  it('is true as soon as there is one', () => {
    expect(hasContent({ counts: { expenses: 1 } })).toBe(true);
  });
});

describe('currentPeriod', () => {
  it('is the calendar month the date falls in', () => {
    expect(currentPeriod(new Date('2026-09-15T12:00:00Z'))).toBe('2026-09');
  });

  it('zero-pads single-digit months', () => {
    expect(currentPeriod(new Date('2026-03-01T00:00:00Z'))).toBe('2026-03');
  });
});

describe('summaryServerUrl', () => {
  const withFeature = (serverUrl: string, monthly_summary?: boolean) => ({
    serverUrl,
    instance: monthly_summary === undefined ? null : { features: { monthly_summary } },
  });

  it('picks the account whose server advertises the feature', () => {
    expect(
      summaryServerUrl([
        withFeature('https://self.host', false),
        withFeature('https://cloud.example', true),
      ]),
    ).toBe('https://cloud.example');
  });

  // A self-hosted-only user has no summary anywhere, so the entry point must
  // not appear at all rather than opening a screen that 404s.
  it('returns null when no account advertises it', () => {
    expect(summaryServerUrl([withFeature('https://self.host', false)])).toBeNull();
  });

  // Backends predating the feature omit the flag entirely.
  it('treats a missing flag as unsupported', () => {
    expect(summaryServerUrl([withFeature('https://old.example')])).toBeNull();
  });

  it('returns null for no accounts at all', () => {
    expect(summaryServerUrl([])).toBeNull();
  });
});

describe('monthStrip (1c)', () => {
  const today = new Date(Date.UTC(2026, 8, 15)); // September 2026

  it('centres on the selected month with a neighbour each side', () => {
    expect(monthStrip('2026-08', '2026-01', today).map((m) => m.period)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('marks exactly one month selected', () => {
    const strip = monthStrip('2026-08', '2026-01', today);
    expect(strip.filter((m) => m.selected).map((m) => m.period)).toEqual(['2026-08']);
  });

  // The strip replaces the arrows, so it inherits their bounds: never past
  // the current month, never before the first month with any spend.
  it('shifts the window forward at the start of the range', () => {
    expect(monthStrip('2026-01', '2026-01', today).map((m) => m.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('shifts the window back at the current month', () => {
    expect(monthStrip('2026-09', '2026-01', today).map((m) => m.period)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('never runs past the current month', () => {
    for (const m of monthStrip('2026-09', '2026-01', today)) {
      expect(m.period <= '2026-09').toBe(true);
    }
  });

  it('shrinks when the whole history is shorter than the strip', () => {
    expect(monthStrip('2026-09', '2026-08', today).map((m) => m.period)).toEqual([
      '2026-08',
      '2026-09',
    ]);
    expect(monthStrip('2026-09', '2026-09', today).map((m) => m.period)).toEqual(['2026-09']);
  });

  it('falls back to the selected month alone when there is no history', () => {
    expect(monthStrip('2026-09', '', today).map((m) => m.period)).toEqual(['2026-09']);
  });
});

describe('dayGrid (1c)', () => {
  it('pads to the weekday the month starts on, Monday first', () => {
    // 1 August 2026 is a Saturday, so five blanks precede it.
    const g = dayGrid('2026-08', []);
    expect(g.filter((c) => c.day === null)).toHaveLength(5);
    expect(g.filter((c) => c.day !== null)).toHaveLength(31);
  });

  it('uses the real length of the month', () => {
    expect(dayGrid('2026-09', []).filter((c) => c.day !== null)).toHaveLength(30);
    expect(dayGrid('2026-02', []).filter((c) => c.day !== null)).toHaveLength(28);
  });

  it('marks only the active days', () => {
    const active = dayGrid('2026-08', [3, 4, 31]).filter((c) => c.active);
    expect(active.map((c) => c.day)).toEqual([3, 4, 31]);
  });

  it('ignores days outside the month', () => {
    expect(dayGrid('2026-09', [31, 0, 99]).filter((c) => c.active)).toHaveLength(0);
  });
});

describe('barWidthPct (1c)', () => {
  // Bars are scaled against the biggest category, not against 100, so the
  // top row always fills the track and the shape stays readable when every
  // category is small.
  it('gives the largest category a full bar', () => {
    expect(barWidthPct(70, 70)).toBe(100);
  });

  it('scales the rest against it', () => {
    expect(barWidthPct(35, 70)).toBe(50);
    expect(barWidthPct(7, 70)).toBe(10);
  });

  it('never divides by zero', () => {
    expect(barWidthPct(0, 0)).toBe(0);
  });

  it('keeps a hairline for a non-zero category that rounds to nothing', () => {
    expect(barWidthPct(1, 100)).toBeGreaterThan(0);
  });
});
