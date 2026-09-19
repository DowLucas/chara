/**
 * First-run onboarding draft: what a new user set up *before* signing up
 * (name, first group or pending invite). Persisted because a magic link can
 * cold-start the app from Mail mid-flow; replayed after sign-up by
 * `onboarding-setup.ts`, then cleared.
 *
 * Storage is SecureStore, which on iOS survives reinstall — so drafts expire
 * after DRAFT_TTL_MS and a stale one is never replayed.
 */
import { clearFlag, getFlag, setFlag } from './storage';

export type OnboardingDraft = {
  createdAt: number;
  name?: string;
  intent?: 'create' | 'join';
  group?: { name: string; currency: string; color: string | null };
  invite?: { serverUrl: string; token: string; groupName: string };
  // Progress written by the post-signup setup runner, so a retry resumes.
  nameDone?: boolean;
  groupId?: string;
};

const KEY = 'onboarding_draft';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function isStale(d: OnboardingDraft, now: number): boolean {
  return now - d.createdAt > DRAFT_TTL_MS;
}

export function isDraftActive(
  d: OnboardingDraft | null,
  now: number,
): d is OnboardingDraft {
  return !!d && !!d.intent && !isStale(d, now);
}

export async function loadDraft(now = Date.now()): Promise<OnboardingDraft | null> {
  const raw = await getFlag(KEY);
  if (!raw) return null;
  let d: OnboardingDraft | null = null;
  try {
    d = JSON.parse(raw);
  } catch {
    d = null;
  }
  if (!d || typeof d.createdAt !== 'number' || isStale(d, now)) {
    await clearFlag(KEY);
    return null;
  }
  return d;
}

export async function saveDraft(d: OnboardingDraft): Promise<void> {
  await setFlag(KEY, JSON.stringify(d));
}

export async function updateDraft(
  patch: Partial<OnboardingDraft>,
  now = Date.now(),
): Promise<OnboardingDraft> {
  const d = { ...((await loadDraft(now)) ?? { createdAt: now }), ...patch };
  await saveDraft(d);
  return d;
}

export async function clearDraft(): Promise<void> {
  await clearFlag(KEY);
}

/** Sign-up route for this draft: the invite's server on the join path. */
export function signUpHref(d: OnboardingDraft, hostedUrl: string): string {
  const server = d.intent === 'join' ? d.invite?.serverUrl : undefined;
  if (!server || server === hostedUrl) return '/(auth)/sign-in';
  return `/(auth)/sign-in?server=${encodeURIComponent(server)}`;
}

/** Where the name step continues: an invite was already chosen → sign up. */
export function nextAfterName(d: OnboardingDraft, hostedUrl: string): string {
  return d.intent === 'join' && d.invite ? signUpHref(d, hostedUrl) : '/welcome/choose';
}
