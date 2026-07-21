/**
 * Builds the homescreen-widget snapshot from the same aggregated reads the
 * home screen renders.
 *
 * Pure and fully injected (`t`, formatters, clock) so it is deterministic
 * under test and free of react-native imports. All presentation decisions —
 * formatting, sorting, truncation, translation, URL encoding — happen here,
 * because the native widgets can do none of them.
 *
 * See `widget-snapshot-types.ts` for the wire format and `balance-summary.ts`
 * for the shared aggregation.
 */

import type { Group, MyBalance, MyNetResponse } from './api';
import { aggregateMyNetReads } from './aggregate-mynet';
import {
  groupPosition,
  mergeGroupsWithBalances,
  netByCurrency,
  type BalanceDirection,
  type Read,
} from './balance-summary';
import {
  MAX_WIDGET_GROUPS,
  WIDGET_SNAPSHOT_VERSION,
  type WidgetCurrencyRow,
  type WidgetGroupRow,
  type WidgetSnapshot,
  type WidgetState,
  type WidgetStrings,
} from './widget-snapshot-types';

export interface LastActiveGroup {
  serverUrl: string;
  groupId: string;
  name: string;
}

export interface SnapshotInput {
  /** `accounts.length` — the denominator for partial-failure reporting. */
  accountsTotal: number;
  homeCurrency: string;
  groupReads: Read<Group[]>[];
  balanceReads: Read<MyBalance[]>[];
  myNetReads: Read<MyNetResponse>[];
  lastActiveGroup: LastActiveGroup | null;
}

export interface SnapshotDeps {
  /** The app's own URL scheme — `chara` in production, `charadev` on the dev
   *  variant. Minted into every deep link so widget taps route to the app that
   *  actually published the snapshot, not a differently-schemed build. */
  scheme: string;
  t: (key: string) => string;
  /** Absolute minor units → display string. */
  formatAmount: (minor: number, currency: string) => string;
  formatAmountCompact: (minor: number, currency: string) => string;
  formatTime: (date: Date) => string;
  locale: string;
  language: string;
  now: () => Date;
}

function directionOf(minor: number): BalanceDirection {
  return minor > 0 ? 'owed' : minor < 0 ? 'owe' : 'settled';
}

function groupLink(scheme: string, serverUrl: string, groupId: string, target?: string): string {
  const base = `${scheme}://groups/${encodeURIComponent(serverUrl)}/${groupId}`;
  return target ? `${base}/${target}` : base;
}

function buildStrings(t: SnapshotDeps['t']): WidgetStrings {
  return {
    youOwe: t('widget.youOwe'),
    youreOwed: t('widget.youreOwed'),
    allSettled: t('widget.allSettled'),
    netBalance: t('widget.netBalance'),
    openChara: t('widget.openChara'),
    signedOut: t('widget.signedOut'),
    noGroups: t('widget.noGroups'),
    partialNotice: t('widget.partialNotice'),
    mixedSignsLabel: t('widget.mixedSignsLabel'),
    addExpense: t('widget.addExpense'),
  };
}

function currencyRow(
  currency: string,
  minor: number,
  deps: SnapshotDeps,
  strings: WidgetStrings,
): WidgetCurrencyRow {
  const direction = directionOf(minor);
  const abs = Math.abs(minor);
  return {
    currency,
    minor,
    direction,
    amountText: deps.formatAmount(abs, currency),
    amountTextCompact: deps.formatAmountCompact(abs, currency),
    captionText:
      direction === 'owe'
        ? strings.youOwe
        : direction === 'owed'
          ? strings.youreOwed
          : strings.allSettled,
  };
}

export function buildWidgetSnapshot(
  input: SnapshotInput,
  deps: SnapshotDeps,
): WidgetSnapshot {
  const now = deps.now();
  const strings = buildStrings(deps.t);

  const envelope = {
    version: WIDGET_SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    updatedAtText: deps.formatTime(now),
    locale: deps.locale,
    language: deps.language,
    homeCurrency: input.homeCurrency,
    strings,
  };

  // Signed out: emit nothing derived from account data. The homescreen is
  // readable without unlocking, so a balance outliving sign-out is a leak.
  if (input.accountsTotal === 0) {
    return {
      ...envelope,
      state: 'signed_out',
      partial: false,
      accountsTotal: 0,
      accountsOk: 0,
      currencies: [],
      homeNet: null,
      groups: [],
      shortcut: null,
    };
  }

  // An account that failed, or that was filtered from the fan-out for being
  // in reauth_required / incompatible, arrives as data:null. It must never
  // contribute rows — including from a stale cache.
  const accountsOk = input.balanceReads.filter((r) => r.data !== null).length;
  const partial = accountsOk < input.accountsTotal;

  const merged = mergeGroupsWithBalances(input.groupReads, input.balanceReads);

  const currencies = netByCurrency(input.balanceReads).map((c) =>
    currencyRow(c.currency, c.minor, deps, strings),
  );

  const groups: WidgetGroupRow[] = merged
    .map((row) => ({ row, pos: groupPosition(row) }))
    // Settled and never-used groups carry no information on a glanceable
    // surface; they'd push live positions off the list.
    .filter(({ pos }) => pos.hasActivity && !pos.settled)
    .sort((a, b) => Math.abs(b.pos.minor) - Math.abs(a.pos.minor))
    .slice(0, MAX_WIDGET_GROUPS)
    .map(({ row, pos }) => ({
      serverUrl: row.serverUrl,
      groupId: row.group.id,
      name: row.group.name,
      currency: pos.currency,
      minor: pos.minor,
      direction: pos.direction,
      amountText: deps.formatAmount(Math.abs(pos.minor), pos.currency),
      mixedSigns: pos.mixedSigns,
      deepLink: groupLink(deps.scheme, row.serverUrl, row.group.id),
    }));

  // Mirrors the home screen's gate: the cross-currency aggregate is only
  // meaningful when a balance is actually held in a foreign currency.
  // Otherwise it restates the hero.
  const hasForeignBalance = input.balanceReads.some((r) =>
    (r.data ?? []).some((b) => b.currency !== input.homeCurrency),
  );
  const aggregated = aggregateMyNetReads(input.myNetReads, input.accountsTotal);
  const homeNet =
    aggregated && hasForeignBalance
      ? {
          ...currencyRow(input.homeCurrency, aggregated.minor, deps, strings),
          estimated: aggregated.skippedAccounts > 0 || aggregated.estimatedLegs > 0,
        }
      : null;

  // Only offer the shortcut if the group is still visible on some account —
  // the user may have left it, or removed the account it lived on.
  const last = input.lastActiveGroup;
  const shortcutVisible =
    last != null &&
    merged.some((m) => m.serverUrl === last.serverUrl && m.group.id === last.groupId);
  const shortcut = shortcutVisible
    ? {
        name: last.name,
        deepLink: groupLink(deps.scheme, last.serverUrl, last.groupId, 'add-expense'),
      }
    : null;

  const hasAnything = merged.length > 0 || currencies.length > 0;
  const state: WidgetState = hasAnything ? 'ok' : 'empty';

  return {
    ...envelope,
    state,
    partial,
    accountsTotal: input.accountsTotal,
    accountsOk,
    currencies,
    homeNet,
    groups,
    shortcut,
  };
}
