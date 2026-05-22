/**
 * ExpenseForm — shared form body used by add-expense and edit-expense.
 *
 * Spec: docs/superpowers/specs/2026-05-23-edit-expense-design.md §"Shared
 * expense form".
 *
 * NOTE: The add-expense screen is large and integrates receipt OCR, FX
 * preview, item-assign, and duplicate detection. This component intentionally
 * encapsulates the *core* edit-friendly fields: title, amount, currency,
 * payer, split method + per-member shares, date, and notes. The add-expense
 * screen's full feature set (OCR / FX preview / item-assign / dup-warn) is
 * orchestrated by the host screen — this component focuses on the editable
 * shape of an expense. A follow-up will migrate add-expense to embed this
 * component once its host-only side effects are isolated.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Text } from './Text';
import type { GroupMember } from '../lib/api';
import { initialsOf } from '../lib/name';
import { currentLocale } from '../lib/i18n';
import {
  colors,
  fontBody,
  fontBodyMedium,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '../lib/theme';

export type SplitMethod = 'equal' | 'exact' | 'percentage';

export interface ExpenseFormValue {
  title: string;
  /** Decimal string in the chosen currency (matches wire format). */
  amount: string;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  participants: string[];
  /** Per-member decimal share strings, indexed by member id. Only meaningful
   *  when splitMethod is `exact`. */
  exactByMember: Record<string, string>;
  /** Per-member basis-points indexed by member id. Only meaningful when
   *  splitMethod is `percentage`. */
  pctByMember: Record<string, string>;
  expenseDate: string; // ISO yyyy-mm-dd
  category: string;
  notes: string;
}

interface Props {
  mode: 'create' | 'edit';
  groupId: string;
  serverUrl: string;
  members: GroupMember[];
  initialValue?: ExpenseFormValue;
  onSubmit: (value: ExpenseFormValue) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
  /** Override the primary CTA label. Defaults to "Save changes" in edit
   *  mode, "Add expense" in create mode. */
  submitLabel?: string;
}

function blankValue(members: GroupMember[]): ExpenseFormValue {
  return {
    title: '',
    amount: '',
    currency: 'SEK',
    paidByMemberId: members[0]?.id ?? '',
    splitMethod: 'equal',
    participants: members.map((m) => m.id),
    exactByMember: {},
    pctByMember: {},
    expenseDate: new Date().toISOString().split('T')[0],
    category: 'other',
    notes: '',
  };
}

