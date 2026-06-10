/**
 * Edit-expense host screen.
 *
 * Spec: docs/superpowers/specs/2026-05-23-edit-expense-design.md §"Edit screen".
 *
 * Hosts the shared <ExpenseWizard mode="edit">. On submit:
 *  - Builds a balance-impact via `computeBalanceImpact`.
 *  - Routes through `decideConfirmFlow` to pick the confirmation surface
 *    (no-changes toast / simple confirm / SettlementImpactSheet).
 *  - PATCHes the expense, then navigates back.
 *
 * Stale-banner: re-fetches on focus; if `updated_at` changes, prompts a reload.
 *
 * Category and notes are edited in the wizard; the PATCH always carries the
 * wizard's values for both (`notes: ''` clears them server-side).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import {
  ExpenseWizard,
  ExpenseWizardSubmitPayload,
} from '@/components/ExpenseWizard';
import { SettlementImpactSheet } from '@/components/SettlementImpactSheet';
import {
  apiFor,
  authToken,
  Expense,
  GroupDetail,
  Settlement,
} from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { computeBalanceImpact, MemberDelta } from '@/lib/balance-impact';
import { normalizeCategory } from '@/lib/categories';
import {
  decideConfirmFlow,
  expenseInputCurrencyAmount,
  expenseToInitialValue,
  nonShareFieldsDiffer,
  NonShareFieldsSnapshot,
  payloadToUpdateInput,
  projectExpenseToInputCurrency,
} from '@/lib/edit-expense-flow';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

function snapshotFromPayload(p: ExpenseWizardSubmitPayload): NonShareFieldsSnapshot {
  return {
    title: p.title,
    category: p.category,
    notes: p.notes,
    expense_date: p.expense_date,
    currency: p.fx?.original_currency ?? p.currency,
    amount: p.fx?.original_amount ?? p.amount,
  };
}

function snapshotFromExpense(expense: Expense): NonShareFieldsSnapshot {
  const { amount, currency } = expenseInputCurrencyAmount(expense);
  return {
    title: expense.title,
    // Normalized like the wizard prefill, so a legacy 'general' expense
    // saved without touching the picker still counts as "no changes".
    category: normalizeCategory(expense.category),
    notes: expense.notes ?? '',
    expense_date: expense.expense_date ?? new Date().toISOString().split('T')[0],
    currency,
    amount: parseFloat(amount).toFixed(2),
  };
}

export default function EditExpenseScreen() {
  const { server, id, groupId } = useLocalSearchParams<{
    server: string;
    id: string;
    groupId?: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const account = useAccount(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleBannerVisible, setStaleBannerVisible] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] =
    useState<ExpenseWizardSubmitPayload | null>(null);
  const [impactSheetVisible, setImpactSheetVisible] = useState(false);

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
    if (!id || !groupId || !serverUrl) return;
    let cancelled = false;
    Promise.allSettled([
      api.getExpense(groupId, id),
      api.getGroup(groupId),
      api.listSettlements(groupId),
    ]).then(([eRes, gRes, sRes]) => {
      if (cancelled) return;
      if (eRes.status === 'fulfilled') setExpense(eRes.value);
      else setLoadError(t('expenseDetail.loadError'));
      if (gRes.status === 'fulfilled') setGroup(gRes.value);
      if (sRes.status === 'fulfilled') setSettlements(sRes.value);
    });
    return () => {
      cancelled = true;
    };
  }, [id, groupId, serverUrl]);

  useFocusEffect(
    useCallback(() => {
      if (!id || !groupId || !expense) return;
      let cancelled = false;
      api
        .getExpense(groupId, id)
        .then((latest) => {
          if (cancelled) return;
          if (latest.updated_at !== expense.updated_at) {
            setStaleBannerVisible(true);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [id, groupId, expense?.updated_at]),
  );

  const initialValue = useMemo(
    () => (expense ? expenseToInitialValue(expense) : undefined),
    [expense],
  );

  const currentUserMemberId = useMemo(
    () => group?.members.find((m) => m.user_id === account?.user?.id)?.id ?? '',
    [group, account?.user?.id],
  );

  function reload() {
    if (!id || !groupId) return;
    setStaleBannerVisible(false);
    api
      .getExpense(groupId, id)
      .then(setExpense)
      .catch(() => setLoadError(t('expenseDetail.loadError')));
  }

  function buildImpact(payload: ExpenseWizardSubmitPayload) {
    if (!expense || !group) {
      return {
        deltas: [] as MemberDelta[],
        affectedSettlements: [] as Settlement[],
        newCurrency: payload.currency,
      };
    }
    const amountMinor = BigInt(Math.round(parseFloat(payload.amount || '0') * 100));
    let newSplits: { memberId: string; amountMinor: bigint }[] | undefined;
    if (payload.split_method === 'exact' && payload.splits) {
      newSplits = payload.splits.map((s) => ({
        memberId: s.member_id,
        amountMinor: BigInt(Math.round(parseFloat(s.share ?? '0') * 100)),
      }));
    }
    const participants =
      payload.participants ?? payload.splits?.map((s) => s.member_id) ?? [];
    const projected = projectExpenseToInputCurrency(expense);
    return computeBalanceImpact({
      expense: projected,
      currentSplits: projected.splits ?? [],
      newAmountMinor: amountMinor,
      newPayerId: payload.paid_by_id,
      newSplitMethod: payload.split_method,
      newParticipants: participants,
      newSplits,
      members: group.members,
      settlements,
    });
  }

  async function handleSubmit(payload: ExpenseWizardSubmitPayload) {
    if (!expense) return;
    const impact = buildImpact(payload);
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: nonShareFieldsDiffer(
        snapshotFromPayload(payload),
        snapshotFromExpense(expense),
      ),
      deltas: impact.deltas,
      affectedSettlementsCount: impact.affectedSettlements.length,
    });

    if (flow.kind === 'no-changes') {
      showAlert({ title: t('expenseDetail.noChanges') });
      router.back();
      return;
    }

    setPendingPayload(payload);

    if (flow.kind === 'impact-sheet') {
      setImpactSheetVisible(true);
      return;
    }

    const result = await showAlert({
      title: t('impactSheet.title.edit'),
      message:
        flow.affectedCount > 0
          ? t('impactSheet.lead.plain', { count: flow.affectedCount })
          : undefined,
      buttons: [
        { key: 'cancel', label: t('impactSheet.cancel'), style: 'cancel' },
        { key: 'save', label: t('impactSheet.save') },
      ],
    });
    if (result === 'save') {
      commitPatch(payload);
    } else {
      setPendingPayload(null);
    }
  }

  async function commitPatch(payload: ExpenseWizardSubmitPayload) {
    if (!id || !groupId || !expense) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.updateExpense(groupId, id, payloadToUpdateInput(payload));
      setImpactSheetVisible(false);
      router.back();
    } catch (e: any) {
      setSubmitError(e?.message || t('impactSheet.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  const impact = pendingPayload ? buildImpact(pendingPayload) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <TopBar
        title={t('expenseDetail.editTitle')}
        left={<IconButton icon="x" onPress={() => router.back()} />}
      />

      {staleBannerVisible && (
        <TouchableOpacity
          onPress={reload}
          style={styles.staleBanner}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('expenseDetail.reload')}
        >
          <Text style={styles.staleBannerText}>{t('expenseDetail.staleBanner')}</Text>
          <Text style={styles.staleBannerLink}>{t('expenseDetail.reload')}</Text>
        </TouchableOpacity>
      )}

      {loadError && (
        <View style={styles.loadError}>
          <Text style={styles.loadErrorText}>{loadError}</Text>
        </View>
      )}

      {!!submitError && (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      )}

      {expense && group && initialValue && (
        <ExpenseWizard
          mode="edit"
          groupName={group.name}
          groupCurrency={group.currency}
          members={group.members}
          currentUserMemberId={currentUserMemberId}
          initialValue={initialValue}
          convertFx={api.convertFx}
          authToken={token}
          submitting={submitting}
          submitLabel={t('impactSheet.save')}
          onSubmit={handleSubmit}
        />
      )}

      {expense && impact && pendingPayload && (
        <SettlementImpactSheet
          visible={impactSheetVisible}
          mode="edit"
          deltas={impact.deltas}
          affectedSettlements={impact.affectedSettlements}
          members={group?.members ?? []}
          currency={pendingPayload.currency}
          submitting={submitting}
          error={submitError}
          onCancel={() => {
            setImpactSheetVisible(false);
            setSubmitError(null);
            setPendingPayload(null);
          }}
          onConfirm={() => commitPatch(pendingPayload)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s3,
    backgroundColor: colors.bone,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  staleBannerText: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  staleBannerLink: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    textDecorationLine: 'underline',
  },
  loadError: {
    margin: spacing.s5,
    padding: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 6,
  },
  loadErrorText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
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
