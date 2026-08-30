const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

const storeReview = { hasAction: jest.fn(async () => true), requestReview: jest.fn(async () => {}) };
jest.mock('expo-store-review', () => storeReview);

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.0' }));

const track = jest.fn();
jest.mock('../analytics', () => ({ track: (...a: unknown[]) => track(...a) }));

import {
  MIN_DAYS_BETWEEN_PROMPTS,
  MIN_DAYS_SINCE_INSTALL,
  MIN_EXPENSES,
  emptyState,
  loadReviewPromptState,
  maybeRequestReviewAfterSettlement,
  noteExpenseSaved,
  shouldRequestReview,
  type ReviewPromptState,
} from '../review-prompt';

const KEY = 'chara.reviewPrompt';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 30);

/** A user who qualifies on every axis, so each test can break exactly one. */
function eligible(overrides: Partial<ReviewPromptState> = {}): ReviewPromptState {
  return {
    installedAt: NOW - 30 * DAY,
    settlements: 1,
    expenses: 0,
    lastPromptedAt: null,
    lastPromptedVersion: null,
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  track.mockClear();
  storeReview.hasAction.mockClear().mockResolvedValue(true);
  storeReview.requestReview.mockClear().mockResolvedValue(undefined);
});

describe('shouldRequestReview', () => {
  it('asks a settled-up user who is past the install grace period', () => {
    expect(
      shouldRequestReview({ state: eligible(), now: NOW, appVersion: '1.4.0', available: true }),
    ).toBe(true);
  });

  it('never asks when the OS has no rating action available', () => {
    expect(
      shouldRequestReview({ state: eligible(), now: NOW, appVersion: '1.4.0', available: false }),
    ).toBe(false);
  });

  it('never asks a user who has neither settled nor added much', () => {
    expect(
      shouldRequestReview({
        state: eligible({ settlements: 0 }),
        now: NOW,
        appVersion: '1.4.0',
        available: true,
      }),
    ).toBe(false);
  });

  it('asks a heavy expense-adder who has never settled', () => {
    const state = eligible({ settlements: 0, expenses: MIN_EXPENSES });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(true);
  });

  it('does not count a not-quite-heavy expense-adder who has never settled', () => {
    const state = eligible({ settlements: 0, expenses: MIN_EXPENSES - 1 });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(false);
  });

  it('never asks inside the install grace period', () => {
    const state = eligible({ installedAt: NOW - (MIN_DAYS_SINCE_INSTALL - 1) * DAY });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(false);
  });

  it('asks once the install grace period has elapsed', () => {
    const state = eligible({ installedAt: NOW - MIN_DAYS_SINCE_INSTALL * DAY });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(true);
  });

  it('never asks twice on the same release', () => {
    const state = eligible({ lastPromptedAt: NOW - 400 * DAY, lastPromptedVersion: '1.4.0' });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(false);
  });

  it('never asks again within the cooldown, even on a new release', () => {
    const state = eligible({
      lastPromptedAt: NOW - (MIN_DAYS_BETWEEN_PROMPTS - 1) * DAY,
      lastPromptedVersion: '1.3.1',
    });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(false);
  });

  it('asks again on a new release once the cooldown has passed', () => {
    const state = eligible({
      lastPromptedAt: NOW - MIN_DAYS_BETWEEN_PROMPTS * DAY,
      lastPromptedVersion: '1.3.1',
    });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(true);
  });

  it('never asks when the running version is unknown, so "once per release" stays enforceable', () => {
    expect(
      shouldRequestReview({ state: eligible(), now: NOW, appVersion: null, available: true }),
    ).toBe(false);
  });

  it('never asks when the clock has moved backwards since install', () => {
    const state = eligible({ installedAt: NOW + 5 * DAY });

    expect(shouldRequestReview({ state, now: NOW, appVersion: '1.4.0', available: true })).toBe(false);
  });
});

describe('loadReviewPromptState', () => {
  it('stamps the install date on first read so the grace period starts now', async () => {
    const state = await loadReviewPromptState(NOW);

    expect(state).toEqual(emptyState(NOW));
    expect(JSON.parse(store.get(KEY)!).installedAt).toBe(NOW);
  });

  it('keeps the original install date on later reads', async () => {
    await loadReviewPromptState(NOW - 10 * DAY);

    expect((await loadReviewPromptState(NOW)).installedAt).toBe(NOW - 10 * DAY);
  });

  it('re-seeds rather than throwing when the stored blob is corrupt', async () => {
    store.set(KEY, 'not json');

    expect(await loadReviewPromptState(NOW)).toEqual(emptyState(NOW));
  });

  it('reads a blob written before the expense counter existed', async () => {
    store.set(KEY, JSON.stringify({ installedAt: NOW - 10 * DAY, settlements: 2 }));

    expect(await loadReviewPromptState(NOW)).toEqual({
      installedAt: NOW - 10 * DAY,
      settlements: 2,
      expenses: 0,
      lastPromptedAt: null,
      lastPromptedVersion: null,
    });
  });
});

describe('noteExpenseSaved', () => {
  it('counts the expense and never shows the sheet', async () => {
    store.set(KEY, JSON.stringify(emptyState(NOW - 30 * DAY)));

    await noteExpenseSaved();
    await noteExpenseSaved();

    expect(JSON.parse(store.get(KEY)!).expenses).toBe(2);
    expect(storeReview.requestReview).not.toHaveBeenCalled();
  });
});

describe('maybeRequestReviewAfterSettlement', () => {
  it('counts the settlement but stays silent during the install grace period', async () => {
    await loadReviewPromptState(NOW);

    expect(await maybeRequestReviewAfterSettlement(NOW)).toBe(false);
    expect(storeReview.requestReview).not.toHaveBeenCalled();
    expect(JSON.parse(store.get(KEY)!).settlements).toBe(1);
  });

  it('requests the sheet on the first settlement after the grace period', async () => {
    store.set(KEY, JSON.stringify(emptyState(NOW - 30 * DAY)));

    expect(await maybeRequestReviewAfterSettlement(NOW)).toBe(true);
    expect(storeReview.requestReview).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('review_prompt_requested', { trigger: 'settlement' });
  });

  it('does not ask a second time on the same release', async () => {
    store.set(KEY, JSON.stringify(emptyState(NOW - 30 * DAY)));
    await maybeRequestReviewAfterSettlement(NOW);

    expect(await maybeRequestReviewAfterSettlement(NOW + DAY)).toBe(false);
    expect(storeReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('persists the prompt across a cold launch', async () => {
    store.set(KEY, JSON.stringify(emptyState(NOW - 30 * DAY)));
    await maybeRequestReviewAfterSettlement(NOW);

    const reloaded = await loadReviewPromptState(NOW + DAY);
    expect(reloaded.lastPromptedAt).toBe(NOW);
    expect(reloaded.lastPromptedVersion).toBe('1.4.0');
  });

  it('swallows a failing rating sheet — settling must never surface a review error', async () => {
    store.set(KEY, JSON.stringify(emptyState(NOW - 30 * DAY)));
    storeReview.requestReview.mockRejectedValue(new Error('no store'));

    expect(await maybeRequestReviewAfterSettlement(NOW)).toBe(false);
  });
});
