const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

import {
  PENDING_SWISH_TTL_MS,
  clearPendingSwish,
  resolvePendingSwish,
  runPendingSwishRecovery,
  savePendingSwish,
  type PendingSwish,
  type RecoveryDeps,
} from '../pending-swish';

const NOW = 1_800_000_000_000;
const SERVER = 'https://api.chara.example';

function pending(overrides: Partial<PendingSwish> = {}): PendingSwish {
  return {
    serverUrl: SERVER,
    groupId: 'g1',
    groupName: 'Stugan',
    fromMemberId: 'm-me',
    toMemberId: 'm-anna',
    payeeName: 'Anna',
    amount: '240.50',
    currency: 'SEK',
    settlementId: '01JABCDEFGHJKMNPQRSTVWXYZ0',
    startedAt: NOW - 60_000,
    ...overrides,
  };
}

const okAccounts = [{ serverUrl: SERVER }];

beforeEach(() => {
  store.clear();
});

describe('resolvePendingSwish', () => {
  it('is none when nothing is stored', () => {
    expect(resolvePendingSwish(null, okAccounts, NOW)).toEqual({ kind: 'none' });
  });

  it('drops a malformed record', () => {
    expect(resolvePendingSwish('{not json', okAccounts, NOW)).toEqual({ kind: 'drop' });
    expect(resolvePendingSwish(JSON.stringify({ groupId: 'g1' }), okAccounts, NOW)).toEqual({
      kind: 'drop',
    });
  });

  it('drops a record older than the TTL', () => {
    const raw = JSON.stringify(pending({ startedAt: NOW - PENDING_SWISH_TTL_MS - 1 }));
    expect(resolvePendingSwish(raw, okAccounts, NOW)).toEqual({ kind: 'drop' });
  });

  it('drops a record for a server the user is no longer signed into', () => {
    const raw = JSON.stringify(pending());
    expect(resolvePendingSwish(raw, [{ serverUrl: 'https://other.example' }], NOW)).toEqual({
      kind: 'drop',
    });
  });

  it('waits (keeps the record) while that account needs reauth or is incompatible', () => {
    const raw = JSON.stringify(pending());
    expect(
      resolvePendingSwish(raw, [{ serverUrl: SERVER, status: 'reauth_required' }], NOW),
    ).toEqual({ kind: 'wait' });
    expect(
      resolvePendingSwish(raw, [{ serverUrl: SERVER, status: 'incompatible' }], NOW),
    ).toEqual({ kind: 'wait' });
  });

  it('prompts for a fresh record on a signed-in server', () => {
    const p = pending();
    expect(resolvePendingSwish(JSON.stringify(p), okAccounts, NOW)).toEqual({
      kind: 'prompt',
      pending: p,
    });
  });
});

describe('runPendingSwishRecovery', () => {
  function deps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps & {
    settle: jest.Mock;
    ask: jest.Mock;
    navigateToGroup: jest.Mock;
    notifyError: jest.Mock;
    track: jest.Mock;
  } {
    return {
      accounts: okAccounts,
      now: NOW,
      ask: jest.fn(async () => 'yes' as const),
      settle: jest.fn(async () => {}),
      navigateToGroup: jest.fn(),
      notifyError: jest.fn(),
      track: jest.fn(),
      ...overrides,
    } as never;
  }

  it('does nothing when no Swish payment is pending', async () => {
    const d = deps();
    await runPendingSwishRecovery(d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });

  it('on "yes" records the settlement under the original id, clears it and opens the group', async () => {
    const p = pending();
    await savePendingSwish(p);
    const d = deps();
    await runPendingSwishRecovery(d);

    expect(d.ask).toHaveBeenCalledWith(p);
    expect(d.settle).toHaveBeenCalledWith(SERVER, 'g1', {
      id: p.settlementId,
      from_member_id: 'm-me',
      to_member_id: 'm-anna',
      amount: '240.50',
      currency: 'SEK',
      method: 'swish',
    });
    expect(d.navigateToGroup).toHaveBeenCalledWith(SERVER, 'g1');
    expect(d.track).toHaveBeenCalledWith('swish_confirmed', { source: 'recovery' });
    expect(store.size).toBe(0);
  });

  it('on "no" clears without recording', async () => {
    await savePendingSwish(pending());
    const d = deps({ ask: jest.fn(async () => 'no' as const) });
    await runPendingSwishRecovery(d);
    expect(d.settle).not.toHaveBeenCalled();
    expect(d.track).toHaveBeenCalledWith('swish_recovery_declined', {});
    expect(store.size).toBe(0);
  });

  it('keeps the record when the prompt is dismissed without an answer', async () => {
    await savePendingSwish(pending());
    const d = deps({ ask: jest.fn(async () => null) });
    await runPendingSwishRecovery(d);
    expect(d.settle).not.toHaveBeenCalled();
    expect(store.size).toBe(1);
  });

  it('clears and reports when recording fails, so a later prompt cannot double-record', async () => {
    await savePendingSwish(pending());
    const err = new Error('network down');
    const d = deps({ settle: jest.fn(async () => { throw err; }) });
    await runPendingSwishRecovery(d);
    expect(d.notifyError).toHaveBeenCalledWith(err);
    expect(d.navigateToGroup).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('removes an expired record without asking', async () => {
    await savePendingSwish(pending({ startedAt: NOW - PENDING_SWISH_TTL_MS - 1 }));
    const d = deps();
    await runPendingSwishRecovery(d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('keeps the record without asking while the account needs reauth', async () => {
    await savePendingSwish(pending());
    const d = deps({ accounts: [{ serverUrl: SERVER, status: 'reauth_required' }] });
    await runPendingSwishRecovery(d);
    expect(d.ask).not.toHaveBeenCalled();
    expect(store.size).toBe(1);
  });

  it('clearPendingSwish removes the record', async () => {
    await savePendingSwish(pending());
    await clearPendingSwish();
    expect(store.size).toBe(0);
  });
});
