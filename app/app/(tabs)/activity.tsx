import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { listMyActivity, ActivityEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatTime } from '@/lib/i18n';
import {
  colors,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

const TR_PREFIX = 'activity.event_';

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

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listMyActivity();
      setEvents(rows);
    } catch {
      // Swallow — the empty state covers the failure case.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Group into day buckets in render order (events arrive DESC by created_at).
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const buckets: { label: string; rows: ActivityEvent[] }[] = [];
  for (const e of events) {
    const d = new Date(e.created_at);
    const label = isSameDay(d, today)
      ? t('activity.today')
      : isSameDay(d, yesterday)
      ? t('activity.yesterday')
      : formatDate(d);
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.rows.push(e);
    else buckets.push({ label, rows: [e] });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('activity.title')}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="filter" />
            <IconButton icon="search" />
          </View>
        }
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loaded && events.length === 0 && (
          <EmptyState
            title={t('activity.emptyTitle')}
            body={t('activity.emptyBody')}
            icon="list"
          />
        )}

        {buckets.map((b) => (
          <View key={b.label}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{b.label}</Text>
              <View style={styles.dayRule} />
            </View>
            {b.rows.map((e) => {
              const isYou = e.actor_id === user?.id;
              const actor = isYou ? t('activity.you') : e.actor_name || '—';
              const key = TR_PREFIX + e.event_type;
              const sentence = t([key, 'activity.event_generic'] as any, {
                actor,
                group: e.group_name,
                event: e.event_type,
              });
              const time = formatTime(new Date(e.created_at));
              return (
                <View key={e.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {sentence}
                    </Text>
                    <Text style={styles.rowMeta}>{time}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
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
