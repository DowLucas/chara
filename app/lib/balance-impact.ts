/**
 * Pure function that computes the per-member balance impact of editing (or
 * soft-deleting) an expense. See
 * `docs/superpowers/specs/2026-05-23-edit-expense-design.md`, section
 * "Settlement-impact pure function".
 *
 * - No I/O, no React, no networking.
 * - All amounts internally are int64 minor units (`bigint`).
 * - Deltas are computed in the *new* currency only. Old-currency balances
 *   are unaffected when the user changes currency.
 * - Settlements are never modified by an edit; they're surfaced informationally
 *   in `affectedSettlements`.
 */

import type { Expense, ExpenseSplit, GroupMember, Settlement } from './api';
import { computeSplits } from './split';

export type MemberDelta = {
  memberId: string;
  displayName: string;
  prevNetMinor: bigint;
  newNetMinor: bigint;
  /** newNetMinor - prevNetMinor */
  deltaMinor: bigint;
};

export type ImpactInput = {
  /** Expense state before the edit. */
  expense: Expense;
  /** Current splits on the expense as returned by the backend. */
  currentSplits: ExpenseSplit[];
  newAmountMinor: bigint;
  newPayerId: string;
  newSplitMethod: 'equal' | 'exact' | 'percentage';
  newParticipants: string[];
  /** Required when `newSplitMethod` is `exact`. */
  newSplits?: { memberId: string; amountMinor: bigint }[];
  /** All members of the group (used to resolve display names). */
  members: GroupMember[];
  /** All settlements for the group, including reverted ones. */
  settlements: Settlement[];
};

export type ImpactResult = {
  /** Members whose net contribution changed, sorted by display name asc. */
  deltas: MemberDelta[];
  /** Post-expense, non-reverted, same-currency settlements involving at least
   *  one changed member. Informational only. */
  affectedSettlements: Settlement[];
  /** The currency in which deltas are denominated (new expense currency). */
  newCurrency: string;
};

/**
 * Wire-format decimal string → minor units (bigint). Two decimal places.
 * Project standard: never use floats for money.
 */
function decimalToMinorBig(s: string): bigint {
  const trimmed = s.trim();
  if (!trimmed) return 0n;
  const neg = trimmed.startsWith('-');
  const body = neg ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const v = BigInt(intPart || '0') * 100n + BigInt(frac || '0');
  return neg ? -v : v;
}

/**
 * Compute net per-member contribution for an expense:
 *   net = (this member paid) - (this member's share)
 *
 * A positive net means the group owes this member; negative means they owe.
 */
function computeNets(
  amountMinor: bigint,
  payerId: string,
  shares: Map<string, bigint>,
): Map<string, bigint> {
  const nets = new Map<string, bigint>();
  for (const [memberId, share] of shares) {
    const paid = memberId === payerId ? amountMinor : 0n;
    nets.set(memberId, paid - share);
  }
  // Ensure the payer is represented even if they don't have a share
  if (!nets.has(payerId) && amountMinor !== 0n) {
    nets.set(payerId, amountMinor);
  }
  return nets;
}

/**
 * Computes the per-member balance delta produced by editing (or deleting) an
 * expense, plus the list of post-expense settlements that touch any changed
 * member.
 *
 * **Delete-mode parameterisation:** when `newAmountMinor === 0n` AND
 * `newParticipants.length === 0`, this function treats the edit as
 * "all current shares zeroed" — matching the backend's soft-delete semantics
 * (`member_balances` view filters `NOT e.is_deleted`).
 *
 * Settlements filter:
 *   currency === newCurrency
 *   && created_at > expense.created_at
 *   && reverted_at == null
 *   && (changedMemberIds includes from_member_id OR to_member_id)
 *
 * Output `deltas` is sorted by display name ascending (ties broken by
 * member id). Members whose net is unchanged are omitted.
 */
export function computeBalanceImpact(input: ImpactInput): ImpactResult {
  const {
    expense,
    currentSplits,
    newAmountMinor,
    newPayerId,
    newSplitMethod,
    newParticipants,
    newSplits,
    members,
    settlements,
  } = input;

  // -------- previous nets --------
  const prevAmountMinor = decimalToMinorBig(expense.amount);
  const prevSharesMap = new Map<string, bigint>();
  for (const s of currentSplits) {
    prevSharesMap.set(s.member_id, decimalToMinorBig(s.share));
  }
  const prevNets = computeNets(prevAmountMinor, expense.paid_by_id, prevSharesMap);

  // -------- new nets --------
  // Delete-mode: zero everything. We model this as "new payer paid 0, every
  // current participant has share 0", which collapses every net to 0.
  const isDelete = newAmountMinor === 0n && newParticipants.length === 0;

  let newSharesMap: Map<string, bigint>;
  if (isDelete) {
    newSharesMap = new Map();
    for (const id of prevSharesMap.keys()) {
      newSharesMap.set(id, 0n);
    }
  } else {
    const computed = computeSplits(
      newAmountMinor,
      newSplitMethod,
      newParticipants,
      newSplits,
    );
    newSharesMap = new Map(computed.map((s) => [s.memberId, s.amountMinor]));
  }
  const effectiveNewAmount = isDelete ? 0n : newAmountMinor;
  const effectiveNewPayer = isDelete ? expense.paid_by_id : newPayerId;
  const newNets = computeNets(effectiveNewAmount, effectiveNewPayer, newSharesMap);

  // -------- build deltas --------
  const allMemberIds = new Set<string>([
    ...prevNets.keys(),
    ...newNets.keys(),
  ]);
  const displayName = (id: string): string =>
    members.find((m) => m.id === id)?.name ?? id;

  const deltas: MemberDelta[] = [];
  for (const id of allMemberIds) {
    const prev = prevNets.get(id) ?? 0n;
    const next = newNets.get(id) ?? 0n;
    if (prev === next) continue;
    deltas.push({
      memberId: id,
      displayName: displayName(id),
      prevNetMinor: prev,
      newNetMinor: next,
      deltaMinor: next - prev,
    });
  }

  // Stable sort by display name, ties broken by member id.
  deltas.sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName);
    if (byName !== 0) return byName;
    return a.memberId.localeCompare(b.memberId);
  });

  // -------- affected settlements --------
  const newCurrency = expense.currency;
  const changedIds = new Set(deltas.map((d) => d.memberId));
  const expCreatedAt = expense.created_at;

  const affectedSettlements = settlements.filter((s) => {
    if (s.currency !== newCurrency) return false;
    if (s.reverted_at != null) return false;
    if (!(s.created_at > expCreatedAt)) return false;
    return changedIds.has(s.from_member_id) || changedIds.has(s.to_member_id);
  });

  return { deltas, affectedSettlements, newCurrency };
}
