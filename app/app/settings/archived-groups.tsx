import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Text } from '@/components/Text';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useAccounts } from '@/lib/accounts';
import { useAggregatedArchivedGroups, refreshAggregatedReads } from '@/lib/aggregated-reads';
import { displayHostFor } from '@/lib/server-url';
import { isPopupJustClosed } from '@/lib/popup-guard';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

export default function ArchivedGroupsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { accounts } = useAccounts();
  const reads = useAggregatedArchivedGroups();
  // Pull-to-refresh spinner state: `status` only reports 'loading' on the
  // first fetch, so a refetch would otherwise show nothing at all. Same
  // 600 ms courtesy hold as the home tab.
  const [refreshing, setRefreshing] = useState(false);

  function onRefresh() {
    setRefreshing(true);
    refreshAggregatedReads();
    setTimeout(() => setRefreshing(false), 600);
  }

  // Show the host on each row only when more than one account is linked —
  // otherwise it's redundant noise.
  const showHostChip = accounts.length >= 2;

  const rows = useMemo(() => {
    const out: { id: string; name: string; serverUrl: string; createdAt: string }[] = [];
    for (const r of reads) {
      for (const g of r.data ?? []) {
        out.push({ id: g.id, name: g.name, serverUrl: r.serverUrl, createdAt: g.created_at ?? '' });
      }
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }, [reads]);

  const loading = reads.some((r) => r.status === 'loading') && rows.length === 0;
  const hasError = reads.some((r) => r.status === 'error') && rows.length === 0;

  function openGroupSettings(serverUrl: string, id: string) {
    if (isPopupJustClosed()) return;
    router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/settings`);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('archivedGroups.title')}
        left={
          <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ContentContainer>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.lead} />
            </View>
          ) : hasError ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorNote}>{t('archivedGroups.loadError')}</Text>
              <TouchableOpacity
                onPress={onRefresh}
                style={styles.retryBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.retryLabel}>{t('archivedGroups.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('archivedGroups.empty.title')}
              body={t('archivedGroups.empty.body')}
            />
          ) : (
            <View style={styles.list}>
              {rows.map((g) => (
                <TouchableOpacity
                  key={`${g.serverUrl}::${g.id}`}
                  style={styles.card}
                  onPress={() => openGroupSettings(g.serverUrl, g.id)}
                  activeOpacity={0.7}
                >
                  <GroupAvatar serverUrl={g.serverUrl} groupId={g.id} />
                  <View style={styles.mid}>
                    <Text style={styles.title} numberOfLines={1}>
                      {g.name}
                    </Text>
                    {showHostChip && (
                      <Text style={styles.hostChip} numberOfLines={1}>
                        {t('home.hostChip', {
                          host: displayHostFor(g.serverUrl, t('common.mainServerLabel')),
                        })}
                      </Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.lead} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s7,
  },
  center: {
    paddingVertical: spacing.s7,
    alignItems: 'center',
  },
  errorWrap: {
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s6,
  },
  errorNote: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  retryLabel: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
  },
  list: {
    gap: spacing.s2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 10,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  mid: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: -0.3,
  },
  hostChip: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
});
