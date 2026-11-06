/**
 * Activity feed — aggregated across every linked server-account.
 *
 * Uses `useAggregatedActivity` (multi-account aware) and the per-row
 * `payload.snapshot` written by the backend so we can describe each
 * event without re-querying the underlying entity.
 *
 * Rendering rules:
 *   • Day-bucketed (Today / Yesterday / specific date).
 *   • One bone card per day; each row is an icon on the group's color, a
 *     short headline (activity.row.*, mapped in lib/activity-display.ts),
 *     a "group · time" meta line and the amount on the right.
 *   • Taps deep-link to:
 *       expense_* → /expenses/{server}/{entity_id}
 *       settlement_* → /groups/{server}/{group_id} (settlements list lives
 *         on the group screen — there's no dedicated settlement detail yet)
 *       group_* / member_* → /groups/{server}/{group_id}
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trans, useTranslation } from 'react-i18next';
import type { Icon } from 'phosphor-react-native';
// Per-icon paths: the package root pulls every icon in all six weights into the bundle.
import { Archive } from 'phosphor-react-native/src/icons/Archive';
import { ArrowCounterClockwise } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowsLeftRight } from 'phosphor-react-native/src/icons/ArrowsLeftRight';
import { DotsThree } from 'phosphor-react-native/src/icons/DotsThree';
import { Link } from 'phosphor-react-native/src/icons/Link';
import { PencilSimple } from 'phosphor-react-native/src/icons/PencilSimple';
import { Receipt } from 'phosphor-react-native/src/icons/Receipt';
import { Trash } from 'phosphor-react-native/src/icons/Trash';
import { UserPlus } from 'phosphor-react-native/src/icons/UserPlus';
import { UsersThree } from 'phosphor-react-native/src/icons/UsersThree';

import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { useAggregatedActivity } from '@/lib/aggregated-reads';
import { useAccounts } from '@/lib/accounts';
import {
  formatDate,
  formatTime,
  formatMinorUnits,
} from '@/lib/i18n';
import { ActivityEvent } from '@/lib/api';
import { activityDisplay, type ActivityIcon } from '@/lib/activity-display';
import { useGroupColor } from '@/lib/group-color';
import {
  contrastInkFor,
  displaySwatch,
  fontBody,
  fontBodyMedium,
  fontDisplay,
  fontMono,
  fontSize,
  spacing,
} from '@/lib/theme';
import { makeStyles, useColors, useTheme } from '@/lib/theme-context';

const ICON_DISC = 36;

const ICONS: Record<ActivityIcon, Icon> = {
  expense: Receipt,
  edit: PencilSimple,
  delete: Trash,
  settle: ArrowsLeftRight,
  revert: ArrowCounterClockwise,
  join: UserPlus,
  group: UsersThree,
  archive: Archive,
  link: Link,
  generic: DotsThree,
};

interface Row {
  event: ActivityEvent;
  serverUrl: string;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function ActivityScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Rows are aggregated across servers — "you" must be matched against the
  // user id of the account each row's event came from, not the default
  // account's user.
  const { accounts } = useAccounts();
  const userIdByServer = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.serverUrl] = a.user?.id ?? '';
    return m;
  }, [accounts]);
  const reads = useAggregatedActivity(50);
  const [refreshing, setRefreshing] = useState(false);

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [];
    for (const r of reads) {
      if (!r.data) continue;
      for (const event of r.data) {
        all.push({ event, serverUrl: r.serverUrl });
      }
    }
    // Newest first across servers. Each server already returns DESC; merge.
    all.sort(
      (a, b) =>
        new Date(b.event.created_at).getTime() -
        new Date(a.event.created_at).getTime(),
    );
    return all;
  }, [reads]);

  const loading = reads.some((r) => r.status === 'loading' && r.data == null);
  const allSettled =
    reads.length > 0 &&
    reads.every((r) => r.status === 'ok' || r.status === 'error' || r.status === 'idle');
  const isEmpty = allSettled && rows.length === 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // The aggregated hook auto-refreshes on focus; the spinner is a UX
    // cue so the user feels a pull-to-refresh "happened". Settle quickly.
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  // Day-bucket the merged rows.
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const buckets: { label: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.event.created_at);
    const label = isSameDay(d, today)
      ? t('activity.today')
      : isSameDay(d, yesterday)
      ? t('activity.yesterday')
      : formatDate(d);
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else buckets.push({ label, rows: [r] });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title={t('activity.title')} />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.graphite}
          />
        }
      >
        <ContentContainer>
          {loading && rows.length === 0 ? (
            <Text style={styles.loading}>{t('activity.loading')}</Text>
          ) : null}

          {isEmpty ? (
            <EmptyState
              title={t('activity.emptyTitle')}
              body={t('activity.emptyBody')}
              icon="list"
            />
          ) : null}

          {buckets.map((b) => (
            <View key={b.label}>
              <Text style={styles.dayLabel} accessibilityRole="header">
                {b.label}
              </Text>
              <View style={styles.dayCard}>
                {b.rows.map((r, i) => (
                  <React.Fragment key={r.event.id}>
                    {i > 0 && <View style={styles.rowRule} />}
                    <ActivityRow row={r} youUserId={userIdByServer[r.serverUrl] ?? ''} />
                  </React.Fragment>
                ))}
              </View>
            </View>
          ))}

          <View style={{ height: insets.bottom + 24 }} />
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

function ActivityRow({ row, youUserId }: { row: Row; youUserId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const { event, serverUrl } = row;
  const display = activityDisplay(event);
  const actor =
    event.actor_id === youUserId ? t('activity.you') : event.actor_name || t('common.dash');
  const meta = [event.group_name, formatTime(new Date(event.created_at))]
    .filter(Boolean)
    .join(' · ');
  const groupFill = displaySwatch(useGroupColor(serverUrl, event.group_id), scheme);
  // Housekeeping sits back: a neutral disc and muted text.
  const fill = display.quiet ? colors.paper : groupFill;
  const RowIcon = ICONS[display.icon];
  const target = resolveActivityTarget(event, serverUrl);
  const Wrapper: any = target ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.row}
      activeOpacity={target ? 0.6 : 1}
      onPress={target ? () => router.push(target as any) : undefined}
      accessibilityRole={target ? 'button' : undefined}
    >
      <View style={[styles.iconDisc, { backgroundColor: fill }]}>
        <RowIcon size={18} color={display.quiet ? colors.lead : contrastInkFor(fill)} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.headline, display.quiet && styles.headlineQuiet]} numberOfLines={2}>
          <Trans
            i18nKey={display.headlineKey}
            values={{ actor, to: t('common.dash'), ...display.params }}
            components={{ b: <Text style={styles.headlineActor} /> }}
          />
        </Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {display.amount && (
        <Text style={styles.amount}>
          {formatMinorUnits(display.amount.minor, display.amount.currency)}
        </Text>
      )}
    </Wrapper>
  );
}

/**
 * Where each activity row should deep-link to when tapped. Returns `null`
 * when there's no useful destination (e.g. a deleted expense — the detail
 * page would 404).
 *
 *   expense_added / expense_edited / expense_updated → expense detail
 *   expense_deleted                                  → group overview
 *                                                      (expense is gone)
 *   settlement_added / settlement_reverted           → group → payments tab
 *   member_joined                                    → group → standings tab
 *                                                      (where members live)
 *   group_* / invite_link_rotated                    → group overview
 */
