import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, Linking } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { ActionSheet, ActionSheetOption, openNativeActionSheet } from '@/components/ActionSheet';
import { MoneyText } from '@/components/MoneyText';
import { SettlementImpactSheet } from '@/components/SettlementImpactSheet';
import { showAlert } from '@/lib/app-alert';
import { Trans, useTranslation } from 'react-i18next';
import {
  apiFor,
  authToken,
  avatarImageSource,
  Expense,
  ExpenseAttachment,
  GroupDetail,
  GroupMember,
  Settlement,
} from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { categoryIcon, normalizeCategory } from '@/lib/categories';
import { currentLocale, formatDate, formatMinorUnits } from '@/lib/i18n';
import { computeBalanceImpact } from '@/lib/balance-impact';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { initialsOf, makeNameShortener } from '@/lib/name';
import { colors, fontDisplay, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function ExpenseDetailScreen() {
  const { server, id, groupId } = useLocalSearchParams<{
    server: string;
    id: string;
    groupId?: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const account = useAccount(serverUrl);
  const user = account?.user ?? null;
  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [viewer, setViewer] = useState<{ uri: string; headers: Record<string, string> } | null>(
    null,
  );
  const [token, setToken] = useState<string | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [receiptSheetVisible, setReceiptSheetVisible] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const isAuthor = !!user && !!expense && user.id === expense.created_by_id;

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load on focus so returning from the edit screen reflects fresh data.
  // The project has no SWR/React Query layer — this is the cheapest
  // mechanism that keeps the detail screen in sync after a save.
  useFocusEffect(
    useCallback(() => {
      if (!id || !groupId || !serverUrl) return;
      let cancelled = false;
      Promise.allSettled([
        api.getExpense(groupId, id),
        api.getGroup(groupId),
        api.listExpenseAttachments(groupId, id),
        api.listSettlements(groupId),
      ]).then(([eRes, gRes, aRes, sRes]) => {
        if (cancelled) return;
        if (eRes.status === 'fulfilled') setExpense(eRes.value);
        if (gRes.status === 'fulfilled') {
          setGroup(gRes.value);
          setMembers(gRes.value.members);
        }
        if (aRes.status === 'fulfilled') setAttachments(aRes.value);
        if (sRes.status === 'fulfilled') setSettlements(sRes.value);
      });
      return () => {
        cancelled = true;
      };
    }, [id, groupId, serverUrl]),
  );

  function inferReceiptMime(asset: ImagePicker.ImagePickerAsset): string {
    const m = (asset as { mimeType?: string }).mimeType?.toLowerCase();
    if (m === 'image/png') return 'image/png';
    if (m === 'image/webp') return 'image/webp';
    // ImagePicker re-encodes to JPEG on both platforms when allowsEditing,
    // so JPEG is the safe default.
    return 'image/jpeg';
  }

  async function uploadReceiptAsset(asset: ImagePicker.ImagePickerAsset | undefined) {
    if (!asset?.base64 || !groupId || !id) return;
    setUploadingReceipt(true);
    try {
      const mime = inferReceiptMime(asset);
      await api.uploadExpenseAttachment(groupId, id, asset.base64, mime);
      const refreshed = await api.listExpenseAttachments(groupId, id);
      setAttachments(refreshed);
    } catch (e) {
      showAlert({
        title: t('common.error'),
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function pickReceiptFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: t('expenseDetail.receiptPermissionTitle'), message: t('expenseDetail.receiptPermissionBody') });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    await uploadReceiptAsset(picked.assets?.[0]);
  }

  async function takeReceiptPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert({ title: t('expenseDetail.receiptPermissionTitle'), message: t('expenseDetail.receiptPermissionBody') });
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    await uploadReceiptAsset(picked.assets?.[0]);
  }

  function openReceiptSheet() {
    if (isPopupJustClosed()) return;
    if (!isAuthor) return;
    const options: ActionSheetOption[] = [
      { label: t('expenseDetail.receiptChooseLibrary'), onPress: pickReceiptFromLibrary },
      { label: t('expenseDetail.receiptTakePhoto'), onPress: takeReceiptPhoto },
    ];
    if (openNativeActionSheet(t('expenseDetail.receiptSheetTitle'), options)) return;
    setReceiptSheetVisible(true);
  }

  function openMenu() {
    // Don't reopen the action sheet if a popup was just dismissed by
    // tapping near this trigger. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    if (!isAuthor) return;
    const options: ActionSheetOption[] = [
      {
        label: t('expenseDetail.actions.edit'),
        onPress: () => {
          if (!id || !groupId) return;
          router.push({
            pathname: '/expenses/[server]/[id]/edit',
            params: { server: encodeURIComponent(serverUrl), id, groupId },
          });
        },
      },
      {
        label: t('expenseDetail.actions.delete'),
        destructive: true,
        onPress: () => setDeleteSheetVisible(true),
      },
    ];
    if (openNativeActionSheet(undefined, options)) return;
    setActionSheetVisible(true);
  }

  // Context-aware shortener over this group's members so each rendered name
  // is the shortest unambiguous label ("Lucas" / "Lucas H." / "Lucas Heinonen").
  // Declared above any early return so it never violates the Rules of Hooks.
  const shortenMember = useMemo(
    () => makeNameShortener(members.map((m) => m.name)),
    [members],
  );

  // Compute the delete impact lazily — we need it when the user opens the
  // delete confirm sheet. Returns empty arrays during loading.
  function computeDeleteImpact() {
    if (!expense) {
      return { deltas: [], affectedSettlements: [], newCurrency: '' };
    }
    const splits = expense.splits ?? [];
    return computeBalanceImpact({
      expense,
      currentSplits: splits,
      // Delete = "set all new shares to zero." Pass zero payer + empty
      // participants; the impl interprets the absence as full reversal.
      newAmountMinor: 0n,
      newPayerId: expense.paid_by_id,
      newSplitMethod: 'equal',
      newParticipants: [],
      newSplits: [],
      members,
      settlements,
    });
  }

  async function handleConfirmDelete() {
    if (!id || !groupId || !expense) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await api.deleteExpense(groupId, id);
      setDeleteSheetVisible(false);
      router.back();
    } catch (e: any) {
      setDeleteError(e?.message || t('impactSheet.deleteErrorGeneric'));
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (!expense) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar left={<IconButton icon="arrow-left" onPress={() => router.back()} />} />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </View>
    );
  }

  const amountMinor = Math.round(parseFloat(expense.amount) * 100);
  // Route the hero through the same formatter the rest of the app uses so
  // the currency symbol position matches everywhere else (kr 125.00, $5.00).
  // Locale-aware: in sv-SE the same call renders "375,00 kr" with the symbol
  // trailing, which is the right thing in that locale.
  const amountDisplay = formatMinorUnits(Math.abs(amountMinor), expense.currency);
  const payer = members.find((m) => m.id === expense.paid_by_id);
  const payerIsYou = payer?.user_id === user?.id;
  const payerLabel = payerIsYou
    ? t('expenseDetail.you')
    : payer
      ? shortenMember(payer.name)
      : t('common.dash');
  const splits = expense.splits ?? [];
  const splitCount = splits.length || members.length;
  const eachOwes = splitCount > 0 ? Math.round(amountMinor / splitCount) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
        right={
          isAuthor ? (
            <IconButton
              icon="more-vertical"
              label={t('expenseDetail.actions.menu')}
              onPress={openMenu}
            />
          ) : undefined
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <ContentContainer>
        {/* Title + amount hero */}
        <View style={styles.header}>
          <Text style={styles.context}>
            {t('expenseDetail.context', { groupName: group?.name ?? '—' })}
          </Text>
          <Text style={styles.title}>{expense.title}</Text>
          <MoneyText style={styles.amount} value={amountDisplay} />
          {expense.expense_date ? (
            <Text style={styles.paidBySentence}>
              <Trans
                i18nKey="expenseDetail.paidBySentence"
                values={{ name: payerLabel, date: formatDate(expense.expense_date) }}
                components={{ b: <Text style={styles.paidByEmphasis} /> }}
              />
            </Text>
          ) : null}

          {/* Category — icon + localized name. Legacy / unknown ids render
              as "other" (normalizeCategory). */}
          {expense.category ? (
            <View style={styles.categoryRow}>
              <Feather name={categoryIcon(expense.category)} size={13} color={colors.lead} />
              <Text style={styles.categoryText}>
                {t(`categories.${normalizeCategory(expense.category)}`)}
              </Text>
            </View>
          ) : null}

          {/* Notes — quiet prose under the hero. */}
          {expense.notes?.trim() ? (
            <Text style={styles.notes}>{expense.notes.trim()}</Text>
          ) : null}


          {/* FX card — promoted out of a one-liner so the rate (and whether
              it was a custom override vs ECB) is impossible to miss. Only
              rendered when the expense was paid in a non-group currency. */}
          {expense.original_currency &&
          expense.original_amount &&
          expense.fx_rate &&
          expense.original_currency !== expense.currency ? (
            <View style={styles.fxCard}>
              <View style={styles.fxCardHeaderRow}>
                <Text style={styles.fxCardEyebrow}>{t('expenseDetail.fx.card')}</Text>
                {expense.fx_source === 'manual' ? (
                  <View style={styles.fxSourceChipManual}>
                    <Text style={styles.fxSourceChipTextManual}>
                      {t('expenseDetail.fx.sourceManual')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.fxRateLine}>
                {t('expenseDetail.fx.rateLine', {
                  from: expense.original_currency,
                  rate: formatRate(expense.fx_rate),
                  to: expense.currency,
                })}
              </Text>
              <Text style={styles.fxPaidLine}>
                {t('expenseDetail.fx.paidLine', {
                  original: formatMinorUnits(
                    Math.round(parseFloat(expense.original_amount) * 100),
                    expense.original_currency,
                  ),
                  converted: formatMinorUnits(amountMinor, expense.currency),
                })}
              </Text>
              {expense.fx_as_of ? (
                <Text style={styles.fxAsOfLine}>
                  {t('expenseDetail.fx.asOf', { date: formatDate(expense.fx_as_of) })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Meta row removed — payer is communicated by the bordered
              split-row card; date is shown once in the activity footer. */}
        </View>

        {/* Split breakdown header removed — the per-row share + the row
            count carry the same information; the meta header was noise. */}
        <View style={styles.sectionGap} />

        {/* Splits list */}
        {splits.length === 0
          ? members.map((m) => {
              const isYou = m.user_id === user?.id;
              return (
                <SplitRow
                  key={m.id}
                  name={isYou ? t('expenseDetail.you') : shortenMember(m.name)}
                  initials={initialsOf(m.name)}
                  share={String(eachOwes)}
                  currency={expense.currency}
                  avatarSource={avatarImageSource(m, token)}
                />
              );
            })
          : splits.map((s) => {
              const member = members.find((m) => m.id === s.member_id);
              const isYou = member?.user_id === user?.id;
              const shareMinor = Math.round(parseFloat(s.share) * 100);
              return (
                <SplitRow
                  key={s.id}
                  name={
                    isYou
                      ? t('expenseDetail.you')
                      : member
                        ? shortenMember(member.name)
                        : t('common.dash')
                  }
                  initials={member ? initialsOf(member.name) : '??'}
                  share={String(shareMinor)}
                  currency={expense.currency}
                  avatarSource={avatarImageSource(member, token)}
                />
              );
            })}

        {/* Receipt — demoted: no section header, single compact row. Empty
            state is rendered as a hairline-bordered ghost row to stay quiet
            until the user actually has something to look at. */}
        <View style={styles.receiptWrap}>
          {attachments.length === 0 ? (
            <TouchableOpacity
              style={styles.receiptEmpty}
              activeOpacity={isAuthor ? 0.7 : 1}
              onPress={isAuthor ? openReceiptSheet : undefined}
              disabled={!isAuthor || uploadingReceipt}
              accessibilityRole={isAuthor ? 'button' : undefined}
              accessibilityLabel={isAuthor ? t('expenseDetail.receiptSheetTitle') : undefined}
            >
              <Feather name={isAuthor ? 'plus-circle' : 'image'} size={14} color={colors.lead} />
              <Text style={styles.receiptEmptyText}>
                {uploadingReceipt
                  ? t('expenseDetail.receiptUploading')
                  : isAuthor
                    ? t('expenseDetail.addReceipt')
                    : t('expenseDetail.noReceipt')}
              </Text>
            </TouchableOpacity>
          ) : (
            attachments.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.receiptCard}
                activeOpacity={0.7}
                onPress={async () => {
                  if (!a.url) return;
                  const token = await authToken();
                  const uri = a.url.startsWith('http') ? a.url : `${serverUrl}${a.url}`;
                  const headers: Record<string, string> = token
                    ? { Authorization: `Bearer ${token}` }
                    : {};
                  if (a.mime_type.startsWith('image/')) {
                    setViewer({ uri, headers });
                  } else {
                    // Non-images can't pass headers via Linking, so fall back
                    // to opening the absolute API URL — caller is responsible
                    // for browser auth (rarely the case in v1).
                    Linking.openURL(uri);
                  }
                }}
              >
                <Feather name="image" size={16} color={colors.graphite} />
                <Text style={styles.receiptText}>{t('expenseDetail.viewReceipt')}</Text>
                <Feather name="chevron-right" size={16} color={colors.lead} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* In-app image viewer for receipts. Linking out to the browser
            works too but a modal keeps users in the flow. */}
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
          <View style={styles.viewerBackdrop}>
            <TouchableOpacity
              style={styles.viewerClose}
              onPress={() => setViewer(null)}
              accessibilityLabel={t('common.close')}
            >
              <Feather name="x" size={24} color={colors.paper} />
            </TouchableOpacity>
            {viewer ? (
              <Image
                source={{ uri: viewer.uri, headers: viewer.headers }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </Modal>

        {/* Activity — single muted mono line; no rule, no section header.
            Use the same `formatDate` the top meta row uses so both dates
            render in one locale-correct shape. */}
        <Text style={styles.activityFooter}>
          {t('expenseDetail.activityHeader', {
            created: expense.created_at ? formatDate(expense.created_at) : '',
            time: expense.created_at
              ? new Date(expense.created_at).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
              : '',
          })}
        </Text>
        </ContentContainer>
      </ScrollView>

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        options={[
          {
            label: t('expenseDetail.actions.edit'),
            onPress: () => {
              if (!id || !groupId) return;
              router.push({
                pathname: '/expenses/[server]/[id]/edit',
                params: { server: encodeURIComponent(serverUrl), id, groupId },
              });
            },
          },
          {
            label: t('expenseDetail.actions.delete'),
            destructive: true,
            onPress: () => setDeleteSheetVisible(true),
          },
        ]}
      />

      <ActionSheet
        visible={receiptSheetVisible}
        onClose={() => setReceiptSheetVisible(false)}
        title={t('expenseDetail.receiptSheetTitle')}
        options={[
          { label: t('expenseDetail.receiptChooseLibrary'), onPress: pickReceiptFromLibrary },
          { label: t('expenseDetail.receiptTakePhoto'), onPress: takeReceiptPhoto },
        ]}
      />

      {/* Delete confirm — always uses SettlementImpactSheet (mode=delete).
          When no settlements are affected the sheet still renders, but with
          the plain lead and zero settlement rows. */}
      {expense && (
        <SettlementImpactSheet
          visible={deleteSheetVisible}
          mode="delete"
          deltas={computeDeleteImpact().deltas}
          affectedSettlements={computeDeleteImpact().affectedSettlements}
          members={members}
          currency={expense.currency}
          submitting={deleteSubmitting}
          error={deleteError}
          onCancel={() => {
            setDeleteSheetVisible(false);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </View>
  );
}

// Trim a decimal string like "11.5000000000" to a humane display width
// (max 6 fractional digits, trailing zeros stripped). Keeps integers
// integer-looking ("12").
function formatRate(s: string): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  const fixed = n.toFixed(6);
  if (!fixed.includes('.')) return fixed;
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

interface SplitRowProps {
  name: string;
  initials: string;
  share: string;
  currency: string;
  avatarSource?: { uri: string; headers?: Record<string, string> } | null;
}

function SplitRow({ name, initials, share, currency, avatarSource }: SplitRowProps) {
  const minor = parseInt(share, 10);
  // No sign — this is each person's share of the cost, not a balance delta.
  // The header already says how the total split, so the row is reinforcement.
  // Showing −kr next to the payer's name contradicts the standings screen
  // (where their net for this expense is positive). Who paid is communicated
  // separately by the "Paid by <name>" sentence under the hero amount.
  const display = formatMinorUnits(Math.abs(minor), currency);
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitLeft}>
        <Avatar initials={initials} source={avatarSource} />
        <Text style={styles.splitName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <MoneyText style={styles.splitAmount} value={display} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  header: { paddingHorizontal: spacing.s5, paddingTop: spacing.s5 },
  context: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    letterSpacing: -0.8,
    color: colors.graphite,
    lineHeight: 46,
    marginBottom: spacing.s4,
  },
  amount: {
    fontFamily: fontMono,
    fontSize: fontSize.displayXl,
    letterSpacing: -1.2,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
    lineHeight: 66,
  },
  fxCard: {
    marginTop: spacing.s4,
    padding: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
    gap: 4,
  },
  fxCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  fxCardEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
  },
  fxSourceChipManual: {
    backgroundColor: colors.graphite,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  fxSourceChipTextManual: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.paper,
    letterSpacing: 0.3,
  },
  fxRateLine: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  fxPaidLine: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
  },
  fxAsOfLine: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 2,
  },
  sectionGap: {
    height: spacing.s5,
  },
  paidBySentence: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    marginTop: spacing.s3,
    // Hint extra line height so the inline chip backgrounds don't bump
    // against the line above / below when the sentence wraps.
    lineHeight: fontSize.body + 10,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.s3,
  },
  categoryText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
  },
  notes: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    marginTop: spacing.s3,
    lineHeight: fontSize.body + 8,
  },
  paidByEmphasis: {
    fontFamily: fontDisplay,
    color: colors.graphite,
    // Inline chip: subtle bone fill with a touch of horizontal padding.
    // Border radius on inline Text is best-effort on RN — falls back to a
    // rectangle on Android, which still reads as a highlight.
    backgroundColor: colors.bone,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
  },
  splitLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  splitName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.3,
    color: colors.graphite,
    flexShrink: 1,
  },
  splitAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  receiptWrap: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s5,
    gap: spacing.s2,
  },
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 10,
  },
  receiptEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s2,
  },
  receiptEmptyText: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
  },
  receiptText: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    flex: 1,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 1,
  },
  viewerImage: { width: '100%', height: '100%' },
  activityFooter: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
  },
});
