/**
 * Tests for SettlementImpactSheet — focused on the pure helper logic that
 * shapes the sheet's content (per-member row ordering, settlements
 * truncation, mode-specific copy, button enablement).
 *
 * The repo doesn't ship `@testing-library/react-native` (intentionally — see
 * `package.json`), so we test the pure helper surface that the component
 * delegates to. The component itself is a thin presentation layer over
 * these helpers; render-time bugs in JSX are surfaced by the integration
 * smoke test in `app/__tests__/edit-expense.test.tsx`.
 *
 * Spec §8.3 bullets covered below in matching order.
 */

import {
  deltaCopy,
  sortDeltasForDisplay,
  truncateSettlements,
} from '../../lib/edit-expense-flow';
import { settlementImpactSheetCopy } from '../SettlementImpactSheet.helpers';

import type { MemberDelta } from '../../lib/balance-impact';

function delta(
  id: string,
  name: string,
  prev: bigint,
  next: bigint,
): MemberDelta {
  return {
    memberId: id,
    displayName: name,
    prevNetMinor: prev,
    newNetMinor: next,
    deltaMinor: next - prev,
  };
}

describe('SettlementImpactSheet — per-member rows', () => {
  it('renders one row per affected member in stable name order', () => {
    const deltas = [
      delta('m3', 'Charlie', 0n, -1000n),
      delta('m1', 'Alice', -500n, 500n),
      delta('m2', 'Bob', 500n, 0n),
    ];
    const sorted = sortDeltasForDisplay(deltas);
    expect(sorted.map((d) => d.displayName)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('preserves stable order when input is already sorted', () => {
    const deltas = [
      delta('a', 'Anna', 0n, -100n),
      delta('b', 'Beata', 0n, -100n),
    ];
    expect(sortDeltasForDisplay(deltas).map((d) => d.memberId)).toEqual(['a', 'b']);
  });

  it('caller is responsible for omitting unchanged rows (deltas only contain changed members)', () => {
    // Sanity: this is enforced by computeBalanceImpact (pure-functions agent),
    // not by the sheet. The sheet trusts its input. We assert that helper
    // logic doesn't *re-add* zero-delta members here.
    const deltas = [delta('a', 'Anna', 0n, -100n)];
    expect(sortDeltasForDisplay(deltas)).toHaveLength(1);
  });
});

describe('SettlementImpactSheet — affected settlements list', () => {
  it('shows all rows when there are 5 or fewer', () => {
    const settlements = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}` }));
    const { visible, overflow } = truncateSettlements(settlements);
    expect(visible).toHaveLength(4);
    expect(overflow).toBe(0);
  });

  it('renders +N more when more than 5 affected settlements', () => {
    const settlements = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }));
    const { visible, overflow } = truncateSettlements(settlements);
    expect(visible).toHaveLength(5);
    expect(overflow).toBe(4);
  });

  it('returns empty visible + zero overflow when no settlements', () => {
    const { visible, overflow } = truncateSettlements([]);
    expect(visible).toEqual([]);
    expect(overflow).toBe(0);
  });
});

describe('SettlementImpactSheet — delta copy and colour coding', () => {
  it('labels a previously-creditor → still-creditor row with was/now owed', () => {
    const c = deltaCopy(delta('a', 'Anna', 1000n, 1500n));
    expect(c.prevKey).toBe('impactSheet.wasOwed');
    expect(c.newKey).toBe('impactSheet.nowOwed');
    expect(c.improved).toBe(true);
  });

  it('labels a debtor → debtor row with owed/now-owes', () => {
    const c = deltaCopy(delta('a', 'Anna', -1500n, -500n));
    expect(c.prevKey).toBe('impactSheet.wasOwes');
    expect(c.newKey).toBe('impactSheet.nowOwes');
    expect(c.improved).toBe(true); // less debt = better
  });

  it('handles a sign flip (creditor → debtor) by combining was-owed + now-owes', () => {
    const c = deltaCopy(delta('a', 'Anna', 500n, -500n));
    expect(c.prevKey).toBe('impactSheet.wasOwed');
    expect(c.newKey).toBe('impactSheet.nowOwes');
    expect(c.improved).toBe(false);
  });

  it('uses absolute values for display', () => {
    const c = deltaCopy(delta('a', 'Anna', -1500n, 500n));
    expect(c.prevAbsMinor).toBe(1500n);
    expect(c.newAbsMinor).toBe(500n);
    expect(c.improved).toBe(true);
  });
});

describe('SettlementImpactSheet — title and primary action', () => {
  it('renders edit-mode title and Save changes primary action', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 0,
      memberCount: 2,
    });
    expect(copy.titleKey).toBe('impactSheet.title.edit');
    expect(copy.primaryKey).toBe('impactSheet.save');
    expect(copy.primaryDestructive).toBe(false);
  });

  it('renders delete-mode title and red Delete expense primary action', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'delete',
      affectedSettlementsCount: 2,
      memberCount: 3,
    });
    expect(copy.titleKey).toBe('impactSheet.title.delete');
    expect(copy.primaryKey).toBe('impactSheet.delete');
    expect(copy.primaryDestructive).toBe(true);
  });

  it('chooses the with-settlements lead copy when settlements exist', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 1,
      memberCount: 2,
    });
    expect(copy.leadKey).toBe('impactSheet.lead.withSettlements');
  });

  it('chooses the plain lead copy when no settlements are affected', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 0,
      memberCount: 3,
    });
    expect(copy.leadKey).toBe('impactSheet.lead.plain');
    expect(copy.leadParams).toEqual({ count: 3 });
  });

  it('uses delete-specific plain lead in delete mode without settlements', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'delete',
      affectedSettlementsCount: 0,
      memberCount: 4,
    });
    expect(copy.leadKey).toBe('impactSheet.lead.deletePlain');
    expect(copy.leadParams).toEqual({ count: 4 });
  });
});

describe('SettlementImpactSheet — submitting + error state', () => {
  it('disables the primary action while submitting', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 1,
      memberCount: 2,
      submitting: true,
    });
    expect(copy.primaryDisabled).toBe(true);
  });

  it('shows an inline error when error is set', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 0,
      memberCount: 1,
      error: 'boom',
    });
    expect(copy.errorVisible).toBe(true);
  });

  it('omits the error banner when error is null', () => {
    const copy = settlementImpactSheetCopy({
      mode: 'edit',
      affectedSettlementsCount: 0,
      memberCount: 1,
      error: null,
    });
    expect(copy.errorVisible).toBe(false);
  });
});
