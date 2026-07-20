/**
 * Keeps the homescreen widgets in sync with the home screen.
 *
 * Deliberately a passive consumer of reads the home screen already performs,
 * rather than a fetcher of its own. That inherits every existing refresh
 * trigger (mount, account change, AppState-active, focus, the imperative
 * refresh bus) without adding a second refresh path — and guarantees the
 * widget can only ever show what the home hero showed.
 *
 * Consequence, by design: if the user cold-launches straight into a
 * deep-linked group and never lands on Home, the snapshot isn't rewritten
 * that session. That is exactly the foreground-only freshness contract; the
 * widget carries an "as of" stamp so old data never reads as current.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Group, MyBalance, MyNetResponse } from './api';
import type { Read } from './balance-summary';
import { currentLocale, formatMinorUnits, formatMinorUnitsCompact, formatTime } from './i18n';
import { getLastActiveGroup, type LastActiveGroupRef } from './preferences';
import { writeWidgetSnapshot } from './widget-bridge';
import { buildWidgetSnapshot } from './widget-snapshot';

export interface WidgetSnapshotInput {
  accountsTotal: number;
  homeCurrency: string;
  groupReads: Read<Group[]>[];
  balanceReads: Read<MyBalance[]>[];
  myNetReads: Read<MyNetResponse>[];
}

export function useWidgetSnapshot(input: WidgetSnapshotInput): void {
  const { t, i18n } = useTranslation();
  const [lastActiveGroup, setLastActiveGroup] = useState<LastActiveGroupRef | null>(null);

  // Read once per mount; the shortcut target only needs to be current as of
  // the session, and re-reading SecureStore on every refresh is wasteful.
  useEffect(() => {
    let cancelled = false;
    void getLastActiveGroup().then((ref) => {
      if (!cancelled) setLastActiveGroup(ref);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deps are read through a ref so the effect can depend on a cheap identity
  // digest rather than on array literals that are new on every render.
  const latest = useRef(input);
  latest.current = input;

  const digest = JSON.stringify({
    a: input.accountsTotal,
    h: input.homeCurrency,
    g: input.groupReads.map((r) => [r.serverUrl, r.data?.length ?? -1]),
    b: input.balanceReads.map((r) => [
      r.serverUrl,
      (r.data ?? []).map((x) => [x.group_id, x.currency, x.net_balance]),
    ]),
    n: input.myNetReads.map((r) => [r.serverUrl, r.data?.net_minor ?? null]),
  });

  useEffect(() => {
    const snapshot = buildWidgetSnapshot(
      { ...latest.current, lastActiveGroup },
      {
        t: (key) => t(key),
        formatAmount: (minor, currency) => formatMinorUnits(minor, currency),
        formatAmountCompact: (minor, currency) => formatMinorUnitsCompact(minor, currency),
        formatTime: (d) => formatTime(d),
        locale: currentLocale(),
        language: i18n.language,
        now: () => new Date(),
      },
    );
    void writeWidgetSnapshot(snapshot);
  }, [digest, lastActiveGroup, i18n.language, t]);
}
