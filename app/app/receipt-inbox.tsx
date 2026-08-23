/**
 * Where a file shared into Chara from another app lands. The scan API takes
 * group_id (category catalog) and language, and the result view needs the
 * group's currency for FX — so the group is an INPUT to extraction and has
 * to be resolved before any scanning happens.
 *
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useAccounts } from '@/lib/accounts';
import { useAggregatedGroups } from '@/lib/aggregated-reads';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { usePendingShare } from '@/lib/pending-share';
import { addExpenseHref, flattenGroupChoices } from './receipt-inbox.helpers';

export default function ReceiptInbox() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { accounts, lastUsedCreateServerUrl, loading: accountsLoading } = useAccounts();
  const reads = useAggregatedGroups();
  const pending = usePendingShare();

  const choices = useMemo(
    () => flattenGroupChoices(reads, lastUsedCreateServerUrl ?? null),
    [reads, lastUsedCreateServerUrl],
  );

  const multiServer = accounts.length > 1;
  const loading =
    accountsLoading || reads.some((r) => r.status === 'loading' || r.status === 'idle');

  // Signed out, or signed in with no groups: nothing useful to do with the
  // file. Say so and discard it rather than stashing it — a resume-after-
  // sign-in flow is machinery for a rare first-run path (see spec).
  if (!accountsLoading && (accounts.length === 0 || (choices.length === 0 && !loading))) {
    const signedOut = accounts.length === 0;
    return (
      <View style={[styles.empty, { paddingTop: insets.top + spacing.s7 }]}>
        <Feather name="inbox" size={32} color={colors.lead} />
        <Text style={styles.emptyTitle}>
          {signedOut ? t('receiptInbox.signedOutTitle') : t('receiptInbox.noGroupsTitle')}
        </Text>
        <Text style={styles.emptyBody}>
          {signedOut ? t('receiptInbox.signedOutBody') : t('receiptInbox.noGroupsBody')}
        </Text>
        <Button kind="secondary" onPress={() => router.replace('/')}>
          {t('common.close')}
        </Button>
      </View>
    );
  }

  function choose(serverUrl: string, groupId: string) {
    if (isPopupJustClosed()) return;
    router.replace(addExpenseHref(serverUrl, groupId) as never);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.s6,
        paddingBottom: insets.bottom + spacing.s6,
      }}
    >
      <View style={styles.fileCard}>
        <Feather
          name={pending?.mimeType === 'application/pdf' ? 'file-text' : 'image'}
          size={28}
          color={colors.lead}
        />
        <Text style={styles.fileName} numberOfLines={2}>
          {pending?.name ?? ''}
        </Text>
      </View>

      {pending && pending.extraFilesIgnored > 0 && (
        <Text style={styles.notice}>
          {t('receiptInbox.multipleFiles', { count: pending.extraFilesIgnored })}
        </Text>
      )}

      <Text style={styles.eyebrow}>{t('receiptInbox.whichGroup')}</Text>
      <View style={styles.list}>
        {choices.map((c) => (
          <TouchableOpacity
            key={`${c.serverUrl}:${c.groupId}`}
            style={styles.row}
            onPress={() => choose(c.serverUrl, c.groupId)}
            accessibilityRole="button"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{c.name}</Text>
              {multiServer && <Text style={styles.rowSub}>{c.serverUrl}</Text>}
            </View>
            <Feather name="chevron-right" size={18} color={colors.lead} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  empty: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    paddingHorizontal: spacing.s6,
    gap: spacing.s4,
  },
  emptyTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    textAlign: 'center',
    marginBottom: spacing.s4,
  },
  fileCard: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    padding: spacing.s5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
  },
  fileName: {
    flex: 1,
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  notice: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s3,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s6,
    marginBottom: spacing.s2,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fontDisplay, fontSize: fontSize.body, color: colors.graphite },
  rowSub: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
});
