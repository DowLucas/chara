/**
 * When to ask for an App Store / Play Store rating.
 *
 * The ask is the OS-native sheet (`expo-store-review`), not the deep link in
 * `store-url.ts` — the user rates without leaving Chara and the sheet is
 * already localized by the OS, so this feature adds no strings. The manual
 * "Rate us" row on the You tab stays: the OS caps how often the sheet may
 * appear, so rating deliberately must remain possible.
 *
 * Apple silently ignores `requestReview()` after ~3 prompts per 365 days and
 * gives no callback saying whether anything was shown. The guards below
 * therefore have to be right on their own — they cannot be tuned by observing
 * outcomes. Hence `shouldRequestReview` is pure and exhaustively tested.
 */

import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';
import * as Application from 'expo-application';

import { track } from './analytics';

const KEY = 'chara.reviewPrompt';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Long enough that a brand-new install can't be asked before the app has
 *  had a chance to be useful. */
export const MIN_DAYS_SINCE_INSTALL = 3;
/** Roughly three asks a year at most, matching Apple's own silent cap. */
export const MIN_DAYS_BETWEEN_PROMPTS = 120;
/** Settling up is the deepest thing you can do in Chara — one is enough. */
export const MIN_SETTLEMENTS = 1;
/** …and a heavy logger who has never settled still counts as engaged. */
export const MIN_EXPENSES = 5;

export interface ReviewPromptState {
  /** Epoch ms, stamped the first time this state is read. For an existing
   *  user upgrading into this feature that is the upgrade, not the true
   *  install — they just wait out the grace period once. */
  installedAt: number;
  settlements: number;
  expenses: number;
  lastPromptedAt: number | null;
  lastPromptedVersion: string | null;
}

export function emptyState(now: number): ReviewPromptState {
  return {
    installedAt: now,
    settlements: 0,
    expenses: 0,
    lastPromptedAt: null,
    lastPromptedVersion: null,
  };
}

export interface ReviewPromptContext {
  state: ReviewPromptState;
  now: number;
  /** `Application.nativeApplicationVersion` — null off-device. */
  appVersion: string | null;
  /** `StoreReview.hasAction()`. */
  available: boolean;
}

export function shouldRequestReview({
  state,
  now,
  appVersion,
  available,
}: ReviewPromptContext): boolean {
  if (!available) return false;
  // Without a version "at most once per release" is unenforceable, and the
  // cooldown alone would let a reinstall ask repeatedly. Stay quiet.
  if (!appVersion) return false;

  const engaged =
    state.settlements >= MIN_SETTLEMENTS || state.expenses >= MIN_EXPENSES;
  if (!engaged) return false;

  // A device clock moved backwards must never *unlock* the prompt, so an
  // install date in the future fails the grace period rather than passing it.
  const sinceInstall = now - state.installedAt;
  if (sinceInstall < MIN_DAYS_SINCE_INSTALL * DAY_MS) return false;

  if (state.lastPromptedVersion === appVersion) return false;
  if (
    state.lastPromptedAt !== null &&
    now - state.lastPromptedAt < MIN_DAYS_BETWEEN_PROMPTS * DAY_MS
  ) {
    return false;
  }

  return true;
}

// ---------- persistence ----------

async function save(state: ReviewPromptState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(state));
}

/** Reads the guard state, seeding it (and stamping the install date) on first
 *  call. Any unreadable blob is replaced rather than thrown on — losing the
 *  counters is far better than breaking the settle screen. */
export async function loadReviewPromptState(
  now: number = Date.now(),
): Promise<ReviewPromptState> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
      if (typeof parsed.installedAt === 'number') {
        return {
          installedAt: parsed.installedAt,
          settlements: parsed.settlements ?? 0,
          expenses: parsed.expenses ?? 0,
          lastPromptedAt: parsed.lastPromptedAt ?? null,
          lastPromptedVersion: parsed.lastPromptedVersion ?? null,
        };
      }
    } catch {
      // fall through to re-seed
    }
  }
  const fresh = emptyState(now);
  await save(fresh);
  return fresh;
}

/** Counts an expense towards eligibility. Deliberately never prompts: adding
 *  an expense is a chore, not a win. */
export async function noteExpenseSaved(): Promise<void> {
  try {
    const state = await loadReviewPromptState();
    await save({ ...state, expenses: state.expenses + 1 });
  } catch {
    // Never let rating bookkeeping break saving an expense.
  }
}

/**
 * Counts a completed settlement and, if every guard passes, shows the native
 * rating sheet. Returns whether the sheet was requested — for tests; the
 * caller has nothing useful to do with it, and the OS may show nothing.
 */
export async function maybeRequestReviewAfterSettlement(
  now: number = Date.now(),
): Promise<boolean> {
  try {
    const loaded = await loadReviewPromptState(now);
    const state = { ...loaded, settlements: loaded.settlements + 1 };
    await save(state);

    const appVersion = Application.nativeApplicationVersion;
    const available = await StoreReview.hasAction();
    if (!shouldRequestReview({ state, now, appVersion, available })) return false;

    await StoreReview.requestReview();
    // Recorded only after the request survives — a throwing sheet showed
    // nothing, so it must not burn this release's single ask.
    await save({ ...state, lastPromptedAt: now, lastPromptedVersion: appVersion });
    track('review_prompt_requested', { trigger: 'settlement' });
    return true;
  } catch {
    // A rating sheet must never surface an error on the settled screen.
    return false;
  }
}
