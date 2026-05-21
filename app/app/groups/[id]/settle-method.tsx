import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { Stamp } from '@/components/Stamp';
import { useTranslation } from 'react-i18next';
import {
  getGroup,
  settle,
  GroupDetail,
  GroupMember,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { decimalToMinor, formatMinorUnits, formatDate, formatTime } from '@/lib/i18n';
import {
  colors,
  fontDisplay,
  fontBody,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

type MethodId = 'swish' | 'vipps' | 'paypal' | 'bank' | 'manual';

interface MethodRow {
  id: MethodId;
  enabled: boolean;
  primary: boolean;
  badge?: string;
}

function initialsOf(name?: string | null): string {
  if (!name) return '??';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function SettleMethodScreen() {
  const { id, from, to, amount, currency } = useLocalSearchParams<{
    id: string;
    from: string;
    to: string;
    amount: string;
    currency: string;
  }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stage, setStage] = useState<'pick' | 'done'>('pick');
  const [submitting, setSubmitting] = useState(false);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);

  // Members come from the GroupDetail response — no separate /members route.
  const members: GroupMember[] = group?.members ?? [];

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const g = await getGroup(id);
      setGroup(g);
    } catch {}
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const fromMember = members.find((m) => m.id === from);
  const toMember = members.find((m) => m.id === to);
  const myMember = members.find((m) => m.user_id === user?.id);
  const isOutgoing = fromMember?.id === myMember?.id;
  const counter = isOutgoing ? toMember : fromMember;

  const amountMinor = useMemo(() => decimalToMinor(amount ?? '0.00'), [amount]);
  const formattedAmount = formatMinorUnits(amountMinor, currency ?? 'SEK');

  // Payment-method state is hard-coded for v1 — once user payment profiles
  // exist (Swish phone, Vipps, PayPal handle, IBAN), pull these from the
  // recipient's profile so the sub-labels show real handles, not "Not linked".
  const methods: MethodRow[] = [
    { id: 'swish',  enabled: true,  primary: true,  badge: t('settleMethod.instantBadge') },
    { id: 'vipps',  enabled: false, primary: false },
    { id: 'paypal', enabled: true,  primary: false },
    { id: 'bank',   enabled: true,  primary: false },
    { id: 'manual', enabled: true,  primary: false },
  ];

  async function recordSettlement(noteSuffix?: string) {
    if (!id || !from || !to || !amount || !currency) return false;
    setSubmitting(true);
    try {
      await settle(id, {
        from_member_id: from,
        to_member_id: to,
        amount,
        currency,
        note: noteSuffix,
      });
      setCompletedAt(new Date());
      setStage('done');
      return true;
    } catch (e: any) {
      Alert.alert(t('settleMethod.errorTitle'), e?.message || t('settleMethod.errorBody'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMethod(m: MethodId) {
    if (!m || submitting) return;
    if (m === 'manual') {
      await recordSettlement('manual');
      return;
    }
    if (m === 'swish') {
      // TODO(push-notifications): when the recipient runs the self-hosted
      // build with notification tokens registered, fire a "you've been paid"
      // push here (via /api/notifications/dispatch) so they see it instantly
      // without polling. For the hosted tier this lands via Expo Push.
      const swishUrl = buildSwishUrl(amountMinor, currency ?? 'SEK', counter?.name);
      if (swishUrl) {
        const can = await Linking.canOpenURL(swishUrl);
        if (can) {
          await Linking.openURL(swishUrl);
        }
      }
      await recordSettlement('swish');
      return;
    }
    // vipps / paypal / bank — defer deep-link integration; for v1, record the
    // settlement and let the user complete the payment out-of-band.
    await recordSettlement(m);
  }

  if (stage === 'done') {
    const sentence = isOutgoing
      ? t('settle.settledBody', { amount: formattedAmount, name: counter?.name ?? '' })
      : t('settle.settledBody', { amount: formattedAmount, name: counter?.name ?? '' });
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar left={<IconButton icon="x" onPress={() => router.back()} />} />
        <View style={styles.settledScreen}>
          <Stamp size="lg" />
          <Text style={styles.settledTitle}>{t('settle.settledTitle')}</Text>
          <Text style={styles.settledBody}>{sentence}</Text>
          <View style={styles.settledRule} />
          <Text style={styles.settledDate}>
            {completedAt && `${formatDate(completedAt)} · ${formatTime(completedAt)}`}
          </Text>
        </View>
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
          <Button kind="primary" onPress={() => router.back()} style={{ flex: 1 }}>
            {t('common.done')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={isOutgoing
          ? t('settleMethod.sendTitle', { amount: formattedAmount })
          : t('settleMethod.requestTitle', { amount: formattedAmount })}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView style={styles.scroll}>
        {/* Counterparty + amount */}
        <View style={styles.counterRow}>
          <Avatar initials={initialsOf(counter?.name)} />
          <View style={styles.counterTextWrap}>
            <Text style={styles.counterName} numberOfLines={1}>
              {isOutgoing
                ? t('settleMethod.to', { name: counter?.name ?? '' })
                : t('settleMethod.from', { name: counter?.name ?? '' })}
            </Text>
            <Text style={styles.counterMeta} numberOfLines={1}>
              {t('settleMethod.subMeta', { group: group?.name ?? '' })}
            </Text>
          </View>
          <Text style={styles.counterAmount}>{formattedAmount}</Text>
        </View>
        <View style={styles.heroRule} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('settleMethod.sectionLabel')}</Text>
          <View style={styles.softRule} />
        </View>

        {methods.map((m) => {
          const label = labelForMethod(m.id, t);
          const sub = subForMethod(m.id, t, counter?.name);
          const disabled = !m.enabled;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.methodRow, disabled && styles.methodRowDisabled]}
              activeOpacity={disabled ? 1 : 0.7}
              onPress={() => !disabled && handleMethod(m.id)}
              disabled={disabled || submitting}
            >
              <View style={styles.methodLeft}>
                <View
                  style={[
                    styles.methodTile,
                    m.primary ? styles.methodTilePrimary : styles.methodTileMuted,
                  ]}
                >
                  <Text
                    style={[
                      styles.methodTileLetter,
                      m.primary && styles.methodTileLetterPrimary,
                    ]}
                  >
                    {label.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.methodTextWrap}>
                  <View style={styles.methodNameRow}>
                    <Text style={styles.methodName}>{label}</Text>
                    {m.badge && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{m.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.methodSub} numberOfLines={1}>{sub}</Text>
                </View>
              </View>
              <Text style={styles.methodArrow}>→</Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.noteCardWrap}>
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>{t('settleMethod.swishNote')}</Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 100 }} />
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
        <Button
          kind="primary"
          disabled={submitting}
          onPress={() => handleMethod('swish')}
          style={{ flex: 1 }}
        >
          {isOutgoing
            ? t('settleMethod.sendVia', { method: t('settleMethod.swish') })
            : t('settleMethod.requestVia', { method: t('settleMethod.swish') })}
        </Button>
      </View>
    </View>
  );
}

function labelForMethod(id: MethodId, t: (k: string) => string): string {
  switch (id) {
    case 'swish':  return t('settleMethod.swish');
    case 'vipps':  return t('settleMethod.vipps');
    case 'paypal': return t('settleMethod.paypal');
    case 'bank':   return t('settleMethod.bank');
    case 'manual': return t('settleMethod.manual');
  }
}

function subForMethod(
  id: MethodId,
  t: (k: string, opts?: any) => string,
  counterName?: string | null,
): string {
  switch (id) {
    case 'swish':  return counterName
      ? t('settleMethod.swishSub', { name: counterName.split(' ')[0], phone: '—' })
      : t('settleMethod.swishUnlinked');
    case 'vipps':  return t('settleMethod.vippsUnlinked');
    case 'paypal': return t('settleMethod.paypalUnlinked');
    case 'bank':   return t('settleMethod.bankSub');
    case 'manual': return t('settleMethod.manualSub');
  }
}

// Build a Swish payment URL (Nordic payment rail). The protocol opens the
// Swish app with the amount and recipient prefilled. Phone is hard-coded to
// blank for v1 — wire to recipient's saved phone once user payment profiles
// land.
function buildSwishUrl(amountMinor: number, currency: string, recipientName?: string | null): string | null {
  if (currency !== 'SEK') return null;
  const sek = (amountMinor / 100).toFixed(2);
  const msg = recipientName ? `Quits · ${recipientName}` : 'Quits';
  return `swish://payment?amount=${sek}&message=${encodeURIComponent(msg)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.s5,
    paddingTop: 10,
    paddingBottom: 18,
  },
  counterTextWrap: { flex: 1, minWidth: 0 },
  counterName: {
    fontFamily: fontDisplay,
    fontSize: 17,
    color: colors.graphite,
    letterSpacing: -0.4,
  },
  counterMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
  },
  counterAmount: {
    fontFamily: fontMonoMedium,
    fontSize: 22,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  heroRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    marginHorizontal: spacing.s5,
  },
  sectionHeader: {
    paddingHorizontal: spacing.s5,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  softRule: {
    height: 0.5,
    backgroundColor: colors.ruleSoft,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  methodRowDisabled: { opacity: 0.5 },
  methodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  methodTile: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
  },
  methodTilePrimary: {
    backgroundColor: colors.vermillion,
    borderColor: colors.vermillion,
  },
  methodTileMuted: {
    backgroundColor: colors.bone,
    borderColor: colors.ruleSoft,
  },
  methodTileLetter: {
    fontFamily: fontMonoMedium,
    fontSize: 11,
    color: colors.lead,
    letterSpacing: 0.5,
  },
  methodTileLetterPrimary: { color: colors.paper },
  methodTextWrap: { flex: 1, minWidth: 0 },
  methodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodName: {
    fontFamily: fontDisplay,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  badge: {
    borderWidth: 0.5,
    borderColor: colors.vermillion,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontFamily: fontMono,
    fontSize: 10,
    color: colors.vermillion,
    letterSpacing: 0.5,
  },
  methodSub: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
  },
  methodArrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  noteCardWrap: {
    paddingHorizontal: spacing.s5,
    paddingTop: 18,
  },
  noteCard: {
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 6,
    padding: 14,
  },
  noteText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 19,
  },
  ctaBar: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  settledScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s6,
    gap: spacing.s3,
  },
  settledTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.8,
    color: colors.graphite,
    marginTop: spacing.s3,
  },
  settledBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
  },
  settledRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    width: 180,
    marginVertical: spacing.s2,
  },
  settledDate: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.5,
  },
});
