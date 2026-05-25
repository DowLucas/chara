import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '@/lib/accounts';
import { apiFor, AccountDeleteBlockedError } from '@/lib/api';
import { hasOpenBalance } from '@/lib/balance-utils';
import { displayHostFor } from '@/lib/server-url';
import { unregisterForAccount } from '@/lib/push';
import { initialsOf } from '@/lib/name';
import { formatMinorUnits } from '@/lib/i18n';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import type { Account } from '@/lib/accounts-store';

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { accounts, defaultAccount, removeAccount, setDefault } = useAccounts();

  const ordered = React.useMemo(
    () => [...accounts].sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1)),
    [accounts],
  );

  async function handleRemove(account: Account) {
    // Block removal when the user has open balances on this server — we don't
    // want someone to accidentally drop an account they still owe money on /
    // are owed money in. The check fetches /api/me/balances; on network
    // failure we block too (better than silently allowing a removal we can't
    // verify).
    let balances;
    try {
      balances = await apiFor(account.serverUrl).listMyBalances();
    } catch {
      showAlert({
        title: t('accounts.removeBalanceCheckFailedTitle'),
        message: t('accounts.removeBalanceCheckFailedBody'),
      });
      return;
    }
    if (hasOpenBalance(balances)) {
      showAlert({
        title: t('accounts.removeBlockedOpenBalanceTitle'),
        message: t('accounts.removeBlockedOpenBalanceBody', { host: displayHostFor(account.serverUrl, t('common.mainServerLabel')) }),
      });
      return;
    }

    const result = await showAlert({
      title: t('accounts.removeConfirmTitle'),
      message: t('accounts.removeConfirmBody'),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'remove', label: t('accounts.removeConfirm'), style: 'destructive' },
      ],
    });
    if (result === 'remove') {
      try {
        await apiFor(account.serverUrl).logout();
      } catch {
        /* best-effort */
      }
      // Spec §15: deregister this device's push token from the server.
      // `unregisterForAccount` swallows internally — safe to await.
      await unregisterForAccount(account.serverUrl);
      await removeAccount(account.serverUrl);
      if (accounts.length <= 1) {
        router.replace('/(auth)/sign-in');
      }
    }
  }

  async function handleDeleteForever(account: Account) {
    const host = displayHostFor(account.serverUrl, t('common.mainServerLabel'));
    const result = await showAlert({
      title: t('account.deleteFromServer.confirmTitle'),
      message: t('account.deleteFromServer.confirmBody', { server: host }),
      buttons: [
        { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
        { key: 'delete', label: t('account.deleteFromServer.confirmCta'), style: 'destructive' },
      ],
    });
    if (result !== 'delete') return;

    try {
      await apiFor(account.serverUrl).deleteMe();
    } catch (e) {
      if (e instanceof AccountDeleteBlockedError) {
        const formatted = e.balances
          .map((b) => formatMinorUnits(b.amount_minor, b.currency))
          .join(', ');
        showAlert({
          title: t('account.deleteFromServer.blockedTitle'),
          message: t('account.deleteFromServer.blockedBody', {
            server: host,
            balances: formatted || t('common.dash'),
          }),
        });
        return;
      }
      showAlert({
        title: t('common.error'),
        message: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // Server-side deletion succeeded — drop push token & local account.
    await unregisterForAccount(account.serverUrl);
    await removeAccount(account.serverUrl);
    if (accounts.length <= 1) {
      router.replace('/(auth)/sign-in');
    }
  }

  function handleSetDefault(serverUrl: string) {
    void setDefault(serverUrl);
  }

  function handleStatusTap(serverUrl: string) {
    router.push(
      `/(auth)/sign-in?server=${encodeURIComponent(serverUrl)}&mode=reauth` as never,
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('accounts.title')}
        left={
          <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {ordered.map((account) => {
          const isDefault = defaultAccount?.serverUrl === account.serverUrl;
          return (
            <AccountCard
              key={account.serverUrl}
              account={account}
              isDefault={isDefault}
              onMakeDefault={() => handleSetDefault(account.serverUrl)}
              onStatusTap={() => handleStatusTap(account.serverUrl)}
              onRemove={() => handleRemove(account)}
              onDeleteForever={() => handleDeleteForever(account)}
              onEditProfile={() => router.push('/onboarding/name')}
            />
          );
        })}

        <TouchableOpacity
          style={styles.addRow}
          onPress={() => router.push('/(auth)/add-server?mode=settings' as never)}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={18} color={colors.graphite} />
          <Text style={styles.addRowLabel}>{t('accounts.add')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

interface AccountCardProps {
  account: Account;
  isDefault: boolean;
  onMakeDefault: () => void;
  onStatusTap: () => void;
  onRemove: () => void;
  onDeleteForever: () => void;
  onEditProfile: () => void;
}

function AccountCard({
  account,
  isDefault,
  onMakeDefault,
  onStatusTap,
  onRemove,
  onDeleteForever,
  onEditProfile,
}: AccountCardProps) {
  const { t } = useTranslation();
  const initials = initialsOf(account.user.name);
  const host = displayHostFor(account.serverUrl, t('common.mainServerLabel'));
  const status = account.status;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar initials={initials} size="md" />
        <View style={styles.cardIdentity}>
          <Text style={styles.cardName} numberOfLines={1}>
            {account.user.name || t('common.dash')}
          </Text>
          <Text style={styles.cardEmail} numberOfLines={1}>
            {account.user.email || t('common.dash')}
          </Text>
          <Text style={styles.cardHost} numberOfLines={1}>
            {host}
          </Text>
        </View>

        <TouchableOpacity
          onPress={isDefault ? undefined : onMakeDefault}
          disabled={isDefault}
          activeOpacity={isDefault ? 1 : 0.7}
          accessibilityLabel={t('accounts.default')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.defaultBadgeWrap}
        >
          <Feather
            name="disc"
            size={18}
            color={isDefault ? colors.graphite : colors.ruleSoft}
          />
        </TouchableOpacity>
      </View>

      {status && (
        <TouchableOpacity
          style={styles.statusChip}
          onPress={onStatusTap}
          activeOpacity={0.7}
        >
          <Text style={styles.statusChipLabel}>
            {status === 'reauth_required'
              ? t('accounts.statusReauth')
              : t('accounts.statusIncompatible')}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={onEditProfile}
          activeOpacity={0.7}
          style={styles.cardActionBtn}
        >
          <Text style={styles.cardActionLabel}>{t('accounts.editProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.7}
          style={styles.cardActionBtn}
        >
          <Text style={styles.cardActionDestructive}>{t('accounts.remove')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={onDeleteForever}
        activeOpacity={0.7}
        style={styles.deleteForeverRow}
      >
        <Text style={styles.deleteForeverTitle}>
          {t('account.deleteFromServer.title')}
        </Text>
        <Text style={styles.deleteForeverBody}>
          {t('account.deleteFromServer.body', { server: host })}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s7,
    gap: spacing.s4,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    borderRadius: 8,
    padding: spacing.s4,
    backgroundColor: colors.paper,
    gap: spacing.s3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
  },
  cardIdentity: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.4,
  },
  cardEmail: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 3,
  },
  cardHost: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  defaultBadgeWrap: {
    paddingTop: 2,
  },
  statusChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.vermillion,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
    borderRadius: 4,
  },
  statusChipLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.fgOnAccent,
    letterSpacing: 0.3,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    paddingTop: spacing.s3,
    gap: spacing.s4,
  },
  cardActionBtn: {
    paddingVertical: spacing.s1,
  },
  cardActionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  cardActionDestructive: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
  },
  deleteForeverRow: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    paddingTop: spacing.s3,
    gap: 2,
  },
  deleteForeverTitle: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.brick,
    letterSpacing: 0.3,
  },
  deleteForeverBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 2,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  addRowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
});
