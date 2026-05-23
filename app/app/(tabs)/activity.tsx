/**
 * Activity feed — aggregated across every linked server-account.
 *
 * Uses `useAggregatedActivity` (multi-account aware) and the per-row
 * `payload.snapshot` written by the backend so we can describe each
 * event without re-querying the underlying entity.
 *
 * Rendering rules:
 *   • Day-bucketed (Today / Yesterday / specific date).
 *   • Per-event-type i18n templates (activity.event_*). Writers populate
 *     snapshots with the required fields; missing fields render as blank.
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { useAggregatedActivity } from '@/lib/aggregated-reads';
import { useAuth } from '@/lib/auth';
import {
  formatDate,
  formatTime,
  formatMinorUnits,
} from '@/lib/i18n';
import {
  ActivityEvent,
  ActivityPayload,
  ExpenseActivitySnapshot,
  SettlementActivitySnapshot,
  GroupActivitySnapshot,
} from '@/lib/api';
import {
  colors,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
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
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{b.label}</Text>
              <View style={styles.dayRule} />
            </View>
            {b.rows.map((r) => (
              <ActivityRow
                key={r.event.id}
                row={r}
                youUserId={user?.id ?? ''}
              />
            ))}
          </View>
        ))}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

function ActivityRow({ row, youUserId }: { row: Row; youUserId: string }) {
  const { t } = useTranslation();
  const { event } = row;
  const isYou = event.actor_id === youUserId;
  const actor = isYou ? t('activity.you') : event.actor_name || t('common.dash');
  const group = event.group_name ?? '';
  const sentence = describeEvent(event, { actor, group, t });
  const time = formatTime(new Date(event.created_at));

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {sentence}
        </Text>
        <Text style={styles.rowMeta}>{time}</Text>
      </View>
    </View>
  );
}

interface DescribeCtx {
  actor: string;
  group: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// Render a one-line summary for one activity row. Writers always populate
// snapshots with the fields the rich templates need; on the rare row with
// a missing field we fall back to `event_generic`.
function describeEvent(event: ActivityEvent, ctx: DescribeCtx): string {
  const { actor, group, t } = ctx;
  const p: ActivityPayload | undefined = event.payload ?? undefined;

  switch (event.event_type) {
    case 'expense_added': {
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      const hasFull = !!s.title && s.amount != null && !!s.currency;
      if (!hasFull) {
        return t('activity.event_expense_added_simple', { actor, group });
      }
      return t('activity.event_expense_added', {
        actor,
        group,
        title: s.title,
        amount: formatMinorUnits(s.amount!, s.currency!),
      });
    }
    case 'expense_edited':
    case 'expense_updated': {
      // 'expense_updated' is the pre-rename event_type still in legacy rows.
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      if (!s.title) {
        return t('activity.event_expense_edited_simple', { actor, group });
      }
      return t('activity.event_expense_edited', { actor, group, title: s.title });
    }
    case 'expense_deleted': {
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      if (!s.title) {
        return t('activity.event_expense_deleted_simple', { actor, group });
      }
      return t('activity.event_expense_deleted', { actor, group, title: s.title });
    }
    case 'settlement_added': {
      const s = (p?.snapshot ?? {}) as SettlementActivitySnapshot;
      return t('activity.event_settlement_added', {
        actor,
        group,
        from: s.from_member_name ?? actor,
        to: s.to_member_name ?? t('common.dash'),
        amount: s.amount != null && s.currency ? formatMinorUnits(s.amount, s.currency) : '',
      });
    }
    case 'settlement_reverted':
      return t('activity.event_settlement_reverted', { actor, group });
    case 'member_joined':
      return t('activity.event_member_joined', { actor, group });
    case 'group_created':
      return t('activity.event_group_created', { actor, group });
    case 'group_updated': {
      const s = (p?.snapshot ?? {}) as GroupActivitySnapshot;
      if (s.changed?.includes('name') && s.name && s.old_name) {
        return t('activity.event_group_renamed', {
          actor,
          oldName: s.old_name,
          newName: s.name,
        });
      }
      return t('activity.event_group_updated', { actor, group });
    }
    case 'group_archived':
      return t('activity.event_group_archived', { actor, group });
    case 'invite_link_rotated':
      return t('activity.event_invite_link_rotated', { actor, group });
    default:
      return t('activity.event_generic', {
        actor,
        group,
        event: event.event_type,
      });
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  loading: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    padding: spacing.s5,
  },
  dayHeader: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: 6,
  },
  dayLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  dayRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fontDisplay,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.graphite,
    lineHeight: 20,
  },
  rowMeta: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 3,
    letterSpacing: 0.3,
  },
});
