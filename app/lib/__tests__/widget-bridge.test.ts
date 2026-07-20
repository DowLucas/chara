/**
 * The bridge is the only place that talks to the native widget module.
 *
 * Two behaviours are load-bearing: it must never let a widget failure break
 * the app (the widget is decoration; the app is not), and it must not fire a
 * native reload on every render — the OS budgets widget refreshes, and the
 * home screen re-renders far more often than balances change.
 */

const setSnapshot = jest.fn(async (_json: string) => undefined);
const clearSnapshot = jest.fn(async () => undefined);

let moduleAvailable = true;

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () =>
    moduleAvailable ? { setSnapshot, clearSnapshot } : null,
}));

import type { WidgetSnapshot } from '../widget-snapshot-types';
import {
  __resetWidgetBridgeForTests,
  clearWidgetSnapshot,
  isWidgetBridgeAvailable,
  writeWidgetSnapshot,
} from '../widget-bridge';

function snapshot(over: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    version: 1,
    generatedAt: '2026-07-20T12:00:00.000Z',
    updatedAtText: '14:00',
    locale: 'sv-SE',
    language: 'sv',
    homeCurrency: 'SEK',
    state: 'ok',
    partial: false,
    accountsTotal: 1,
    accountsOk: 1,
    currencies: [],
    homeNet: null,
    groups: [],
    shortcut: null,
    strings: {
      youOwe: 'You owe',
      youreOwed: "You're owed",
      allSettled: 'All settled up',
      netBalance: 'net balance',
      openChara: 'Open Chara',
      signedOut: 'Sign in',
      noGroups: 'No groups yet',
      partialNotice: 'Some accounts unreachable',
      mixedSignsLabel: 'Mixed balances',
      addExpense: 'Add expense',
    },
    ...over,
  };
}

beforeEach(() => {
  moduleAvailable = true;
  setSnapshot.mockClear();
  clearSnapshot.mockClear();
  setSnapshot.mockImplementation(async (_json: string) => undefined);
  __resetWidgetBridgeForTests();
});

describe('writeWidgetSnapshot', () => {
  it('serializes the snapshot to the native module', async () => {
    await writeWidgetSnapshot(snapshot());
    expect(setSnapshot).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(setSnapshot.mock.calls[0][0]);
    expect(parsed.version).toBe(1);
    expect(parsed.homeCurrency).toBe('SEK');
  });

  it('skips a redundant write when only the timestamp moved', async () => {
    await writeWidgetSnapshot(snapshot());
    await writeWidgetSnapshot(
      snapshot({ generatedAt: '2026-07-20T13:00:00.000Z', updatedAtText: '15:00' }),
    );
    expect(setSnapshot).toHaveBeenCalledTimes(1);
  });

  it('writes again when the data actually changed', async () => {
    await writeWidgetSnapshot(snapshot());
    await writeWidgetSnapshot(snapshot({ partial: true }));
    expect(setSnapshot).toHaveBeenCalledTimes(2);
  });

  it('never throws when the native side rejects', async () => {
    setSnapshot.mockImplementation(async () => {
      throw new Error('app group unavailable');
    });
    await expect(writeWidgetSnapshot(snapshot())).resolves.toBeUndefined();
  });

  it('retries after a failed write rather than caching the failure', async () => {
    setSnapshot.mockImplementationOnce(async () => {
      throw new Error('transient');
    });
    await writeWidgetSnapshot(snapshot());
    await writeWidgetSnapshot(snapshot());
    expect(setSnapshot).toHaveBeenCalledTimes(2);
  });

  it('no-ops when the native module is absent', async () => {
    moduleAvailable = false;
    await expect(writeWidgetSnapshot(snapshot())).resolves.toBeUndefined();
    expect(setSnapshot).not.toHaveBeenCalled();
  });
});

describe('clearWidgetSnapshot', () => {
  it('delegates to the native module', async () => {
    await clearWidgetSnapshot();
    expect(clearSnapshot).toHaveBeenCalledTimes(1);
  });

  it('forgets the dedup cache so the next write always lands', async () => {
    await writeWidgetSnapshot(snapshot());
    await clearWidgetSnapshot();
    await writeWidgetSnapshot(snapshot());
    expect(setSnapshot).toHaveBeenCalledTimes(2);
  });

  it('never throws when the native side rejects', async () => {
    clearSnapshot.mockImplementation(async () => {
      throw new Error('nope');
    });
    await expect(clearWidgetSnapshot()).resolves.toBeUndefined();
  });
});

describe('isWidgetBridgeAvailable', () => {
  it('reflects native module presence', () => {
    expect(isWidgetBridgeAvailable()).toBe(true);
    moduleAvailable = false;
    expect(isWidgetBridgeAvailable()).toBe(false);
  });
});
