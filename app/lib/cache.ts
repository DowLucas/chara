/**
 * `(serverUrl, userId, endpoint)`-keyed cache backed by AsyncStorage for
 * cold-start-critical aggregated reads (groups list, balances).
 *
 * Stale-while-revalidate by design: this module only stores the last
 * known-good response; callers decide what to do with stale data. There
 * is no TTL.
 *
 * Eviction: `evictServer(serverUrl)` is invoked by `removeAccount()` in
 * the future `AccountsProvider` (spec §12). It removes every entry whose
 * key matches that `serverUrl`, regardless of `userId` or `endpoint`.
 * Without this, removing an account would leak cached data to disk
 * indefinitely, and re-adding the same server as a different user could
 * in principle race with the new fetch and serve stale entries from the
 * previous user before the new fetch lands.
 *
 * Security (spec §17): AsyncStorage on iOS is an unencrypted plist in the
 * app sandbox and on Android is an unencrypted SharedPreferences file.
 * The cached data is non-sensitive UI aggregates — group names, balances,
 * timestamps — chosen for cold-start render speed. **Tokens stay in
 * SecureStore.** Do not extend this cache to hold PII beyond display
 * name or payment instrument details.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'chara.cache.v1';
const SEP = '::';

export interface CacheEntry<T> {
  value: T;
  /** ISO 8601 timestamp of when this entry was written. */
  storedAt: string;
}

export interface CacheKey {
  serverUrl: string;
  userId: string;
  endpoint: string;
}

/**
 * Builds the AsyncStorage key for a cache entry. Deterministic.
 *
 * `serverUrl` and `userId` are URL-encoded so that arbitrary characters
 * (colons, slashes, the `SEP` itself) round-trip safely and so that two
 * distinct serverUrls cannot accidentally share a key prefix. `endpoint`
 * is a small fixed set of identifiers chosen by the caller and is kept
 * unencoded for readability when debugging stored keys.
 */
export function cacheKey(k: CacheKey): string {
  return `${PREFIX}${SEP}${encodeURIComponent(k.serverUrl)}${SEP}${encodeURIComponent(
    k.userId,
  )}${SEP}${k.endpoint}`;
}

/**
 * Inverse of `cacheKey`. Returns `null` for anything that isn't a
 * `v1`-formatted key. Used by `evictServer` to filter the full
 * AsyncStorage keyset.
 */
export function parseCacheKey(s: string): CacheKey | null {
  if (!s.startsWith(`${PREFIX}${SEP}`)) return null;
  const rest = s.slice(PREFIX.length + SEP.length);
  const parts = rest.split(SEP);
  if (parts.length !== 3) return null;
  const [encServer, encUser, endpoint] = parts;
  try {
    return {
      serverUrl: decodeURIComponent(encServer),
      userId: decodeURIComponent(encUser),
      endpoint,
    };
  } catch {
    return null;
  }
}

export async function readCache<T>(k: CacheKey): Promise<CacheEntry<T> | null> {
  const key = cacheKey(k);
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    // Corrupt entry — self-heal so subsequent reads don't keep failing.
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function writeCache<T>(k: CacheKey, value: T): Promise<void> {
  const entry: CacheEntry<T> = {
    value,
    storedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(cacheKey(k), JSON.stringify(entry));
}

export async function deleteCache(k: CacheKey): Promise<void> {
  await AsyncStorage.removeItem(cacheKey(k));
}

/**
 * Removes every cache entry whose key matches `serverUrl`, across all
 * `userId`s and all `endpoint`s. Safe to call when nothing matches.
 *
 * Implementation note: we scan `getAllKeys()` and decode each key via
 * `parseCacheKey` rather than doing a string `startsWith` on the encoded
 * prefix — that avoids over-deleting when one serverUrl is a literal
 * prefix of another (e.g. `https://api.chara.app` vs
 * `https://api.chara.app.evil.example`).
 */
export async function evictServer(serverUrl: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const toRemove: string[] = [];
  for (const key of allKeys) {
    const parsed = parseCacheKey(key);
    if (parsed && parsed.serverUrl === serverUrl) {
      toRemove.push(key);
    }
  }
  if (toRemove.length === 0) return;
  await AsyncStorage.multiRemove(toRemove);
}
