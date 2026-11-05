import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/lib/accounts';
import { apiFor } from '@/lib/api';
import { showAlert } from '@/lib/app-alert';
import { track } from '@/lib/analytics';
import { decimalToMinor, formatMinorUnits } from '@/lib/i18n';
import { runPendingSwishRecovery } from '@/lib/pending-swish';
import { userErrorMessage } from '@/lib/user-error';

/**
 * Asks, once per cold launch, whether a Swish payment the app was killed in
 * the middle of went through (see lib/pending-swish.ts). Mounted inside
 * AccountsProvider; renders nothing.
 */
export function PendingSwishRecovery() {
  const { accounts, loading } = useAccounts();
  const { t } = useTranslation();
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading || ranRef.current) return;
    ranRef.current = true;
    void runPendingSwishRecovery({
      accounts,
      now: Date.now(),
      ask: async (p) => {
        const r = await showAlert({
          title: t('pendingSwish.title'),
          message: t('pendingSwish.body', {
            name: p.payeeName,
            amount: formatMinorUnits(decimalToMinor(p.amount), p.currency),
            group: p.groupName,
          }),
          buttons: [
            { key: 'no', label: t('pendingSwish.no'), style: 'cancel' },
            { key: 'yes', label: t('pendingSwish.yes') },
          ],
        });
        return r === 'yes' || r === 'no' ? r : null;
      },
      settle: (serverUrl, groupId, input) => apiFor(serverUrl).settle(groupId, input),
      navigateToGroup: (serverUrl, groupId) =>
        router.push(`/groups/${encodeURIComponent(serverUrl)}/${groupId}`),
      notifyError: (e) => {
        void showAlert({
          title: t('settleMethod.errorTitle'),
          message: userErrorMessage(e, t('pendingSwish.errorBody')),
        });
      },
      track,
    }).catch(() => {});
  }, [loading]);

  return null;
}
