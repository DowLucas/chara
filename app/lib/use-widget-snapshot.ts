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

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import type { Group, MyBalance, MyNetResponse } from './api';
import type { Read } from './balance-summary';
import { currentLocale, formatMinorUnits, formatMinorUnitsCompact, formatTime } from './i18n';
import { getLastActiveGroup } from './preferences';
import { writeWidgetSnapshot } from './widget-bridge';
import { buildWidgetSnapshot } from './widget-snapshot';

// The app's own URL scheme, baked into the config at build time: `chara` in
// production, `charadev` on the dev variant. Widget deep links must carry the
// scheme of the build that wrote the snapshot, or the OS can't route the tap.
const rawScheme = Constants.expoConfig?.scheme;
const APP_SCHEME = (Array.isArray(rawScheme) ? rawScheme[0] : rawScheme) ?? 'chara';

export interface WidgetSnapshotInput {
  accountsTotal: number;
  homeCurrency: string;
  groupReads: Read<Group[]>[];
  balanceReads: Read<MyBalance[]>[];
  myNetReads: Read<MyNetResponse>[];
}

export function useWidgetSnapshot(input: WidgetSnapshotInput): void {
  const { t, i18n } = useTranslation();

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
      // Keep null (errored / not-yet-resolved account) distinct from [] (resolved,
      // genuinely no balances). Collapsing both to [] meant a recovery from
      // partial-data back to complete never changed the digest, so the widget
      // kept its stale "some accounts couldn't be reached" marker forever.
      r.data === null ? null : r.data.map((x) => [x.group_id, x.currency, x.net_balance]),
    ]),
    n: input.myNetReads.map((r) => [r.serverUrl, r.data?.net_minor ?? null]),
  });

  useEffect(() => {
    let cancelled = false;
    // Re-read the last-active group on every rebuild, not once at mount: the
    // Home tab stays mounted while the user opens group screens, so a mount-only
    // read would freeze the "+" shortcut target at whatever it was when Home
    // first loaded and never pick up a group opened afterwards.
    void getLastActiveGroup().then((lastActiveGroup) => {
      if (cancelled) return;
      const snapshot = buildWidgetSnapshot(
        { ...latest.current, lastActiveGroup },
        {
          scheme: APP_SCHEME,
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
    });
    return () => {
      cancelled = true;
    };
  }, [digest, i18n.language, t]);
}
