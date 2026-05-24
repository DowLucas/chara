import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  APP_PROTOCOL_VERSION,
  PROTOCOL_HEADER,
} from './protocol';
import {
  accountFor,
  defaultAccount,
  markIncompatible,
  markReauthRequired,
} from './accounts-store';

const TOKEN_KEY = 'auth_token';

function resolveBaseUrl(): string {
  if (!__DEV__) return 'https://api.chara.app';

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
export async function authToken(): Promise<string | null> {
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
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class NoAccountError extends Error {
  constructor(public serverUrl: string) {
    super(`No account configured for server ${serverUrl}`);
  }
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

async function requestWithToken<T>(
  serverUrl: string,
  path: string,
  options: RequestInit,
  token: string | null,
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
    void markReauthRequired(serverUrl);
  } else if (res.status === 426 && accountFor(serverUrl)) {
    void markIncompatible(serverUrl);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
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
export interface TokenResponse { token: string; user: User }

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

/** Build the QR payload / deep link for a group's invite token. */
export function inviteDeepLink(token: string): string {
  return `chara://join/${token}`;
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
  from_member_id: string;
  to_member_id: string;
  amount: string;
  currency: string;
  note?: string;
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
  total_minor: number;
  subtotal_minor?: number;
  tax_minor?: number;
  tip_minor?: number;
  /** Per-line items in the receipt's currency. Optional — backends without
   *  itemized OCR (or scans where items can't be confidently parsed) omit
   *  this field. The mobile app must tolerate missing / empty. */
  items?: ScannedReceiptItem[];
}

export interface ScannedReceiptItem {
  description: string;
  qty: number;
  unit_price_minor: number;
  total_minor: number;
}

export function scanReceipt(imageBase64: string, mimeType: string, language?: string) {
  return request<ScannedReceipt>('/api/receipts/scan', {
    method: 'POST',
    body: JSON.stringify({
      image_base64: imageBase64,
      mime_type: mimeType,
      ...(language ? { language } : {}),
    }),
  });
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
 *  The OAuth fallback (`avatar_url`) is served by the provider directly and
 *  doesn't need auth headers; the server avatar does. The cache-buster
 *  (`?v=<updated_at>`) only applies to the server avatar so a fresh upload
 *  invalidates the RN image cache. */
export function avatarImageSource(
  input:
    | { avatar_object_url?: string | null; avatar_url?: string | null; avatar_updated_at?: string | null }
    | null
    | undefined,
  token: string | null,
): { uri: string; headers?: Record<string, string> } | null {
  if (!input) return null;
  if (input.avatar_object_url) {
    const path = input.avatar_object_url;
    const sep = path.includes('?') ? '&' : '?';
    const bust = input.avatar_updated_at
      ? `${sep}v=${encodeURIComponent(input.avatar_updated_at)}`
      : '';
    const uri = path.startsWith('http') ? `${path}${bust}` : `${BASE_URL}${path}${bust}`;
    return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
  }
  if (input.avatar_url) {
    return { uri: input.avatar_url };
  }
  return null;
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
    updateMe: (input: { name?: string; phone?: string }) =>
      requestOn<User>(serverUrl, '/api/me', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    // Groups
    listGroups: () => requestOn<Group[]>(serverUrl, '/api/groups'),
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
    listExpenseAttachments: (groupId: string, expenseId: string) =>
      requestOn<ExpenseAttachment[]>(
        serverUrl,
        `/api/groups/${groupId}/expenses/${expenseId}/attachments`,
      ),

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
    scanReceipt: (imageBase64: string, mimeType: string, language?: string) =>
      requestOn<ScannedReceipt>(serverUrl, '/api/receipts/scan', {
        method: 'POST',
        body: JSON.stringify({
          image_base64: imageBase64,
          mime_type: mimeType,
          ...(language ? { language } : {}),
        }),
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

    // Push tokens (Wave 5)
    registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') =>
      requestOn<void>(serverUrl, '/api/me/push-token', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
      }),
    deletePushToken: (token: string) =>
      requestOn<void>(serverUrl, '/api/me/push-token', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      }),

    // Logout (advisory; spec §16 item 4)
    logout: () => requestOn<void>(serverUrl, '/api/me/logout', { method: 'POST' }),
  };
}

export function publicApi(serverUrl: string) {
  return {
    instanceInfo: () =>
      requestOn<InstanceInfo>(serverUrl, '/.well-known/chara-instance', {
        requireAuth: false,
      }),
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
  };
}
