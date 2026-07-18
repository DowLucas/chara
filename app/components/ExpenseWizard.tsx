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
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/lib/app-alert';
import { itemizedAmounts, type Itemization } from '@/lib/scan-items';
import { splitExtraCharge } from '@/lib/extra-charge';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { ContentContainer } from '@/components/ContentContainer';
import { AmountKeypad } from '@/components/AmountKeypad';
import { AmountField } from '@/components/AmountField';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { ActionSheet } from '@/components/ActionSheet';
import {
  DEFAULT_CATEGORY,
  categoryLabel,
  categoryLabelKey,
  categoryPickerOptions,
  inferCategoryFromTitle,
  loadCustomCategories,
  addCustomCategory,
  resolveGroupCategorySlugs,
} from '@/lib/categories';
import { TextPromptModal } from '@/components/TextPromptModal';
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
import { previewApportion } from '@/lib/split';
import {
  loadGroupDefaultSplit,
  resolvePercentageBasisPoints,
  saveGroupDefaultSplit,
  savedSplitToPct,
  type GroupDefaultSplit,
} from '@/lib/saved-splits';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

const MAX_AMOUNT_MINOR = 9_999_999_99;

type Step = 1 | 2;
/** Split methods the user can pick in the editor. `itemized` is a
 *  client-side authoring mode backed by per-receipt-line assignments; it has
 *  no server representation and submits as `exact`. */
export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'itemized';
/** The subset the API accepts (see CreateExpenseInput.split_method). */
export type WireSplitMethod = 'equal' | 'exact' | 'percentage';

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
  split_method: WireSplitMethod;
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
    category?: string;
    date?: Date;
  }): void;
  /** Hand the wizard the raw receipt itemisation (not just the derived
   *  per-member totals) so the itemised split can be re-derived later —
   *  switching split method and back must not require a rescan. */
  applyScanItemsAssignment(input: {
    itemization: Itemization;
    participants: string[];
    /** Container deposit ("pant") from the scan, prefilled as the evenly
     *  shared extra charge. */
    depositMinor?: number;
  }): void;
}

export interface ExpenseWizardProps {
  mode: 'create' | 'edit';
  groupName: string;
  groupCurrency: string;
  /** The group's enabled category ids (Group.category_slugs). Omitted/empty
   *  falls back to the full default catalog (see resolveGroupCategorySlugs). */
  groupCategorySlugs?: string[];
  members: GroupMember[];
  /** Group id. Enables the personal "default split" feature: auto-prefill on
   *  create + "Save as group default" in the split step. Omit to disable. */
  groupId?: string;
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
  /** Home server of the group being edited — avatar thumbnails and their
   *  auth token must resolve against this server, not the default account. */
  serverUrl: string;
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
      groupCategorySlugs,
      members,
      groupId,
      currentUserMemberId,
      initialValue,
      convertFx,
      serverUrl,
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
    // True once the category was set explicitly (user tap or a receipt-scan
    // suggestion) — blocks the title-based auto-suggestion from clobbering
    // it. Create mode only; edit mode never runs the heuristic at all.
    const [categoryTouched, setCategoryTouched] = useState(false);
    const [categorySheetOpen, setCategorySheetOpen] = useState(false);
    const [customCategories, setCustomCategories] = useState<string[]>([]);
    const [categoryInputOpen, setCategoryInputOpen] = useState(false);

    const enabledCategories = useMemo(
      () => resolveGroupCategorySlugs(groupCategorySlugs),
      [groupCategorySlugs],
    );

