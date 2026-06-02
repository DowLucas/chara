import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { ContentContainer } from '@/components/ContentContainer';
import { Avatar } from '@/components/Avatar';
import { AmountKeypad } from '@/components/AmountKeypad';
import { currentLocale } from '@/lib/i18n';
import { initialsOf, makeNameShortener } from '@/lib/name';
import { avatarImageSource, GroupMember, ScannedReceiptItem } from '@/lib/api';
import { decimalToMinor } from '@/lib/money-utils';
import { markPopupClosed } from '@/lib/popup-guard';
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

function minorToInput(n: number): string {
  return (n / 100).toFixed(2).replace(/\.?0+$/, '');
}

type EditTarget =
  | { kind: 'item'; id: string }
  | { kind: 'tax' }
  | { kind: 'tip' }
  | { kind: 'total' };

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

  // Mount stable client-side ids on the items (Gemini doesn't return ids) and
  // lift them into local state so the user can correct OCR misreads. The same
  // applies to tax/tip/total — Gemini sometimes returns a header total that
  // doesn't match its own line items, so we need every number on this screen
  // to be editable.
  const [scanItems, setScanItems] = useState<ScanItem[]>(() =>
    props.items.map((it, i) => ({
      id: `i${i}`,
      description: it.description,
      qty: it.qty,
      unit_price_minor: it.unit_price_minor,
      total_minor: it.total_minor,
    })),
  );
  const [taxMinor, setTaxMinor] = useState<number>(props.taxMinor);
  const [tipMinor, setTipMinor] = useState<number>(props.tipMinor);
  const [totalMinor, setTotalMinor] = useState<number>(props.totalMinor);

  // Reset local edits when a new scan comes in.
  useEffect(() => {
    setScanItems(
      props.items.map((it, i) => ({
        id: `i${i}`,
        description: it.description,
        qty: it.qty,
        unit_price_minor: it.unit_price_minor,
        total_minor: it.total_minor,
      })),
    );
    setTaxMinor(props.taxMinor);
    setTipMinor(props.tipMinor);
    setTotalMinor(props.totalMinor);
  }, [props.items, props.taxMinor, props.tipMinor, props.totalMinor]);

  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);

  // Inline amount editor (item totals, tax, tip, receipt total).
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  function openEditor(target: EditTarget) {
    let initial = 0;
    if (target.kind === 'item') {
      initial = scanItems.find((i) => i.id === target.id)?.total_minor ?? 0;
    } else if (target.kind === 'tax') initial = taxMinor;
    else if (target.kind === 'tip') initial = tipMinor;
    else initial = totalMinor;
    setEditValue(minorToInput(initial));
    setEditTarget(target);
  }

  function commitEditor(resolved: string) {
    const minor = decimalToMinor(resolved);
    const target = editTarget;
    setEditTarget(null);
    if (!target) return;
    if (target.kind === 'item') {
      setScanItems((prev) =>
        prev.map((it) => (it.id === target.id ? { ...it, total_minor: minor } : it)),
      );
    } else if (target.kind === 'tax') setTaxMinor(minor);
    else if (target.kind === 'tip') setTipMinor(minor);
    else setTotalMinor(minor);
  }

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
        taxMinor,
        tipMinor,
        participants,
      }),
    [scanItems, assignments, taxMinor, tipMinor, participants],
  );

  const unassignedCount = scanItems.filter(
    (it) => !assignments[it.id] || assignments[it.id].length === 0,
  ).length;

  // The proration always sums to items + tax + tip. We compare that against
  // the receipt total — if Gemini's parse is internally inconsistent, the
  // user can fix any of the editable values (item amounts, tax, tip, or the
  // total) to reconcile.
  const computedTotal = useMemo(
    () => Object.values(perMember).reduce((s, v) => s + v, 0),
    [perMember],
  );
  const totalDiff = computedTotal - totalMinor;
  const totalMismatch = Math.abs(totalDiff) > 1;

  // Context-aware shortener: "Lucas" when unique in the group, "Lucas H."
  // when there's another Lucas, "Lucas Heinonen" only on a full collision.
  // Built once per member list so every row in this screen agrees.
  const shorten = useMemo(
    () => makeNameShortener(props.members.map((m) => m.name)),
    [props.members],
  );

  function nameOf(memberId: string): string {
    const m = props.members.find((mm) => mm.id === memberId);
    if (!m) return memberId;
    if (m.id === props.currentMemberId) return t('addExpense.you');
    return shorten(m.name);
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
          <ContentContainer>
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
                  <TouchableOpacity
                    onPress={() => openEditor({ kind: 'item', id: item.id })}
                    activeOpacity={0.6}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('scanItems.editItemAmount')}
                  >
                    <Text style={styles.itemAmountEditable}>
                      {fmtMinor(item.total_minor, props.currency)}
                    </Text>
                  </TouchableOpacity>
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

          <View style={styles.metaWrap}>
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() => openEditor({ kind: 'tax' })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('scanItems.editTax')}
            >
              <Text style={styles.metaLabel}>{t('scanItems.taxLine')}</Text>
              <Text style={styles.metaValueEditable}>{fmtMinor(taxMinor, props.currency)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() => openEditor({ kind: 'tip' })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('scanItems.editTip')}
            >
              <Text style={styles.metaLabel}>{t('scanItems.tipLine')}</Text>
              <Text style={styles.metaValueEditable}>{fmtMinor(tipMinor, props.currency)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.metaRow}
              onPress={() => openEditor({ kind: 'total' })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('scanItems.editTotal')}
            >
              <Text style={styles.metaLabel}>{t('scanItems.receiptTotal')}</Text>
              <Text style={styles.metaValueEditable}>{fmtMinor(totalMinor, props.currency)}</Text>
            </TouchableOpacity>
          </View>

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
              <View style={styles.errHeader}>
                <Feather name="alert-circle" size={14} color={colors.brick} />
                <Text style={styles.errText}>{t('scanItems.totalMismatch')}</Text>
              </View>
              <View style={styles.errLine}>
                <Text style={styles.errLineLabel}>{t('scanItems.computedTotal')}</Text>
                <Text style={styles.errLineValue}>
                  {fmtMinor(computedTotal, props.currency)}
                </Text>
              </View>
              <View style={styles.errLine}>
                <Text style={styles.errLineLabel}>{t('scanItems.receiptTotal')}</Text>
                <Text style={styles.errLineValue}>{fmtMinor(totalMinor, props.currency)}</Text>
              </View>
              <View style={styles.errLine}>
                <Text style={[styles.errLineLabel, { color: colors.brick }]}>
                  {t('scanItems.diff')}
                </Text>
                <Text style={[styles.errLineValue, { color: colors.brick }]}>
                  {(totalDiff > 0 ? '+' : '−') + fmtMinor(Math.abs(totalDiff), props.currency)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.matchBtn}
                onPress={() => setTotalMinor(computedTotal)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Feather name="refresh-cw" size={12} color={colors.graphite} />
                <Text style={styles.matchBtnLabel}>{t('scanItems.matchItems')}</Text>
              </TouchableOpacity>
              <Text style={styles.matchHint}>{t('scanItems.matchItemsHint')}</Text>
            </View>
          )}
          </ContentContainer>
        </ScrollView>

        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
          <ContentContainer style={styles.ctaRow}>
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
          </ContentContainer>
        </View>
      </View>

      <AmountKeypad
        visible={editTarget !== null}
        value={editValue}
        currency={props.currency}
        onChange={setEditValue}
        onSubmit={commitEditor}
        onClose={() => setEditTarget(null)}
      />

      {/* Picker sheet --------------------------------------------------- */}
      <Modal
        visible={pickerOpen !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setPickerOpen(null);
          markPopupClosed();
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            setPickerOpen(null);
            markPopupClosed();
          }}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}
            onPress={(e) => e.stopPropagation()}
          >
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
                  markPopupClosed();
                }}
                style={{ flex: 1 }}
              >
                {t('scanItems.cancel')}
              </Button>
              <Button
                kind="primary"
                onPress={() => {
                  setPickerOpen(null);
                  markPopupClosed();
                }}
                style={{ flex: 1 }}
              >
                {t('scanItems.done')}
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  ctaRow: { flexDirection: 'row', gap: spacing.s2 },
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
  itemAmountEditable: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: colors.ruleSoft,
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  metaLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  metaValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  metaValueEditable: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: colors.ruleSoft,
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
    marginHorizontal: spacing.s5,
    marginTop: spacing.s3,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.brick,
    borderRadius: 6,
    gap: 6,
  },
  errHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errText: { flex: 1, fontFamily: fontMono, fontSize: fontSize.caption, color: colors.brick },
  errLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  errLineLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  errLineValue: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  matchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
  },
  matchBtnLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  matchHint: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
  },

  ctaBar: {
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
