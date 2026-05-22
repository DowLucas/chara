/**
 * One-shot, idempotent, crash-safe migration of the legacy single-account
 * `auth_token` SecureStore key into the multi-account `chara.accounts` blob.
 *
 * See `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md`
 * §5 (accounts blob shape) and §11 (migration).
 *
 * The helper is pure-abstract over a `MigrationStorage` interface so the
 * real SecureStore (native) and `localStorage` (web) adapters can be
 * plugged in by the future `AccountsProvider` work, and so the crash-safety
 * contract can be exercised in tests.
 */

export const LEGACY_TOKEN_KEY = 'auth_token';
export const ACCOUNTS_KEY = 'chara.accounts';

export type MigrationResult =
  | { kind: 'no_legacy_token' }
  | { kind: 'already_migrated' }
  | { kind: 'migrated'; serverUrl: string };

export interface MigrationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface MigrationDeps {
  storage: MigrationStorage;
  /**
   * Resolves the URL the legacy app was talking to. Production: the
   * `HOSTED_SERVER_URL` constant. Dev: the existing `resolveBaseUrl()`
   * logic. Caller injects so this helper stays pure-testable.
   */
  legacyHostedUrl(): string;
  /** ISO timestamp for the new account record; tests inject a fixed value. */
  nowIso(): string;
}

interface PlaceholderUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

interface MigratedAccount {
  serverUrl: string;
  token: string;
  user: PlaceholderUser;
  instance: null;
  addedAt: string;
  lastUsedAt: string;
}

interface AccountsBlobV1 {
  version: 1;
  accounts: MigratedAccount[];
  defaultServerUrl: string;
  lastUsedCreateServerUrl: string;
}

function placeholderUser(): PlaceholderUser {
  return { id: '', email: '', name: '', phone: '', avatar_url: null };
}

/**
 * Idempotent. Safe to call on every app boot.
 *
 * Order matters — this is the crash-safety contract:
 *  1. If `ACCOUNTS_KEY` exists, do not touch the blob. If a stray
 *     `LEGACY_TOKEN_KEY` is still present (partial prior run), delete it.
 *  2. Otherwise, read `LEGACY_TOKEN_KEY`. Absent → nothing to migrate.
 *  3. Build a one-entry blob with a placeholder `user` and `instance: null`
 *     and write it atomically.
 *  4. ONLY AFTER the blob write resolves, delete the legacy key. If the
 *     delete fails, the next boot's step 1 cleans it up.
 */
export async function migrateLegacyAuth(deps: MigrationDeps): Promise<MigrationResult> {
  const { storage } = deps;

  // Step 1: idempotency gate.
  const existingBlob = await storage.getItem(ACCOUNTS_KEY);
  if (existingBlob !== null) {
    const strayLegacy = await storage.getItem(LEGACY_TOKEN_KEY);
    if (strayLegacy !== null) {
      await storage.deleteItem(LEGACY_TOKEN_KEY);
    }
    return { kind: 'already_migrated' };
  }

  // Step 2: read legacy token.
  const legacyToken = await storage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken === null) {
    return { kind: 'no_legacy_token' };
  }

  // Step 3: build and atomically write the one-entry blob.
  const serverUrl = deps.legacyHostedUrl();
  const now = deps.nowIso();
  const blob: AccountsBlobV1 = {
    version: 1,
    accounts: [
      {
        serverUrl,
        token: legacyToken,
        user: placeholderUser(),
        instance: null,
        addedAt: now,
        lastUsedAt: now,
      },
    ],
    defaultServerUrl: serverUrl,
    lastUsedCreateServerUrl: serverUrl,
  };

  await storage.setItem(ACCOUNTS_KEY, JSON.stringify(blob));

  // Step 4: only now delete the legacy key. If this fails (or the process
  // dies between step 3 and step 4), step 1 on the next boot cleans up.
  await storage.deleteItem(LEGACY_TOKEN_KEY);

  return { kind: 'migrated', serverUrl };
}
