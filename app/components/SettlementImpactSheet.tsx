/**
 * Settlement-aware confirm sheet. Slide-up modal showing the per-member
 * balance delta the user is about to commit, plus any post-expense
 * settlements those changes touch.
 *
 * Spec: docs/superpowers/specs/2026-05-23-edit-expense-design.md §"Settlement
 * Impact Sheet".
 *
 * Honesty rules: never say "settlement updated" or "reverted" — only
 * "balances will shift" and "settlements stay on record."
 */

import React from 'react';
import {
  Modal,
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Text } from './Text';
import {
  deltaCopy,
  sortDeltasForDisplay,
  truncateSettlements,
} from '../lib/edit-expense-flow';
import { settlementImpactSheetCopy, SheetMode } from './SettlementImpactSheet.helpers';
import { formatMinorUnits } from '../lib/i18n';
import { useResponsive } from '@/lib/use-responsive';
import { markPopupClosed } from '../lib/popup-guard';
import { initialsOf } from '../lib/name';
import type { MemberDelta } from '../lib/balance-impact';
import type { Settlement, GroupMember } from '../lib/api';
import { colors, fontBody, fontMono, fontMonoMedium, fontSize, spacing } from '../lib/theme';

interface Props {
  visible: boolean;
  mode: SheetMode;
  deltas: MemberDelta[];
  affectedSettlements: Settlement[];
  members: GroupMember[];
  currency: string;
  submitting: boolean;
  error?: string | null;
  onCancel(): void;
  onConfirm(): void;
}

export function SettlementImpactSheet({
  visible,
  mode,
  deltas,
  affectedSettlements,
  members,
  currency,
  submitting,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const { sheetMaxWidth } = useResponsive();
  // On tablet, cap+center the inner content so it doesn't stretch; the
  // `container` background stays full-bleed. No-op on phone (sheetMaxWidth null).
  const capStyle =
    sheetMaxWidth != null
      ? { maxWidth: sheetMaxWidth, width: '100%' as const, alignSelf: 'center' as const }
      : null;
  // Stamp the popup-guard on dismissal so the row that opened us underneath
  // can't fire `onPress` in the same gesture. See app/lib/popup-guard.ts.
  const handleCancel = React.useCallback(() => {
    markPopupClosed();
    onCancel();
  }, [onCancel]);
  const copy = settlementImpactSheetCopy({
    mode,
    affectedSettlementsCount: affectedSettlements.length,
    memberCount: deltas.length,
    submitting,
    error,
  });
  const sortedDeltas = sortDeltasForDisplay(deltas);
  const { visible: visibleSettlements, overflow } = truncateSettlements(
    affectedSettlements,
    5,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollBody, capStyle]}>
          <Text style={styles.title}>{t(copy.titleKey)}</Text>
          <Text style={styles.lead}>{t(copy.leadKey, copy.leadParams)}</Text>

          {sortedDeltas.map((d) => (
            <DeltaRow
              key={d.memberId}
              delta={d}
              member={members.find((m) => m.id === d.memberId)}
              currency={currency}
            />
          ))}

          {affectedSettlements.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t('impactSheet.affectedSettlements.heading')}
              </Text>
              <View style={styles.sectionRule} />
              {visibleSettlements.map((s) => (
                <SettlementRow
                  key={s.id}
                  settlement={s}
                  members={members}
                />
              ))}
              {overflow > 0 && (
                <Text style={styles.moreLine}>
                  {t('impactSheet.affectedSettlements.more', { count: overflow })}
                </Text>
              )}
            </View>
          )}

          <Text style={styles.note}>{t('impactSheet.note.settlementsUnchanged')}</Text>

          {copy.errorVisible && (
            <View
              style={styles.errorBanner}
              accessibilityRole="alert"
              accessibilityLabel={t('common.error')}
            >
              <Text style={styles.errorText}>
                {error || t(mode === 'delete' ? 'impactSheet.deleteErrorGeneric' : 'impactSheet.errorGeneric')}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.ctaBar}>
          <View style={[styles.ctaRow, capStyle]}>
            <Button
              kind="secondary"
              onPress={handleCancel}
              style={{ flex: 1 }}
              disabled={submitting}
            >
              {t('impactSheet.cancel')}
            </Button>
            <Button
              kind="primary"
              onPress={onConfirm}
              style={[
                { flex: 1 },
                copy.primaryDestructive ? styles.destructive : styles.constructive,
              ] as any}
              disabled={copy.primaryDisabled}
            >
              {submitting ? t('common.saving') : t(copy.primaryKey)}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface DeltaRowProps {
  delta: MemberDelta;
  member?: GroupMember;
  currency: string;
}

function DeltaRow({ delta, member, currency }: DeltaRowProps) {
  const { t } = useTranslation();
  const c = deltaCopy(delta);
  const initials = member ? initialsOf(member.name) : initialsOf(delta.displayName);
  return (
    <View style={styles.deltaRow}>
      <Avatar initials={initials} size="sm" />
      <View style={styles.deltaCol}>
        <Text style={styles.deltaName} numberOfLines={1}>
          {delta.displayName}
        </Text>
        <Text style={styles.deltaPrev}>
          {t(c.prevKey)} {formatMinorUnits(Number(c.prevAbsMinor), currency)}
        </Text>
      </View>
      <View style={styles.deltaRight}>
        <Text
          style={[
            styles.deltaNew,
            { color: c.improved ? colors.moss : colors.brick },
          ]}
        >
          {t(c.newKey)} {formatMinorUnits(Number(c.newAbsMinor), currency)}
        </Text>
      </View>
    </View>
  );
}

function SettlementRow({
  settlement,
  members,
}: {
  settlement: Settlement;
  members: GroupMember[];
}) {
  const from = members.find((m) => m.id === settlement.from_member_id);
  const to = members.find((m) => m.id === settlement.to_member_id);
  const amountMinor = Math.round(parseFloat(settlement.amount) * 100);
  return (
    <TouchableOpacity activeOpacity={0.7} style={styles.settlementRow}>
      <Text style={styles.settlementText} numberOfLines={1}>
        {(from?.name ?? '?')} → {(to?.name ?? '?')}
      </Text>
      <Text style={styles.settlementAmount}>
        {formatMinorUnits(amountMinor, settlement.currency)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scrollBody: { padding: spacing.s5, paddingBottom: spacing.s7 },
  title: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    marginBottom: spacing.s3,
    letterSpacing: -0.2,
  },
  lead: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    marginBottom: spacing.s4,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  deltaCol: { flex: 1 },
  deltaRight: { alignItems: 'flex-end' },
  deltaName: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  deltaPrev: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
  },
  deltaNew: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    fontVariant: ['tabular-nums'],
  },
  section: { marginTop: spacing.s5 },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginBottom: spacing.s2,
    letterSpacing: 0.3,
  },
  sectionRule: { height: 1, backgroundColor: colors.graphite, marginBottom: spacing.s2 },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  settlementText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    flex: 1,
    marginRight: spacing.s3,
  },
  settlementAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  moreLine: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: spacing.s2,
  },
  note: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: spacing.s4,
    fontStyle: 'italic',
  },
  errorBanner: {
    marginTop: spacing.s4,
    padding: spacing.s3,
    borderRadius: 6,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  errorText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
  },
  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s5,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  destructive: {
    backgroundColor: colors.brick,
    borderColor: colors.brick,
  },
  constructive: {
    backgroundColor: colors.moss,
    borderColor: colors.moss,
  },
});
