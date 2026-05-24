/**
 * SplitEditor — controlled split-method + per-member share editor.
 *
 * Extracted from ExpenseWizard so the recurring-bill form can reuse the same
 * UI (and, eventually, the same exact/percentage editors). The parent owns
 * all state and passes the canonical `value` shape; the component renders
 * the segmented method picker, the included-members list, and the reconcile
 * card at the bottom.
 *
 * The wire format `value.splits[].value` is interpreted per `method`:
 *   - 'equal'      : value is unused (share count is derived from included
 *                    members). Only `member_id` matters.
 *   - 'exact'      : value = locked minor units for that member (omit a
 *                    member from `splits` to mark them as "auto").
 *   - 'percentage' : value = locked basis points for that member.
 *
 * `allowedMethods` lets a host lock the picker to a subset (or hide it
 * entirely when only one method is allowed). The recurring form uses
 * ['equal', 'exact', 'percentage'] — same as the wizard — so the picker is
 * shown there too.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/Avatar';
import { avatarImageSource, GroupMember } from '@/lib/api';
import { currentLocale } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import {
  colors,
  fontBody,
  fontBodyMedium,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

export type SplitMethod = 'equal' | 'exact' | 'percentage';

export interface SplitValue {
  method: SplitMethod;
  /** Locked per-member values. Members not present are auto-filled.
   *  - exact: `value` is minor units (öre / cents)
   *  - percentage: `value` is basis points (1% = 100)
   *  - equal: only `member_id` matters; presence = included */
  splits: Array<{ member_id: string; value: number }>;
  /** Set of member ids included in the split. Required because for `equal`,
   *  splits[] carries no per-member data and for exact/percentage a member
   *  can be included with no locked value (= auto). */
  included: string[];
}

const SPLIT_METHODS: { id: SplitMethod; labelKey: string }[] = [
  { id: 'equal', labelKey: 'addExpense.methodEqual' },
  { id: 'exact', labelKey: 'addExpense.methodManual' },
  { id: 'percentage', labelKey: 'addExpense.methodPercent' },
];

export interface SplitEditorProps {
  members: GroupMember[];
  /** Total amount to split, in the same currency as `currency`, in minor
   *  units. For the wizard this is the FX-converted amount in group ccy. */
  totalMinor: number;
  currency: string;
  value: SplitValue;
  onChange: (next: SplitValue) => void;
  /** Member id whose user_id === current user. Used to render "You". */
  currentUserMemberId?: string;
  /** Auth token for fetching avatar thumbnails. */
  authToken: string | null;
  /** Restrict the method picker. Defaults to all three. When length === 1
   *  the picker is hidden. */
  allowedMethods?: SplitMethod[];
}

function fmtMinor(n: number, currency: string): string {
  const abs = Math.abs(n);
  return `${(abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} ${currency}`;
}

function distributeInt(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total <= 0) return new Array(count).fill(0);
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

function fmtAutoMinor(minor: number): string {
  return (Math.max(0, minor) / 100).toFixed(2);
}

function fmtAutoPct(bp: number): string {
  const safe = Math.max(0, bp);
  if (safe % 100 === 0) return String(safe / 100);
  return (safe / 100).toFixed(2);
}

