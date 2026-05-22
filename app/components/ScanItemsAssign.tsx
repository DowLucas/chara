import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { currentLocale } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { avatarImageSource, GroupMember, ScannedReceiptItem } from '@/lib/api';
import {
  colors,
  fontBody,
  fontBodyMedium,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';
import { prorateItemAssignments, ScanItem } from '@/lib/scan-items';

function fmtMinor(n: number, currency: string): string {
  const abs = Math.abs(n);
  return `${(abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} ${currency}`;
}

export interface ScanItemsAssignProps {
  visible: boolean;
  items: ScannedReceiptItem[];
  taxMinor: number;
  tipMinor: number;
  totalMinor: number;
  currency: string;
  members: GroupMember[];
  /** ID of the current user's group-member row (for the "you" label). */
  currentMemberId?: string;
  authToken: string | null;
  onCancel: () => void;
  /** Called with the resolved per-member amounts in minor units. The
   *  caller is responsible for flipping the expense to exact split and
   *  filling the splits[]. */
  onApply: (perMemberMinor: Record<string, number>) => void;
}

export function ScanItemsAssign(props: ScanItemsAssignProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Mount stable client-side ids on the items (Gemini doesn't return ids).
  const scanItems: ScanItem[] = useMemo(
    () =>
      props.items.map((it, i) => ({
        id: `i${i}`,
        description: it.description,
        qty: it.qty,
        unit_price_minor: it.unit_price_minor,
        total_minor: it.total_minor,
      })),
    [props.items],
  );

  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);

  const participants = useMemo(() => props.members.map((m) => m.id), [props.members]);

  function assignAllToEveryone() {
    const all: Record<string, string[]> = {};
    for (const it of scanItems) all[it.id] = participants;
    setAssignments(all);
  }

  function toggleAssign(itemId: string, memberId: string) {
    setAssignments((prev) => {
      const cur = prev[itemId] ?? [];
      const next = cur.includes(memberId)
        ? cur.filter((m) => m !== memberId)
        : [...cur, memberId];
      return { ...prev, [itemId]: next };
    });
  }

  function clearAssignment(itemId: string) {
    setAssignments((prev) => ({ ...prev, [itemId]: [] }));
  }

  const perMember = useMemo(
    () =>
      prorateItemAssignments({
        items: scanItems,
        assignments,
        taxMinor: props.taxMinor,
        tipMinor: props.tipMinor,
        participants,
      }),
    [scanItems, assignments, props.taxMinor, props.tipMinor, participants],
  );

  const unassignedCount = scanItems.filter(
    (it) => !assignments[it.id] || assignments[it.id].length === 0,
  ).length;

  // The proration always produces a sum equal to items + tax + tip. We
  // compare that against the receipt total — if Gemini's items don't add up
  // to its own total, we block save so the user notices the discrepancy.
  const computedTotal = useMemo(
    () => Object.values(perMember).reduce((s, v) => s + v, 0),
    [perMember],
  );
  const totalMismatch = Math.abs(computedTotal - props.totalMinor) > 1;

  function nameOf(memberId: string): string {
    const m = props.members.find((mm) => mm.id === memberId);
    if (!m) return memberId;
    return m.id === props.currentMemberId ? t('addExpense.you') : m.name;
  }

  function memberInitials(memberId: string): string {
    const m = props.members.find((mm) => mm.id === memberId);
    return initialsOf(m?.name ?? '?');
  }

  function memberSource(memberId: string) {
    const m = props.members.find((mm) => mm.id === memberId);
    if (!m) return undefined;
    return avatarImageSource(m, props.authToken);
  }

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      onRequestClose={props.onCancel}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar
          title={t('scanItems.title')}
          left={<IconButton icon="x" onPress={props.onCancel} />}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>{t('scanItems.subtitle')}</Text>

          <View style={styles.shortcutRow}>
            <TouchableOpacity
              onPress={assignAllToEveryone}
              activeOpacity={0.7}
              style={styles.shortcutBtn}
            >
              <Feather name="users" size={14} color={colors.graphite} />
              <Text style={styles.shortcutLabel}>{t('scanItems.shareEqually')}</Text>
            </TouchableOpacity>
          </View>

          {scanItems.map((item) => {
            const assigned = assignments[item.id] ?? [];
            return (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemTop}>
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {item.description}
                    {item.qty > 1 && (
                      <Text style={styles.itemQty}> {t('scanItems.qty', { count: item.qty })}</Text>
                    )}
                  </Text>
                  <Text style={styles.itemAmount}>
                    {fmtMinor(item.total_minor, props.currency)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.assignRow}
                  onPress={() => setPickerOpen(item.id)}
                  activeOpacity={0.7}
                >
                  {assigned.length === 0 ? (
                    <Text style={styles.unassignedBadge}>{t('scanItems.unassigned')}</Text>
                  ) : assigned.length === participants.length ? (
                    <Text style={styles.assignedLabel}>{t('scanItems.everyone')}</Text>
                  ) : (
                    <Text style={styles.assignedLabel}>
                      {assigned.map(nameOf).join(', ')}
                    </Text>
                  )}
                  <Feather name="chevron-right" size={16} color={colors.lead} />
                </TouchableOpacity>
              </View>
            );
          })}

          {(props.taxMinor > 0 || props.tipMinor > 0) && (
            <View style={styles.metaWrap}>
              {props.taxMinor > 0 && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('scanItems.taxLine')}</Text>
                  <Text style={styles.metaValue}>{fmtMinor(props.taxMinor, props.currency)}</Text>
                </View>
              )}
              {props.tipMinor > 0 && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>{t('scanItems.tipLine')}</Text>
                  <Text style={styles.metaValue}>{fmtMinor(props.tipMinor, props.currency)}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.summaryWrap}>
            <Text style={styles.summaryHeader}>{t('scanItems.perPerson')}</Text>
            {props.members.map((m) => {
              const amount = perMember[m.id] ?? 0;
              return (
                <View key={m.id} style={styles.summaryRow}>
                  <View style={styles.summaryLeft}>
                    <Avatar
                      initials={memberInitials(m.id)}
                      size="sm"
                      source={memberSource(m.id)}
                    />
                    <Text style={styles.summaryName}>{nameOf(m.id)}</Text>
                  </View>
                  <Text style={styles.summaryAmount}>{fmtMinor(amount, props.currency)}</Text>
                </View>
              );
            })}
          </View>

          {unassignedCount > 0 && (
            <View style={styles.warnBanner}>
              <Feather name="info" size={14} color={colors.lead} />
              <Text style={styles.warnText}>
                {t('scanItems.unassignedWarning', { count: unassignedCount })}
              </Text>
            </View>
          )}

          {totalMismatch && (
            <View style={styles.errBanner}>
              <Feather name="alert-circle" size={14} color={colors.brick} />
              <Text style={styles.errText}>{t('scanItems.totalMismatch')}</Text>
            </View>
          )}
        </ScrollView>

        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
          <Button
            kind="secondary"
            onPress={() => props.onApply({})}
            style={{ flex: 1 }}
          >
            {t('scanItems.skip')}
          </Button>
          <Button
            kind="primary"
            onPress={() => props.onApply(perMember)}
            disabled={totalMismatch}
            style={{ flex: 1 }}
          >
            {t('scanItems.continue')}
          </Button>
        </View>
      </View>

      {/* Picker sheet --------------------------------------------------- */}
      <Modal
        visible={pickerOpen !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPickerOpen(null)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sheetTitle}>{t('scanItems.assignSheetTitle')}</Text>
            <Text style={styles.sheetHint}>{t('scanItems.assignSheetHint')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {props.members.map((m) => {
                const selected = pickerOpen
                  ? (assignments[pickerOpen] ?? []).includes(m.id)
                  : false;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => pickerOpen && toggleAssign(pickerOpen, m.id)}
                    style={styles.sheetRow}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                      {selected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Avatar
                      initials={memberInitials(m.id)}
                      size="sm"
                      source={memberSource(m.id)}
                    />
                    <Text style={styles.sheetName}>{nameOf(m.id)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.sheetCta}>
              <Button
                kind="secondary"
                onPress={() => {
                  if (pickerOpen) clearAssignment(pickerOpen);
                  setPickerOpen(null);
                }}
                style={{ flex: 1 }}
              >
                {t('scanItems.cancel')}
              </Button>
              <Button kind="primary" onPress={() => setPickerOpen(null)} style={{ flex: 1 }}>
                {t('scanItems.done')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  subtitle: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s3,
  },
  shortcutRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s3,
  },
  shortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
  },
  shortcutLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },

  itemRow: {
    paddingHorizontal: spacing.s5,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  itemDesc: { flex: 1, fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  itemQty: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  itemAmount: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.bone,
    borderRadius: 6,
  },
  assignedLabel: { flex: 1, fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.graphite },
  unassignedBadge: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  metaWrap: { paddingHorizontal: spacing.s5, paddingTop: spacing.s3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  metaLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  metaValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  summaryWrap: {
    marginTop: spacing.s4,
    marginHorizontal: spacing.s5,
    padding: 12,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 8,
  },
  summaryHeader: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryName: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  summaryAmount: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s3,
    padding: 10,
    backgroundColor: colors.bone,
    borderRadius: 6,
  },
  warnText: { flex: 1, fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  errBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s3,
    padding: 10,
    borderWidth: 0.5,
    borderColor: colors.brick,
    borderRadius: 6,
  },
  errText: { flex: 1, fontFamily: fontMono, fontSize: fontSize.caption, color: colors.brick },

  ctaBar: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },

  // Picker sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
  },
  sheetTitle: { fontFamily: fontBodyMedium, fontSize: fontSize.bodyL, color: colors.graphite },
  sheetHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 4,
    marginBottom: spacing.s3,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  sheetName: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxOn: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  checkmark: { color: colors.paper, fontSize: 12, fontFamily: fontMonoMedium },
  sheetCta: { flexDirection: 'row', gap: spacing.s2, paddingTop: spacing.s3 },
});
