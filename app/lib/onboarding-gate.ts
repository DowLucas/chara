/**
 * Where a signed-out launch goes: the first-run welcome flow on a device that
 * has never finished onboarding, plain sign-in otherwise (e.g. after sign-out).
 * `null` = the persisted flag hasn't been read yet.
 */
export function decideSignedOutEntry(
  onboardingComplete: boolean | null,
): 'pending' | 'welcome' | 'sign-in' {
  if (onboardingComplete === null) return 'pending';
  return onboardingComplete ? 'sign-in' : 'welcome';
}

/**
 * Whether a signed-in user must still complete the name step before entering
 * the app. Name is the only required profile field — phone is optional (it
 * only powers Swish/Vipps settle deep-links; Apple 5.1.1(v): don't gate on
 * info the core app doesn't need). Kept consistent with `onboarding/name.tsx`
 * (`canSubmit`) and `onboarding/_layout.tsx` (`missingName`).
 */
export function needsNameStep(user: {
  name?: string | null;
  // Accepted but intentionally ignored — phone never gates entry.
  phone?: string | null;
}): boolean {
  return !user.name?.trim();
}
