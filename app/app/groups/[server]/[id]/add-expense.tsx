import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { Button } from '@/components/Button';
import {
  apiFor,
  Expense,
  GroupDetail,
  GroupMember,
  ScannedReceiptItem,
} from '@/lib/api';
import { decimalToMinor, currentLocale } from '@/lib/i18n';
import { ReceiptScanner, ReceiptScanResult } from '@/components/ReceiptScanner';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReceiptSource } from '@/lib/receipt-file';
import { consumePendingShare } from '@/lib/pending-share';
import { openPdfExternally } from '@/lib/receipt-open';
import { PdfView, canRenderPdfInline } from '@/components/PdfView';
import { ExpenseSavedOverlay } from '@/components/ExpenseSavedOverlay';
import { notifyGroupChanged } from '@/lib/group-refresh';
import { ScanItemsAssign } from '@/components/ScanItemsAssign';
import { buildScanItemsState, type Itemization, type ScanItemsState } from '@/lib/scan-items';
import { draftKey } from '@/lib/expense-draft';
import { useAccount } from '@/lib/accounts';
import {
  ExpenseWizard,
  ExpenseWizardHandle,
  ExpenseWizardSubmitPayload,
} from '@/components/ExpenseWizard';
import {
  colors,
  fontDisplay,
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
  // "You" must resolve to this server's account, not the default account.
  const account = useAccount(serverUrl);
  const user = account?.user ?? null;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  // null until the instance descriptor has answered — the shared-file effect
  // below must not decide "no OCR" on the initial value.
  const [ocrAvailable, setOcrAvailable] = useState<boolean | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  // A file handed over by the OS share sheet, for the scanner to start on.
  const [initialScan, setInitialScan] = useState<{
    source: ReceiptSource;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [savedSubtitle, setSavedSubtitle] = useState<string | null>(null);
  const [existingExpenses, setExistingExpenses] = useState<Expense[]>([]);
  const [pendingReceiptFile, setPendingReceiptFile] = useState<
    { base64: string; mime_type: string; name?: string } | null
  >(null);
  const [scanItemsState, setScanItemsState] =
    useState<ScanItemsState<ScannedReceiptItem> | null>(null);
  // Assignments to seed the items screen with when it opens: empty for a fresh
  // scan, the prior per-item assignments when re-opening an applied itemisation.
  const [scanInitialAssignments, setScanInitialAssignments] = useState<
    Record<string, string[]>
  >({});
  // The itemisation currently behind the split, surfaced by the wizard (from a
  // fresh scan, an edit, or a restored draft). Drives the "Receipt" card that
  // lets the user re-open the items screen. Deposit rides along so re-opening
  // reconstructs the same unassigned remainder.
  const [appliedScan, setAppliedScan] = useState<{
    itemization: Itemization;
    depositMinor: number;
  } | null>(null);
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
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

  // Shared-file entry (receipt-inbox → here). Consumed once, after the group
  // and OCR availability are known: with OCR the scanner opens already
  // analyzing the file; without it the file is attached as-is and the user
  // enters the amount by hand.
  const shareConsumedRef = useRef(false);
  useEffect(() => {
    if (!group || ocrAvailable === null || shareConsumedRef.current) return;
    const share = consumePendingShare();
    if (!share) return;
    shareConsumedRef.current = true;
    void (async () => {
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(share.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        await showAlert({
          title: t('receiptScanner.fileRejectedTitle'),
          message: t('receiptScanner.fileUnreadable'),
          buttons: [{ key: 'ok', label: t('common.ok') }],
        });
        return;
      }
      if (ocrAvailable) {
        setInitialScan({
          source:
            share.mimeType === 'application/pdf'
              ? { kind: 'pdf', uri: share.uri, name: share.name }
              : { kind: 'image', uri: share.uri },
          base64,
          mimeType: share.mimeType,
        });
        setScannerOpen(true);
      } else {
        setPendingReceiptFile({ base64, mime_type: share.mimeType, name: share.name });
        await showAlert({
          title: t('addExpense.noOcrTitle'),
          message: t('addExpense.noOcrBody'),
          buttons: [{ key: 'ok', label: t('common.ok') }],
        });
      }
    })();
  }, [group, ocrAvailable, t]);

  const currentUserMemberId = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.id ?? '',
    [members, user?.id],
  );

  function sharePendingReceipt() {
    if (!pendingReceiptFile) return;
    void openPdfExternally({
      kind: 'base64',
      base64: pendingReceiptFile.base64,
      name: pendingReceiptFile.name,
    }).then((ok) => {
      if (ok) return;
      void showAlert({
        title: t('addExpense.receiptOpenFailedTitle'),
        message: t('addExpense.receiptOpenFailedBody'),
        buttons: [{ key: 'ok', label: t('common.ok') }],
      });
    });
  }

  function closeScanner() {
    setScannerOpen(false);
    // A shared file is scanned once; a later manual open starts at the camera.
    setInitialScan(null);
  }

  function handleReceiptScanned(result: ReceiptScanResult) {
    closeScanner();
    const { receipt, applied } = result;
    if (result.file) setPendingReceiptFile(result.file);

    wizardRef.current?.applyReceiptResult({
      amount: applied.amount_minor > 0 ? (applied.amount_minor / 100).toFixed(2) : undefined,
      currency: applied.currency,
      title: receipt.title || receipt.merchant || undefined,
      category: receipt.category || undefined,
      date: receipt.date
        ? (() => {
            const parsed = new Date(receipt.date + 'T00:00:00');
            return Number.isNaN(parsed.getTime()) ? undefined : parsed;
          })()
        : undefined,
    });

    // Open the itemised assign view, scaling line items / tax / tip into the
    // group currency. Returns null (and we skip the view) when there are no
    // items, or when the applied amount isn't in group currency — see
    // buildScanItemsState for the FX rationale.
    const state = buildScanItemsState(receipt, applied, group?.currency ?? 'SEK');
    if (state) {
      setScanInitialAssignments({});
      setScanItemsState(state);
    }
  }

  // Re-open the items screen for the itemisation already behind the split,
  // reconstructed from what the wizard holds plus the live expense amount (the
  // receipt total the split reconciles against). Editing and re-applying flows
  // back through the same path as a fresh scan.
  function reopenItems() {
    if (!appliedScan) return;
    setScanInitialAssignments(appliedScan.itemization.assignments);
    setScanItemsState({
      items: appliedScan.itemization.items,
      taxMinor: appliedScan.itemization.taxMinor,
      tipMinor: appliedScan.itemization.tipMinor,
      depositMinor: appliedScan.depositMinor,
      totalMinor: liveValues.amountMinor,
      currency: group?.currency ?? 'SEK',
    });
  }

  function applyScanItemsAssignment(
    result: Parameters<
      NonNullable<typeof wizardRef.current>['applyScanItemsAssignment']
    >[0] | null,
  ) {
    setScanItemsState(null);
    // Skipping the itemised step leaves the wizard's split untouched.
    if (!result) return;
    wizardRef.current?.applyScanItemsAssignment(result);
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
        category: payload.category,
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

      if (pendingReceiptFile && created?.id) {
        try {
          await api.uploadExpenseAttachment(
            id,
            created.id,
            pendingReceiptFile.base64,
            pendingReceiptFile.mime_type,
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
      // Rethrow so the wizard keeps the auto-saved draft on failure.
      throw e;
    } finally {
      setSaving(false);
    }
  }

  // Once a scan is applied the plain "Scan receipt" row becomes a card that
  // re-opens the items screen and the captured receipt image, so neither is a
  // one-shot. The image is session-only (too large for the SecureStore draft),
  // so "View receipt" only appears while it's still in memory; the itemisation
  // itself persists in the draft and re-opens after a restart.
  const topSlot = appliedScan ? (
    <View style={styles.receiptCard}>
      <View style={styles.receiptCardHead}>
        <Feather name="file-text" size={16} color={colors.graphite} />
        <Text style={styles.receiptCardTitle}>
          {t('addExpense.receiptItems', { count: appliedScan.itemization.items.length })}
        </Text>
      </View>
      <View style={styles.receiptCardActions}>
        <TouchableOpacity
          style={styles.receiptActionBtn}
          onPress={reopenItems}
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <Text style={styles.receiptActionLabel}>{t('addExpense.viewItems')}</Text>
        </TouchableOpacity>
        {pendingReceiptFile && (
          <TouchableOpacity
            style={styles.receiptActionBtn}
            onPress={() => setReceiptViewerOpen(true)}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={styles.receiptActionLabel}>{t('addExpense.viewReceipt')}</Text>
          </TouchableOpacity>
        )}
        {ocrAvailable && (
          <TouchableOpacity
            style={styles.receiptActionBtn}
            onPress={() => setScannerOpen(true)}
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Text style={styles.receiptActionLabelMuted}>{t('addExpense.rescan')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  ) : ocrAvailable ? (
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
        groupCategorySlugs={group?.category_slugs}
        members={members}
        groupId={id}
        currentUserMemberId={currentUserMemberId}
        convertFx={api.convertFx}
        serverUrl={serverUrl}
        submitting={saving}
        onSubmit={handleSubmit}
        draftKey={id ? draftKey(serverUrl, id) : undefined}
        onValuesChange={setLiveValues}
        onScanChange={setAppliedScan}
        topSlot={topSlot}
        preCtaSlot={preCtaSlot}
      />

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={closeScanner}
        statusBarTranslucent
      >
        <ReceiptScanner
          serverUrl={serverUrl}
          groupCurrency={group?.currency ?? 'SEK'}
          groupLanguage={group?.language}
          groupId={id}
          onScanned={handleReceiptScanned}
          onCancel={closeScanner}
          initialScan={initialScan ?? undefined}
        />
      </Modal>

      <ScanItemsAssign
        visible={scanItemsState !== null}
        items={scanItemsState?.items ?? []}
        taxMinor={scanItemsState?.taxMinor ?? 0}
        tipMinor={scanItemsState?.tipMinor ?? 0}
        depositMinor={scanItemsState?.depositMinor ?? 0}
        totalMinor={scanItemsState?.totalMinor ?? 0}
        currency={scanItemsState?.currency ?? group?.currency ?? 'SEK'}
        initialAssignments={scanInitialAssignments}
        members={members}
        currentMemberId={currentUserMemberId}
        serverUrl={serverUrl}
        onCancel={() => setScanItemsState(null)}
        onApply={applyScanItemsAssignment}
      />

      <Modal
        visible={receiptViewerOpen && !!pendingReceiptFile}
        animationType="fade"
        transparent
        onRequestClose={() => setReceiptViewerOpen(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.receiptViewer}
          activeOpacity={1}
          onPress={() => setReceiptViewerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          {pendingReceiptFile && (
            pendingReceiptFile.mime_type === 'application/pdf' && canRenderPdfInline ? (
              <View style={styles.receiptPdfWrap}>
                <View style={styles.receiptPdfBar}>
                  <Text style={styles.receiptPdfName} numberOfLines={1}>
                    {pendingReceiptFile.name ?? t('addExpense.receiptDocument')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => sharePendingReceipt()}
                    accessibilityLabel={t('common.share')}
                    style={styles.receiptPdfBarBtn}
                  >
                    <Feather name="share" size={22} color={colors.paper} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setReceiptViewerOpen(false)}
                    accessibilityLabel={t('common.close')}
                    style={styles.receiptPdfBarBtn}
                  >
                    <Feather name="x" size={24} color={colors.paper} />
                  </TouchableOpacity>
                </View>
                <PdfView
                  source={{
                    uri: `data:application/pdf;base64,${pendingReceiptFile.base64}`,
                  }}
                  style={styles.receiptPdf}
                />
              </View>
            ) : pendingReceiptFile.mime_type === 'application/pdf' ? (
              <View style={styles.receiptDocCard}>
                <Feather name="file-text" size={48} color={colors.lead} />
                <Text style={styles.receiptDocName} numberOfLines={2}>
                  {pendingReceiptFile.name ?? t('addExpense.receiptDocument')}
                </Text>
                <Button kind="secondary" onPress={() => sharePendingReceipt()}>
                  {t('addExpense.openReceipt')}
                </Button>
              </View>
            ) : (
              <Image
                style={styles.receiptImage}
                resizeMode="contain"
                source={{
                  uri: `data:${pendingReceiptFile.mime_type};base64,${pendingReceiptFile.base64}`,
                }}
              />
            )
          )}
        </TouchableOpacity>
      </Modal>

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
  receiptCard: {
    marginHorizontal: spacing.s5,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 8,
    gap: 10,
  },
  receiptCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptCardTitle: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  receiptCardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  receiptActionBtn: {
    backgroundColor: colors.bone,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  receiptActionLabel: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  receiptActionLabelMuted: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  receiptViewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.s4,
  },
  receiptImage: { width: '100%', height: '100%' },
  receiptPdfWrap: { flex: 1, alignSelf: 'stretch' },
  receiptPdfBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  receiptPdfName: {
    flex: 1,
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyS,
    color: colors.paper,
  },
  receiptPdfBarBtn: { padding: spacing.s2 },
  receiptPdf: { flex: 1, alignSelf: 'stretch', backgroundColor: 'transparent' },
  receiptDocCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    padding: spacing.s6,
  },
  receiptDocName: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.paper,
    letterSpacing: 0.3,
    textAlign: 'center',
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
