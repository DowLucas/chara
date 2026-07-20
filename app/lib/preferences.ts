import * as SecureStore from 'expo-secure-store';

const KEY_LANGUAGE = 'chara.language';
const KEY_SWISH_PHONE_PROMPT_DISMISSED = 'chara.swishPhonePromptDismissed';
const KEY_LAST_ACTIVE_GROUP = 'chara.lastActiveGroup';

/** Returns the user's explicitly-picked language code, or null if they're
 *  on auto-detect (the default — i18n.ts falls back to the device locale). */
export async function getPreferredLanguage(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_LANGUAGE);
}

export async function setPreferredLanguage(code: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_LANGUAGE, code);
}

export async function clearPreferredLanguage(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_LANGUAGE);
}

/** True once the user has dismissed the one-time "add your Swish number"
 *  nudge shown on the settle screen (so we don't ask again). */
export async function getSwishPhonePromptDismissed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_SWISH_PHONE_PROMPT_DISMISSED)) === '1';
}

export async function setSwishPhonePromptDismissed(): Promise<void> {
  await SecureStore.setItemAsync(KEY_SWISH_PHONE_PROMPT_DISMISSED, '1');
}

/** The group the homescreen widget's "add expense" shortcut targets.
 *  `Group` carries no last-activity timestamp, so recency is tracked here,
 *  client-side, as the user opens groups. */
export interface LastActiveGroupRef {
  serverUrl: string;
  groupId: string;
  name: string;
}

export async function getLastActiveGroup(): Promise<LastActiveGroupRef | null> {
  const raw = await SecureStore.getItemAsync(KEY_LAST_ACTIVE_GROUP);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastActiveGroupRef>;
    if (!parsed.serverUrl || !parsed.groupId) return null;
    return { serverUrl: parsed.serverUrl, groupId: parsed.groupId, name: parsed.name ?? '' };
  } catch {
    return null;
  }
}

export async function setLastActiveGroup(ref: LastActiveGroupRef): Promise<void> {
  await SecureStore.setItemAsync(KEY_LAST_ACTIVE_GROUP, JSON.stringify(ref));
}
