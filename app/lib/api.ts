import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  APP_PROTOCOL_VERSION,
  PROTOCOL_HEADER,
} from './protocol';
import type { VoiceDraft } from './voice-drafts';
import {
  accountFor,
  defaultAccount,
  markIncompatible,
  markReauthRequired,
  updateAccount,
} from './accounts-store';
import type {
  RecurringExpense,
  CreateRecurringInput,
  UpdateRecurringInput,
} from './api-types-recurring';
import { MAIN_HOSTED_SERVER_URL } from './server-url';
import type { SettlementMethod } from './settlement-method';
import i18n from './i18n';

const TOKEN_KEY = 'auth_token';

function resolveBaseUrl(): string {
  if (!__DEV__) return MAIN_HOSTED_SERVER_URL;

  // Explicit override always wins (e.g. EXPO_PUBLIC_API_URL=http://192.168.0.45:8080).
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  // On web, reuse whatever host served the page (localhost, LAN IP, tunnel, ...).
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }

  // Android emulator: host machine is reachable via 10.0.2.2.
  if (Platform.OS === 'android') {
    // For a real device, set EXPO_PUBLIC_API_URL — there is no general way to detect it.
    return 'http://10.0.2.2:8080';
  }

  // Physical iOS / native dev: try the Expo dev-server host (Metro is on your LAN).
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ??
    (Constants as any)?.expoGoConfig?.hostUri ??
    (Constants.manifest as any)?.hostUri;
  if (typeof hostUri === 'string') {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost') return `http://${host}:8080`;
  }
  return 'http://localhost:8080';
}

export const BASE_URL = resolveBaseUrl();
if (__DEV__ && typeof console !== 'undefined') {
  console.log('[chara] API base URL:', BASE_URL);
}

// Exposed for callers (e.g. Image source headers) that need to make their
// own authenticated requests outside the typed `request` helper.
//
// Resolves to the default account's token from the multi-server accounts
// store. The legacy SecureStore key is only consulted as a fallback for
// the brief boot window before the accounts blob is loaded (and for the
// backward-compat sign-in path that still writes it). Without this, any
// user who signed in via the new add-server flow had a null token here,
// which broke things like the authenticated avatar <Image> source.
export async function authToken(): Promise<string | null> {
  const def = defaultAccount();
  if (def?.token) return def.token;
  return getToken();
}

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  // Scope the legacy auth-token keychain item to this device — no iCloud
  // backup, not restorable to a different device. iOS-only option; ignored
  // on Android and unreachable on web (handled above).
  return SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  /**
   * Parsed JSON payload when the server returned `Content-Type: application/json`.
   * Server-emitted structured errors put their machine-readable details here
   * (e.g. the OCR cap response: `{code, remaining, period_resets_at, waitlist_prompt}`).
   * Falls back to `null` when the body isn't JSON or didn't parse.
   */
  public readonly body: unknown;

  constructor(public status: number, message: string, body?: unknown) {
    super(message);
    this.body = body ?? null;
  }
}

/**
 * Human-readable message for a failed response. The backend wraps errors in
 * the envelope `{"error": msg, "code"?: ...}` (handler writeError/
 * writeErrorCode), so surface `error` — most screens show `err.message`
 * straight in an alert, and a raw JSON blob is not an acceptable popup.
 * Structured fields remain available on `ApiError.body`. A non-JSON,
 * human-sized body (e.g. a plain-text proxy 502) passes through; anything
 * else collapses to a friendly generic.
 */
export function apiErrorMessage(parsed: unknown, rawText: string): string {
  if (parsed && typeof parsed === 'object') {
    const err = (parsed as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }
  const trimmed = rawText.trim();
  if (trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.length <= 300) {
    return trimmed;
  }
  return i18n.t('common.requestFailed');
}

export class NoAccountError extends Error {
  constructor(public serverUrl: string) {
    super(`No account configured for server ${serverUrl}`);
  }
}

/**
 * Thrown by `apiFor(serverUrl).deleteMe()` when the backend refuses to
 * permanently delete the account because the user still has outstanding
 * balances (HTTP 409 `{error: "balance_not_zero", balances: [...]}`).
 *
 * Apple Guideline 5.1.1(v) requires in-app self-deletion; the per-currency
 * balance list lets the UI tell the user exactly what to settle before
 * retrying.
 */
export class AccountDeleteBlockedError extends Error {
  public balances: Array<{ currency: string; amount_minor: number }>;
  constructor(balances: Array<{ currency: string; amount_minor: number }>) {
    super('balance_not_zero');
    this.name = 'AccountDeleteBlockedError';
    this.balances = balances;
  }
}

/**
 * Outcome of a single account's delete attempt during a bulk
 * "delete from all servers" run.
 */
export type AccountDeleteOutcome =
  | { serverUrl: string; status: 'deleted' }
  | {
      serverUrl: string;
      status: 'blocked';
      balances: Array<{ currency: string; amount_minor: number }>;
    }
  | { serverUrl: string; status: 'failed'; error: string };

/**
 * Aggregate the results of `Promise.allSettled(serverUrls.map(deleteOne))`
 * into one outcome per server. Pure function so it can be unit-tested
 * without spinning up the network layer.
 *
 *   - fulfilled → `deleted`
 *   - rejected with `AccountDeleteBlockedError` → `blocked` + balances
 *   - any other rejection → `failed` + message
 */
export function aggregateBulkDeleteResults(
  serverUrls: string[],
  settled: PromiseSettledResult<unknown>[],
): AccountDeleteOutcome[] {
  return serverUrls.map((serverUrl, i) => {
    const r = settled[i];
    if (!r) {
      return { serverUrl, status: 'failed', error: 'missing_result' };
    }
    if (r.status === 'fulfilled') {
      return { serverUrl, status: 'deleted' };
    }
    const reason = r.reason;
    if (reason instanceof AccountDeleteBlockedError) {
      return { serverUrl, status: 'blocked', balances: reason.balances };
    }
    const msg = reason instanceof Error ? reason.message : String(reason ?? 'error');
    return { serverUrl, status: 'failed', error: msg };
  });
}

/**
 * Parse a 409 body from `DELETE /api/me` into the structured balance list.
 * Tolerates missing/malformed fields — returns an empty array rather than
 * throwing, so the caller can still surface "Settle up first" without
 * crashing on a partial payload.
 *
 * Exported for tests.
 */
export function parseDeleteBlockedBody(
  body: unknown,
): Array<{ currency: string; amount_minor: number }> {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as { balances?: unknown }).balances;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ currency: string; amount_minor: number }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const c = (entry as { currency?: unknown }).currency;
    const a = (entry as { amount_minor?: unknown }).amount_minor;
    if (typeof c !== 'string') continue;
    const n = typeof a === 'number' ? a : typeof a === 'string' ? Number(a) : NaN;
    if (!Number.isFinite(n)) continue;
    out.push({ currency: c, amount_minor: Math.trunc(n) });
  }
  return out;
}

/**
 * Core per-server request. Used by `apiFor(serverUrl)`, `publicApi(serverUrl)`,
 * and the backward-compat `request()` shim below.
 *
 *   - Injects `X-Chara-App-Protocol` on every call (spec §9).
 *   - Injects `Authorization: Bearer <token>` when an account exists for
 *     `serverUrl` *and* `requireAuth` is true.
 *   - On `401` from an authenticated call, flips the account's status to
 *     `reauth_required` (spec §12).
 *   - On `426`, flips the account's status to `incompatible` (spec §9).
 *   - Throws `ApiError` on non-2xx, `NoAccountError` if an authenticated
 *     call is made without an account for `serverUrl`.
 */
