/**
 * Single-screen scrollable form for creating + editing a recurring bill.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md §4.5
 *
 * Sections, top → bottom:
 *   1. What & how much  — title, amount, category, currency-locked chip
 *   2. Who pays         — payer picker scoped to current group members
 *   3. Split            — uses the shared <SplitEditor>; supports equal,
 *                         exact, and percentage methods (matching the
 *                         one-off expense wizard).
 *   4. Schedule         — frequency unit chips, mono interval input,
 *                         start_date (read-only on edit), end_date,
 *                         fire_local_time, timezone.
 *   5. Preview          — computed from nextFire(), live as inputs change.
 *   6. Footer           — Save (+ Pause/Resume on edit; Delete via action
 *                         sheet, not on the footer).
 *
 * Currency comes from the group and is immutable for the rule's life.
 * Edits apply to future bills only; the "editFutureOnlyNotice" line is
 * rendered above the schedule section in edit mode.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getCalendars } from 'expo-localization';
import { Feather } from '@expo/vector-icons';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { ActionSheet } from '@/components/ActionSheet';
import { SplitEditor, type SplitValue } from '@/components/SplitEditor';
import { apiFor, GroupDetail } from '@/lib/api';
import type {
  CreateRecurringInput,
  RecurringExpense,
  UpdateRecurringInput,
} from '@/lib/api-types-recurring';
import { showAlert } from '@/lib/app-alert';
import { formatDate, formatMinorUnits, formatTime } from '@/lib/i18n';
import { isPopupJustClosed, markPopupClosed } from '@/lib/popup-guard';
import { nextFire } from '@/lib/recurring/next-fire';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

type FreqUnit = RecurringExpense['freq_unit'];

interface Props {
  serverUrl: string;
  groupId: string;
  mode: 'create' | 'edit';
  initialValue?: RecurringExpense;
  onSaved: (rule: RecurringExpense) => void;
}

function deviceTimezone(): string {
  const tz = getCalendars()[0]?.timeZone ?? null;
  // Fallback to Intl when expo-localization didn't surface one (web).
  return tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYmd(s: string): Date {
  // Treat the date string as local-midnight so the picker shows the same
  // day the user typed. The schedule logic re-anchors via tz separately.
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function parseFireTime(s: string): Date {
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10));
  const d = new Date();
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}

function formatFireTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function RecurringForm({
  serverUrl,
  groupId,
  mode,
  initialValue,
  onSaved,
}: Props) {
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loadError, setLoadError] = useState(false);

  // --- form state -------------------------------------------------------
  const [title, setTitle] = useState(initialValue?.title ?? '');
  // amount is stored as a digits-only string we parse to minor units on save.
  const [amountInput, setAmountInput] = useState(
    initialValue ? String(initialValue.amount_minor / 100) : '',
  );
  const [category, setCategory] = useState(initialValue?.category ?? 'other');
  const [payerId, setPayerId] = useState(initialValue?.paid_by_id ?? '');
  // Split state matches the wire shape. SplitEditor (shared with the
  // expense wizard) handles equal/exact/percentage in one component.
  const [split, setSplit] = useState<SplitValue>(() => {
    if (initialValue) {
      return {
        method: initialValue.split_method,
        included: initialValue.splits.map((s) => s.member_id),
        // For 'equal', value is unused; for exact/percentage it is the
        // locked minor / basis-points value the server stored.
        splits:
          initialValue.split_method === 'equal'
            ? []
            : initialValue.splits.map((s) => ({
                member_id: s.member_id,
                value: s.value,
              })),
      };
    }
    return { method: 'equal', included: [], splits: [] };
  });
  const [freqUnit, setFreqUnit] = useState<FreqUnit>(
    initialValue?.freq_unit ?? 'month',
  );
  const [freqInterval, setFreqInterval] = useState<string>(
    String(initialValue?.freq_interval ?? 1),
  );
  const [startDate, setStartDate] = useState<Date>(
    initialValue ? fromYmd(initialValue.start_date) : new Date(),
  );
  const [hasEnd, setHasEnd] = useState<boolean>(!!initialValue?.end_date);
  const [endDate, setEndDate] = useState<Date | null>(
    initialValue?.end_date ? fromYmd(initialValue.end_date) : null,
  );
  const [fireTime, setFireTime] = useState<Date>(
    parseFireTime(initialValue?.fire_local_time ?? '09:00'),
  );
  const [timezone, setTimezone] = useState<string>(
    initialValue?.timezone ?? deviceTimezone(),
  );

  // Picker visibility state.
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [payerSheetOpen, setPayerSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  // --- load group (members + currency) ---------------------------------
  useEffect(() => {
    let cancelled = false;
    api
      .getGroup(groupId)
      .then((g) => {
        if (cancelled) return;
        setGroup(g);
        // First-load defaults for create mode: payer = me-or-first-member,
        // split = all members.
        if (mode === 'create') {
          if (!payerId && g.members[0]) setPayerId(g.members[0].id);
          if (split.included.length === 0) {
            setSplit((s) => ({ ...s, included: g.members.map((m) => m.id) }));
          }
        }
      })
      .catch(() => setLoadError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, serverUrl]);

  const currency =
    initialValue?.currency ?? group?.currency ?? '—';

  // --- preview ----------------------------------------------------------
  const previewLines = useMemo(() => {
    const interval = Math.max(1, parseInt(freqInterval, 10) || 1);
    const rule = {
      freq_unit: freqUnit,
      freq_interval: interval,
      start_date: toYmd(startDate),
      end_date: hasEnd && endDate ? toYmd(endDate) : null,
      timezone,
      fire_local_time: formatFireTime(fireTime),
    };
    try {
      // Anchor preview from start_date; show the next 3 occurrences.
      const dates: Date[] = [];
      let cursor = fromYmd(rule.start_date);
      for (let i = 0; i < 3; i++) {
        const r = nextFire(rule, cursor);
        if (r.status === 'ended') break;
        dates.push(r.next_fire);
        cursor = r.next_fire;
      }
      if (dates.length === 0) return null;
      const [first, ...rest] = dates;
      return {
        first: t('recurring.previewNext', {
          date: formatDate(first),
          time: formatTime(first),
          tz: timezone,
        }),
        then:
          rest.length > 0
            ? t('recurring.previewThen', {
                dates: rest.map((d) => formatDate(d)).join(', '),
              })
            : null,
      };
    } catch {
      return null;
    }
  }, [freqUnit, freqInterval, startDate, hasEnd, endDate, timezone, fireTime, t]);

  // --- save -------------------------------------------------------------
  async function handleSave() {
    if (!group) return;
    const amount = parseFloat(amountInput.replace(',', '.'));
    if (!title.trim() || !isFinite(amount) || amount <= 0) {
      showAlert({
        title: t('addExpense.invalidAmountTitle'),
        message: t('addExpense.invalidAmountBody'),
      });
      return;
    }
    if (!payerId || split.included.length === 0) return;

    const amountMinor = Math.round(amount * 100);
    // Wire-format splits, per method:
    //   - equal: one row per included member, value=1 (placeholder the
    //     backend ignores; it recomputes minor units per occurrence)
    //   - exact / percentage: one row per included member; locked values
    //     ride as-is; unlocked (auto-fill) members get value=0 and the
    //     backend distributes the remainder.
    const splits = split.included.map((member_id) => {
      if (split.method === 'equal') return { member_id, value: 1 };
      const locked = split.splits.find((s) => s.member_id === member_id);
      return { member_id, value: locked?.value ?? 0 };
    });

    const interval = Math.max(1, parseInt(freqInterval, 10) || 1);
    const base = {
      title: title.trim(),
      amount_minor: amountMinor,
      paid_by_id: payerId,
      split_method: split.method,
      splits,
      category,
      notes: null,
      freq_unit: freqUnit,
      freq_interval: interval,
      end_date: hasEnd && endDate ? toYmd(endDate) : null,
      timezone,
      fire_local_time: formatFireTime(fireTime),
    };

    setSaving(true);
    try {
      if (mode === 'create') {
        const input: CreateRecurringInput = {
          ...base,
          start_date: toYmd(startDate),
        };
        const saved = await api.recurring.create(groupId, input);
        onSaved(saved);
      } else if (initialValue) {
        const input: UpdateRecurringInput = base;
        const saved = await api.recurring.update(groupId, initialValue.id, input);
        onSaved(saved);
      }
    } catch (e: any) {
      showAlert({
        title: t('addExpense.saveErrorTitle'),
        message: e?.message || t('addExpense.saveErrorBody'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handlePauseResume() {
    if (!initialValue) return;
    try {
      const updated =
        initialValue.status === 'paused'
          ? await api.recurring.resume(groupId, initialValue.id)
          : await api.recurring.pause(groupId, initialValue.id);
      onSaved(updated);
    } catch (e: any) {
      showAlert({ title: t('common.error'), message: e?.message || String(e) });
    }
  }

  async function handleDelete() {
    if (!initialValue) return;
    const r = await showAlert({
      title: t('recurring.deleteButton'),
      message: t('recurring.editFutureOnlyNotice'),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'delete', label: t('recurring.deleteButton'), style: 'destructive' },
      ],
    });
    if (r !== 'delete') return;
    try {
      await api.recurring.delete(groupId, initialValue.id);
      router.back();
    } catch (e: any) {
      showAlert({ title: t('common.error'), message: e?.message || String(e) });
    }
  }

  function openMoreSheet() {
    if (isPopupJustClosed()) return;
    setMoreSheetOpen(true);
  }

  function openPayerSheet() {
    if (isPopupJustClosed()) return;
    setPayerSheetOpen(true);
  }

  const members = group?.members ?? [];
  const payerName = members.find((m) => m.id === payerId)?.name ?? '—';

  // Live amount in minor units — feeds the SplitEditor reconcile card so
  // exact/percentage breakdowns show correct rounded shares as the user
  // types. Falls back to 0 for empty/invalid input (editor handles it).
  const amountMinorPreview = useMemo(() => {
    const n = parseFloat(amountInput.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amountInput]);

  // --- render -----------------------------------------------------------
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={
          mode === 'create' ? t('recurring.newButton') : t('recurring.listHeader')
        }
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
        right={
          mode === 'edit' ? (
            <IconButton icon="more-horizontal" onPress={openMoreSheet} />
          ) : undefined
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
        keyboardShouldPersistTaps="handled"
      >
        {loadError && (
          <Text style={styles.errorBanner}>{t('common.error')}</Text>
        )}

        {/* SECTION 1 — What & how much */}
        <Section eyebrow={t('addExpense.stepWhat')}>
          <LabeledInput
            label={t('addExpense.titleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('addExpense.titlePlaceholder')}
          />
          <LabeledInput
            label={t('addExpense.amount')}
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder={t('addExpense.amountPlaceholder')}
            keyboardType="decimal-pad"
            mono
          />
          <Text style={styles.helper}>
            {t('recurring.currencyLockedHelp', { currency })}
          </Text>
        </Section>

        {/* SECTION 2 — Who pays */}
        <Section eyebrow={t('addExpense.paidByLabel')}>
          <Pressable
            onPress={openPayerSheet}
            style={styles.rowButton}
            accessibilityRole="button"
          >
            <Text style={styles.rowButtonLabel}>{payerName}</Text>
            <Feather name="chevron-down" size={18} color={colors.lead} />
          </Pressable>
        </Section>

        {/* SECTION 3 — Split (shared editor: equal / exact / percentage) */}
        <Section eyebrow={t('addExpense.splitLabel')}>
          <SplitEditor
            members={members}
            totalMinor={amountMinorPreview}
            currency={currency === '—' ? '' : currency}
            value={split}
            onChange={setSplit}
            authToken={null}
          />
        </Section>

        {/* SECTION 4 — Schedule */}
        <Section eyebrow={t('recurring.scheduleEyebrow')}>
          {mode === 'edit' && (
            <Text style={styles.helper}>
              {t('recurring.editFutureOnlyNotice')}
            </Text>
          )}

          <View style={styles.chipsRow}>
            {(['day', 'week', 'month', 'year'] as FreqUnit[]).map((u) => {
              const on = freqUnit === u;
              const unitKey =
                u === 'day'
                  ? 'recurring.unitDay'
                  : u === 'week'
                    ? 'recurring.unitWeek'
                    : u === 'month'
                      ? 'recurring.unitMonth'
                      : 'recurring.unitYear';
              return (
                <Pressable
                  key={u}
                  onPress={() => setFreqUnit(u)}
                  style={[styles.unitChip, on && styles.unitChipOn]}
                >
                  <Text style={[styles.unitChipLabel, on && styles.unitChipLabelOn]}>
                    {t(unitKey, { count: 2 })}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.intervalRow}>
            <Text style={styles.intervalPrefix}>{t('recurring.intervalPrefix')}</Text>
            <TextInput
              value={freqInterval}
              onChangeText={(v) => setFreqInterval(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={styles.intervalInput}
              maxLength={3}
            />
            <Text style={styles.intervalSuffix}>
              {t(
                freqUnit === 'day'
                  ? 'recurring.unitDay'
                  : freqUnit === 'week'
                    ? 'recurring.unitWeek'
                    : freqUnit === 'month'
                      ? 'recurring.unitMonth'
                      : 'recurring.unitYear',
                { count: parseInt(freqInterval, 10) || 1 },
              )}
            </Text>
          </View>

          {/* start_date */}
          <DateRow
            label={t('recurring.startLabel')}
            value={formatDate(startDate)}
            readOnly={mode === 'edit'}
            onPress={() => {
              if (mode === 'edit') return;
              setShowStart(true);
            }}
          />
          {showStart && (
            <DateTimePicker
              value={startDate}
              mode="date"
              minimumDate={new Date()}
              onChange={(event, selected) => {
                if (Platform.OS !== 'ios') setShowStart(false);
                if (event.type === 'set' && selected) setStartDate(selected);
              }}
            />
          )}

          {/* end_date toggle + picker */}
          <Pressable
            onPress={() => {
              setHasEnd((v) => {
                const next = !v;
                if (next && !endDate) setEndDate(startDate);
                return next;
              });
            }}
            style={styles.toggleRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: hasEnd }}
          >
            <Text style={styles.toggleLabel}>{t('recurring.endDateLabel')}</Text>
            <Text style={styles.toggleValue}>
              {hasEnd ? t('recurring.endDateOn') : t('recurring.endDateOff')}
            </Text>
          </Pressable>
          {hasEnd && (
            <>
              <DateRow
                label={t('recurring.endsLabel')}
                value={endDate ? formatDate(endDate) : '—'}
                onPress={() => setShowEnd(true)}
              />
              {showEnd && (
                <DateTimePicker
                  value={endDate ?? startDate}
                  mode="date"
                  minimumDate={startDate}
                  onChange={(event, selected) => {
                    if (Platform.OS !== 'ios') setShowEnd(false);
                    if (event.type === 'set' && selected) setEndDate(selected);
                  }}
                />
              )}
            </>
          )}

          {/* fire time */}
          <DateRow
            label={t('recurring.timeLabel')}
            value={formatTime(fireTime)}
            onPress={() => setShowTime(true)}
          />
          {showTime && (
            <DateTimePicker
              value={fireTime}
              mode="time"
              onChange={(event, selected) => {
                if (Platform.OS !== 'ios') setShowTime(false);
                if (event.type === 'set' && selected) setFireTime(selected);
              }}
            />
          )}

          {/* timezone — read-only (device default; we don't ship a TZ
              picker in v1 since "device" is correct for every realistic
              user. Tracked as future enhancement.) */}
          <DateRow label={t('recurring.timezoneLabel')} value={timezone} />
        </Section>

        {/* SECTION 5 — Preview */}
        {previewLines && (
          <Section eyebrow={t('recurring.previewEyebrow')}>
            <Text style={styles.previewText}>{previewLines.first}</Text>
            {previewLines.then && (
              <Text style={[styles.previewText, styles.previewThen]}>
                {previewLines.then}
              </Text>
            )}
          </Section>
        )}

        {/* SECTION 6 — Footer */}
        <View style={styles.footer}>
          <Button onPress={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('recurring.saveButton')}
          </Button>
          {mode === 'edit' && initialValue && (
            <Button kind="secondary" onPress={handlePauseResume}>
              {initialValue.status === 'paused'
                ? t('recurring.resumeButton')
                : t('recurring.pauseButton')}
            </Button>
          )}
          {mode === 'edit' && initialValue && (
            <Text style={styles.amountMeta}>
              {formatMinorUnits(initialValue.amount_minor, initialValue.currency)}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Payer picker sheet */}
      <ActionSheet
        visible={payerSheetOpen}
        onClose={() => {
          markPopupClosed();
          setPayerSheetOpen(false);
        }}
        title={t('addExpense.whoPaid')}
        options={members.map((m) => ({
          label: m.name,
          onPress: () => setPayerId(m.id),
        }))}
      />

      {/* "More" sheet on edit — Delete lives here, off the footer. */}
      <ActionSheet
        visible={moreSheetOpen}
        onClose={() => {
          markPopupClosed();
          setMoreSheetOpen(false);
        }}
        options={[
          {
            label: t('recurring.deleteButton'),
            destructive: true,
            onPress: handleDelete,
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Local presentational helpers.
// ---------------------------------------------------------------------------

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  mono,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  mono?: boolean;
}) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.lead}
        keyboardType={keyboardType ?? 'default'}
        style={[styles.input, mono && styles.inputMono]}
        allowFontScaling
        maxFontSizeMultiplier={2}
      />
    </View>
  );
}

function DateRow({
  label,
  value,
  onPress,
  readOnly,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  readOnly?: boolean;
}) {
  const disabled = readOnly || !onPress;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.dateRow, disabled && styles.dateRowDisabled]}
      accessibilityRole={disabled ? undefined : 'button'}
    >
      <Text style={styles.dateRowLabel}>{label}</Text>
      <Text style={styles.dateRowValue}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  errorBanner: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s3,
  },
  section: {
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s5,
  },
  sectionEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: spacing.s2,
    paddingHorizontal: spacing.s1,
  },
  card: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    paddingVertical: spacing.s2,
  },
  inputRow: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: 4,
  },
  inputLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    padding: 0,
  },
  inputMono: {
    fontFamily: fontMonoMedium,
    fontVariant: ['tabular-nums'],
  },
  helper: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
  },
  rowButtonLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  unitChip: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.lead,
  },
  unitChipOn: {
    backgroundColor: colors.graphite,
    borderColor: colors.graphite,
  },
  unitChipLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  unitChipLabelOn: { color: colors.fgOnAccent },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: spacing.s2,
  },
  intervalPrefix: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.lead,
  },
  intervalInput: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    minWidth: 40,
    padding: 4,
    textAlign: 'center',
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 6,
  },
  intervalSuffix: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  dateRowDisabled: { opacity: 0.6 },
  dateRowLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  dateRowValue: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  toggleLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  toggleValue: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  previewText: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  previewThen: {
    color: colors.lead,
    fontSize: fontSize.bodyS,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s6,
    gap: spacing.s3,
  },
  amountMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    textAlign: 'center',
    marginTop: spacing.s2,
  },
});
