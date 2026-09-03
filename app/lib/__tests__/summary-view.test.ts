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
