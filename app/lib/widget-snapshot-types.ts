/**
 * Wire format between the app and the native homescreen widgets.
 *
 * The widget renders from this and nothing else — it cannot fetch (the
 * extension has no access to SecureStore tokens, and there is no background
 * fetch), and it cannot run i18next. So every amount arrives both as signed
 * minor units *and* as a pre-formatted display string, and every label
 * arrives already translated.
 *
 * Amounts are integer minor units. Never floats.
 *
 * Bump `WIDGET_SNAPSHOT_VERSION` on any breaking shape change; native reads
 * the version first and renders the empty state on mismatch rather than
 * decoding garbage.
 */

export const WIDGET_SNAPSHOT_VERSION = 1;

/** Most groups a snapshot ever carries. Native slices further per family. */
export const MAX_WIDGET_GROUPS = 6;

export type WidgetDirection = 'owe' | 'owed' | 'settled';

export interface WidgetCurrencyRow {
  currency: string;
  /** Signed minor units. Negative = the user owes. */
  minor: number;
  direction: WidgetDirection;
  /** Absolute, pre-formatted: "1 250,00 kr". Direction lives in the caption. */
  amountText: string;
  /** Absolute, hair-spaced for tight layouts (small family). */
  amountTextCompact: string;
  /** "You owe" / "You're owed" / "All settled up". */
  captionText: string;
}

export interface WidgetGroupRow {
  /** Composite identity, half 1. Raw (unencoded) — see `deepLink`. */
  serverUrl: string;
  /** Composite identity, half 2. */
  groupId: string;
  name: string;
  /** The dominant row's currency, not necessarily the group's own. */
  currency: string;
  /** Signed minor units of the dominant row. */
  minor: number;
  direction: WidgetDirection;
  amountText: string;
  /**
   * Opposing signs across currencies in this group: the headline amount
   * hides a debt (or credit) in another currency. Native renders a marker.
   */
  mixedSigns: boolean;
  /** Pre-encoded in JS so there is exactly one URL encoder in the system. */
  deepLink: string;
}

/**
 * `signed_out` is distinct from `empty` on purpose: a logged-out widget must
 * never render `0,00`, which reads as "all settled up".
 */
export type WidgetState = 'ok' | 'empty' | 'signed_out';

export interface WidgetStrings {
  youOwe: string;
  youreOwed: string;
  allSettled: string;
  netBalance: string;
  openChara: string;
  signedOut: string;
  noGroups: string;
  partialNotice: string;
  mixedSignsLabel: string;
  addExpense: string;
}

export interface WidgetSnapshot {
  version: number;
  /** ISO 8601. */
  generatedAt: string;
  /** Pre-formatted "as of" stamp, e.g. "14:32". */
  updatedAtText: string;
  locale: string;
  language: string;
  homeCurrency: string;

  state: WidgetState;
  /** Some account errored or hasn't resolved; shown data is incomplete. */
  partial: boolean;
  accountsTotal: number;
  accountsOk: number;

  /** Per-currency totals, sorted by absolute value. Never summed across. */
  currencies: WidgetCurrencyRow[];
  /**
   * Cross-currency aggregate, only when the server's locked-in historical FX
   * makes it meaningful and the user actually holds a foreign balance.
   */
  homeNet: (WidgetCurrencyRow & { estimated: boolean }) | null;
  groups: WidgetGroupRow[];

  /**
   * Target for the "+" shortcut: the most recently opened group. Null when
   * the user has never opened one, in which case native opens the app.
   */
  shortcut: { name: string; deepLink: string } | null;

  strings: WidgetStrings;
}
