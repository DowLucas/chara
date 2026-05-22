/**
 * Per-group activity screen. Single-server (no fan-out) — uses
 * `apiFor(serverUrl).listGroupActivity(groupId)` directly.
 *
 * Mirrors the cross-group activity tab in look-and-feel: day-buckets +
 * per-event-type i18n templates. Reuses the same template namespace
 * (`activity.event_*`) so we only maintain one set of strings.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { useAuth } from '@/lib/auth';
import {
  apiFor,
  ActivityEvent,
  ActivityPayload,
  ExpenseActivitySnapshot,
  SettlementActivitySnapshot,
  GroupActivitySnapshot,
} from '@/lib/api';
import {
  formatDate,
  formatTime,
  formatMinorUnits,
} from '@/lib/i18n';
import {
  colors,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function GroupActivityScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const groupId = id ?? '';
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!serverUrl || !groupId) return;
    try {
      const rows = await apiFor(serverUrl).listGroupActivity(groupId);
      setEvents(rows);
    } catch {
      // Silent: the empty/loading state covers the failure case.
    } finally {
      setLoaded(true);
    }
  }, [serverUrl, groupId]);

  useEffect(() => {
    void load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const buckets = useMemo(() => {
    const out: { label: string; rows: ActivityEvent[] }[] = [];
    for (const e of events) {
      const d = new Date(e.created_at);
      const label = isSameDay(d, today)
        ? t('activity.today')
        : isSameDay(d, yesterday)
        ? t('activity.yesterday')
        : formatDate(d);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(e);
      else out.push({ label, rows: [e] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('activity.title')}
        left={<IconButton icon="chevron-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loaded && events.length === 0 ? (
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
            {b.rows.map((e) => (
              <ActivityRow
                key={e.id}
                event={e}
                serverUrl={serverUrl}
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

function ActivityRow({
  event,
  serverUrl,
  youUserId,
}: {
  event: ActivityEvent;
  serverUrl: string;
  youUserId: string;
}) {
  const { t } = useTranslation();
  const isYou = event.actor_id === youUserId;
  const actor = isYou ? t('activity.you') : event.actor_name || t('common.dash');
  const group = event.group_name ?? '';
  const sentence = describeEvent(event, { actor, group, t });
  const time = formatTime(new Date(event.created_at));

  const onPress = () => {
    if (!event.entity_id) return;
    if (event.event_type.startsWith('expense_')) {
      router.push(
        `/expenses/${encodeURIComponent(serverUrl)}/${event.entity_id}` as never,
      );
    }
    // settlement_* / group_* / member_* stay on this group; no-op.
  };

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {sentence}
        </Text>
        <Text style={styles.rowMeta}>{time}</Text>
      </View>
    </TouchableOpacity>
  );
}

interface DescribeCtx {
  actor: string;
  group: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

// Keep in sync with the cross-tab renderer. The per-group screen omits
// {group} in some templates because the screen header already names the
// group — but we keep the same i18n keys so translations are unified.
function describeEvent(event: ActivityEvent, ctx: DescribeCtx): string {
  const { actor, group, t } = ctx;
  const p: ActivityPayload | undefined = event.payload ?? undefined;

  switch (event.event_type) {
    case 'expense_added': {
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      return t('activity.event_expense_added', {
        actor,
        group,
        title: s.title ?? '',
        amount: s.amount != null && s.currency ? formatMinorUnits(s.amount, s.currency) : '',
      });
    }
    case 'expense_edited': {
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      return t('activity.event_expense_edited', { actor, group, title: s.title ?? '' });
    }
    case 'expense_deleted': {
      const s = (p?.snapshot ?? {}) as ExpenseActivitySnapshot;
      return t('activity.event_expense_deleted', { actor, group, title: s.title ?? '' });
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
