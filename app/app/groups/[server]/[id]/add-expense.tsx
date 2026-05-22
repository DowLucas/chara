import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Avatar } from '@/components/Avatar';
import { AmountKeypad } from '@/components/AmountKeypad';
import { useTranslation } from 'react-i18next';
import {
  apiFor,
  authToken,
  avatarImageSource,
  Expense,
  GroupDetail,
  GroupMember,
  ScannedReceipt,
  ScannedReceiptItem,
  FxConvertResponse,
} from '@/lib/api';
import { decimalToMinor } from '@/lib/i18n';
import { ReceiptScanner, ReceiptScanResult } from '@/components/ReceiptScanner';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { ExpenseSavedOverlay } from '@/components/ExpenseSavedOverlay';
import { ScanItemsAssign } from '@/components/ScanItemsAssign';
import { useAuth } from '@/lib/auth';
import { currentLocale } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { evalExpression, hasOperator } from '@/lib/evalExpression';
import {
  colors,
  fontDisplay,
  fontBody,
  fontBodyMedium,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

const SPLIT_METHODS = [
  { id: 'equal', labelKey: 'addExpense.methodEqual' },
  { id: 'exact', labelKey: 'addExpense.methodExact' },
  { id: 'percentage', labelKey: 'addExpense.methodPercent' },
] as const;

type Step = 1 | 2;
type SplitMethod = 'equal' | 'exact' | 'percentage';

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtMinor(n: number, currency: string): string {
  const abs = Math.abs(n);
  return `${(abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} ${currency}`;
}

// Distribute an integer total across `count` buckets as evenly as possible.
// Any remainder lands in the first `rem` buckets, so the sum always equals total.
function distributeInt(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total <= 0) return new Array(count).fill(0);
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

// Render an exact-amount auto value (minor units) for the input placeholder.
function fmtAutoMinor(minor: number): string {
  return (Math.max(0, minor) / 100).toFixed(2);
}

// Render an auto basis-point value as a percentage string. Drops trailing zeros.
function fmtAutoPct(bp: number): string {
  const safe = Math.max(0, bp);
  if (safe % 100 === 0) return String(safe / 100);
  return (safe / 100).toFixed(2);
}

export default function AddExpenseScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [groupCount, setGroupCount] = useState<number>(1);
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date>(() => new Date());
  // Currency override for the expense. Defaults to the group currency once
  // the group loads. When this differs from the group currency the user is
  // entering a foreign-currency expense and we show a live FX preview.
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fxPreview, setFxPreview] = useState<FxConvertResponse | null>(null);
  const [fxError, setFxError] = useState<string | null>(null);
  // Android opens picker on tap; iOS shows inline picker permanently.
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Payer is always the current user (member-id resolved once group loads).
  const [payerMemberId, setPayerMemberId] = useState<string>('');

  // Step 2 state
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [exactByMember, setExactByMember] = useState<Record<string, string>>({});
  const [pctByMember, setPctByMember] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);

  // OCR: gated by the server's /.well-known/chara-instance feature flag.
  const [ocrAvailable, setOcrAvailable] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  // Save-success overlay state — set after createExpense returns. Holds the
  // subtitle ("Title · 200 SEK") for display; the user dismisses via the
  // Continue button which routes back to the group page.
  const [savedSubtitle, setSavedSubtitle] = useState<string | null>(null);
  // Existing expenses for the group, used to spot accidental duplicates as
  // the user types. Re-fetched only on mount — duplicate detection on a
  // single open form doesn't need live updates.
  const [existingExpenses, setExistingExpenses] = useState<Expense[]>([]);
  // Captured receipt image bytes from the last scan, persisted in form
  // state until expense save. Uploaded as an attachment in handleSubmit
  // — at which point we know the expense id to link it to.
  const [pendingReceiptImage, setPendingReceiptImage] = useState<
    { base64: string; mime_type: string } | null
  >(null);
  // Itemized assign-to-people step. Populated by handleReceiptScanned when
  // Gemini returned line items AND no FX conversion happened (items live in
  // the receipt's currency — if we FX'd the headline total we'd also need
  // to FX every item, out of scope for v1).
  const [scanItemsState, setScanItemsState] = useState<{
    items: ScannedReceiptItem[];
    taxMinor: number;
    tipMinor: number;
    totalMinor: number;
    currency: string;
  } | null>(null);

  // Math keypad target — null = closed.
  type KeypadTarget = { kind: 'amount' };
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null);

  const keypadValue = keypadTarget?.kind === 'amount' ? amount : '';
  const setKeypadValue = (next: string) => {
    if (!keypadTarget) return;
    if (keypadTarget.kind === 'amount') setAmount(next);
  };

  useEffect(() => {
    if (!id || !serverUrl) return;
    api
      .getGroup(id)
      .then((g) => {
        setGroup(g);
        setMembers(g.members);
        const me = g.members.find((m) => m.user_id === user?.id);
        if (me) setPayerMemberId(me.id);
        const inc: Record<string, boolean> = {};
        g.members.forEach((m) => (inc[m.id] = true));
        setIncluded(inc);
        // Default the expense currency to the group's. The user can still
        // open the picker to override per-expense.
        setSelectedCurrency(g.currency);
      })
      .catch(() => {});
  }, [id, serverUrl, user?.id]);

  useEffect(() => {
    if (!serverUrl) return;
    api
      .listGroups()
      .then((gs) => setGroupCount(gs.length))
      .catch(() => {});
  }, [serverUrl]);

  useEffect(() => {
    if (!serverUrl) return;
    api
      .instanceInfo()
      .then((info) => setOcrAvailable(info.features.ocr))
      .catch(() => setOcrAvailable(false));
  }, [serverUrl]);

  useEffect(() => {
    if (!id || !serverUrl) return;
    api
      .listExpenses(id)
      .then(setExistingExpenses)
      .catch(() => setExistingExpenses([]));
  }, [id, serverUrl]);

  function handleReceiptScanned(result: ReceiptScanResult) {
    setScannerOpen(false);
    const { receipt, applied } = result;
    if (result.image) setPendingReceiptImage(result.image);
    // The scanner already resolved which amount + currency the form should
    // use:
    //   • same currency  → applied = receipt total in receipt currency
    //   • FX conversion  → applied = converted total in group currency
    //   • FX failed      → applied = receipt total in receipt currency
    //                       (the form's FX preview takes over)
    if (applied.amount_minor > 0) {
      setAmount((applied.amount_minor / 100).toFixed(2));
    }
    setSelectedCurrency(applied.currency);
    // The AI's `title` is a natural-language "what was this for" string
    // (combining merchant + items), which matches the form field's intent
    // far better than the bare merchant name. Falls back to merchant on
    // older backends or when the model omits it.
    const inferredTitle = receipt.title || receipt.merchant;
    if (inferredTitle) {
      setTitle(inferredTitle);
    }
    if (receipt.date) {
      const parsed = new Date(receipt.date + 'T00:00:00');
      if (!Number.isNaN(parsed.getTime())) setDate(parsed);
    }

    // Open the itemized assign step when we have line items AND the form
    // currency matches the receipt's (no FX conversion happened). Items
    // are in the receipt's currency — converting them would need per-line
    // FX which isn't in scope for v1.
    const items = receipt.items ?? [];
    if (items.length > 0 && applied.currency === receipt.currency) {
      setScanItemsState({
        items,
        taxMinor: receipt.tax_minor ?? 0,
        tipMinor: receipt.tip_minor ?? 0,
        totalMinor: receipt.total_minor,
        currency: receipt.currency,
      });
    }
  }

  // Apply itemized assignment results: flip the split to "exact" and seed
  // per-member amounts. We then close the modal; the user can still review
  // on step 2 before saving.
  function applyScanItemsAssignment(perMemberMinor: Record<string, number>) {
    setScanItemsState(null);
    if (Object.keys(perMemberMinor).length === 0) {
      // User chose to skip — leave the form on equal split.
      return;
    }
    setMethod('exact');
    // Include any member with a non-zero share; uncheck the rest so they
    // don't appear as "0.00" rows in step 2.
    const nextIncluded: Record<string, boolean> = {};
    const nextExact: Record<string, string> = {};
    for (const m of members) {
      const minor = perMemberMinor[m.id] ?? 0;
      nextIncluded[m.id] = minor > 0;
      if (minor > 0) {
        nextExact[m.id] = (minor / 100).toFixed(2);
      }
    }
    setIncluded(nextIncluded);
    setExactByMember(nextExact);
  }

  const amountMinor = useMemo(() => {
    const cleaned = amount.replace(',', '.');
    const n = hasOperator(cleaned) ? evalExpression(cleaned) : parseFloat(cleaned);
    if (n === null || !Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amount]);

  const groupCurrency = group?.currency ?? 'SEK';
  const currency = selectedCurrency || groupCurrency;
  const isForeignCurrency = currency !== groupCurrency;

  // Debounced FX preview. The /api/fx/convert call is server-side and
  // round-trips, so don't refire on every keystroke — wait 350 ms after the
  // user stops typing the amount.
  useEffect(() => {
    if (!isForeignCurrency || amountMinor <= 0) {
      setFxPreview(null);
      setFxError(null);
      return;
    }
    let cancelled = false;
    setFxError(null);
    const handle = setTimeout(() => {
      api
        .convertFx({ from: currency, to: groupCurrency, amountMinor })
        .then((res) => {
          if (!cancelled) setFxPreview(res);
        })
        .catch((e) => {
          if (cancelled) return;
          setFxPreview(null);
          setFxError(e?.message || 'rate unavailable');
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [currency, groupCurrency, amountMinor, isForeignCurrency]);

  const includedMembers = members.filter((m) => included[m.id]);
  const equalShare =
    method === 'equal' && includedMembers.length > 0
      ? Math.round(amountMinor / includedMembers.length)
      : 0;

  // Switching split method wipes any per-member entries so values from one
  // mode (e.g. exact kronor) don't bleed into another (percentages).
  useEffect(() => {
    setExactByMember({});
    setPctByMember({});
  }, [method]);

  // A row is "locked" if the user has typed anything in it. Empty rows are
  // "auto" and split the remainder evenly among themselves.
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

  // For exact mode: compute per-member auto-fill (in minor units) for any
  // included row the user hasn't typed into.
  const autoExactMinor = useMemo<Record<string, number>>(() => {
    if (method !== 'exact') return {};
    let lockedSum = 0;
    const autoIds: string[] = [];
    for (const m of includedMembers) {
      const locked = lockedExactMinor(m.id);
      if (locked === null) autoIds.push(m.id);
      else lockedSum += locked;
    }
    const remaining = amountMinor - lockedSum;
    const shares = distributeInt(remaining, autoIds.length);
    const out: Record<string, number> = {};
    autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
    return out;
  }, [method, includedMembers, exactByMember, amountMinor]);

  // For percentage mode: same idea, but the budget is 10000 basis points.
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

  // Resolve each member to a concrete amount in minor units, blending typed
  // values with computed auto-fill. Used for reconciliation and submission.
  function effectiveMinor(memberId: string): number {
    if (method === 'exact') {
      return lockedExactMinor(memberId) ?? autoExactMinor[memberId] ?? 0;
    }
    if (method === 'percentage') {
      const bp = lockedPctBp(memberId) ?? autoPctBp[memberId] ?? 0;
      return Math.round((amountMinor * bp) / 10000);
    }
    return 0;
  }

  const totalSplitMinor = useMemo(() => {
    // Equal-mode shares are reconciled by the backend's SplitEqual, which
    // distributes the rounding remainder one minor unit at a time so the
    // shares always sum back to the total. Multiplying the displayed
    // per-member figure here would drift by up to N-1 cents and surface a
    // bogus "0.03 off" line. By definition, equal mode is never off.
    if (method === 'equal') return amountMinor;
    return includedMembers.reduce((s, m) => s + effectiveMinor(m.id), 0);
  }, [method, equalShare, includedMembers, exactByMember, pctByMember, amountMinor, autoExactMinor, autoPctBp]);

  const offBy = totalSplitMinor - amountMinor;

  const canContinueStep1 = title.trim().length > 0 && amountMinor > 0;

  // Subtle duplicate warning: an existing expense in this group shares the
  // same title (case-insensitive, trimmed), amount (minor units), and
  // currency. We only check against same-currency rows — cross-currency
  // matches would need FX and would surface too many false positives.
  // Soft-deleted rows are already filtered server-side in listExpenses.
  const titleKey = title.trim().toLowerCase();
  const duplicate = useMemo<Expense | null>(() => {
    if (!titleKey || amountMinor <= 0) return null;
    return (
      existingExpenses.find(
        (e) =>
          e.title.trim().toLowerCase() === titleKey &&
          decimalToMinor(e.amount) === amountMinor &&
          e.currency === currency,
      ) ?? null
    );
  }, [existingExpenses, titleKey, amountMinor, currency]);

  const canSubmit =
    canContinueStep1 && !!payerMemberId && offBy === 0 && includedMembers.length > 0;

  function effectiveDate(): string {
    return toDateStr(date);
  }

  async function handleSubmit() {
    if (!id || !canSubmit || !payerMemberId) return;

    setSaving(true);
    try {
      const amountDecimal = (amountMinor / 100).toFixed(2);
      const base = {
        title: title.trim(),
        amount: amountDecimal,
        currency,
        paid_by_id: payerMemberId,
        expense_date: effectiveDate(),
        split_method: method,
      } as const;

      let created;
      if (method === 'equal') {
        created = await api.createExpense(id, {
          ...base,
          participants: includedMembers.map((m) => m.id),
        });
      } else if (method === 'exact') {
        created = await api.createExpense(id, {
          ...base,
          splits: includedMembers.map((m) => ({
            member_id: m.id,
            share: (effectiveMinor(m.id) / 100).toFixed(2),
          })),
        });
      } else {
        created = await api.createExpense(id, {
          ...base,
          splits: includedMembers.map((m) => ({
            member_id: m.id,
            basis_points: lockedPctBp(m.id) ?? autoPctBp[m.id] ?? 0,
          })),
        });
      }

      // If a receipt was scanned, persist the image now that we have an
      // expense id to link it to. A failed upload is non-fatal — the
      // expense itself is already saved and the user can re-attach later
      // (a future feature). We just log and move on.
      if (pendingReceiptImage && created?.id) {
        try {
          await api.uploadExpenseAttachment(
            id,
            created.id,
            pendingReceiptImage.base64,
            pendingReceiptImage.mime_type,
          );
        } catch (uploadErr) {
          console.warn('receipt attachment upload failed', uploadErr);
        }
      }

      // Show the success overlay instead of immediate router.back(). The
      // Continue button dismisses back to the group page; we keep the
      // form mounted underneath so a quick add->add->add flow could be
      // wired in later without re-mounting the screen.
      setSavedSubtitle(`${base.title} · ${fmtMinor(amountMinor, currency)}`);
    } catch (e: any) {
      Alert.alert(t('addExpense.saveErrorTitle'), e?.message || t('addExpense.saveErrorBody'));
    } finally {
      setSaving(false);
    }
  }

  function memberLabel(m: GroupMember): string {
    return m.user_id === user?.id ? t('addExpense.you') : m.name;
  }

  const recapMeta = fmtMinor(amountMinor, currency);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar
          title={t('addExpense.title')}
          left={
            <IconButton
              icon={step === 1 ? 'x' : 'arrow-left'}
              onPress={() => (step === 1 ? router.back() : setStep((step - 1) as Step))}
            />
          }
        />

        <Stepper current={step} t={t} />

        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {step === 1 && (
            <Step1
              t={t}
              amount={amount}
              setAmount={setAmount}
              currency={currency}
              title={title}
              setTitle={setTitle}
              date={date}
              setDate={setDate}
              onOpenDatePicker={() => setShowDatePicker(true)}
              groupName={group?.name ?? '—'}
              showChangeGroup={groupCount > 1}
              onOpenKeypad={() => setKeypadTarget({ kind: 'amount' })}
              ocrAvailable={ocrAvailable}
              onScanReceipt={() => setScannerOpen(true)}
            />
          )}

          {step === 2 && (
            <Step2
              t={t}
              currency={currency}
              amountMinor={amountMinor}
              recapMeta={recapMeta}
              groupName={group?.name ?? '—'}
              members={members}
              memberLabel={memberLabel}
              method={method}
              setMethod={setMethod}
              included={included}
              setIncluded={setIncluded}
              equalShare={equalShare}
              exactByMember={exactByMember}
              setExactByMember={setExactByMember}
              pctByMember={pctByMember}
              setPctByMember={setPctByMember}
              autoExactMinor={autoExactMinor}
              autoPctBp={autoPctBp}
              totalSplitMinor={totalSplitMinor}
              offBy={offBy}
              authToken={token}
            />
          )}
        </ScrollView>

        {duplicate && (
          <View style={[styles.dupWrap, { paddingBottom: 4 }]}>
            <View style={styles.dupBanner}>
              <Feather name="alert-circle" size={14} color={colors.lead} />
              <Text style={styles.dupText} numberOfLines={2}>
                {t('addExpense.dupWarning', { title: duplicate.title })}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/expenses/[server]/[id]',
                    params: { server: encodeURIComponent(serverUrl), id: duplicate.id, groupId: id },
                  })
                }
                hitSlop={6}
                accessibilityRole="link"
              >
                <Text style={styles.dupLink}>{t('addExpense.dupView')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
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
              disabled={!canSubmit || saving}
              style={{ flex: 1 }}
            >
              {saving ? t('addExpense.saving') : t('addExpense.submit')}
            </Button>
          )}
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
          display="default"
          onChange={(event, selected) => {
            setShowDatePicker(false);
            if (event.type === 'set' && selected) setDate(selected);
          }}
        />
      )}

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
        statusBarTranslucent
      >
        <ReceiptScanner
          groupCurrency={groupCurrency}
          groupLanguage={group?.language}
          onScanned={handleReceiptScanned}
          onCancel={() => setScannerOpen(false)}
        />
      </Modal>

      <ScanItemsAssign
        visible={scanItemsState !== null}
        items={scanItemsState?.items ?? []}
        taxMinor={scanItemsState?.taxMinor ?? 0}
        tipMinor={scanItemsState?.tipMinor ?? 0}
        totalMinor={scanItemsState?.totalMinor ?? 0}
        currency={scanItemsState?.currency ?? currency}
        members={members}
        currentMemberId={payerMemberId}
        authToken={token}
        onCancel={() => setScanItemsState(null)}
        onApply={applyScanItemsAssignment}
      />

      <ExpenseSavedOverlay
        visible={!!savedSubtitle}
        subtitle={savedSubtitle ?? undefined}
        onContinue={() => {
          setSavedSubtitle(null);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

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
  setAmount: (v: string) => void;
  currency: string;
  title: string;
  setTitle: (v: string) => void;
  date: Date;
  setDate: (d: Date) => void;
  onOpenDatePicker: () => void;
  groupName: string;
  showChangeGroup: boolean;
  onOpenKeypad: () => void;
  ocrAvailable: boolean;
  onScanReceipt: () => void;
}
function Step1({
  t,
  amount,
  setAmount,
  currency,
  title,
  setTitle,
  date,
  setDate,
  onOpenDatePicker,
  groupName,
  showChangeGroup,
  onOpenKeypad,
  ocrAvailable,
  onScanReceipt,
}: Step1Props) {
  return (
    <View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('addExpense.amount')}</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onOpenKeypad} style={styles.amountRow}>
          <Text
            style={[
              styles.amountInput,
              !amount && { color: colors.lead },
            ]}
          >
            {amount || '0'}
          </Text>
          <Text style={styles.currency}>{currency.toLowerCase()}</Text>
        </TouchableOpacity>
        <View style={styles.rule} />
      </View>

      {ocrAvailable && (
        <TouchableOpacity
          style={styles.scanRow}
          onPress={onScanReceipt}
          accessibilityRole="button"
          accessibilityLabel={t('addExpense.scanReceipt')}
        >
          <Feather name="camera" size={18} color={colors.graphite} />
          <Text style={styles.scanLabel}>{t('addExpense.scanReceipt')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.titleLabel')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('addExpense.titlePlaceholder')}
          placeholderTextColor={colors.lead}
          style={styles.titleInput}
        />
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.fieldLabel}>{t('addExpense.whenLabel')}</Text>
        <DateInput date={date} setDate={setDate} onOpenPicker={onOpenDatePicker} />
      </View>

      <View style={[styles.fieldWrap, { borderBottomWidth: 0 }]}>
        <Text style={styles.fieldLabel}>{t('addExpense.groupLabel')}</Text>
        <View style={styles.groupRow}>
          <Text style={styles.groupName}>{groupName}</Text>
          {showChangeGroup && (
            <Text style={styles.changeLink}>{t('addExpense.change')} →</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────
interface Step2Props {
  t: (k: string, opts?: any) => string;
  currency: string;
  amountMinor: number;
  recapMeta: string;
  groupName: string;
  members: GroupMember[];
  memberLabel: (m: GroupMember) => string;
  method: SplitMethod;
  setMethod: (v: SplitMethod) => void;
  included: Record<string, boolean>;
  setIncluded: (v: Record<string, boolean>) => void;
  equalShare: number;
  exactByMember: Record<string, string>;
  setExactByMember: (v: Record<string, string>) => void;
  pctByMember: Record<string, string>;
  setPctByMember: (v: Record<string, string>) => void;
  autoExactMinor: Record<string, number>;
  autoPctBp: Record<string, number>;
  totalSplitMinor: number;
  offBy: number;
  authToken: string | null;
}
function Step2({
  t,
  currency,
  amountMinor,
  recapMeta,
  groupName,
  members,
  memberLabel,
  method,
  setMethod,
  included,
  setIncluded,
  equalShare,
  exactByMember,
  setExactByMember,
  pctByMember,
  setPctByMember,
  autoExactMinor,
  autoPctBp,
  totalSplitMinor,
  offBy,
  authToken: token,
}: Step2Props) {
  const includedCount = members.filter((m) => included[m.id]).length;
  const methodHint = method === 'equal' ? t('addExpense.nWays', { count: includedCount }) : undefined;

  return (
    <View>
      <Recap
        eyebrow={recapMeta}
        line={groupName}
        amount={fmtMinor(amountMinor, currency)}
      />

      <SectionLabel>{t('addExpense.splitMethodLabel')}</SectionLabel>
      <View style={styles.segmentWrap}>
        {SPLIT_METHODS.map((m, i) => (
          <SegmentButton
            key={m.id}
            label={t(m.labelKey)}
            active={method === m.id}
            onPress={() => setMethod(m.id as SplitMethod)}
            first={i === 0}
            last={i === SPLIT_METHODS.length - 1}
          />
        ))}
      </View>

      <SectionLabel hint={methodHint}>{t('addExpense.between')}</SectionLabel>
      {(method === 'exact' || method === 'percentage') && (
        <Text style={styles.autoFillHint}>{t('addExpense.autoFillHint')}</Text>
      )}
      <View style={{ paddingHorizontal: spacing.s5 }}>
        {members.map((m) => {
          const inc = included[m.id];
          return (
            <View key={m.id} style={styles.payerRow}>
              <TouchableOpacity
                onPress={() => setIncluded({ ...included, [m.id]: !inc })}
                style={styles.payerLeft}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, inc && styles.checkboxOn]}>
                  {inc && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Avatar initials={initialsOf(m.name)} size="sm" source={avatarImageSource(m, token)} />
                <Text style={[styles.payerName, !inc && { color: colors.lead }]}>
                  {memberLabel(m)}
                </Text>
              </TouchableOpacity>
              {inc && method === 'equal' && (
                <Text style={styles.equalShare}>{fmtMinor(equalShare, currency)}</Text>
              )}
              {inc && method === 'exact' && (
                <AutoSplitField
                  value={exactByMember[m.id] ?? ''}
                  onChange={(v) => setExactByMember({ ...exactByMember, [m.id]: v })}
                  onClear={() => {
                    const next = { ...exactByMember };
                    delete next[m.id];
                    setExactByMember(next);
                  }}
                  autoPlaceholder={fmtAutoMinor(autoExactMinor[m.id] ?? 0)}
                  unit={currency.toLowerCase()}
                />
              )}
              {inc && method === 'percentage' && (
                <AutoSplitField
                  value={pctByMember[m.id] ?? ''}
                  onChange={(v) => setPctByMember({ ...pctByMember, [m.id]: v })}
                  onClear={() => {
                    const next = { ...pctByMember };
                    delete next[m.id];
                    setPctByMember(next);
                  }}
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
            <Text style={styles.reconcileLabel}>{t('addExpense.totalSplit')}</Text>
            <Text style={styles.reconcileValue}>{fmtMinor(totalSplitMinor, currency)}</Text>
          </View>
          <View style={styles.reconcileRow}>
            <Text style={styles.reconcileLabel}>{t('addExpense.matchesPaid')}</Text>
            <Text
              style={[
                styles.reconcileValue,
                { color: offBy === 0 ? colors.moss : colors.brick },
              ]}
            >
              {fmtMinor(Math.abs(offBy), currency)} {t('addExpense.off')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────
function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
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
      <Text style={[styles.segmentBtnLabel, active && styles.segmentBtnLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Field that shows the auto-split suggestion as a placeholder when empty, and
// becomes "locked" (with a clear ✕) as soon as the user types anything.
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

  stepBadge: { paddingHorizontal: 8 },
  stepBadgeText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.4,
  },

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
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountInput: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: 56,
    letterSpacing: -1.5,
    color: colors.graphite,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  currency: { fontFamily: fontMono, fontSize: 24, color: colors.lead },
  rule: { height: 1.5, backgroundColor: colors.graphite, marginTop: 12 },

  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.s5,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 8,
    justifyContent: 'center',
  },
  scanLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },

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
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupName: { fontFamily: fontBody, fontSize: fontSize.bodyL, color: colors.graphite },
  changeLink: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.vermillion },

  sectionLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    marginBottom: 6,
    marginTop: spacing.s3,
  },
  sectionLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },

  segmentWrap: { flexDirection: 'row', paddingHorizontal: spacing.s5, marginBottom: spacing.s3 },
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

  payerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  payerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  payerName: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite, flexShrink: 1 },

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
    backgroundColor: 'transparent',
  },
  checkboxOn: { backgroundColor: colors.graphite, borderColor: colors.graphite },
  checkmark: { color: colors.paper, fontSize: 11, lineHeight: 12, fontFamily: fontMonoMedium },

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
  clearBtnLabel: { fontFamily: fontMono, fontSize: 10, color: colors.lead, lineHeight: 11 },
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
  reconcileLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  reconcileValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  ctaBar: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },

  // Subtle duplicate warning surface — bone fill, no border, lead-grey
  // text so it reads as an info hint rather than an error.
  dupWrap: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    backgroundColor: colors.paper,
  },
  dupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    backgroundColor: colors.bone,
    borderRadius: 6,
  },
  dupText: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.2,
  },
  dupLink: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
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
