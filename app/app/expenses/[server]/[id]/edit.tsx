/**
 * Edit-expense host screen.
 *
 * Spec: docs/superpowers/specs/2026-05-23-edit-expense-design.md §"Edit screen".
 *
 * - Fetches expense + group + settlements via `apiFor(serverUrl)`.
 * - Pre-fills `<ExpenseForm initialValue={...} />`.
 * - On save: computes balance impact via `computeBalanceImpact`, decides
 *   which confirm surface to show via `decideConfirmFlow`, PATCHes the
 *   expense, then navigates back.
 * - Stale-banner: re-fetches on focus; if `updated_at` changes, shows an
 *   inline banner asking the user to reload.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { ExpenseForm, ExpenseFormValue, SplitMethod } from '@/components/ExpenseForm';
import { SettlementImpactSheet } from '@/components/SettlementImpactSheet';
import {
  apiFor,
  Expense,
  GroupDetail,
  Settlement,
  UpdateExpenseInput,
} from '@/lib/api';
import { computeBalanceImpact, MemberDelta } from '@/lib/balance-impact';
import {
  decideConfirmFlow,
  expenseInputCurrencyAmount,
  nonShareFieldsDiffer,
  NonShareFieldsSnapshot,
  projectExpenseToInputCurrency,
  splitShareInInputCurrency,
} from '@/lib/edit-expense-flow';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

function expenseToFormValue(expense: Expense): ExpenseFormValue {
  const exactByMember: Record<string, string> = {};
  const pctByMember: Record<string, string> = {};
  // The wire only preserves `share` (decimal). For percentage-split expenses
  // the backend re-derives shares on save, so we can pre-fill the exact-mode
  // inputs from the existing splits; if the user keeps split_method =
  // percentage and edits, they'll re-type the basis points.
  for (const s of expense.splits ?? []) {
    exactByMember[s.member_id] = splitShareInInputCurrency(s.share, expense);
  }
  const { amount, currency } = expenseInputCurrencyAmount(expense);
  return {
    title: expense.title,
    amount: parseFloat(amount).toFixed(2),
    currency,
    paidByMemberId: expense.paid_by_id,
    splitMethod: (expense.split_method as SplitMethod) || 'equal',
    participants: (expense.splits ?? []).map((s) => s.member_id),
    exactByMember,
    pctByMember,
    expenseDate: expense.expense_date ?? new Date().toISOString().split('T')[0],
    category: expense.category || 'other',
    notes: expense.notes ?? '',
  };
}


function snapshot(value: ExpenseFormValue, expense: Expense): NonShareFieldsSnapshot {
  return {
    title: value.title,
    category: value.category,
    notes: value.notes,
    expense_date: value.expenseDate,
    currency: value.currency,
    amount: value.amount,
  };
}

function valueToUpdatePayload(
  value: ExpenseFormValue,
  amountMinor: bigint,
): UpdateExpenseInput {
  const base: UpdateExpenseInput = {
    title: value.title.trim(),
    amount: (Number(amountMinor) / 100).toFixed(2),
    currency: value.currency,
    paid_by_id: value.paidByMemberId,
    expense_date: value.expenseDate,
    split_method: value.splitMethod,
    notes: value.notes,
    category: value.category,
  };
  if (value.splitMethod === 'equal') {
    base.participants = value.participants;
  } else if (value.splitMethod === 'exact') {
    base.splits = value.participants.map((id) => ({
      member_id: id,
      share: value.exactByMember[id] ?? '0.00',
    }));
  } else {
    base.splits = value.participants.map((id) => ({
      member_id: id,
      basis_points: Math.round(parseFloat(value.pctByMember[id] ?? '0') * 100),
    }));
  }
  return base;
}

export default function EditExpenseScreen() {
  const { server, id, groupId } = useLocalSearchParams<{
    server: string;
    id: string;
    groupId?: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleBannerVisible, setStaleBannerVisible] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<ExpenseFormValue | null>(null);
  const [impactSheetVisible, setImpactSheetVisible] = useState(false);

  // Initial load.
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

  // Stale-banner mechanism — re-fetch on focus and compare updated_at.
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
        .catch(() => {
          /* tolerate transient failures — banner stays off */
        });
      return () => {
        cancelled = true;
      };
    }, [id, groupId, expense?.updated_at]),
  );

  const initialValue = useMemo(
    () => (expense ? expenseToFormValue(expense) : undefined),
    [expense],
  );

  function reload() {
    if (!id || !groupId) return;
    setStaleBannerVisible(false);
    api
      .getExpense(groupId, id)
      .then(setExpense)
      .catch(() => setLoadError(t('expenseDetail.loadError')));
  }

  function buildImpact(value: ExpenseFormValue) {
    if (!expense || !group) {
      return { deltas: [] as MemberDelta[], affectedSettlements: [] as Settlement[], newCurrency: value.currency };
    }
    const amountMinor = BigInt(Math.round(parseFloat(value.amount || '0') * 100));
    let newSplits: { memberId: string; amountMinor: bigint }[] | undefined;
    if (value.splitMethod === 'exact') {
      newSplits = value.participants.map((id) => ({
        memberId: id,
        amountMinor: BigInt(Math.round(parseFloat(value.exactByMember[id] ?? '0') * 100)),
      }));
    }
    // For FX-snapshotted expenses, project both sides into input currency so
    // deltas match the currency the user is editing in.
    const projected = projectExpenseToInputCurrency(expense);
    return computeBalanceImpact({
      expense: projected,
      currentSplits: projected.splits ?? [],
      newAmountMinor: amountMinor,
      newPayerId: value.paidByMemberId,
      newSplitMethod: value.splitMethod,
      newParticipants: value.participants,
      newSplits,
      members: group.members,
      settlements,
    });
  }

  function handleSubmit(value: ExpenseFormValue) {
    if (!expense) return;
    const impact = buildImpact(value);
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: nonShareFieldsDiffer(
        snapshot(value, expense),
        snapshot(expenseToFormValue(expense), expense),
      ),
      deltas: impact.deltas,
      affectedSettlementsCount: impact.affectedSettlements.length,
    });

    if (flow.kind === 'no-changes') {
      Alert.alert(t('expenseDetail.noChanges'));
      router.back();
      return;
    }

    setPendingValue(value);

    if (flow.kind === 'impact-sheet') {
      setImpactSheetVisible(true);
      return;
    }
    // simple confirm
    Alert.alert(
      t('impactSheet.title.edit'),
      flow.affectedCount > 0
        ? t('impactSheet.lead.plain', { count: flow.affectedCount })
        : '',
      [
        { text: t('impactSheet.cancel'), style: 'cancel', onPress: () => setPendingValue(null) },
        { text: t('impactSheet.save'), onPress: () => commitPatch(value) },
      ],
    );
  }

  async function commitPatch(value: ExpenseFormValue) {
    if (!id || !groupId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const amountMinor = BigInt(Math.round(parseFloat(value.amount || '0') * 100));
      await api.updateExpense(groupId, id, valueToUpdatePayload(value, amountMinor));
      setImpactSheetVisible(false);
      router.back();
    } catch (e: any) {
      setSubmitError(e?.message || t('impactSheet.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  const impact = pendingValue ? buildImpact(pendingValue) : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
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

        {expense && group && initialValue && (
          <ExpenseForm
            mode="edit"
            groupId={groupId ?? expense.group_id}
            serverUrl={serverUrl}
            members={group.members}
            initialValue={initialValue}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={submitError}
          />
        )}

        {expense && impact && pendingValue && (
          <SettlementImpactSheet
            visible={impactSheetVisible}
            mode="edit"
            deltas={impact.deltas}
            affectedSettlements={impact.affectedSettlements}
            members={group?.members ?? []}
            currency={pendingValue.currency}
            submitting={submitting}
            error={submitError}
            onCancel={() => {
              setImpactSheetVisible(false);
              setSubmitError(null);
              setPendingValue(null);
            }}
            onConfirm={() => commitPatch(pendingValue)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
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
});
