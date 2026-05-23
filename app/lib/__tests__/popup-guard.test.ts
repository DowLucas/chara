import {
  markPopupClosed,
  isPopupJustClosed,
  __resetPopupGuardForTests,
  __GUARD_MS,
} from '../popup-guard';

describe('popup-guard', () => {
  beforeEach(() => {
    __resetPopupGuardForTests();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-23T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns false when no popup has been closed yet', () => {
    expect(isPopupJustClosed()).toBe(false);
  });

  it('returns true immediately after markPopupClosed', () => {
    markPopupClosed();
    expect(isPopupJustClosed()).toBe(true);
  });

  it('still returns true just before the guard window expires', () => {
    markPopupClosed();
    jest.advanceTimersByTime(__GUARD_MS - 1);
    expect(isPopupJustClosed()).toBe(true);
  });

  it('returns false after the guard window expires', () => {
    markPopupClosed();
    jest.advanceTimersByTime(__GUARD_MS + 1);
    expect(isPopupJustClosed()).toBe(false);
  });

  it('a second close resets the clock', () => {
    markPopupClosed();
    jest.advanceTimersByTime(__GUARD_MS - 10);
    // Still within first window.
    expect(isPopupJustClosed()).toBe(true);
    // Close again; clock restarts.
    markPopupClosed();
    jest.advanceTimersByTime(__GUARD_MS - 1);
    expect(isPopupJustClosed()).toBe(true);
    jest.advanceTimersByTime(2);
    expect(isPopupJustClosed()).toBe(false);
  });
});
