import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { showAlert } from '@/lib/app-alert';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import {
  apiFor,
  authToken,
  Expense,
  GroupDetail,
  GroupMember,
  ScannedReceiptItem,
} from '@/lib/api';
import { decimalToMinor, currentLocale } from '@/lib/i18n';
import { ReceiptScanner, ReceiptScanResult } from '@/components/ReceiptScanner';
import { ExpenseSavedOverlay } from '@/components/ExpenseSavedOverlay';
import { notifyGroupChanged } from '@/lib/group-refresh';
import { ScanItemsAssign } from '@/components/ScanItemsAssign';
import { useAuth } from '@/lib/auth';
import {
  ExpenseWizard,
  ExpenseWizardHandle,
  ExpenseWizardSubmitPayload,
} from '@/components/ExpenseWizard';
import {
  colors,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

function fmtMinor(n: number, currency: string): string {
  const abs = Math.abs(n);
  return `${(abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} ${currency}`;
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

  const [ocrAvailable, setOcrAvailable] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [savedSubtitle, setSavedSubtitle] = useState<string | null>(null);
  const [existingExpenses, setExistingExpenses] = useState<Expense[]>([]);
  const [pendingReceiptImage, setPendingReceiptImage] = useState<
    { base64: string; mime_type: string } | null
  >(null);
  const [scanItemsState, setScanItemsState] = useState<{
    items: ScannedReceiptItem[];
    taxMinor: number;
    tipMinor: number;
    totalMinor: number;
    currency: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Live snapshot of wizard values for duplicate detection.
  const [liveValues, setLiveValues] = useState<{
    title: string;
    amount: string;
    amountMinor: number;
    currency: string;
  }>({ title: '', amount: '', amountMinor: 0, currency: '' });

  const wizardRef = useRef<ExpenseWizardHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id || !serverUrl) return;
    api
      .getGroup(id)
      .then((g) => {
        setGroup(g);
        setMembers(g.members);
      })
      .catch(() => {});
  }, [id, serverUrl]);

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

  const currentUserMemberId = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.id ?? '',
    [members, user?.id],
  );

  function handleReceiptScanned(result: ReceiptScanResult) {
    setScannerOpen(false);
    const { receipt, applied } = result;
    if (result.image) setPendingReceiptImage(result.image);

    wizardRef.current?.applyReceiptResult({
      amount: applied.amount_minor > 0 ? (applied.amount_minor / 100).toFixed(2) : undefined,
      currency: applied.currency,
      title: receipt.title || receipt.merchant || undefined,
      date: receipt.date
        ? (() => {
            const parsed = new Date(receipt.date + 'T00:00:00');
            return Number.isNaN(parsed.getTime()) ? undefined : parsed;
          })()
        : undefined,
    });

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

  function applyScanItemsAssignment(perMemberMinor: Record<string, number>) {
    setScanItemsState(null);
    wizardRef.current?.applyScanItemsAssignment(perMemberMinor);
  }

  // Duplicate detection: title + amount + currency match against any existing
  // expense in the group. Same-currency only — cross-currency would need FX
  // and produces false positives.
  const duplicate = useMemo<Expense | null>(() => {
    const titleKey = liveValues.title.trim().toLowerCase();
    if (!titleKey || liveValues.amountMinor <= 0) return null;
    return (
      existingExpenses.find(
        (e) =>
          e.title.trim().toLowerCase() === titleKey &&
          decimalToMinor(e.amount) === liveValues.amountMinor &&
          e.currency === liveValues.currency,
      ) ?? null
    );
  }, [existingExpenses, liveValues]);

  async function handleSubmit(payload: ExpenseWizardSubmitPayload) {
    if (!id) return;
    setSaving(true);
    try {
      const base = {
        title: payload.title,
        amount: payload.amount,
        currency: payload.currency,
        paid_by_id: payload.paid_by_id,
        expense_date: payload.expense_date,
        split_method: payload.split_method,
        ...(payload.fx ?? {}),
      };

      let created;
      if (payload.split_method === 'equal') {
        created = await api.createExpense(id, {
          ...base,
          participants: payload.participants ?? [],
        });
      } else {
        created = await api.createExpense(id, {
          ...base,
          splits: payload.splits ?? [],
        });
      }

      notifyGroupChanged(serverUrl, id);

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

      const amountMinor = Math.round(parseFloat(payload.amount) * 100);
      setSavedSubtitle(`${payload.title} · ${fmtMinor(amountMinor, payload.currency)}`);
    } catch (e: any) {
      showAlert({
        title: t('addExpense.saveErrorTitle'),
        message: e?.message || t('addExpense.saveErrorBody'),
      });
    } finally {
      setSaving(false);
    }
  }

  const topSlot = ocrAvailable ? (
    <TouchableOpacity
      style={styles.scanRow}
      onPress={() => setScannerOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={t('addExpense.scanReceipt')}
    >
      <Feather name="camera" size={18} color={colors.graphite} />
      <Text style={styles.scanLabel}>{t('addExpense.scanReceipt')}</Text>
    </TouchableOpacity>
  ) : null;

  const preCtaSlot = duplicate ? (
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
              params: {
                server: encodeURIComponent(serverUrl),
                id: duplicate.id,
                groupId: id,
              },
            })
          }
          hitSlop={6}
          accessibilityRole="link"
        >
          <Text style={styles.dupLink}>{t('addExpense.dupView')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ExpenseWizard
        ref={wizardRef}
        mode="create"
        topBarTitle={
          group?.name
            ? t('addExpense.titleInGroup', { group: group.name })
            : t('addExpense.title')
        }
        onCancel={() => router.back()}
        groupName={group?.name ?? '—'}
        groupCurrency={group?.currency ?? 'SEK'}
        members={members}
        currentUserMemberId={currentUserMemberId}
        convertFx={api.convertFx}
        authToken={token}
        submitting={saving}
        onSubmit={handleSubmit}
        onValuesChange={setLiveValues}
        topSlot={topSlot}
        preCtaSlot={preCtaSlot}
      />

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
        statusBarTranslucent
      >
        <ReceiptScanner
          groupCurrency={group?.currency ?? 'SEK'}
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
        currency={scanItemsState?.currency ?? group?.currency ?? 'SEK'}
        members={members}
        currentMemberId={currentUserMemberId}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
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
});