export function SplitEditor({
  members,
  totalMinor,
  currency,
  value,
  onChange,
  currentUserMemberId,
  authToken,
  allowedMethods = ['equal', 'exact', 'percentage'],
}: SplitEditorProps) {
  const { t } = useTranslation();

  const { method, splits, included } = value;
  const includedSet = useMemo(() => new Set(included), [included]);
  const lockedById = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of splits) m.set(s.member_id, s.value);
    return m;
  }, [splits]);

  const includedMembers = members.filter((m) => includedSet.has(m.id));
  const equalShare =
    method === 'equal' && includedMembers.length > 0
      ? Math.round(totalMinor / includedMembers.length)
      : 0;

  // --- auto-fill maps ---------------------------------------------------
  const autoExactMinor = useMemo<Record<string, number>>(() => {
    if (method !== 'exact') return {};
    let lockedSum = 0;
    const autoIds: string[] = [];
    for (const m of includedMembers) {
      if (lockedById.has(m.id)) lockedSum += lockedById.get(m.id) ?? 0;
      else autoIds.push(m.id);
    }
    const remaining = totalMinor - lockedSum;
    const shares = distributeInt(remaining, autoIds.length);
    const out: Record<string, number> = {};
    autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
    return out;
  }, [method, includedMembers, lockedById, totalMinor]);

  const autoPctBp = useMemo<Record<string, number>>(() => {
    if (method !== 'percentage') return {};
    let lockedSum = 0;
    const autoIds: string[] = [];
    for (const m of includedMembers) {
      if (lockedById.has(m.id)) lockedSum += lockedById.get(m.id) ?? 0;
      else autoIds.push(m.id);
    }
    const remaining = 10000 - lockedSum;
    const shares = distributeInt(remaining, autoIds.length);
    const out: Record<string, number> = {};
    autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
    return out;
  }, [method, includedMembers, lockedById]);

  function effectiveMinor(memberId: string): number {
    if (method === 'exact') {
      return lockedById.get(memberId) ?? autoExactMinor[memberId] ?? 0;
    }
    if (method === 'percentage') {
      const bp = lockedById.get(memberId) ?? autoPctBp[memberId] ?? 0;
      return Math.round((totalMinor * bp) / 10000);
    }
    // equal — equal share rounded; reconcile picks up the remainder.
    return equalShare;
  }

  const totalSplitMinor = useMemo(() => {
    if (method === 'equal') return totalMinor;
    return includedMembers.reduce((s, m) => s + effectiveMinor(m.id), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, includedMembers, lockedById, autoExactMinor, autoPctBp, totalMinor]);

  const offBy = totalSplitMinor - totalMinor;

  function memberLabel(m: GroupMember): string {
    return m.id === currentUserMemberId ? t('addExpense.you') : m.name;
  }

  // --- mutators ---------------------------------------------------------
  function setMethod(next: SplitMethod) {
    // Switching method clears locked values (the previously locked numbers
    // are interpreted differently per method). Matches wizard behavior.
    onChange({ method: next, splits: [], included });
  }

  function toggleIncluded(memberId: string) {
    const nextIncluded = includedSet.has(memberId)
      ? included.filter((id) => id !== memberId)
      : [...included, memberId];
    // Drop any locked value for an excluded member.
    const nextSplits = includedSet.has(memberId)
      ? splits.filter((s) => s.member_id !== memberId)
      : splits;
    onChange({ method, splits: nextSplits, included: nextIncluded });
  }

  function setLockedDecimal(memberId: string, text: string) {
    // text is a decimal string (e.g. "12.50") for exact, or "33.33" for %.
    if (text === '') {
      // Treat as auto: drop the locked entry.
      onChange({
        method,
        splits: splits.filter((s) => s.member_id !== memberId),
        included,
      });
      return;
    }
    const n = parseFloat(text.replace(',', '.'));
    const safe = Number.isFinite(n) ? n : 0;
    const valueMinor =
      method === 'exact' ? Math.round(safe * 100) : Math.round(safe * 100); // bp
    const next = splits.filter((s) => s.member_id !== memberId);
    next.push({ member_id: memberId, value: valueMinor });
    onChange({ method, splits: next, included });
  }

  function lockedDecimalStr(memberId: string): string {
    const v = lockedById.get(memberId);
    if (v === undefined) return '';
    return (v / 100).toString();
  }

  const includedCount = includedMembers.length;
  const methodHint =
    method === 'equal'
      ? t('addExpense.nWays', { count: includedCount })
      : undefined;

  const showMethodPicker = allowedMethods.length > 1;

  return (
    <View>
      {showMethodPicker && (
        <>
          <SectionLabel>{t('addExpense.splitMethodLabel')}</SectionLabel>
          <View style={styles.segmentWrap}>
            {SPLIT_METHODS.filter((m) => allowedMethods.includes(m.id)).map(
              (m, i, arr) => (
                <SegmentButton
                  key={m.id}
                  label={t(m.labelKey)}
                  active={method === m.id}
                  onPress={() => setMethod(m.id)}
                  first={i === 0}
                  last={i === arr.length - 1}
                />
              ),
            )}
          </View>
        </>
      )}

      <SectionLabel hint={methodHint}>{t('addExpense.between')}</SectionLabel>
      {(method === 'exact' || method === 'percentage') && (
        <Text style={styles.autoFillHint}>{t('addExpense.autoFillHint')}</Text>
      )}
      <View style={{ paddingHorizontal: spacing.s5 }}>
        {members.map((m) => {
          const inc = includedSet.has(m.id);
          return (
            <View key={m.id} style={styles.payerRow}>
              <TouchableOpacity
                onPress={() => toggleIncluded(m.id)}
                style={styles.payerLeft}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, inc && styles.checkboxOn]}>
                  {inc && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Avatar
                  initials={initialsOf(m.name)}
                  size="sm"
                  source={avatarImageSource(m, authToken)}
                />
                <Text style={[styles.payerName, !inc && { color: colors.lead }]}>
                  {memberLabel(m)}
                </Text>
              </TouchableOpacity>
              {inc && method === 'equal' && (
                <Text style={styles.equalShare}>
                  {fmtMinor(equalShare, currency)}
                </Text>
              )}
              {inc && method === 'exact' && (
                <AutoSplitField
                  value={lockedDecimalStr(m.id)}
                  onChange={(v) => setLockedDecimal(m.id, v)}
                  onClear={() => setLockedDecimal(m.id, '')}
                  autoPlaceholder={fmtAutoMinor(autoExactMinor[m.id] ?? 0)}
                  unit={currency.toLowerCase()}
                />
              )}
              {inc && method === 'percentage' && (
                <AutoSplitField
                  value={lockedDecimalStr(m.id)}
                  onChange={(v) => setLockedDecimal(m.id, v)}
                  onClear={() => setLockedDecimal(m.id, '')}
                  autoPlaceholder={fmtAutoPct(autoPctBp[m.id] ?? 0)}
                  unit="%"
                  narrow
                />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.reconcileWrap}>
        <View style={styles.reconcileCard}>
          <View style={styles.reconcileRow}>
            <Text style={styles.reconcileLabel}>
              {t('addExpense.totalSplit')}
            </Text>
            <Text style={styles.reconcileValue}>
              {fmtMinor(totalSplitMinor, currency)}
            </Text>
          </View>
          <View style={styles.reconcileRow}>
            <Text style={styles.reconcileLabel}>
              {t('addExpense.matchesPaid')}
            </Text>
            <Text
              style={[
                styles.reconcileValue,
                { color: offBy === 0 ? colors.moss : colors.brick },
              ]}
            >
              {offBy === 0
                ? ''
                : `${fmtMinor(Math.abs(offBy), currency)} ${
                    offBy > 0
                      ? t('addExpense.leftToAssign')
                      : t('addExpense.overBy')
                  }`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────
function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <View style={styles.sectionLabelWrap}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {hint && <Text style={styles.sectionLabel}>{hint}</Text>}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
  first,
  last,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.segmentBtn,
        active && styles.segmentBtnActive,
        first && styles.segmentBtnFirst,
        last && styles.segmentBtnLast,
      ]}
    >
      <Text
        style={[styles.segmentBtnLabel, active && styles.segmentBtnLabelActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AutoSplitField({
  value,
  onChange,
  onClear,
  autoPlaceholder,
  unit,
  narrow,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  autoPlaceholder: string;
  unit: string;
  narrow?: boolean;
}) {
  const locked = value !== '';
  return (
    <View style={styles.amountField}>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={autoPlaceholder}
        placeholderTextColor={colors.lead}
        style={[
          styles.amountFieldInput,
          narrow && { width: 50 },
          !locked && styles.amountFieldInputAuto,
        ]}
      />
      <Text style={styles.amountFieldUnit}>{unit}</Text>
      {locked ? (
        <TouchableOpacity onPress={onClear} hitSlop={10} style={styles.clearBtn}>
          <Text style={styles.clearBtnLabel}>✕</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.autoBadge}>
          <Text style={styles.autoBadgeLabel}>auto</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    marginBottom: 6,
    marginTop: spacing.s3,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },

  segmentWrap: {
    flexDirection: 'row',
    paddingHorizontal: spacing.s5,
    marginBottom: spacing.s3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.graphite,
    borderLeftWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnFirst: {
    borderLeftWidth: 1,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  segmentBtnLast: { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  segmentBtnActive: { backgroundColor: colors.graphite },
  segmentBtnLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
  },
  segmentBtnLabelActive: { color: colors.paper },

  payerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  payerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  payerName: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    flexShrink: 1,
  },

  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxOn: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  checkmark: {
    color: colors.paper,
    fontSize: 11,
    lineHeight: 12,
    fontFamily: fontMonoMedium,
  },

  equalShare: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  amountField: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  amountFieldInput: {
    fontFamily: fontMonoMedium,
    fontSize: 18,
    color: colors.graphite,
    width: 70,
    textAlign: 'right',
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    fontVariant: ['tabular-nums'],
  },
  amountFieldUnit: { fontFamily: fontMono, fontSize: 11, color: colors.lead },
  amountFieldInputAuto: { fontStyle: 'italic', color: colors.lead },
  clearBtn: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bone,
  },
  clearBtnLabel: {
    fontFamily: fontMono,
    fontSize: 10,
    color: colors.lead,
    lineHeight: 11,
  },
  autoBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.bone,
  },
  autoBadgeLabel: {
    fontFamily: fontMono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.lead,
    textTransform: 'uppercase',
  },
  autoFillHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    paddingHorizontal: spacing.s5,
    marginBottom: 4,
  },

  reconcileWrap: { paddingHorizontal: spacing.s5, paddingTop: spacing.s4 },
  reconcileCard: {
    padding: 12,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 6,
    gap: 4,
  },
  reconcileRow: { flexDirection: 'row', justifyContent: 'space-between' },
  reconcileLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  reconcileValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
});
