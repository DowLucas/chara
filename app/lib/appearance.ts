/** The user's Appearance choice (You → Settings → Appearance). */
export type AppearancePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

export const APPEARANCE_PREFERENCES: readonly AppearancePreference[] = ['system', 'light', 'dark'];

/** Which palette to show. System follows the phone; an unknown phone
 *  setting falls back to light, the app's original look. */
export function resolveScheme(
  preference: AppearancePreference,
  system: string | null | undefined,
): Scheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}