export async function requestOn<T>(
  serverUrl: string,
  path: string,
  options: RequestInit & { requireAuth?: boolean } = {},
): Promise<T> {
  const { requireAuth = true, ...rest } = options;
  const account = accountFor(serverUrl);

  if (requireAuth && !account) {
    // Fall back to the legacy SecureStore token *only* if `serverUrl` matches
    // BASE_URL — this covers the brief window between sign-in completion and
    // the accounts blob being written by useAuth().signIn() during the
    // backward-compat path. Removed in Wave 2D.
    if (serverUrl === BASE_URL) {
      const legacyToken = await getToken();
      if (legacyToken) {
        return requestWithToken<T>(serverUrl, path, rest, legacyToken);
      }
    }
    throw new NoAccountError(serverUrl);
  }

  const token = account?.token ?? null;
  return requestWithToken<T>(serverUrl, path, rest, token);
}

// Single-flight refresh per server: concurrent 401s on the same account all
// await one /api/auth/refresh call rather than each firing its own (which would
// rotate the token N times and trip the server's reuse-detection). Resolves to
// the new access token, or null if refresh isn't possible / failed.
const refreshInFlight = new Map<string, Promise<string | null>>();

async function attemptRefresh(serverUrl: string): Promise<string | null> {
  const existing = refreshInFlight.get(serverUrl);
  if (existing) return existing;

  const p = (async (): Promise<string | null> => {
    const refreshToken = accountFor(serverUrl)?.refreshToken;
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [PROTOCOL_HEADER]: String(APP_PROTOCOL_VERSION),
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as TokenResponse;
      if (!data?.token) return null;
      // Persist the rotated pair so the next request (and cold launches) use it.
      await updateAccount(serverUrl, {
        token: data.token,
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      });
      return data.token;
    } catch {
      return null;
    }
  })();

  refreshInFlight.set(serverUrl, p);
  try {
    return await p;
  } finally {
    refreshInFlight.delete(serverUrl);
  }
}