function resolveActivityTarget(
  event: ActivityEvent,
  serverUrl: string,
):
  | { pathname: string; params: Record<string, string> }
  | null {
  const enc = encodeURIComponent(serverUrl);
  const groupHref = {
    pathname: '/groups/[server]/[id]',
    params: { server: enc, id: event.group_id },
  };
  switch (event.event_type) {
    case 'expense_added':
    case 'expense_edited':
    case 'expense_updated':
      if (event.entity_id) {
        return {
          pathname: '/expenses/[server]/[id]',
          params: { server: enc, id: event.entity_id, groupId: event.group_id },
        };
      }
      return groupHref;
    case 'expense_deleted':
      // The expense is gone — sending the user to a 404 is hostile. Drop
      // them on the group instead.
      return groupHref;
    case 'settlement_added':
    case 'settlement_reverted':
      return { ...groupHref, params: { ...groupHref.params, tab: 'payments' } };
    case 'member_joined':
      return { ...groupHref, params: { ...groupHref.params, tab: 'standings' } };
    case 'group_created':
    case 'group_updated':
    case 'group_archived':
    case 'invite_link_rotated':
      return groupHref;
    default:
      return groupHref;
  }
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  loading: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    padding: spacing.s5,
  },
  dayLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.caption,
    color: colors.lead,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s2,
  },
  dayCard: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
  },
  // Inset past the icon so the rule reads as part of the text column.
  rowRule: {
    height: 1,
    backgroundColor: colors.ruleSoft,
    marginLeft: spacing.s3 + ICON_DISC + spacing.s3,
  },
  iconDisc: {
    width: ICON_DISC,
    height: ICON_DISC,
    borderRadius: ICON_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  headline: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    lineHeight: 20,
    color: colors.graphite,
  },
  headlineQuiet: { color: colors.lead },
  headlineActor: { fontFamily: fontDisplay },
  meta: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
  },
  amount: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
}));
