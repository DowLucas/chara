/**
 * ExpenseWizard — 2-step expense create/edit wizard.
 *
 * Extracted from `app/groups/[server]/[id]/add-expense.tsx` so both add and
 * edit hosts share one body. Host owns: data fetch, OCR modal, scan-items
 * modal, save-success overlay, duplicate detection, API call. Wizard owns:
 * all in-form state (amount, title, date, currency, FX, payer, split method,
 * per-member shares), the stepper, the CTA bar, and the keypad/picker/date
 * modals scoped to the wizard.
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/lib/app-alert';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { ContentContainer } from '@/components/ContentContainer';
import { AmountKeypad } from '@/components/AmountKeypad';
import { AmountField } from '@/components/AmountField';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { ActionSheet } from '@/components/ActionSheet';
import { EXPENSE_CATEGORIES, DEFAULT_CATEGORY, categoryLabelKey } from '@/lib/categories';
import { loadDraft, saveDraft, clearDraft } from '@/lib/expense-draft';
import {
  FxConversionSection,
  useFxConversion,
} from '@/components/FxConversionSection';
import { SplitEditor, type SplitValue } from '@/components/SplitEditor';
import {
  FxConvertResponse,
  GroupMember,
} from '@/lib/api';
import { currentLocale } from '@/lib/i18n';
import { evalExpression, hasOperator } from '@/lib/evalExpression';
import {
  colors,
  fontBody,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

const MAX_AMOUNT_MINOR = 9_999_999_99;

type Step = 1 | 2;
export type SplitMethod = 'equal' | 'exact' | 'percentage';

export interface ExpenseWizardInitialValue {
  title?: string;
  amount?: string;
  currency?: string;
  date?: Date;
  paidByMemberId?: string;
  category?: string;
  splitMethod?: SplitMethod;
  included?: Record<string, boolean>;
  exactByMember?: Record<string, string>;
  pctByMember?: Record<string, string>;
}

export interface ExpenseWizardSubmitPayload {
  title: string;
  amount: string;
  currency: string;
  expense_date: string;
  paid_by_id: string;
  category: string;
  split_method: SplitMethod;
  participants?: string[];
  splits?: Array<{ member_id: string; share?: string; basis_points?: number }>;
  fx?: {
    original_amount: string;
    original_currency: string;
    fx_rate: string;
    fx_as_of: string;
    fx_source: 'ecb' | 'manual';
  };
}

export interface ExpenseWizardHandle {
  applyReceiptResult(input: {
    amount?: string;
    currency?: string;
    title?: string;
    date?: Date;
  }): void;
  applyScanItemsAssignment(perMemberMinor: Record<string, number>): void;
}

export interface ExpenseWizardProps {
  mode: 'create' | 'edit';
  groupName: string;
  groupCurrency: string;
  members: GroupMember[];
  /** Member id whose user_id === current user. Used as the default payer in
   *  create mode and to render "You" in the split list. The wizard compares
   *  on member id directly. */
  currentUserMemberId?: string;
  initialValue?: ExpenseWizardInitialValue;
  convertFx: (input: {
    from: string;
    to: string;
    amountMinor: number;
    asOf?: string;
  }) => Promise<FxConvertResponse>;
  authToken: string | null;
  submitting?: boolean;
  submitLabel?: string;
  /** Override the back/close icon for step 1. Defaults to 'x'. */
  step1CancelIcon?: 'x' | 'arrow-left';
  /** Override the TopBar title. If omitted, no TopBar is rendered (host
   *  provides its own). */
  topBarTitle?: string;
  onCancel?: () => void;
  onSubmit: (payload: ExpenseWizardSubmitPayload) => void | Promise<void>;
  /** When set (create mode only), the in-progress form is auto-saved to local
   *  storage under this key and restored on next mount, so accidentally
   *  leaving the wizard doesn't lose what was typed. Cleared on a successful
   *  submit. Use `draftKey(serverUrl, groupId)` from `@/lib/expense-draft`. */
  draftKey?: string;
  /** Rendered above Step 1's hero (e.g. the "Scan receipt" row). */
  topSlot?: React.ReactNode;
  /** Rendered between the scroll and the CTA bar (e.g. duplicate banner). */
  preCtaSlot?: React.ReactNode;
  onValuesChange?: (snapshot: {
    title: string;
    amount: string;
    amountMinor: number;
    currency: string;
  }) => void;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
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