async function requestWithToken<T>(
  serverUrl: string,
  path: string,
  options: RequestInit,
  token: string | null,
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [PROTOCOL_HEADER]: String(APP_PROTOCOL_VERSION),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${serverUrl}${path}`, { ...options, headers });

  // Mark account status based on response codes (spec §9, §12).
  if (res.status === 401 && accountFor(serverUrl)) {
    // Access token likely expired — try a one-shot silent refresh and replay
    // the request before giving up. Only mark the account reauth_required if
    // the refresh itself fails (no/expired/revoked refresh token).
    if (!isRetry) {
      const newToken = await attemptRefresh(serverUrl);
      if (newToken) {
        return requestWithToken<T>(serverUrl, path, options, newToken, true);
      }
    }
    void markReauthRequired(serverUrl);
  } else if (res.status === 426 && accountFor(serverUrl)) {
    void markIncompatible(serverUrl);
  }

  if (!res.ok) {
    const text = await res.text();
    // Try to expose a parsed body so callers can read structured error
    // payloads (e.g. the OCR cap's {code, remaining, period_resets_at,
    // waitlist_prompt}). Non-JSON or empty bodies fall through to null.
    let parsed: unknown = null;
    const contentType = res.headers.get('Content-Type') ?? '';
    if (text && contentType.includes('application/json')) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Server claimed JSON but sent garbage; fall back to raw text in message.
      }
    }
    throw new ApiError(res.status, apiErrorMessage(parsed, text), parsed);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Backward-compat shim. Existing flat exports (listGroups, createGroup, …)
 * go through this. It resolves the target server from the default account,
 * falling back to BASE_URL during the brief boot window before the
 * accounts blob is loaded.
 *
 * New code must NOT use this — call `apiFor(serverUrl).X()` instead.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const def = defaultAccount();
  const serverUrl = def?.serverUrl ?? BASE_URL;
  return requestOn<T>(serverUrl, path, options);
}

// Auth
export interface MagicLinkRequest { email: string }
export interface MagicLinkResponse {
  ok: boolean;
  token?: string; // only set in dev mode — lets the app skip the email round-trip
  link?: string;
}
export interface TokenResponse { token: string; refresh_token?: string; user: User }

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  /** Server-hosted avatar object URL (relative, e.g. /api/users/<id>/avatar).
   *  Prefer this over `avatar_url` (the latter is the OAuth provider's URL). */
  avatar_object_url?: string | null;
  /** ISO-8601 timestamp the user's avatar was last updated. Used to bust the
   *  RN image cache after a fresh upload. */
  avatar_updated_at?: string | null;
  /** True when the user has turned the monthly summary push off. Absent on
   *  backends predating the feature. */
  monthly_summary_opt_out?: boolean;
}

export function requestMagicLink(email: string) {
  return request<MagicLinkResponse>('/api/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyMagicLink(token: string) {
  return request<TokenResponse>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function getMe() {
  return request<User>('/api/me');
}

export function updateMe(input: { name?: string; phone?: string }) {
  return request<User>('/api/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// Groups
export interface Group {
  id: string;
  name: string;
  currency: string;
  /** ISO 639-1 code used to localise AI-generated content (e.g. receipt
   *  scan titles) for the whole group. Defaults to "en" on the server. */
  language: string;
  invite_token: string;
  created_at: string;
  /** Group lock state. True ⇒ no new expenses, settlements, edits, or
   *  invite regen are accepted by the server (returns 409 group_locked).
   *  Lifecycle (archive/unarchive/delete) and membership (leave/kick)
   *  bypass the lock. Added in spec
   *  `docs/superpowers/specs/2026-05-23-group-settings-design.md`. */
  is_locked: boolean;
  /** Archived groups are hidden from the home list but otherwise intact.
   *  Unarchive reverses this. Independent from `is_locked`. */
  is_archived: boolean;
  /** True ⇒ the group has at least one active expense, so the backend
   *  will refuse any attempt to change the group currency (409
   *  group_currency_locked). Frontend uses this to disable the chips
   *  proactively. Optional for backward compat with old servers. */
  currency_locked?: boolean;
  /** Enabled expense-category ids, in display order — always resolved
   *  server-side (falls back to the full default catalog when the group
   *  has no explicit configuration). Optional for backward compat with old
   *  servers, which callers should treat the same as "full default catalog"
   *  (see DEFAULT_CATEGORY_SLUGS_FALLBACK in lib/categories.ts). */
  category_slugs?: string[];
}

/** Per-currency total for the group's stats card. */
export interface GroupCurrencyTotal {
  currency: string;
  minor_units: number;
}

/** Top-paid member for the group's stats card. The currency field is the
 *  group's base currency — the backend pre-converts each expense via
 *  the FX snapshot before summing. */
export interface GroupTopSpender {
  member_id: string;
  user_id: string;
  display_name: string;
  minor_units_paid: number;
  currency: string;
}

/** Group statistics — returned by GET /api/groups/{id}/stats. Live query,
 *  uncached. Filters `NOT is_deleted AND NOT is_reimbursement` (mirrors
 *  the balance view). */
export interface GroupStats {
  member_count: number;
  expense_count: number;
  totals_by_currency: GroupCurrencyTotal[];
  top_spender: GroupTopSpender | null;
  created_at: string;
  first_expense_at: string | null;
  last_expense_at: string | null;
}

/** Structured reason rows returned by GET /api/groups/{id}/members/{mid}/can-leave
 *  and the body of 409 refusals from DELETE /members/{mid}. */
export type LeaveBlockedReason =
  | {
      code: 'member_has_open_balance';
      rows: { currency: string; minor_units: number }[];
    }
  | { code: 'owner_cannot_leave' };

export interface CanLeaveResponse {
  ok: boolean;
  reasons: LeaveBlockedReason[];
}

export interface GroupMember {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  role?: string;
  is_ghost?: boolean;
  joined_at?: string;
  /** Server-hosted avatar object URL for this member's user (relative). */
  avatar_object_url?: string | null;
  /** Linked user's phone number (E.164 or national format). Used by the
   * settle screen to build Swish deep-links. Absent for ghost members
   * and users with no phone on file. */
  phone?: string | null;
}

export function listGroups() {
  return request<Group[]>('/api/groups');
}

export function getGroup(id: string) {
  return request<GroupDetail>(`/api/groups/${id}`);
}

export function createGroup(name: string, currency: string, language?: string) {
  return request<Group>('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name, currency, ...(language ? { language } : {}) }),
  });
}

export interface UpdateGroupInput {
  name?: string;
  currency?: string;
  language?: string;
  /** Non-empty subset of EXPENSE_CATEGORIES to enable for the group, in
   *  display order. Omit to leave unchanged. */
  category_slugs?: string[];
}

export function updateGroup(id: string, input: UpdateGroupInput) {
  return request<Group>(`/api/groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function archiveGroup(id: string) {
  return request<void>(`/api/groups/${id}`, { method: 'DELETE' });
}

// Group settings — backward-compat shims. New code should use
// apiFor(serverUrl) directly; these exist so the flat surface is complete.

export function getGroupStats(groupId: string) {
  return request<GroupStats>(`/api/groups/${groupId}/stats`);
}

export function lockGroup(groupId: string) {
  return request<Group>(`/api/groups/${groupId}/lock`, { method: 'POST' });
}

export function unlockGroup(groupId: string) {
  return request<Group>(`/api/groups/${groupId}/unlock`, { method: 'POST' });
}

export function unarchiveGroup(groupId: string) {
  return request<Group>(`/api/groups/${groupId}/unarchive`, { method: 'POST' });
}

export function permanentDeleteGroup(groupId: string, nameConfirmation: string) {
  return request<void>(`/api/groups/${groupId}/permanent`, {
    method: 'DELETE',
    body: JSON.stringify({ name_confirmation: nameConfirmation }),
  });
}

export function removeMember(groupId: string, memberId: string) {
  return request<void>(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
}

export function getMemberCanLeave(groupId: string, memberId: string) {
  return request<CanLeaveResponse>(`/api/groups/${groupId}/members/${memberId}/can-leave`);
}

export function listGroupMembers(groupId: string) {
  return request<GroupMember[]>(`/api/groups/${groupId}/members`);
}

export interface GroupDetail extends Group {
  invite_token: string;
  members: GroupMember[];
}

export function joinGroupByToken(token: string) {
  return request<GroupDetail>(`/api/groups/join/${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}

/** Extract an invite token from a scanned string. Accepts the raw token, a
 *  `chara://join/<token>` deep link, or any URL whose path ends with /join/<token>. */
export function parseInviteToken(scanned: string): string | null {
  const s = scanned.trim();
  if (!s) return null;
  const m = s.match(/(?:^|\/)join\/([A-Za-z0-9_-]+)\/?$/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

// Expenses
export interface Expense {
  id: string;
  group_id: string;
  title: string;
  amount: string;
  currency: string;
  paid_by_id: string;
  split_method: string;
  category: string;
  notes?: string;
  expense_date?: string;
  is_reimbursement: boolean;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  splits?: ExpenseSplit[];
  /** Set when the user paid in a currency other than the group's. Decimal
   *  string in the original currency's minor-unit format. */
  original_amount?: string;
  original_currency?: string;
  /** "1 original_currency = fx_rate currency", decimal string. */
  fx_rate?: string;
  /** ISO date the FX rate was sourced for. */
  fx_as_of?: string;
  /** Where the rate came from: backend ECB lookup, or a user-entered
   *  override. Present iff fx_rate is present. */
  fx_source?: 'ecb' | 'manual';
}

export interface ExpenseSplit {
  id: string;
  member_id: string;
  share: string;
}

export interface Split {
  user_id: string;
  amount: string;
}

export interface CreateExpenseInput {
  title: string;
  amount: string;
  currency: string;
  paid_by_id: string;
  split_method: 'equal' | 'exact' | 'percentage';
  category?: string;
  expense_date: string;
  participants?: string[];
  splits?: Array<{ member_id: string; share?: string; basis_points?: number }>;
  /** Optional all-or-none FX snapshot. When provided, `amount`/`currency`
   *  must already be in the group's canonical currency; the backend stores
   *  the snapshot verbatim and skips its own ECB conversion. */
  original_amount?: string;
  original_currency?: string;
  fx_rate?: string;
  fx_as_of?: string;
  fx_source?: 'ecb' | 'manual';
  /** Links this expense to the AI generation that proposed it. Optional and
   *  best-effort — the server ignores an unknown id rather than failing. */
  generation_id?: string;
  /** Draft fields the user changed before saving, for acceptance metrics. */
  changed_fields?: string[];
}

// PATCH /api/groups/{groupID}/expenses/{expenseID}.
// All fields optional — the server applies a partial update.
export interface UpdateExpenseInput {
  title?: string;
  amount?: string;
  currency?: string;
  paid_by_id?: string;
  split_method?: 'equal' | 'exact' | 'percentage';
  category?: string;
  notes?: string;
  expense_date?: string;
  participants?: string[];
  splits?: Array<{ member_id: string; share?: string; basis_points?: number }>;
  /** Optional all-or-none FX snapshot. See CreateExpenseInput. */
  original_amount?: string;
  original_currency?: string;
  fx_rate?: string;
  fx_as_of?: string;
  fx_source?: 'ecb' | 'manual';
}

// --- Import from another app (spec 2026-05-28-import-from-another-app-design.md)
/** A single screenshot sent to the extract endpoint. */
export interface ImportImage {
  image_base64: string;
  mime_type: string;
}

/** Balance direction relative to the importing user. */
export type ImportStandingDirection = 'owes_you' | 'you_owe';

/** One extracted net standing for a counterparty (name not yet resolved). */
export interface ImportStanding {
  name: string;
  direction: ImportStandingDirection;
  /** Canonical 2-decimal string, group currency. */
  amount: string;
  /** 0–1 extraction confidence; low rows float to the top of review. */
  confidence: number;
}

export interface ImportExtractResult {
  currency: string;
  standings: ImportStanding[];
}

/** A review-confirmed standing ready to become one opening-balance expense. */
export interface ImportCommitStanding {
  name: string;
  direction: ImportStandingDirection;
  /** Canonical 2-decimal string, group currency. */
  amount: string;
  title?: string;
  /**
   * Existing member this name was matched to on the reconcile screen. When
   * set, the backend attributes the balance to this member instead of
   * matching by name or minting a placeholder. Omitted for "new member".
   */
  memberId?: string | null;
}

export interface ImportCommitInput {
  source: string;
  standings: ImportCommitStanding[];
}

export function listExpenses(groupId: string) {
  return request<Expense[]>(`/api/groups/${groupId}/expenses`);
}

export function getExpense(groupId: string, expenseId: string) {
  return request<Expense>(`/api/groups/${groupId}/expenses/${expenseId}`);
}

export function createExpense(groupId: string, input: CreateExpenseInput) {
  return request<Expense>(`/api/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateExpense(groupId: string, expenseId: string, input: UpdateExpenseInput) {
  return request<Expense>(`/api/groups/${groupId}/expenses/${expenseId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteExpense(groupId: string, expenseId: string) {
  return request<void>(`/api/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
}

// Balances
export interface Balance {
  member_id: string;
  user_id: string;
  currency: string;
  net_balance: string;
}

export interface MyBalance {
  group_id: string;
  group_name: string;
  currency: string;
  net_balance: string;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: string;
  currency: string;
  note?: string;
  method?: string;
  created_by_id?: string;
  created_at: string;
  /** Set when the settlement has been soft-reverted. Reverted rows are
   *  excluded from balance math but kept in the audit list. */
  reverted_at?: string;
  /** FX snapshot — present iff the user paid in a currency other than
   *  the canonical settlement currency. All four are present or all
   *  four are absent (DB CHECK enforces). Mirrors the expense FX
   *  snapshot; see 2026-05-24-home-currency-aggregation-design.md. */
  original_amount?: string;
  original_currency?: string;
  fx_rate?: string;
  fx_as_of?: string;
}

export interface SettleInput {
  /** Client-generated ULID doubling as the idempotency key. Retrying a
   *  settle whose response was lost with the same id returns the original
   *  settlement instead of recording the payment twice. Omit to let the
   *  server mint one (older servers ignore this field entirely). */
  id?: string;
  from_member_id: string;
  to_member_id: string;
  amount: string;
  currency: string;
  note?: string;
  /** How the payment was made. Drives per-rail analytics and the
   *  false-settle rate that decides whether verified settlement is worth
   *  building. Omitted → the server records 'manual'. */
  method?: SettlementMethod;
  /** Optional FX snapshot. All-or-none — partial input is 400'd by the
   *  backend. Only set when the user paid in a different currency than
   *  the canonical settlement currency. */
  original_amount?: string;
  original_currency?: string;
  fx_rate?: string;
  fx_as_of?: string;
}

export function listGroupBalances(groupId: string) {
  return request<Balance[]>(`/api/groups/${groupId}/balances`);
}

export interface SettlementSuggestion {
  from_member_id: string;
  to_member_id: string;
  amount: string;
  currency: string;
}

export interface SettleReminderResult {
  /** How many debtors were nudged. */
  reminded: number;
  /** ISO timestamp the creditor may send again (now + 48h). */
  next_allowed_at: string;
}

export function listSettlementSuggestions(groupId: string) {
  return request<SettlementSuggestion[]>(`/api/groups/${groupId}/settle-suggestions`);
}

export function settle(groupId: string, input: SettleInput) {
  return request<Settlement>(`/api/groups/${groupId}/settle`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listSettlements(groupId: string) {
  return request<Settlement[]>(`/api/groups/${groupId}/settlements`);
}

export function revertSettlement(groupId: string, settlementId: string) {
  return request<void>(`/api/groups/${groupId}/settlements/${settlementId}/revert`, {
    method: 'POST',
  });
}

export function listMyBalances() {
  return request<MyBalance[]>('/api/me/balances');
}

// Canonical activity event names. Mirrors backend constants in
// internal/handler/activity_write.go and the schema comment in
// migrations/000007_create_activity.up.sql.
export type ActivityEventType =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'settlement_added'
  | 'settlement_reverted'
  | 'member_joined'
  | 'group_created'
  | 'group_updated'
  | 'group_archived'
  | 'invite_link_rotated';

// Minimal payload snapshots — written at the time the activity row is
// created so the feed can render the row without re-querying the
// underlying entity. Clients must tolerate missing fields.
export interface ExpenseActivitySnapshot {
  title?: string;
  amount?: number;
  currency?: string;
  payer_member_id?: string;
}

export interface SettlementActivitySnapshot {
  from_member_id?: string;
  from_member_name?: string;
  to_member_id?: string;
  to_member_name?: string;
  amount?: number;
  currency?: string;
}

export interface GroupActivitySnapshot {
  name?: string;
  changed?: string[];
  old_name?: string;
  currency?: string;
  old_currency?: string;
  language?: string;
  old_language?: string;
}

export interface MemberActivitySnapshot {
  member_id?: string;
  display_name?: string;
}

export interface ActivityPayload {
  entity_type?: 'expense' | 'settlement' | 'group' | 'member';
  snapshot?:
    | ExpenseActivitySnapshot
    | SettlementActivitySnapshot
    | GroupActivitySnapshot
    | MemberActivitySnapshot;
  // The richer expense-edit collapse writer (see backend
  // writeExpenseUpdatedActivity) emits a flat shape with
  // `changed_fields` and `actor_display_name` instead of `snapshot`.
  changed_fields?: string[];
  actor_display_name?: string;
  entity_id?: string;
}

export interface ActivityEvent {
  id: string;
  group_id: string;
  /** Set on /api/me/activity (cross-group feed); omitted on per-group feed. */
  group_name?: string;
  actor_id: string;
  actor_name: string;
  event_type: ActivityEventType | string;
  entity_id?: string;
  entity_type?: string;
  payload?: ActivityPayload;
  created_at: string;
}

export function listMyActivity(limit = 50, offset = 0) {
  return request<ActivityEvent[]>(
    `/api/me/activity?limit=${limit}&offset=${offset}`,
  );
}

export function listGroupActivity(groupId: string, limit = 50, offset = 0) {
  return request<ActivityEvent[]>(
    `/api/groups/${groupId}/activity?limit=${limit}&offset=${offset}`,
  );
}

// Instance info — published by the backend at /.well-known/chara-instance.
// Result is cached for the session; the feature set is fixed at server boot.
export interface InstanceFeatures {
  google_auth: boolean;
  apple_auth: boolean;
  ocr: boolean;
  /** POST /settle-reminders is available. Optional — absent on backends
   *  predating the feature, which the app treats as unsupported. */
  settle_reminders?: boolean;
  /** POST /api/voice/expenses is available. Optional — absent on backends
   *  predating the feature, which the app treats as unsupported, so the
   *  mic stays hidden rather than offering a button that always fails. */
  voice_expense?: boolean;
  /** GET /api/me/summary and the monthly summary push are available.
   *  Optional — absent on backends predating the feature, and false on every
   *  self-hosted instance, which the app treats as unsupported. */
  monthly_summary?: boolean;
}

export interface InstanceInfo {
  mode: 'hosted' | 'selfhost';
  version: string;
  auth_methods: string[];
  features: InstanceFeatures;
}

let instanceCache: Promise<InstanceInfo> | null = null;
export function getInstanceInfo(): Promise<InstanceInfo> {
  if (instanceCache) return instanceCache;
  instanceCache = (async () => {
    const res = await fetch(`${BASE_URL}/.well-known/chara-instance`);
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<InstanceInfo>;
  })().catch((e) => {
    // Don't poison the cache forever on transient failures.
    instanceCache = null;
    throw e;
  });
  return instanceCache;
}

// Receipt OCR
export interface ScannedReceipt {
  /** AI-generated short natural-language description, e.g. "Groceries at ICA
   *  Maxi". Falls back to the merchant name if the model omitted it. */
  title: string;
  merchant: string;
  date?: string;
  currency: string;
  /** Best-guess expense category id (one of EXPENSE_CATEGORIES in
   *  lib/categories.ts), or absent when the scanner had no confident guess. */
  category?: string;
  total_minor: number;
  subtotal_minor?: number;
  tax_minor?: number;
  tip_minor?: number;
  /** Container deposit ("pant") included in total_minor but never in
   *  `items` — it belongs to the receipt rather than to any purchased good.
   *  Negative for a deposit refund ("pantretur"). Absent on older backends,
   *  so treat missing as 0. Surfaced as an evenly-shared extra charge. */
  deposit_minor?: number;
  /** Per-line items in the receipt's currency. Optional — backends without
   *  itemized OCR (or scans where items can't be confidently parsed) omit
   *  this field. The mobile app must tolerate missing / empty. */
  items?: ScannedReceiptItem[];

  // Hosted-instance billing piggyback. Present only on hosted; selfhost
  // responses omit these and the client treats their absence as "no
  // metering, never show upsells." See `2026-05-24-pro-billing-design.md`.
  tier?: 'free';
  remaining?: number;
  period_resets_at?: string;
}

export interface ScannedReceiptItem {
  description: string;
  qty: number;
  unit_price_minor: number;
  total_minor: number;
}

export function scanReceipt(
  imageBase64: string,
  mimeType: string,
  language?: string,
  groupId?: string,
) {
  return request<ScannedReceipt>('/api/receipts/scan', {
    method: 'POST',
    body: JSON.stringify({
      image_base64: imageBase64,
      mime_type: mimeType,
      ...(language ? { language } : {}),
      ...(groupId ? { group_id: groupId } : {}),
    }),
  });
}

// Voice expenses — POST /api/voice/expenses. Audio (or, on a clarify
// re-post, a transcript plus answers) becomes validated expense drafts.
// Drafts are proposals only: creating an expense still goes through
// createExpense, which the server validates independently.
export interface VoiceQuestionOption {
  member_id: string;
  label: string;
}

export interface VoiceQuestion {
  id: string;
  text: string;
  options: VoiceQuestionOption[];
}

export interface VoiceExpensesResponse {
  transcript: string;
  expenses: VoiceDraft[];
  questions?: VoiceQuestion[];
  /** Pass back on createExpense to record per-field acceptance. */
  generation_id?: string;
  tier?: string;
  remaining?: number;
  period_resets_at?: string;
}

export interface VoiceExpensesInput {
  /** Omitted on a clarify re-post, which carries `transcript` instead. */
  audioBase64?: string;
  mimeType?: string;
  groupId: string;
  /** The device's local day (YYYY-MM-DD) and IANA zone. The server cannot
   *  know the user's day, and "yesterday" must resolve against theirs. */
  localDate: string;
  timezone: string;
  clipMs?: number;
  /** The recorder's app language, for the model's `reasoning` text. */
  uiLanguage?: string;
  /** Set for the clarify re-post. The server routes it to the text path,
   *  which is cheaper and deliberately not metered. */
  transcript?: string;
  answers?: Array<{ question_id: string; member_id?: string; text: string }>;
}

function voiceBody(input: VoiceExpensesInput) {
  return JSON.stringify({
    group_id: input.groupId,
    local_date: input.localDate,
    timezone: input.timezone,
    ...(input.audioBase64 ? { audio_base64: input.audioBase64 } : {}),
    ...(input.mimeType ? { mime_type: input.mimeType } : {}),
    ...(input.clipMs ? { clip_ms: input.clipMs } : {}),
    ...(input.uiLanguage ? { ui_language: input.uiLanguage } : {}),
    ...(input.transcript ? { transcript: input.transcript } : {}),
    ...(input.answers?.length ? { answers: input.answers } : {}),
  });
}

// Waitlist — captures emails when hosted users hit a soft gate during the
// v1.0/v1.1 free beta. The server enforces the allowed-triggers list, so
// adding a new trigger here also requires a backend handler change.
export type WaitlistTrigger = 'ocr_cap' | 'voice_cap' | 'recurring_request' | 'export_request';

export interface WaitlistSubmission {
  email: string;
  trigger: WaitlistTrigger;
  /** Optional funnel-analysis hint, e.g. 'mobile' | 'web'. */
  source?: string;
  /** Optional device locale at submission time. */
  locale?: string;
}

export function submitWaitlist(input: WaitlistSubmission) {
  return request<{ ok: boolean }>('/api/waitlist', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Discriminator for the 429 OCR-cap response. Matches the server-side
 * `capReachedResponse` shape from internal/handler/receipts.go. Use with
 * `ApiError.body` to switch from a generic error toast to the waitlist
 * modal.
 */
export interface OcrCapReachedBody {
  code: 'ocr_cap_reached';
  message: string;
  remaining: number;
  period_resets_at: string;
  waitlist_prompt: boolean;
}

export function isOcrCapReached(err: unknown): OcrCapReachedBody | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 429) return null;
  const body = err.body as Partial<OcrCapReachedBody> | null;
  if (!body || body.code !== 'ocr_cap_reached') return null;
  return body as OcrCapReachedBody;
}

/** The 429 body for the voice cap. Same shape as the OCR one — a separate
 *  code because voice and OCR are independent budgets. */
export interface VoiceCapReachedBody {
  code: 'voice_cap_reached';
  message: string;
  remaining: number;
  period_resets_at: string;
  waitlist_prompt: boolean;
}

export function isVoiceCapReached(err: unknown): VoiceCapReachedBody | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 429) return null;
  const body = err.body as Partial<VoiceCapReachedBody> | null;
  if (!body || body.code !== 'voice_cap_reached') return null;
  return body as VoiceCapReachedBody;
}

/** The 422 body for a voice extraction that produced nothing usable. The
 *  code drives which copy the user sees — in particular `settlement`
 *  points at the settle flow rather than reporting a failure. */
export type VoiceFailureCode =
  | 'unintelligible'
  | 'no_expense'
  | 'settlement'
  | 'bad_request';

export function voiceFailureCode(err: unknown): VoiceFailureCode | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { code?: string } | null;
  const code = body?.code;
  if (
    code === 'unintelligible' ||
    code === 'no_expense' ||
    code === 'settlement' ||
    code === 'bad_request'
  ) {
    return code;
  }
  return null;
}

// Receipt attachments
export interface ExpenseAttachment {
  id: string;
  expense_id: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  /** Short-lived presigned GET URL (15 min). Re-fetch the list to refresh. */
  url?: string;
}

export function uploadExpenseAttachment(
  groupId: string,
  expenseId: string,
  imageBase64: string,
  mimeType: string,
) {
  return request<ExpenseAttachment>(
    `/api/groups/${groupId}/expenses/${expenseId}/attachments`,
    {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
    },
  );
}

export function listExpenseAttachments(groupId: string, expenseId: string) {
  return request<ExpenseAttachment[]>(
    `/api/groups/${groupId}/expenses/${expenseId}/attachments`,
  );
}

/**
 * Upload a receipt attachment with progress reporting. `fetch` can't report
 * upload progress in React Native, so this uses XMLHttpRequest over the same
 * base64-JSON body the backend already accepts (no backend change). It:
 *  - reports 0..1 progress via `onProgress`,
 *  - times out (so a stalled upload surfaces an error instead of hanging on
 *    "uploading" forever — the original bug), and
 *  - retries once after a silent token refresh on 401.
 */
export function uploadExpenseAttachmentWithProgress(
  serverUrl: string,
  groupId: string,
  expenseId: string,
  imageBase64: string,
  mimeType: string,
  onProgress?: (fraction: number) => void,
): Promise<ExpenseAttachment> {
  const url = `${serverUrl}/api/groups/${groupId}/expenses/${expenseId}/attachments`;
  const body = JSON.stringify({ image_base64: imageBase64, mime_type: mimeType });

  const send = (token: string | null) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader(PROTOCOL_HEADER, String(APP_PROTOCOL_VERSION));
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 60000;
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(e.loaded / e.total);
        };
      }
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new ApiError(0, 'network error during upload'));
      xhr.ontimeout = () => reject(new ApiError(0, 'upload timed out'));
      xhr.send(body);
    });

  return (async () => {
    let token = accountFor(serverUrl)?.token ?? null;
    let res = await send(token);
    if (res.status === 401) {
      const refreshed = await attemptRefresh(serverUrl);
      if (refreshed) {
        token = refreshed;
        res = await send(token);
      }
    }
    if (res.status < 200 || res.status >= 300) {
      let parsed: unknown = null;
      let msg = `upload failed (${res.status})`;
      try {
        parsed = JSON.parse(res.text);
        const e = (parsed as { error?: string })?.error;
        if (e) msg = e;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, msg, parsed);
    }
    return JSON.parse(res.text) as ExpenseAttachment;
  })();
}

// Avatars
export type AvatarMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export function uploadAvatar(imageBase64: string, mimeType: AvatarMimeType) {
  return request<{ url: string; updated_at: string }>('/api/me/avatar', {
    method: 'POST',
    body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
  });
}

export function deleteAvatar() {
  return request<void>('/api/me/avatar', { method: 'DELETE' });
}

/** Build an authenticated `<Image source={...}>` descriptor for the given
 *  user's server-hosted avatar. Returns null if neither `avatar_object_url`
 *  nor a fallback OAuth `avatar_url` is set — callers should then render
 *  initials.
 *
 *  Security: only server-relative paths get the Authorization header. If
 *  `avatar_object_url` is an absolute URL we return null — a hostile or
 *  compromised server (or a self-set avatar URL on any server) could
 *  otherwise capture the user's JWT via the outbound Authorization header.
 *
 *  The OAuth fallback (`avatar_url`) is served by the provider directly and
 *  doesn't need auth headers. The cache-buster (`?v=<updated_at>`) only
 *  applies to the server avatar so a fresh upload invalidates the RN
 *  image cache. */
type AvatarInput =
  | { avatar_object_url?: string | null; avatar_url?: string | null; avatar_updated_at?: string | null }
  | null
  | undefined;

function buildAvatarSource(
  base: string,
  input: AvatarInput,
  token: string | null,
): { uri: string; headers?: Record<string, string> } | null {
  if (!input) return null;
  if (input.avatar_object_url) {
    const path = input.avatar_object_url;
    // Reject absolute URLs: never send the bearer token to an arbitrary host.
    if (!path.startsWith('/')) return null;
    const sep = path.includes('?') ? '&' : '?';
    const bust = input.avatar_updated_at
      ? `${sep}v=${encodeURIComponent(input.avatar_updated_at)}`
      : '';
    const uri = `${base}${path}${bust}`;
    return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
  }
  if (input.avatar_url) {
    return { uri: input.avatar_url };
  }
  return null;
}

export function avatarImageSource(input: AvatarInput, token: string | null) {
  return buildAvatarSource(BASE_URL, input, token);
}

/** Per-server variant: builds the avatar source against `serverUrl` (not the
 *  default `BASE_URL`) and pulls that account's token. Use this on any
 *  multi-server surface — e.g. the home groups list, whose member avatars can
 *  live on any linked server. Relative `avatar_object_url`s would otherwise
 *  resolve against the wrong host. */
export function avatarImageSourceOn(serverUrl: string, input: AvatarInput) {
  return buildAvatarSource(serverUrl, input, accountFor(serverUrl)?.token ?? null);
}

// FX
export interface FxConvertResponse {
  from: string;
  to: string;
  amount_minor: number;
  result_minor: number;
  rate: string;
  as_of: string;
  source: string;
}

/** Most-recent ECB snapshot from a server. base is always EUR (the
 *  /api/fx/rates endpoint rejects anything else); cross-rates are
 *  computed client-side. Used by the home-currency aggregate. */
export interface FxRatesResponse {
  base: string;
  as_of: string;
  source: string;
  rates: Array<{ quote: string; rate: string }>;
}

export function convertFx(input: {
  from: string;
  to: string;
  amountMinor: number;
  asOf?: string;
}) {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
    amount_minor: String(input.amountMinor),
  });
  if (input.asOf) params.set('as_of', input.asOf);
  return request<FxConvertResponse>(`/api/fx/convert?${params.toString()}`);
}

export function listFxRates(asOf?: string) {
  const params = new URLSearchParams({ base: 'EUR' });
  if (asOf) params.set('as_of', asOf);
  return request<FxRatesResponse>(`/api/fx/rates?${params.toString()}`);
}

/** Per-account aggregate: the user's net balance across every group on
 *  this server, summed in `homeCurrency` using ECB rates locked at each
 *  leg's own date. Never uses today's rate. Spec:
 *  2026-05-24-home-currency-aggregation-design.md. */
export interface MyNetResponse {
  home_currency: string;
  /** Signed decimal string, e.g. "-1240.50". */
  net_minor: string;
  total_legs: number;
  converted_legs: number;
  estimated_legs: number;
  contributing_groups: number;
}


// --- Monthly summary (hosted-only) -----------------------------------------
//
// Shapes mirror backend/internal/handler/summary.go. Every money field is a
// decimal string in the currency named alongside it, per the Money rule —
// never a number.

export interface SummaryCurrencyTotals {
  currency: string;
  paid: string;
  share: string;
  expense_count: number;
}

export interface SummaryConverted {
  currency: string;
  paid: string;
  share: string;
  net: string;
  total_legs: number;
  converted_legs: number;
  /** Legs converted at a rate that was not the expense-date rate. Same
   *  "approximate" contract as /api/me/net. */
  estimated_legs: number;
}

export interface SummaryCounts {
  expenses: number;
  groups: number;
  active_days: number;
}

export interface SummaryCategory {
  slug: string;
  share: string;
  /** Whole percent, apportioned by the backend so the set sums to 100. */
  pct: number;
}

export interface SummaryBiggestExpense {
  expense_id: string;
  group_id: string;
  group_name: string;
  title: string;
  /** In `currency`, not the home currency — ranking happens converted,
   *  display stays native. */
  share: string;
  currency: string;
}

export interface SummaryTopGroup {
  group_id: string;
  name: string;
  share: string;
}

export interface SummaryResponse {
  period: string;
  by_currency: SummaryCurrencyTotals[];
  converted: SummaryConverted;
  counts: SummaryCounts;
  categories: SummaryCategory[];
  highlights: {
    biggest_expense: SummaryBiggestExpense | null;
    top_group: SummaryTopGroup | null;
  };
  previous: { paid: string; share: string; net: string } | null;
  /** Earliest month with any qualifying expense, so the screen knows when to
   *  stop offering "previous month". Empty when there is none. */
  first_period: string;
}

export function getMyNet(homeCurrency: string) {
  return request<MyNetResponse>(
    `/api/me/net?in=${encodeURIComponent(homeCurrency)}`,
  );
}

// ---------------------------------------------------------------------------
// Per-server clients (spec §6).
//
// `apiFor(serverUrl)` and `publicApi(serverUrl)` are the forward-looking
// surface for multi-server callers. They always return a client object;
// authentication errors throw at *request* time (NoAccountError), not at
// construction time, so the client is safely constructible for speculative
// uses.
//
// During the route-refactor wave (2D), screens migrate from the flat
// `listGroups()` / `getGroup(id)` / etc. exports above to
// `apiFor(serverUrl).listGroups()`. The flat exports stay for now as
// backward-compat shims routing through the default account.
// ---------------------------------------------------------------------------

export function apiFor(serverUrl: string) {
  return {
    // Identity
    getMe: () => requestOn<User>(serverUrl, '/api/me'),
    updateMe: (input: {
      name?: string;
      phone?: string;
      // Optional so an unrelated profile edit cannot silently opt the user
      // back into the monthly summary — the backend field is a pointer for
      // the same reason.
      monthly_summary_opt_out?: boolean;
    }) =>
      requestOn<User>(serverUrl, '/api/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    // Groups
    listGroups: () => requestOn<Group[]>(serverUrl, '/api/groups'),
    listArchivedGroups: () => requestOn<Group[]>(serverUrl, '/api/groups?archived=true'),
    getGroup: (id: string) => requestOn<GroupDetail>(serverUrl, `/api/groups/${id}`),
    createGroup: (name: string, currency: string, language?: string) =>
      requestOn<Group>(serverUrl, '/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name, currency, ...(language ? { language } : {}) }),
      }),
    updateGroup: (id: string, input: UpdateGroupInput) =>
      requestOn<Group>(serverUrl, `/api/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    archiveGroup: (id: string) =>
      requestOn<void>(serverUrl, `/api/groups/${id}`, { method: 'DELETE' }),
    listGroupMembers: (groupId: string) =>
      requestOn<GroupMember[]>(serverUrl, `/api/groups/${groupId}/members`),

    // Group lifecycle (spec 2026-05-23-group-settings-design.md)
    getGroupStats: (groupId: string) =>
      requestOn<GroupStats>(serverUrl, `/api/groups/${groupId}/stats`),
    lockGroup: (groupId: string) =>
      requestOn<Group>(serverUrl, `/api/groups/${groupId}/lock`, { method: 'POST' }),
    unlockGroup: (groupId: string) =>
      requestOn<Group>(serverUrl, `/api/groups/${groupId}/unlock`, { method: 'POST' }),
    unarchiveGroup: (groupId: string) =>
      requestOn<Group>(serverUrl, `/api/groups/${groupId}/unarchive`, { method: 'POST' }),
    permanentDeleteGroup: (groupId: string, nameConfirmation: string) =>
      requestOn<void>(serverUrl, `/api/groups/${groupId}/permanent`, {
        method: 'DELETE',
        body: JSON.stringify({ name_confirmation: nameConfirmation }),
      }),
    removeMember: (groupId: string, memberId: string) =>
      requestOn<void>(serverUrl, `/api/groups/${groupId}/members/${memberId}`, {
        method: 'DELETE',
      }),
    getMemberCanLeave: (groupId: string, memberId: string) =>
      requestOn<CanLeaveResponse>(
        serverUrl,
        `/api/groups/${groupId}/members/${memberId}/can-leave`,
      ),

    // Invites
    joinGroupByToken: (token: string) =>
      requestOn<GroupDetail>(serverUrl, `/api/groups/join/${encodeURIComponent(token)}`, {
        method: 'POST',
      }),
    /** Fetch the canonical shareable invite URL for a group. The backend
     *  returns `{ invite_url: 'https://<host>/i/<token>' }` — both QR and
     *  share-sheet payloads use this string verbatim. */
    getInviteLink: (groupId: string) =>
      requestOn<{ invite_url: string }>(serverUrl, `/api/groups/${groupId}/invite-link`),

    // Expenses
    listExpenses: (groupId: string) =>
      requestOn<Expense[]>(serverUrl, `/api/groups/${groupId}/expenses`),
    getExpense: (groupId: string, expenseId: string) =>
      requestOn<Expense>(serverUrl, `/api/groups/${groupId}/expenses/${expenseId}`),
    createExpense: (groupId: string, input: CreateExpenseInput) =>
      requestOn<Expense>(serverUrl, `/api/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateExpense: (groupId: string, expenseId: string, input: UpdateExpenseInput) =>
      requestOn<Expense>(serverUrl, `/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    deleteExpense: (groupId: string, expenseId: string) =>
      requestOn<void>(serverUrl, `/api/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
      }),
    mergeExpenses: (
      groupId: string,
      input: { source_expense_ids: string[]; title?: string },
    ) =>
      requestOn<Expense>(serverUrl, `/api/groups/${groupId}/expenses/merge`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    // Balances + settlements
    listGroupBalances: (groupId: string) =>
      requestOn<Balance[]>(serverUrl, `/api/groups/${groupId}/balances`),
    listSettlementSuggestions: (groupId: string) =>
      requestOn<SettlementSuggestion[]>(serverUrl, `/api/groups/${groupId}/settle-suggestions`),
    settle: (groupId: string, input: SettleInput) =>
      requestOn<Settlement>(serverUrl, `/api/groups/${groupId}/settle`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    // Nudge the members who owe you in this group to settle up. Throws
    // ApiError(429, { next_allowed_at }) when within the 48h cooldown.
    sendSettleReminders: (groupId: string) =>
      requestOn<SettleReminderResult>(serverUrl, `/api/groups/${groupId}/settle-reminders`, {
        method: 'POST',
      }),
    listSettlements: (groupId: string) =>
      requestOn<Settlement[]>(serverUrl, `/api/groups/${groupId}/settlements`),
    revertSettlement: (groupId: string, settlementId: string) =>
      requestOn<void>(serverUrl, `/api/groups/${groupId}/settlements/${settlementId}/revert`, {
        method: 'POST',
      }),

    // Attachments
    uploadExpenseAttachment: (
      groupId: string,
      expenseId: string,
      imageBase64: string,
      mimeType: string,
    ) =>
      requestOn<ExpenseAttachment>(
        serverUrl,
        `/api/groups/${groupId}/expenses/${expenseId}/attachments`,
        {
          method: 'POST',
          body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
        },
      ),
    uploadExpenseAttachmentWithProgress: (
      groupId: string,
      expenseId: string,
      imageBase64: string,
      mimeType: string,
      onProgress?: (fraction: number) => void,
    ) =>
      uploadExpenseAttachmentWithProgress(
        serverUrl,
        groupId,
        expenseId,
        imageBase64,
        mimeType,
        onProgress,
      ),
    listExpenseAttachments: (groupId: string, expenseId: string) =>
      requestOn<ExpenseAttachment[]>(
        serverUrl,
        `/api/groups/${groupId}/expenses/${expenseId}/attachments`,
      ),

    // Import from another app (spec 2026-05-28-import-from-another-app-design.md).
    // `extract` is stateless OCR; `commit` bulk-creates in one transaction.
    importExtract: (
      groupId: string,
      input: { source: string; images: ImportImage[] },
    ) =>
      requestOn<ImportExtractResult>(serverUrl, `/api/groups/${groupId}/import/extract`, {
        method: 'POST',
        body: JSON.stringify({ source: input.source, images: input.images }),
      }),
    importCommit: (groupId: string, input: ImportCommitInput) =>
      requestOn<{ imported: number }>(serverUrl, `/api/groups/${groupId}/import/commit`, {
        method: 'POST',
        body: JSON.stringify({
          source: input.source,
          standings: input.standings.map((s) => ({
            name: s.name,
            direction: s.direction,
            amount: s.amount,
            title: s.title,
            member_id: s.memberId ?? undefined,
          })),
        }),
      }),

    // Recurring (spec 2026-05-24-recurring-expenses-design.md)
    recurring: {
      list: (groupId: string) =>
        requestOn<RecurringExpense[]>(serverUrl, `/api/groups/${groupId}/recurring`),
      get: (groupId: string, id: string) =>
        requestOn<RecurringExpense>(serverUrl, `/api/groups/${groupId}/recurring/${id}`),
      create: (groupId: string, input: CreateRecurringInput) =>
        requestOn<RecurringExpense>(serverUrl, `/api/groups/${groupId}/recurring`, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      update: (groupId: string, id: string, input: UpdateRecurringInput) =>
        requestOn<RecurringExpense>(serverUrl, `/api/groups/${groupId}/recurring/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      delete: (groupId: string, id: string) =>
        requestOn<void>(serverUrl, `/api/groups/${groupId}/recurring/${id}`, {
          method: 'DELETE',
        }),
      pause: (groupId: string, id: string) =>
        requestOn<RecurringExpense>(serverUrl, `/api/groups/${groupId}/recurring/${id}/pause`, {
          method: 'POST',
        }),
      resume: (groupId: string, id: string) =>
        requestOn<RecurringExpense>(serverUrl, `/api/groups/${groupId}/recurring/${id}/resume`, {
          method: 'POST',
        }),
      resumeAllAfterUnlock: (groupId: string) =>
        requestOn<{ resumed_ids: string[] }>(
          serverUrl,
          `/api/groups/${groupId}/recurring/resume-all-after-unlock`,
          { method: 'POST' },
        ),
    },

    // FX (group-scoped — uses the group's home server)
    convertFx: (input: { from: string; to: string; amountMinor: number; asOf?: string }) => {
      const params = new URLSearchParams({
        from: input.from,
        to: input.to,
        amount_minor: String(input.amountMinor),
      });
      if (input.asOf) params.set('as_of', input.asOf);
      return requestOn<FxConvertResponse>(serverUrl, `/api/fx/convert?${params.toString()}`);
    },

    listFxRates: (asOf?: string) => {
      const params = new URLSearchParams({ base: 'EUR' });
      if (asOf) params.set('as_of', asOf);
      return requestOn<FxRatesResponse>(serverUrl, `/api/fx/rates?${params.toString()}`);
    },

    // Receipt OCR (group-scoped — uses the group's home server)
    scanReceipt: (imageBase64: string, mimeType: string, language?: string, groupId?: string) =>
      requestOn<ScannedReceipt>(serverUrl, '/api/receipts/scan', {
        method: 'POST',
        body: JSON.stringify({
          image_base64: imageBase64,
          mime_type: mimeType,
          ...(language ? { language } : {}),
          ...(groupId ? { group_id: groupId } : {}),
        }),
      }),

    // Voice expenses (group-scoped — uses the group's home server).
    // Intentionally has no flat-export twin: new code uses apiFor().
    generateVoiceExpenses: (input: VoiceExpensesInput) =>
      requestOn<VoiceExpensesResponse>(serverUrl, '/api/voice/expenses', {
        method: 'POST',
        body: voiceBody(input),
      }),

    // Waitlist signup — hosted-only soft-gate email capture during the
    // v1.0/v1.1 free beta.
    submitWaitlist: (input: WaitlistSubmission) =>
      requestOn<{ ok: boolean }>(serverUrl, '/api/waitlist', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    // Instance info (unauthenticated, but bound to a specific server)
    instanceInfo: () =>
      requestOn<InstanceInfo>(serverUrl, '/.well-known/chara-instance', {
        requireAuth: false,
      }),

    // Aggregated home/balances/activity (Wave 4 fan-out targets)
    listMyBalances: () => requestOn<MyBalance[]>(serverUrl, '/api/me/balances'),
    getMyNet: (homeCurrency: string) =>
      requestOn<MyNetResponse>(
        serverUrl,
        `/api/me/net?in=${encodeURIComponent(homeCurrency)}`,
      ),
    listMyActivity: (limit = 50, offset = 0) =>
      requestOn<ActivityEvent[]>(
        serverUrl,
        `/api/me/activity?limit=${limit}&offset=${offset}`,
      ),
    listGroupActivity: (groupId: string, limit = 50, offset = 0) =>
      requestOn<ActivityEvent[]>(
        serverUrl,
        `/api/groups/${groupId}/activity?limit=${limit}&offset=${offset}`,
      ),

    // Monthly summary (hosted-only; gated on features.monthly_summary)
    getSummary: (period: string, homeCurrency: string) =>
      requestOn<SummaryResponse>(
        serverUrl,
        `/api/me/summary?period=${encodeURIComponent(period)}&in=${encodeURIComponent(homeCurrency)}`,
      ),

    // Push tokens (Wave 5)
    // `locale` is the device's UI language. Optional on the wire — an older
    // backend ignores the field — and it is what lets the server localize
    // push copy it writes itself, like the monthly summary.
    registerPushToken: (
      token: string,
      platform: 'ios' | 'android' | 'web',
      locale?: string,
    ) =>
      requestOn<void>(serverUrl, '/api/me/push-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform, ...(locale ? { locale } : {}) }),
      }),
    deletePushToken: (token: string) =>
      requestOn<void>(serverUrl, '/api/me/push-token', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      }),

    // Logout (advisory; spec §16 item 4)
    logout: () => {
      // Send the refresh token so the server can revoke it (the access JWT is
      // stateless and dies on its own ≤24h later). Best-effort either way.
      const refreshToken = accountFor(serverUrl)?.refreshToken;
      return requestOn<void>(serverUrl, '/api/me/logout', {
        method: 'POST',
        ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
      });
    },

    // Permanent account self-deletion — Apple Guideline 5.1.1(v).
    // 204 → resolves. 401 → already gone, resolves. 409 → throws
    // `AccountDeleteBlockedError` with the per-currency outstanding balances
    // so the UI can prompt the user to settle up first.
    deleteMe: async (): Promise<void> => {
      try {
        await requestOn<void>(serverUrl, '/api/me', { method: 'DELETE' });
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) return; // already deleted
          if (e.status === 409) {
            throw new AccountDeleteBlockedError(parseDeleteBlockedBody(e.body));
          }
        }
        throw e;
      }
    },
  };
}

// Shape returned by GET /api/invites/{token}/preview. Always HTTP 200; the
// `state` discriminator carries the real result so the UI can branch without
// a separate request to learn it.
export type InvitePreview =
  | {
      state: 'ok' | 'locked';
      groupName: string;
      memberCount: number;
      serverName: string;
      serverHost: string;
      inviterName: string | null;
    }
  | { state: 'expired' | 'not_found' | 'archived' | 'deleted' | 'rate_limited' | string };

/** The branch of [InvitePreview] that actually carries group details. */
export type InvitePreviewDetails = Extract<InvitePreview, { groupName: string }>;

/**
 * Narrow an [InvitePreview] to the branch with group details.
 *
 * The union cannot discriminate on `state` alone: the not-available branch is
 * open (`| string`) so a future server can return a state this build has never
 * heard of, which means TypeScript must assume that branch could also carry
 * `state: 'ok'`. Checking for a field only the detailed branch has is both
 * type-sound and a genuine runtime guard against a server that sends `ok`
 * without the accompanying data.
 */
export function hasInviteDetails(p: InvitePreview): p is InvitePreviewDetails {
  return (
    (p.state === 'ok' || p.state === 'locked') &&
    typeof (p as Partial<InvitePreviewDetails>).groupName === 'string'
  );
}

export function publicApi(serverUrl: string) {
  return {
    instanceInfo: () =>
      requestOn<InstanceInfo>(serverUrl, '/.well-known/chara-instance', {
        requireAuth: false,
      }),
    previewInvite: (token: string) =>
      requestOn<InvitePreview>(
        serverUrl,
        `/api/invites/${encodeURIComponent(token)}/preview`,
        { requireAuth: false },
      ),
    requestMagicLink: (email: string) =>
      requestOn<MagicLinkResponse>(serverUrl, '/api/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
        requireAuth: false,
      }),
    verifyMagicLink: (token: string) =>
      requestOn<TokenResponse>(serverUrl, '/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
        requireAuth: false,
      }),
    // Native Sign in with Apple — exchanges Apple's identity_token for a
    // Chara session JWT. `name` is provided only on the first sign-in (Apple
    // returns it once); the server persists it as the user's display name.
    // `nonce` is the raw (unhashed) nonce the client used when calling
    // AppleAuthentication.signInAsync; Apple hashes it and embeds it in
    // the JWT, the server verifies the hash matches what we send here.
    appleNativeSignIn: (args: { identity_token: string; nonce: string; name?: string }) =>
      requestOn<TokenResponse>(serverUrl, '/api/auth/apple/native', {
        method: 'POST',
        body: JSON.stringify(args),
        requireAuth: false,
      }),
    // Native Sign in with Google — exchanges Google's identity_token for a
    // Chara session JWT. `name` is best-effort from the Google profile and
    // only consumed by the server on first sign-in (it sets the user's
    // display name then; subsequent logins ignore the field). `nonce` is
    // the raw nonce we passed to GoogleSignin.signIn; Google embeds it in
    // the ID token so the server can verify it wasn't replayed.
    googleNativeSignIn: (args: { identity_token: string; nonce: string; name?: string }) =>
      requestOn<TokenResponse>(serverUrl, '/api/auth/google/native', {
        method: 'POST',
        body: JSON.stringify(args),
        requireAuth: false,
      }),
  };
}
