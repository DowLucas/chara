import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';

function resolveBaseUrl(): string {
  if (!__DEV__) return 'https://api.quits.app';

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
  console.log('[quits] API base URL:', BASE_URL);
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
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
}

export interface GroupMember {
  id: string;
  user_id?: string;
  name: string;
  email?: string;
  role?: string;
  is_ghost?: boolean;
  joined_at?: string;
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
  return `quits://join/${token}`;
}

/** Extract an invite token from a scanned string. Accepts the raw token, a
 *  `quits://join/<token>` deep link, or any URL whose path ends with /join/<token>. */
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
  created_at: string;
}

export interface SettleInput {
  from_member_id: string;
  to_member_id: string;
  amount: string;
  currency: string;
  note?: string;
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

export function listMyBalances() {
  return request<MyBalance[]>('/api/me/balances');
}

export interface ActivityEvent {
  id: string;
  group_id: string;
  group_name: string;
  actor_id: string;
  actor_name: string;
  event_type:
    | 'expense_added'
    | 'expense_updated'
    | 'expense_deleted'
    | 'settlement_added'
    | 'member_joined'
    | 'member_left'
    | string;
  entity_id?: string;
  entity_type?: string;
  created_at: string;
}

export function listMyActivity(limit = 50, offset = 0) {
  return request<ActivityEvent[]>(
    `/api/me/activity?limit=${limit}&offset=${offset}`,
  );
}

// Instance info — published by the backend at /.well-known/quits-instance.
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
    const res = await fetch(`${BASE_URL}/.well-known/quits-instance`);
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