function buildInitialIncluded(
  members: GroupMember[],
  initial: ExpenseWizardInitialValue | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (initial?.included) {
    for (const m of members) {
      out[m.id] = initial.included[m.id] ?? false;
    }
    return out;
  }
  for (const m of members) out[m.id] = true;
  return out;
}

function initialKeyOf(
  iv: ExpenseWizardInitialValue | undefined,
  members: GroupMember[],
): string {
  if (!iv) return `__blank__|${members.map((m) => m.id).join(',')}`;
  return [
    iv.title ?? '',
    iv.amount ?? '',
    iv.currency ?? '',
    iv.date ? toDateStr(iv.date) : '',
    iv.paidByMemberId ?? '',
    iv.splitMethod ?? '',
    members.map((m) => m.id).join(','),
  ].join('|');
}

export const ExpenseWizard = forwardRef<ExpenseWizardHandle, ExpenseWizardProps>(
  function ExpenseWizard(props, ref) {
    const {
      mode,
      groupName,
      groupCurrency: groupCurrencyProp,
      members,
      currentUserMemberId,
      initialValue,
      convertFx,
      authToken,
      submitting,
      submitLabel,
      step1CancelIcon,
      topBarTitle,
      onCancel,
      onSubmit,
      topSlot,
      preCtaSlot,
      onValuesChange,
      draftKey,
    } = props;

    const { t } = useTranslation();
    const draftEnabled = mode === 'create' && !!draftKey;
    const [step, setStep] = useState<Step>(1);

    const [amount, setAmount] = useState(initialValue?.amount ?? '');
    const [title, setTitle] = useState(initialValue?.title ?? '');
    const [date, setDate] = useState<Date>(initialValue?.date ?? new Date());
    const [selectedCurrency, setSelectedCurrency] = useState<string>(
      initialValue?.currency ?? '',
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [payerSheetOpen, setPayerSheetOpen] = useState(false);

    const [payerMemberId, setPayerMemberId] = useState<string>(
      initialValue?.paidByMemberId ?? currentUserMemberId ?? '',
    );
    const [category, setCategory] = useState<string>(
      initialValue?.category ?? DEFAULT_CATEGORY,
    );
    const [categorySheetOpen, setCategorySheetOpen] = useState(false);

    const [method, setMethod] = useState<SplitMethod>(
      initialValue?.splitMethod ?? 'equal',
    );
    const [included, setIncluded] = useState<Record<string, boolean>>(() =>
      buildInitialIncluded(members, initialValue),
    );
    const [exactByMember, setExactByMember] = useState<Record<string, string>>(
      initialValue?.exactByMember ?? {},
    );
    const [pctByMember, setPctByMember] = useState<Record<string, string>>(
      initialValue?.pctByMember ?? {},
    );

    type KeypadTarget = { kind: 'amount' };
    const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null);

    // Reset state when the identity of `initialValue` or `members` changes
    // (e.g. expense loaded asynchronously in edit mode, or members arrived
    // after first render). Matches the `initialKey` pattern from ExpenseForm.
    const resetKey = initialKeyOf(initialValue, members);
    const firstRender = useRef(true);
    // Draft hydration owns create-mode state; skip the members-changed reset so
    // a restored draft isn't wiped when the member list arrives after mount.
    const draftHydrated = useRef(false);
    const draftSubmitted = useRef(false);
    useEffect(() => {
      if (firstRender.current) {
        firstRender.current = false;
        return;
      }
      if (draftEnabled) return;
      setAmount(initialValue?.amount ?? '');
      setTitle(initialValue?.title ?? '');
      setDate(initialValue?.date ?? new Date());
      setSelectedCurrency(initialValue?.currency ?? '');
      setPayerMemberId(
        initialValue?.paidByMemberId ?? currentUserMemberId ?? '',
      );
      setCategory(initialValue?.category ?? DEFAULT_CATEGORY);
      setMethod(initialValue?.splitMethod ?? 'equal');
      setIncluded(buildInitialIncluded(members, initialValue));
      setExactByMember(initialValue?.exactByMember ?? {});
      setPctByMember(initialValue?.pctByMember ?? {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetKey]);

    // Late-arriving currentUserMemberId for create mode (group loads after
    // the wizard mounts). Don't clobber if the user already picked someone
    // or initialValue specified one.
    useEffect(() => {
      if (
        mode === 'create' &&
        !payerMemberId &&
        currentUserMemberId &&
        !initialValue?.paidByMemberId
      ) {
        setPayerMemberId(currentUserMemberId);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUserMemberId]);

    // Restore an auto-saved draft once, on mount (create mode only).
    useEffect(() => {
      if (!draftEnabled || !draftKey) {
        draftHydrated.current = true;
        return;
      }
      let cancelled = false;
      loadDraft(draftKey, Date.now()).then((d) => {
        if (cancelled) return;
        if (d) {
          if (d.amount != null) setAmount(d.amount);
          if (d.title != null) setTitle(d.title);
          if (d.dateMs != null) setDate(new Date(d.dateMs));
          if (d.currency != null) setSelectedCurrency(d.currency);
          if (d.payerMemberId != null) setPayerMemberId(d.payerMemberId);
          if (d.category != null) setCategory(d.category);
          if (d.method != null) setMethod(d.method);
          if (d.included != null) setIncluded(d.included);
          if (d.exactByMember != null) setExactByMember(d.exactByMember);
          if (d.pctByMember != null) setPctByMember(d.pctByMember);
        }
        draftHydrated.current = true;
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save the in-progress draft (debounced) after hydration, until the
    // form is successfully submitted.
    useEffect(() => {
      if (!draftEnabled || !draftKey) return;
      if (!draftHydrated.current || draftSubmitted.current) return;
      const fields = {
        amount,
        title,
        dateMs: date.getTime(),
        currency: selectedCurrency,
        payerMemberId,
        category,
        method,
        included,
        exactByMember,
        pctByMember,
      };
      const handle = setTimeout(() => {
        if (draftSubmitted.current) return;
        saveDraft(draftKey, fields, Date.now());
      }, 600);
      return () => clearTimeout(handle);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      draftEnabled,
      draftKey,
      amount,
      title,
      date,
      selectedCurrency,
      payerMemberId,
      category,
      method,
      included,
      exactByMember,
      pctByMember,
    ]);

    // When members arrive after the wizard has mounted in create mode and
    // included is still empty, seed it.
    useEffect(() => {
      if (mode === 'create' && Object.keys(included).length === 0 && members.length > 0 && !initialValue?.included) {
        setIncluded(buildInitialIncluded(members, undefined));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members.length]);

    const keypadValue = keypadTarget?.kind === 'amount' ? amount : '';
    const setKeypadValue = (next: string) => {
      if (!keypadTarget) return;
      if (keypadTarget.kind === 'amount') setAmount(next);
    };

    const amountMinor = useMemo(() => {
      const cleaned = amount.replace(',', '.');
      const n = hasOperator(cleaned) ? evalExpression(cleaned) : parseFloat(cleaned);
      if (n === null || !Number.isFinite(n) || n <= 0) return 0;
      return Math.round(n * 100);
    }, [amount]);

    const groupCurrency = groupCurrencyProp;
    const currency = selectedCurrency || groupCurrency;
    const isForeignCurrency = currency !== groupCurrency;

    const fxAsOf = toDateStr(date);
    const { fx, rateInput, setRateInput, rateNumber, convertedMinor } =
      useFxConversion({
        from: currency,
        to: groupCurrency,
        amountMinor,
        asOf: fxAsOf,
        enabled: isForeignCurrency,
        convertFx,
        debounceMs: 350,
      });

    const fxApplied =
      isForeignCurrency && fx?.kind === 'ready' && rateNumber !== null;
    const effectiveAmountMinor = fxApplied ? convertedMinor : amountMinor;
    const effectiveCurrency = fxApplied ? groupCurrency : currency;

    const payerLabel =
      (payerMemberId === currentUserMemberId
        ? t('addExpense.you')
        : members.find((m) => m.id === payerMemberId)?.name) ?? '';

    const includedMembers = members.filter((m) => included[m.id]);
    const equalShare =
      method === 'equal' && includedMembers.length > 0
        ? Math.round(effectiveAmountMinor / includedMembers.length)
        : 0;

    // Clear custom split entries when the effective currency changes — amounts
    // typed in the old currency are meaningless in the new one. Deliberately
    // NOT keyed on `method`: a user-driven method switch already clears these
    // in handleSplitChange, and keying on `method` here would also wipe the
    // amounts that applyScanItemsAssignment() sets together with setMethod('exact'),
    // collapsing itemized receipt splits back to an equal split.
    useEffect(() => {
      setExactByMember({});
      setPctByMember({});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveCurrency]);

    function lockedExactMinor(memberId: string): number | null {
      const v = exactByMember[memberId];
      if (v === undefined || v === '') return null;
      const n = parseFloat(v.replace(',', '.'));
      if (!Number.isFinite(n)) return 0;
      return Math.round(n * 100);
    }
    function lockedPctBp(memberId: string): number | null {
      const v = pctByMember[memberId];
      if (v === undefined || v === '') return null;
      const n = parseFloat(v.replace(',', '.'));
      if (!Number.isFinite(n)) return 0;
      return Math.round(n * 100);
    }

    const autoExactMinor = useMemo<Record<string, number>>(() => {
      if (method !== 'exact') return {};
      let lockedSum = 0;
      const autoIds: string[] = [];
      for (const m of includedMembers) {
        const locked = lockedExactMinor(m.id);
        if (locked === null) autoIds.push(m.id);
        else lockedSum += locked;
      }
      const remaining = effectiveAmountMinor - lockedSum;
      const shares = distributeInt(remaining, autoIds.length);
      const out: Record<string, number> = {};
      autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
      return out;
    }, [method, includedMembers, exactByMember, effectiveAmountMinor]);

    const autoPctBp = useMemo<Record<string, number>>(() => {
      if (method !== 'percentage') return {};
      let lockedSum = 0;
      const autoIds: string[] = [];
      for (const m of includedMembers) {
        const locked = lockedPctBp(m.id);
        if (locked === null) autoIds.push(m.id);
        else lockedSum += locked;
      }
      const remaining = 10000 - lockedSum;
      const shares = distributeInt(remaining, autoIds.length);
      const out: Record<string, number> = {};
      autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
      return out;
    }, [method, includedMembers, pctByMember]);

    function effectiveMinor(memberId: string): number {
      if (method === 'exact') {
        return lockedExactMinor(memberId) ?? autoExactMinor[memberId] ?? 0;
      }
      if (method === 'percentage') {
        const bp = lockedPctBp(memberId) ?? autoPctBp[memberId] ?? 0;
        return Math.round((effectiveAmountMinor * bp) / 10000);
      }
      return 0;
    }

    const totalSplitMinor = useMemo(() => {
      if (method === 'equal') return effectiveAmountMinor;
      return includedMembers.reduce((s, m) => s + effectiveMinor(m.id), 0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [method, equalShare, includedMembers, exactByMember, pctByMember, effectiveAmountMinor, autoExactMinor, autoPctBp]);

    const offBy = totalSplitMinor - effectiveAmountMinor;

    // SplitEditor uses a single canonical SplitValue shape; the wizard still
    // owns the per-method maps it needs at submit time. These two adapters
    // bridge the gap.
    const splitValue = useMemo<SplitValue>(() => {
      const includedIds = members.filter((m) => included[m.id]).map((m) => m.id);
      const splits: SplitValue['splits'] = [];
      if (method === 'exact') {
        for (const m of members) {
          const v = exactByMember[m.id];
          if (v === undefined || v === '') continue;
          const n = parseFloat(v.replace(',', '.'));
          splits.push({
            member_id: m.id,
            value: Number.isFinite(n) ? Math.round(n * 100) : 0,
          });
        }
      } else if (method === 'percentage') {
        for (const m of members) {
          const v = pctByMember[m.id];
          if (v === undefined || v === '') continue;
          const n = parseFloat(v.replace(',', '.'));
          splits.push({
            member_id: m.id,
            value: Number.isFinite(n) ? Math.round(n * 100) : 0,
          });
        }
      }
      return { method, included: includedIds, splits };
    }, [members, included, method, exactByMember, pctByMember]);

    function handleSplitChange(next: SplitValue) {
      // Method change — clear sub-maps to mirror legacy behavior.
      if (next.method !== method) {
        setMethod(next.method);
        setExactByMember({});
        setPctByMember({});
        // included map stays the same.
        return;
      }
      // included update.
      const nextIncluded: Record<string, boolean> = {};
      for (const m of members) nextIncluded[m.id] = false;
      for (const id of next.included) nextIncluded[id] = true;
      let includedChanged = false;
      for (const m of members) {
        if ((included[m.id] ?? false) !== nextIncluded[m.id]) {
          includedChanged = true;
          break;
        }
      }
      if (includedChanged) setIncluded(nextIncluded);

      // splits update — translate numeric values back to decimal strings.
      if (next.method === 'exact') {
        const nextMap: Record<string, string> = {};
        for (const s of next.splits) {
          nextMap[s.member_id] = (s.value / 100).toString();
        }
        setExactByMember(nextMap);
      } else if (next.method === 'percentage') {
        const nextMap: Record<string, string> = {};
        for (const s of next.splits) {
          nextMap[s.member_id] = (s.value / 100).toString();
        }
        setPctByMember(nextMap);
      }
    }

    const canContinueStep1 = title.trim().length > 0 && amountMinor > 0;
    const canSubmit =
      canContinueStep1 && !!payerMemberId && offBy === 0 && includedMembers.length > 0;

    useEffect(() => {
      onValuesChange?.({ title, amount, amountMinor, currency });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, amount, amountMinor, currency]);

    useImperativeHandle(
      ref,
      () => ({
        applyReceiptResult(input) {
          if (input.amount !== undefined) setAmount(input.amount);
          if (input.currency) setSelectedCurrency(input.currency);
          if (input.title) setTitle(input.title);
          if (input.date) setDate(input.date);
        },
        applyScanItemsAssignment(perMemberMinor) {
          if (Object.keys(perMemberMinor).length === 0) return;
          setMethod('exact');
          const nextIncluded: Record<string, boolean> = {};
          const nextExact: Record<string, string> = {};
          for (const m of members) {
            const minor = perMemberMinor[m.id] ?? 0;
            nextIncluded[m.id] = minor > 0;
            if (minor > 0) nextExact[m.id] = (minor / 100).toFixed(2);
          }
          setIncluded(nextIncluded);
          setExactByMember(nextExact);
        },
      }),
      [members],
    );

    async function handleSubmit() {
      if (!canSubmit || !payerMemberId) return;

      if (amountMinor > MAX_AMOUNT_MINOR) {
        showAlert({
          title: t('addExpense.saveErrorTitle'),
          message: `Amount too large. Maximum is ${fmtMinor(MAX_AMOUNT_MINOR, currency)}.`,
        });
        return;
      }

      const amountDecimal = (effectiveAmountMinor / 100).toFixed(2);
      // FX-snapshot is sent so the backend doesn't re-convert: it preserves
      // exactly the rate (and source: 'ecb' vs 'manual') we showed the user.
      const fx_payload =
        fxApplied && fx?.kind === 'ready' && rateNumber !== null
          ? {
              original_amount: (amountMinor / 100).toFixed(2),
              original_currency: currency,
              fx_rate: String(rateNumber),
              fx_as_of: fx.data.as_of,
              fx_source:
                rateInput.trim() === fx.data.rate
                  ? ('ecb' as const)
                  : ('manual' as const),
            }
          : undefined;

      const base: ExpenseWizardSubmitPayload = {
        title: title.trim(),
        amount: amountDecimal,
        currency: effectiveCurrency,
        paid_by_id: payerMemberId,
        category,
        expense_date: toDateStr(date),
        split_method: method,
        ...(fx_payload ? { fx: fx_payload } : {}),
      };

      if (method === 'equal') {
        base.participants = includedMembers.map((m) => m.id);
      } else if (method === 'exact') {
        base.splits = includedMembers.map((m) => ({
          member_id: m.id,
          share: (effectiveMinor(m.id) / 100).toFixed(2),
        }));
      } else {
        base.splits = includedMembers.map((m) => ({
          member_id: m.id,
          basis_points: lockedPctBp(m.id) ?? autoPctBp[m.id] ?? 0,
        }));
      }

      if (draftEnabled && draftKey) {
        // Only clear the draft once the save actually succeeds — on failure we
        // keep it so the user doesn't lose their work. Relies on the host's
        // onSubmit rejecting on failure (add-expense rethrows).
        try {
          await onSubmit(base);
          draftSubmitted.current = true;
          clearDraft(draftKey);
        } catch {
          /* keep the draft for next time */
        }
      } else {
        await onSubmit(base);
      }
    }

    const recapMeta = fmtMinor(amountMinor, currency);

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          {topBarTitle !== undefined && (
            <TopBar
              title={topBarTitle}
              left={
                <IconButton
                  icon={
                    step === 1 ? (step1CancelIcon ?? 'x') : 'arrow-left'
                  }
                  onPress={() => (step === 1 ? onCancel?.() : setStep((step - 1) as Step))}
                />
              }
            />
          )}

          <Stepper current={step} t={t} />

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            <ContentContainer>
            {step === 1 && (
              <Step1
                t={t}
                amount={amount}
                currency={currency}
                onOpenCurrencyPicker={() => setPickerOpen(true)}
                title={title}
                setTitle={setTitle}
                date={date}
                setDate={setDate}
                onOpenDatePicker={() => setShowDatePicker(true)}
                groupName={groupName}
                payerLabel={payerLabel}
                onOpenPayerPicker={() => setPayerSheetOpen(true)}
                categoryLabel={t(categoryLabelKey(category))}
                onOpenCategoryPicker={() => setCategorySheetOpen(true)}
                onOpenKeypad={() => setKeypadTarget({ kind: 'amount' })}
                topSlot={topSlot}
                isForeignCurrency={isForeignCurrency}
                groupCurrency={groupCurrency}
                amountMinor={amountMinor}
                fx={fx}
                rateInput={rateInput}
                setRateInput={setRateInput}
                rateNumber={rateNumber}
              />
            )}

            {step === 2 && (
              <Step2
                currency={effectiveCurrency}
                amountMinor={effectiveAmountMinor}
                recapMeta={recapMeta}
                groupName={groupName}
                members={members}
                currentUserMemberId={currentUserMemberId}
                splitValue={splitValue}
                onSplitChange={handleSplitChange}
                authToken={authToken}
              />
            )}
            </ContentContainer>
          </ScrollView>

          {preCtaSlot}

          <View style={styles.ctaBar}>
            <ContentContainer style={styles.ctaRow}>
            {step > 1 && (
              <Button kind="secondary" onPress={() => setStep((step - 1) as Step)} style={{ flex: 1 }}>
                {t('addExpense.back')}
              </Button>
            )}
            {step < 2 ? (
              <Button
                kind="primary"
                onPress={() => setStep((step + 1) as Step)}
                disabled={!canContinueStep1}
                style={{ flex: 1 }}
              >
                {t('addExpense.continue')}
              </Button>
            ) : (
              <Button
                kind="primary"
                onPress={handleSubmit}
                disabled={!canSubmit || !!submitting}
                style={{ flex: 1 }}
              >
                {submitting
                  ? t('addExpense.saving')
                  : submitLabel ?? t('addExpense.submit')}
              </Button>
            )}
            </ContentContainer>
          </View>
        </View>

        <AmountKeypad
          visible={keypadTarget !== null}
          value={keypadValue}
          currency={currency}
          onChange={setKeypadValue}
          onSubmit={() => setKeypadTarget(null)}
          onClose={() => setKeypadTarget(null)}
        />

        {showDatePicker && Platform.OS === 'android' && (
          <DateTimePicker
            value={date}
            mode="date"
            maximumDate={new Date()}
            minimumDate={(() => {
              const d = new Date();
              d.setFullYear(d.getFullYear() - 5);
              return d;
            })()}
            display="default"
            onChange={(event, selected) => {
              setShowDatePicker(false);
              if (event.type === 'set' && selected) setDate(selected);
            }}
          />
        )}

        <CurrencyPicker
          visible={pickerOpen}
          selected={currency}
          onClose={() => setPickerOpen(false)}
          onSelect={(code) => {
            setSelectedCurrency(code);
            setPickerOpen(false);
          }}
        />

        <ActionSheet
          visible={payerSheetOpen}
          onClose={() => setPayerSheetOpen(false)}
          title={t('addExpense.whoPaid')}
          options={members.map((m) => ({
            label: m.id === currentUserMemberId ? t('addExpense.you') : m.name,
            onPress: () => setPayerMemberId(m.id),
          }))}
        />

        <ActionSheet
          visible={categorySheetOpen}
          onClose={() => setCategorySheetOpen(false)}
          title={t('addExpense.categoryLabel')}
          options={EXPENSE_CATEGORIES.map((key) => ({
            label: t(categoryLabelKey(key)),
            onPress: () => setCategory(key),
          }))}
        />
      </KeyboardAvoidingView>
    );
  },
);

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ current, t }: { current: Step; t: (k: string) => string }) {
  const labels = [t('addExpense.stepWhat'), t('addExpense.stepSplit')];
  return (
    <View style={styles.stepperWrap}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const done = n < current;
        const active = n === current;
        return (
          <React.Fragment key={i}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  (done || active) && styles.stepCircleActive,
                ]}
              >
                <Text style={[styles.stepNum, (done || active) && styles.stepNumActive]}>
                  {done ? '✓' : n}
                </Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
            </View>
            {n < 2 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
interface Step1Props {
  t: (k: string, opts?: any) => string;
  amount: string;
  currency: string;
  onOpenCurrencyPicker: () => void;
  title: string;
  setTitle: (v: string) => void;
  date: Date;
  setDate: (d: Date) => void;
  onOpenDatePicker: () => void;
  groupName: string;
  payerLabel: string;
  onOpenPayerPicker: () => void;
  categoryLabel: string;
  onOpenCategoryPicker: () => void;
  onOpenKeypad: () => void;
  topSlot?: React.ReactNode;
  isForeignCurrency: boolean;
  groupCurrency: string;
  amountMinor: number;
  fx: ReturnType<typeof useFxConversion>['fx'];
  rateInput: string;
  setRateInput: (v: string) => void;
  rateNumber: number | null;
}
function Step1({
  t,
  amount,
  currency,
  onOpenCurrencyPicker,
  title,
  setTitle,
  date,
  setDate,
  onOpenDatePicker,
  groupName,
  payerLabel,
  onOpenPayerPicker,
  categoryLabel,
  onOpenCategoryPicker,
  onOpenKeypad,
  topSlot,
  isForeignCurrency,
  groupCurrency,
  amountMinor,
  fx,
  rateInput,
  setRateInput,
  rateNumber,
}: Step1Props) {
  return (
    <View>
      {topSlot}

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('addExpense.amount')}</Text>
        <AmountField
          amount={amount}
          currency={currency}
          onPress={onOpenKeypad}
          onCurrencyPress={onOpenCurrencyPicker}
          currencyAccessibilityLabel={t('addExpense.changeCurrency')}
        />
        <View style={styles.rule} />
        {isForeignCurrency && amountMinor > 0 && (
          <FxConversionSection
            from={currency}
            to={groupCurrency}
            amountMinor={amountMinor}
            fx={fx}
            rateInput={rateInput}
            setRateInput={setRateInput}
            rateNumber={rateNumber}
          />
        )}
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.titleLabel')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('addExpense.titlePlaceholder')}
          placeholderTextColor={colors.lead}
          style={styles.titleInput}
          maxLength={120}
        />
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.whenLabel')}</Text>
        <DateInput date={date} setDate={setDate} onOpenPicker={onOpenDatePicker} />
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.paidByLabel')}</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenPayerPicker}
          style={styles.groupRow}
          accessibilityRole="button"
          accessibilityLabel={t('addExpense.whoPaid')}
        >
          <Text style={styles.groupName}>{payerLabel}</Text>
          <Text style={styles.dateInputCaret}>▾</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.categoryLabel')}</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenCategoryPicker}
          style={styles.groupRow}
          accessibilityRole="button"
          accessibilityLabel={t('addExpense.categoryLabel')}
        >
          <Text style={styles.groupName}>{categoryLabel}</Text>
          <Text style={styles.dateInputCaret}>▾</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.fieldWrap, { borderBottomWidth: 0 }]}>
        <Text style={styles.fieldLabel}>{t('addExpense.groupLabel')}</Text>
        <View style={styles.groupRow}>
          <Text style={styles.groupName}>{groupName}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────
interface Step2Props {
  currency: string;
  amountMinor: number;
  recapMeta: string;
  groupName: string;
  members: GroupMember[];
  currentUserMemberId?: string;
  splitValue: SplitValue;
  onSplitChange: (v: SplitValue) => void;
  authToken: string | null;
}
function Step2({
  currency,
  amountMinor,
  recapMeta,
  groupName,
  members,
  currentUserMemberId,
  splitValue,
  onSplitChange,
  authToken,
}: Step2Props) {
  return (
    <View>
      <Recap
        eyebrow={recapMeta}
        line={groupName}
        amount={fmtMinor(amountMinor, currency)}
      />
      <SplitEditor
        members={members}
        totalMinor={amountMinor}
        currency={currency}
        value={splitValue}
        onChange={onSplitChange}
        currentUserMemberId={currentUserMemberId}
        authToken={authToken}
      />
    </View>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────
function Recap({ eyebrow, line, amount }: { eyebrow: string; line: string; amount: string }) {
  return (
    <View style={styles.recapWrap}>
      <View style={styles.recapCard}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.recapEyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={styles.recapLine} numberOfLines={1}>
            {line}
          </Text>
        </View>
        <Text style={styles.recapAmount}>{amount}</Text>
      </View>
    </View>
  );
}

function DateInput({
  date,
  setDate,
  onOpenPicker,
}: {
  date: Date;
  setDate: (d: Date) => void;
  onOpenPicker: () => void;
}) {
  const formatted = date.toLocaleDateString(currentLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.dateInputIos}>
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          minimumDate={(() => {
            const d = new Date();
            d.setFullYear(d.getFullYear() - 5);
            return d;
          })()}
          display="compact"
          themeVariant="light"
          accentColor={colors.vermillion}
          onChange={(_, selected) => {
            if (selected) setDate(selected);
          }}
        />
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onOpenPicker} style={styles.dateInputAndroid}>
      <Text style={styles.dateInputValue}>{formatted}</Text>
      <Text style={styles.dateInputCaret}>▾</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  ctaRow: { flexDirection: 'row', gap: spacing.s2 },

  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    gap: 8,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  stepCircleActive: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  stepNum: { fontFamily: fontMonoMedium, fontSize: 10, color: colors.lead },
  stepNumActive: { color: colors.paper },
  stepLabel: { fontFamily: fontMono, fontSize: 11, color: colors.lead, letterSpacing: 0.4 },
  stepLabelActive: { color: colors.graphite, fontFamily: fontMonoMedium },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.ruleSoft },
  stepLineDone: { backgroundColor: colors.graphite },

  hero: { padding: spacing.s5, paddingTop: 14, paddingBottom: spacing.s4 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  rule: { height: 1.5, backgroundColor: colors.graphite, marginTop: 12 },

  fieldWrap: {
    paddingHorizontal: spacing.s5,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  titleInput: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    padding: 0,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupName: { fontFamily: fontBody, fontSize: fontSize.bodyL, color: colors.graphite },

  recapWrap: { paddingHorizontal: spacing.s5, paddingTop: 10, paddingBottom: spacing.s4 },
  recapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 8,
  },
  recapEyebrow: {
    fontFamily: fontMono,
    fontSize: 10,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  recapLine: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.graphite },
  recapAmount: {
    fontFamily: fontMonoMedium,
    fontSize: 22,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },

  dateInputIos: { alignSelf: 'flex-start', marginLeft: -8 },
  dateInputAndroid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 8,
  },
  dateInputValue: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  dateInputCaret: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
  },
});
