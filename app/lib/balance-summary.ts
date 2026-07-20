/**
 * Pure balance aggregation shared by the home screen and the homescreen-widget
 * snapshot builder.
 *
 * Extracted verbatim from `app/(tabs)/index.tsx` so both surfaces compute
 * positions with the same code. The mixed-sign rule below is the reason this
 * is shared rather than reimplemented: a widget that collapsed currencies
 * would confidently render "+€100" for someone who still owes $30.
 *
 * Hook-free by design — input types are structural subsets of
 * `AccountRead<T>` (see `aggregate-mynet.ts` for the same pattern), so this
 * module never imports React or react-native and stays unit-testable.
 */

import type { Group, MyBalance } from './api';
import { decimalToMinor } from './money-utils';

/** Structural subset of `AccountRead<T>` from `aggregated-reads.ts`. */
export interface Read<T> {
  serverUrl: string;
  data: T | null;
}

export interface CurrencyNet {
  currency: string;
  minor: number;
}

/**
 * Per-currency net totals across every account, sorted by absolute value.
 *
 * Never sums across currencies — that's what `aggregateMyNetReads` is for,
 * and only because the server locks in historical FX.
 */
export function netByCurrency(reads: Read<MyBalance[]>[]): CurrencyNet[] {
  const totals = new Map<string, number>();
  for (const br of reads) {
    for (const b of br.data ?? []) {
      totals.set(b.currency, (totals.get(b.currency) ?? 0) + decimalToMinor(b.net_balance));
    }
  }
  return [...totals.entries()]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor));
}

export interface MergedGroup {
  group: Group;
  serverUrl: string;
  /** Every per-currency balance row for this group. Never collapsed. */
  balances: MyBalance[];
}

/**
 * Join groups to their balance rows on the composite `(serverUrl, groupId)`
 * identity. A bare group id is never sufficient — two linked servers can
 * legitimately issue the same id.
 *
 * Ordering is left to the caller: the home screen floats pinned groups, the
 * widget sorts by absolute balance.
 */
export function mergeGroupsWithBalances(
  groupReads: Read<Group[]>[],
  balanceReads: Read<MyBalance[]>[],
): MergedGroup[] {
  const balancesByKey = new Map<string, MyBalance[]>();
  for (const br of balanceReads) {
    for (const b of br.data ?? []) {
      const key = `${br.serverUrl}::${b.group_id}`;
      const list = balancesByKey.get(key);
      if (list) list.push(b);
      else balancesByKey.set(key, [b]);
    }
  }
  const rows: MergedGroup[] = [];
  for (const gr of groupReads) {
    for (const g of gr.data ?? []) {
      rows.push({
        group: g,
        serverUrl: gr.serverUrl,
        balances: balancesByKey.get(`${gr.serverUrl}::${g.id}`) ?? [],
      });
    }
  }
  return rows;
}

export type BalanceDirection = 'owe' | 'owed' | 'settled';

export interface GroupPosition {
  /** Largest-absolute row; null when the group has no balance rows. */
  dominant: MyBalance | null;
  /** Minor units of `dominant`, 0 when there is no activity. */
  minor: number;
  /** `dominant.currency`, falling back to the group's own currency. */
  currency: string;
  hasActivity: boolean;
  settled: boolean;
  /**
   * Opposing signs across currencies in the same group. The dominant row
   * hides debt (or credit) in another currency, so the headline alone lies.
   * Both surfaces must render an affordance when this is true.
   */
  mixedSigns: boolean;
  direction: BalanceDirection;
}

export function groupPosition(row: MergedGroup): GroupPosition {
  const { balances, group } = row;
  const hasActivity = balances.length > 0;
  // Dominant currency: largest absolute net wins. Ties break on the server's
  // row order, which is deterministic (returned by currency).
  const dominant = hasActivity
    ? [...balances].sort(
        (a, b) =>
          Math.abs(decimalToMinor(b.net_balance)) - Math.abs(decimalToMinor(a.net_balance)),
      )[0]
    : null;
  const minor = dominant ? decimalToMinor(dominant.net_balance) : 0;
  const settled = hasActivity && balances.every((b) => decimalToMinor(b.net_balance) === 0);
  const hasPositive = balances.some((b) => decimalToMinor(b.net_balance) > 0);
  const hasNegative = balances.some((b) => decimalToMinor(b.net_balance) < 0);
  return {
    dominant,
    minor,
    currency: dominant?.currency ?? group.currency,
    hasActivity,
    settled,
    mixedSigns: hasPositive && hasNegative,
    direction: minor > 0 ? 'owed' : minor < 0 ? 'owe' : 'settled',
  };
}