    // Live keyword-based category suggestion from the title, offline and
    // free — only while the user hasn't picked (or been suggested) a
    // category explicitly, and only for a brand-new expense.
    //
    // `enabledCategories` is in the deps deliberately: groupCategorySlugs
    // typically arrives after mount (the host screen fetches the group), so
    // this can first run against the full default catalog fallback, suggest
    // a category, then need to re-check once the group's real (narrower)
    // catalog loads — correcting a suggestion that's no longer valid for
    // this group rather than leaving a stale one to reach submit.
    useEffect(() => {
      if (mode !== 'create' || categoryTouched) return;
      const suggested = inferCategoryFromTitle(title);
      if (suggested && (enabledCategories as readonly string[]).includes(suggested)) {
        setCategory(suggested);
      } else if (!(enabledCategories as readonly string[]).includes(category)) {
        setCategory(enabledCategories[0] ?? DEFAULT_CATEGORY);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, mode, categoryTouched, enabledCategories]);

    useEffect(() => {
      let cancelled = false;
      loadCustomCategories().then((c) => {
        if (!cancelled) setCustomCategories(c);
      });
      return () => {
        cancelled = true;
      };
    }, []);

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
    // Receipt itemisation, held here rather than inside the scan modal so it
    // outlives that modal. Because it is separate from the per-method maps,
    // switching to "evenly"/"%" and back to "itemised" is lossless — no
    // rescan. Null when no receipt was scanned.
    const [itemization, setItemization] = useState<Itemization | null>(null);
    // Optional secondary charge (service fee, or a receipt's "pant" deposit)
    // taken OUT of the total and shared evenly by everyone on the expense;
    // the selected split method then applies to whatever is left. Held as the
    // raw input string so the shared AmountKeypad can edit it like any other
    // amount field; minor units are derived.
    const [extraChargeInput, setExtraChargeInput] = useState('');
    const extraChargeMinor = useMemo(() => {
      const cleaned = extraChargeInput.replace(',', '.');
      const n = hasOperator(cleaned) ? evalExpression(cleaned) : parseFloat(cleaned);
      if (n === null || !Number.isFinite(n) || n <= 0) return 0;
      return Math.round(n * 100);
    }, [extraChargeInput]);
    // A saved default split loaded on mount, awaiting members to be applied.
    const [pendingSavedSplit, setPendingSavedSplit] =
      useState<GroupDefaultSplit | null>(null);

    type KeypadTarget = { kind: 'amount' } | { kind: 'extraCharge' };
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
      setCategoryTouched(!!initialValue?.category);
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

    // Restore an auto-saved draft once, on mount (create mode only). When
    // there is no draft to restore, fall back to the personal saved default
    // split for this group (applied by the effect below once members load).
    useEffect(() => {
      let cancelled = false;
      async function hydrate() {
        let restoredDraft = false;
        if (draftEnabled && draftKey) {
          const d = await loadDraft(draftKey, Date.now());
          if (cancelled) return;
          if (d) {
            restoredDraft = true;
            if (d.amount != null) setAmount(d.amount);
            if (d.title != null) setTitle(d.title);
            if (d.dateMs != null) setDate(new Date(d.dateMs));
            if (d.currency != null) setSelectedCurrency(d.currency);
            if (d.payerMemberId != null) setPayerMemberId(d.payerMemberId);
            if (d.category != null) {
              setCategory(d.category);
              setCategoryTouched(true);
            }
            if (d.method != null) setMethod(d.method);
            if (d.included != null) setIncluded(d.included);
            if (d.exactByMember != null) setExactByMember(d.exactByMember);
            if (d.pctByMember != null) setPctByMember(d.pctByMember);
            if (d.itemization != null) setItemization(d.itemization);
            if (d.extraChargeMinor != null && d.extraChargeMinor > 0) {
              setExtraChargeInput((d.extraChargeMinor / 100).toFixed(2));
            }
          }
        }
        draftHydrated.current = true;
        if (!restoredDraft && mode === 'create' && groupId) {
          const saved = await loadGroupDefaultSplit(serverUrl, groupId);
          if (cancelled) return;
          if (saved) setPendingSavedSplit(saved);
        }
      }
      hydrate();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Apply a loaded saved default split once members are available. Only
    // applies when the saved roster still matches (savedSplitToPct → null
    // otherwise), so a membership change falls back to the equal default.
    const savedSplitAppliedRef = useRef(false);
    useEffect(() => {
      if (!pendingSavedSplit || savedSplitAppliedRef.current) return;
      if (members.length === 0) return;
      savedSplitAppliedRef.current = true;
      const applied = savedSplitToPct(pendingSavedSplit, members);
      setPendingSavedSplit(null);
      if (!applied) return;
      setMethod('percentage');
      setIncluded(applied.included);
      setPctByMember(applied.pctByMember);
    }, [pendingSavedSplit, members.length]);

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
        // Persisted so a draft restored in `itemized` mode can still derive
        // its amounts instead of coming back empty.
        ...(itemization ? { itemization } : {}),
        ...(extraChargeMinor > 0 ? { extraChargeMinor } : {}),
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
      itemization,
      extraChargeInput,
    ]);

    // When members arrive after the wizard has mounted in create mode and
    // included is still empty, seed it.
    useEffect(() => {
      if (mode === 'create' && Object.keys(included).length === 0 && members.length > 0 && !initialValue?.included) {
        setIncluded(buildInitialIncluded(members, undefined));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members.length]);

    const keypadValue =
      keypadTarget?.kind === 'amount'
        ? amount
        : keypadTarget?.kind === 'extraCharge'
          ? extraChargeInput
          : '';
    const setKeypadValue = (next: string) => {
      if (!keypadTarget) return;
      if (keypadTarget.kind === 'amount') setAmount(next);
      else if (keypadTarget.kind === 'extraCharge') setExtraChargeInput(next);
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
    const includedIds = includedMembers.map((m) => m.id);

    // The extra charge is carved OUT of the total: it is shared evenly and
    // the selected split method applies only to the remainder, so the parts
    // still sum to the amount the user entered. Clamped because the amount
    // can be edited after the charge is set (or prefilled from a scan).
    // The extra charge is ADDITIONAL to the amount entered. The split method
    // divides exactly what the user typed — that number never moves — and the
    // charge is shared evenly on top, so the expense total is the sum of the
    // two. (A scanned receipt prefills the amount with its total minus any
    // deposit, so `entered + deposit` still equals what the receipt printed.)
    const extraCharge = Math.max(0, extraChargeMinor);
    const baseAmountMinor = effectiveAmountMinor;
    const totalWithExtraMinor = effectiveAmountMinor + extraCharge;
    const extraByMember = splitExtraCharge(extraCharge, includedIds);

    const equalShare =
      method === 'equal' && includedMembers.length > 0
        ? Math.round(baseAmountMinor / includedMembers.length)
        : 0;

    // Clear custom exact-split entries when the effective currency changes —
    // amounts typed in the old currency are meaningless in the new one.
    // Deliberately NOT keyed on `method`: a user-driven method switch already
    // clears these in handleSplitChange, and keying on `method` here would
    // also wipe the amounts that applyScanItemsAssignment() sets together with
    // setMethod('exact'), collapsing itemized receipt splits back to an equal
    // split. Two more constraints:
    //  - Skip until `effectiveCurrency` actually changes (the ref tracks the
    //    last-seen value): effects also run on mount, and in edit mode the
    //    maps are seeded from initialValue — wiping them here regressed #69.
    //  - `pctByMember` is NOT wiped: percentages are proportions, not
    //    amounts, so they stay meaningful across a currency change. This also
    //    preserves seeded percentage splits when editing an FX expense, where
    //    `effectiveCurrency` flips from the input currency to the group
    //    currency once the rate resolves shortly after mount.
    const lastEffectiveCurrency = useRef(effectiveCurrency);
    useEffect(() => {
      if (lastEffectiveCurrency.current === effectiveCurrency) return;
      lastEffectiveCurrency.current = effectiveCurrency;
      setExactByMember({});
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
      const remaining = baseAmountMinor - lockedSum;
      const shares = distributeInt(remaining, autoIds.length);
      const out: Record<string, number> = {};
      autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
      return out;
    }, [method, includedMembers, exactByMember, baseAmountMinor]);

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

    // Per-member minor shares for the percentage method. Must use the same
    // exact-sum apportionment SplitEditor previews with (floor + largest
    // remainder): rounding each member independently can overshoot the total
    // (e.g. 10.01 / 3 → 334+334+334 = 1002), leaving `offBy` non-zero and
    // Save permanently disabled even though the editor shows green.
    const pctMinorByMember = useMemo<Record<string, number>>(() => {
      if (method !== 'percentage') return {};
      const bps = includedMembers.map(
        (m) => lockedPctBp(m.id) ?? autoPctBp[m.id] ?? 0,
      );
      const shares = previewApportion(baseAmountMinor, bps);
      const out: Record<string, number> = {};
      includedMembers.forEach((m, i) => (out[m.id] = shares[i] ?? 0));
      return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [method, includedMembers, pctByMember, autoPctBp, baseAmountMinor]);

    // Itemised amounts are always re-derived from the stored itemisation
    // against the members currently included, so toggling someone off
    // redistributes their items instead of stranding a stale amount.
    const itemizedByMember = useMemo<Record<string, number>>(() => {
      if (!itemization) return {};
      return itemizedAmounts(itemization, includedIds);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemization, included, members]);

    function effectiveMinor(memberId: string): number {
      if (method === 'exact') {
        return lockedExactMinor(memberId) ?? autoExactMinor[memberId] ?? 0;
      }
      if (method === 'percentage') {
        return pctMinorByMember[memberId] ?? 0;
      }
      if (method === 'itemized') {
        return itemizedByMember[memberId] ?? 0;
      }
      return 0;
    }

    /** What a member ends up owing: their share of the base split plus their
     *  even share of the extra charge. This is what gets submitted. */
    function finalMinor(memberId: string): number {
      const base =
        method === 'equal' ? (equalMinorByMember[memberId] ?? 0) : effectiveMinor(memberId);
      return base + (extraByMember[memberId] ?? 0);
    }

    // Equal is apportioned rather than rounded per member so the shares sum
    // exactly to the base amount (mirrors previewApportion's largest-remainder
    // rule used by the other methods).
    const equalMinorByMember = useMemo<Record<string, number>>(() => {
      if (method !== 'equal' || includedMembers.length === 0) return {};
      const shares = distributeInt(baseAmountMinor, includedMembers.length);
      const out: Record<string, number> = {};
      includedMembers.forEach((m, i) => (out[m.id] = shares[i] ?? 0));
      return out;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [method, included, members, baseAmountMinor]);

    const totalSplitMinor = useMemo(() => {
      if (method === 'equal') return baseAmountMinor;
      return includedMembers.reduce((s, m) => s + effectiveMinor(m.id), 0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [method, equalShare, includedMembers, exactByMember, pctByMember, baseAmountMinor, autoExactMinor, pctMinorByMember, itemizedByMember]);

    // Reconciliation is against the BASE amount — the extra charge is always
    // fully allocated by construction, so it can never be the thing that is
    // off.
    const offBy = totalSplitMinor - baseAmountMinor;

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
      } else if (method === 'itemized') {
        // Derived from the receipt assignments, not typed by the user — sent
        // so the editor can display them (it renders them read-only).
        for (const m of members) {
          const minor = itemizedByMember[m.id];
          if (minor === undefined) continue;
          splits.push({ member_id: m.id, value: minor });
        }
      }
      return { method, included: includedIds, splits };
    }, [members, included, method, exactByMember, pctByMember, itemizedByMember]);

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

    // Persist the current percentage split as this user's personal default for
    // this group (device-local, see saved-splits.ts), so future expenses here
    // prefill it. Percentage-only. Always gives feedback — never a silent no-op.
    async function handleSaveDefaultSplit() {
      if (!groupId) return;
      const includedIds = members.filter((m) => included[m.id]).map((m) => m.id);
      const bp = resolvePercentageBasisPoints(includedIds, pctByMember);
      const sum = Object.values(bp).reduce((s, v) => s + v, 0);
      // No included members (sum 0) or percentages that don't total 100%.
      if (includedIds.length === 0 || sum !== 10000) {
        showAlert({
          title: t('addExpense.saveDefaultSplitInvalidTitle'),
          message: t('addExpense.saveDefaultSplitInvalidBody'),
        });
        return;
      }
      try {
        await saveGroupDefaultSplit(serverUrl, groupId, bp);
      } catch {
        showAlert({ title: t('common.error'), message: t('common.requestFailed') });
        return;
      }
      showAlert({
        title: t('addExpense.saveDefaultSplitDoneTitle'),
        message: t('addExpense.saveDefaultSplitDoneBody'),
      });
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
          if (input.category && (enabledCategories as readonly string[]).includes(input.category)) {
            setCategory(input.category);
            setCategoryTouched(true);
          }
        },
        applyScanItemsAssignment({ itemization: scanned, participants, depositMinor }) {
          // Store the itemisation itself rather than the amounts it happens
          // to produce, so the split can be re-derived after the user visits
          // another method — the whole point of the `itemized` mode.
          setItemization(scanned);
          setMethod('itemized');
          const nextIncluded: Record<string, boolean> = {};
          for (const m of members) nextIncluded[m.id] = participants.includes(m.id);
          setIncluded(nextIncluded);
          if (depositMinor && depositMinor > 0) {
            setExtraChargeInput((depositMinor / 100).toFixed(2));
            // The receipt total already includes the deposit, and the charge
            // adds on top of the entered amount — so take the deposit back out
            // of the amount, leaving entered + deposit equal to what the
            // receipt actually printed.
            setAmount((prev) => {
              const cleaned = prev.replace(',', '.');
              const n = hasOperator(cleaned)
                ? evalExpression(cleaned)
                : parseFloat(cleaned);
              if (n === null || !Number.isFinite(n) || n <= 0) return prev;
              const rest = Math.max(0, Math.round(n * 100) - depositMinor);
              return (rest / 100).toFixed(2);
            });
          }
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

      // The saved expense is what was entered plus the evenly-shared charge.
      const amountDecimal = (totalWithExtraMinor / 100).toFixed(2);
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

      // `itemized` has no server representation, and a percentage split stops
      // being expressible in basis points once part of the total is carved off
      // as an evenly-shared extra charge — both submit as explicit exact
      // shares. `equal` survives as-is: an even base plus an even extra charge
      // is still an even split of the whole amount.
      const wireMethod: WireSplitMethod =
        method === 'equal'
          ? 'equal'
          : method === 'percentage' && extraCharge === 0
            ? 'percentage'
            : 'exact';

      const base: ExpenseWizardSubmitPayload = {
        title: title.trim(),
        amount: amountDecimal,
        currency: effectiveCurrency,
        paid_by_id: payerMemberId,
        category,
        expense_date: toDateStr(date),
        split_method: wireMethod,
        ...(fx_payload ? { fx: fx_payload } : {}),
      };

      if (wireMethod === 'equal') {
        base.participants = includedMembers.map((m) => m.id);
      } else if (wireMethod === 'percentage') {
        base.splits = includedMembers.map((m) => ({
          member_id: m.id,
          basis_points: lockedPctBp(m.id) ?? autoPctBp[m.id] ?? 0,
        }));
      } else {
        base.splits = includedMembers.map((m) => ({
          member_id: m.id,
          share: (finalMinor(m.id) / 100).toFixed(2),
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
                  label={step === 1 ? t('common.close') : t('common.back')}
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
                categoryLabel={categoryLabel(category, t)}
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
                amountMinor={baseAmountMinor}
                fullAmountMinor={totalWithExtraMinor}
                allowedMethods={
                  itemization
                    ? ['equal', 'exact', 'percentage', 'itemized']
                    : ['equal', 'exact', 'percentage']
                }
                recapMeta={recapMeta}
                groupName={groupName}
                members={members}
                currentUserMemberId={currentUserMemberId}
                splitValue={splitValue}
                onSplitChange={handleSplitChange}
                serverUrl={serverUrl}
                extraChargeInput={extraChargeInput}
                extraChargeMinor={extraCharge}
                extraChargePerPersonMinor={
                  includedMembers.length > 0
                    ? Math.round(extraCharge / includedMembers.length)
                    : 0
                }
                extraPerMemberMinor={extraByMember}
                onExtraChargePress={() => setKeypadTarget({ kind: 'extraCharge' })}
                onExtraChargeClear={() => setExtraChargeInput('')}
                onSaveDefaultSplit={groupId ? handleSaveDefaultSplit : undefined}
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
          options={[
            ...categoryPickerOptions(enabledCategories, category).map((key) => ({
              label: t(categoryLabelKey(key)),
              onPress: () => {
                setCategory(key);
                setCategoryTouched(true);
              },
            })),
            ...customCategories.map((c) => ({
              label: c,
              onPress: () => {
                setCategory(c);
                setCategoryTouched(true);
              },
            })),
            { label: t('addExpense.addCategory'), onPress: () => setCategoryInputOpen(true) },
          ]}
        />

        <TextPromptModal
          visible={categoryInputOpen}
          title={t('addExpense.addCategoryTitle')}
          placeholder={t('addExpense.addCategoryPlaceholder')}
          submitLabel={t('addExpense.addCategorySubmit')}
          onClose={() => setCategoryInputOpen(false)}
          onSubmit={(name) => {
            setCategoryInputOpen(false);
            addCustomCategory(name).then(setCustomCategories);
            setCategory(name.trim());
            setCategoryTouched(true);
          }}
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
  /** The amount the split method must account for: the expense total minus
   *  any evenly-shared extra charge. Drives the split editor only. */
  amountMinor: number;
  /** The full expense total. Shown in the recap, so carving off an extra
   *  charge never looks like the expense itself got smaller. */
  fullAmountMinor: number;
  /** Split methods to offer. `itemized` is included only once a receipt has
   *  been itemised, since it has nothing to derive from otherwise. */
  allowedMethods: SplitMethod[];
  recapMeta: string;
  groupName: string;
  members: GroupMember[];
  currentUserMemberId?: string;
  splitValue: SplitValue;
  onSplitChange: (v: SplitValue) => void;
  serverUrl: string;
  /** Raw input for the evenly-shared extra charge (fee / deposit). */
  extraChargeInput: string;
  extraChargeMinor: number;
  /** What each included member pays of the charge, for the hint line. */
  extraChargePerPersonMinor: number;
  /** Per-member share of the charge, added back onto the displayed amounts so
   *  the editor shows what someone actually owes rather than the base alone. */
  extraPerMemberMinor: Record<string, number>;
  onExtraChargePress: () => void;
  onExtraChargeClear: () => void;
  /** When set and the current method is percentage, shows a "Save as group
   *  default" affordance under the split editor. */
  onSaveDefaultSplit?: () => void;
}
function Step2({
  currency,
  amountMinor,
  fullAmountMinor,
  allowedMethods,
  recapMeta,
  groupName,
  members,
  currentUserMemberId,
  splitValue,
  onSplitChange,
  serverUrl,
  extraChargeInput,
  extraChargeMinor,
  extraChargePerPersonMinor,
  extraPerMemberMinor,
  onExtraChargePress,
  onExtraChargeClear,
  onSaveDefaultSplit,
}: Step2Props) {
  const { t } = useTranslation();
  return (
    <View>
      <Recap
        eyebrow={recapMeta}
        line={groupName}
        amount={fmtMinor(fullAmountMinor, currency)}
      />
      {/* Carved out of the total and shared evenly — the split methods below
          apply to what's left, which is what the Recap shows. */}
      <TouchableOpacity
        style={styles.extraChargeRow}
        onPress={onExtraChargePress}
        accessibilityRole="button"
        accessibilityLabel={t('addExpense.extraChargeLabel')}
      >
        <View style={styles.extraChargeText}>
          <Text style={styles.extraChargeLabel}>
            {t('addExpense.extraChargeLabel')}
          </Text>
          <Text style={styles.extraChargeHint}>
            {extraChargeMinor > 0
              ? t('addExpense.extraChargeEach', {
                  amount: fmtMinor(extraChargePerPersonMinor, currency),
                })
              : t('addExpense.extraChargeHint')}
          </Text>
        </View>
        <Text style={styles.extraChargeValue}>
          {extraChargeInput.trim() !== ''
            ? fmtMinor(extraChargeMinor, currency)
            : t('addExpense.extraChargeNone')}
        </Text>
        {extraChargeMinor > 0 && (
          <TouchableOpacity
            onPress={onExtraChargeClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('addExpense.extraChargeClear')}
          >
            <Feather name="x" size={16} color={colors.lead} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      <SplitEditor
        members={members}
        totalMinor={amountMinor}
        extraPerMember={extraPerMemberMinor}
        allowedMethods={allowedMethods}
        currency={currency}
        value={splitValue}
        onChange={onSplitChange}
        currentUserMemberId={currentUserMemberId}
        serverUrl={serverUrl}
      />
      {onSaveDefaultSplit && splitValue.method === 'percentage' && (
        <TouchableOpacity
          onPress={onSaveDefaultSplit}
          style={styles.saveDefaultSplitRow}
          accessibilityRole="button"
        >
          <Feather name="bookmark" size={14} color={colors.lead} />
          <Text style={styles.saveDefaultSplitLabel}>
            {t('addExpense.saveDefaultSplit')}
          </Text>
        </TouchableOpacity>
      )}
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
  extraChargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
  },
  extraChargeText: { flex: 1 },
  extraChargeLabel: {
    fontFamily: fontDisplay,
    fontSize: 15,
    color: colors.graphite,
  },
  extraChargeHint: {
    fontFamily: fontBody,
    fontSize: 12,
    color: colors.lead,
    marginTop: 2,
  },
  extraChargeValue: {
    fontFamily: fontMono,
    fontSize: 15,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  saveDefaultSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s4,
    paddingVertical: 10,
  },
  saveDefaultSplitLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
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