export function ExpenseForm({
  mode,
  members,
  initialValue,
  onSubmit,
  submitting,
  error,
  submitLabel,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState<ExpenseFormValue>(
    initialValue ?? blankValue(members),
  );

  // If a fresh initialValue arrives after the first mount (e.g. expense
  // loaded asynchronously), reset state to it.
  const initialKey =
    initialValue &&
    `${initialValue.title}|${initialValue.amount}|${initialValue.currency}|${initialValue.expenseDate}|${initialValue.paidByMemberId}|${initialValue.splitMethod}`;
  useEffect(() => {
    if (initialValue) setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  function update<K extends keyof ExpenseFormValue>(k: K, v: ExpenseFormValue[K]) {
    setValue((prev) => ({ ...prev, [k]: v }));
  }

  function toggleParticipant(memberId: string) {
    setValue((prev) => {
      const included = prev.participants.includes(memberId);
      const next = included
        ? prev.participants.filter((id) => id !== memberId)
        : [...prev.participants, memberId];
      return { ...prev, participants: next };
    });
  }

  const amountMinor = useMemo(() => {
    const n = parseFloat(value.amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [value.amount]);

  const canSubmit =
    value.title.trim().length > 0 &&
    amountMinor > 0 &&
    !!value.paidByMemberId &&
    value.participants.length > 0;

  function handleSubmit() {
    if (!canSubmit || submitting) return;
    onSubmit(value);
  }

  const defaultSubmitLabel =
    mode === 'edit' ? t('impactSheet.save') : t('addExpense.submit');

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.titleLabel')}</Text>
        <TextInput
          value={value.title}
          onChangeText={(v) => update('title', v)}
          placeholder={t('addExpense.titlePlaceholder')}
          placeholderTextColor={colors.lead}
          style={styles.titleInput}
          accessibilityLabel={t('addExpense.titleLabel')}
        />
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.amount')}</Text>
        <View style={styles.amountRow}>
          <TextInput
            value={value.amount}
            onChangeText={(v) => update('amount', v)}
            placeholder="0"
            placeholderTextColor={colors.lead}
            keyboardType="decimal-pad"
            style={styles.amountInput}
            accessibilityLabel={t('addExpense.amount')}
          />
          <Text style={styles.currency}>{value.currency.toLowerCase()}</Text>
        </View>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.whenLabel')}</Text>
        <DateField
          value={value.expenseDate}
          onChange={(v) => update('expenseDate', v)}
        />
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.paidByLabel')}</Text>
        {members.map((m) => {
          const selected = m.id === value.paidByMemberId;
          return (
            <TouchableOpacity
              key={m.id}
              style={styles.memberRow}
              onPress={() => update('paidByMemberId', m.id)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={[styles.radio, selected && styles.radioActive]}>
                {selected && <View style={styles.radioDot} />}
              </View>
              <Avatar initials={initialsOf(m.name)} size="sm" />
              <Text style={styles.memberName}>{m.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.splitMethodLabel')}</Text>
        <View style={styles.segmentWrap}>
          {(['equal', 'exact', 'percentage'] as SplitMethod[]).map((m, i) => (
            <TouchableOpacity
              key={m}
              onPress={() => update('splitMethod', m)}
              activeOpacity={0.7}
              style={[
                styles.segmentBtn,
                value.splitMethod === m && styles.segmentBtnActive,
                i === 0 && styles.segmentBtnFirst,
                i === 2 && styles.segmentBtnLast,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: value.splitMethod === m }}
            >
              <Text
                style={[
                  styles.segmentBtnLabel,
                  value.splitMethod === m && styles.segmentBtnLabelActive,
                ]}
              >
                {t(`addExpense.method${m === 'equal' ? 'Equal' : m === 'exact' ? 'Exact' : 'Percent'}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.between')}</Text>
        {members.map((m) => {
          const included = value.participants.includes(m.id);
          return (
            <View key={m.id} style={styles.memberRow}>
              <TouchableOpacity
                onPress={() => toggleParticipant(m.id)}
                style={styles.memberLeft}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: included }}
              >
                <View style={[styles.checkbox, included && styles.checkboxOn]}>
                  {included && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Avatar initials={initialsOf(m.name)} size="sm" />
                <Text
                  style={[
                    styles.memberName,
                    !included && { color: colors.lead },
                  ]}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
              {included && value.splitMethod === 'exact' && (
                <TextInput
                  value={value.exactByMember[m.id] ?? ''}
                  onChangeText={(v) =>
                    update('exactByMember', { ...value.exactByMember, [m.id]: v })
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.lead}
                  style={styles.shareInput}
                  accessibilityLabel={`${m.name} share`}
                />
              )}
              {included && value.splitMethod === 'percentage' && (
                <TextInput
                  value={value.pctByMember[m.id] ?? ''}
                  onChangeText={(v) =>
                    update('pctByMember', { ...value.pctByMember, [m.id]: v })
                  }
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.lead}
                  style={styles.shareInput}
                  accessibilityLabel={`${m.name} percent`}
                />
              )}
            </View>
          );
        })}
      </View>

      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.s3 }]}>
        {!!error && (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Button
          kind="primary"
          onPress={handleSubmit}
          disabled={!canSubmit || !!submitting}
        >
          {submitting ? t('common.saving') : submitLabel ?? defaultSubmitLabel}
        </Button>
      </View>
    </View>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const date = new Date(value + 'T00:00:00');
  const formatted = isNaN(date.getTime())
    ? t('common.dash')
    : date.toLocaleDateString(currentLocale(), {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={isNaN(date.getTime()) ? new Date() : date}
        mode="date"
        maximumDate={new Date()}
        display="compact"
        onChange={(_, selected) => {
          if (selected) onChange(selected.toISOString().split('T')[0]);
        }}
      />
    );
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        style={styles.dateBtn}
        accessibilityRole="button"
      >
        <Text style={styles.dateValue}>{formatted}</Text>
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={isNaN(date.getTime()) ? new Date() : date}
          mode="date"
          maximumDate={new Date()}
          display="default"
          onChange={(event, selected) => {
            setOpen(false);
            if (event.type === 'set' && selected) {
              onChange(selected.toISOString().split('T')[0]);
            }
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  body: { paddingBottom: spacing.s5 },
  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 0.5,
    borderTopColor: colors.ruleSoft,
    backgroundColor: colors.paper,
    gap: spacing.s3,
  },
  fieldWrap: {
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginBottom: spacing.s2,
    letterSpacing: 0.3,
  },
  titleInput: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    padding: 0,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountInput: {
    flex: 1,
    fontFamily: fontMonoMedium,
    fontSize: 36,
    color: colors.graphite,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  currency: { fontFamily: fontMono, fontSize: 18, color: colors.lead },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    gap: spacing.s3,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    flex: 1,
  },
  memberName: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    flex: 1,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.vermillion },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.vermillion },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  checkmark: { color: colors.paper, fontSize: 11, fontFamily: fontMonoMedium },
  segmentWrap: { flexDirection: 'row' },
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
  segmentBtnFirst: { borderLeftWidth: 1, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  segmentBtnLast: { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  segmentBtnActive: { backgroundColor: colors.graphite },
  segmentBtnLabel: { fontFamily: fontBodyMedium, fontSize: fontSize.bodyS, color: colors.graphite },
  segmentBtnLabelActive: { color: colors.paper },
  shareInput: {
    fontFamily: fontMonoMedium,
    fontSize: 16,
    color: colors.graphite,
    width: 90,
    textAlign: 'right',
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    fontVariant: ['tabular-nums'],
  },
  dateBtn: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 8,
  },
  dateValue: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  errorBanner: {
    margin: spacing.s5,
    padding: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  errorText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
  },
});
