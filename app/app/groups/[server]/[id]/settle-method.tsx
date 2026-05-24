import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Platform, Image } from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { Stamp } from '@/components/Stamp';
import { useTranslation } from 'react-i18next';
import {
  apiFor,
  GroupDetail,
  GroupMember,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { decimalToMinor, formatMinorUnits, formatDate, formatTime } from '@/lib/i18n';
import {
  buildSwishLink,
  isSwishEligible,
  normalizeSwishNumber,
  type Platform as SwishPlatform,
} from '@/lib/swish';
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
  const { server, id, from, to, amount, currency } = useLocalSearchParams<{
    server: string;
    id: string;
    from: string;
    to: string;
    amount: string;
    currency: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stage, setStage] = useState<'pick' | 'awaiting' | 'done'>('pick');
  const [submitting, setSubmitting] = useState(false);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  // Swish deep-link held across the awaiting stage so the "Open Swish
  // again" button can re-fire the same URL the user already approved.
  const [swishUrl, setSwishUrl] = useState<string | null>(null);
  // Tracks whether the user has tapped Open Swish at least once. We
  // only foreground the "I've paid" confirm button after they've
  // actually been to Swish, so a stray tap can't record a false settle.
  const [swishOpened, setSwishOpened] = useState(false);

  // Members come from the GroupDetail response — no separate /members route.
  const members: GroupMember[] = group?.members ?? [];

  const load = useCallback(async () => {
    if (!id || !serverUrl) return;
    try {
      const g = await api.getGroup(id);
      setGroup(g);
    } catch {}
  }, [id, serverUrl]);

  useEffect(() => { load(); }, [load]);

  const fromMember = members.find((m) => m.id === from);
  const toMember = members.find((m) => m.id === to);
  const myMember = members.find((m) => m.user_id === user?.id);
  const isOutgoing = fromMember?.id === myMember?.id;
  const counter = isOutgoing ? toMember : fromMember;

  const amountMinor = useMemo(() => decimalToMinor(amount ?? '0.00'), [amount]);
  const formattedAmount = formatMinorUnits(amountMinor, currency ?? 'SEK');

  // The Swish row is the recipient's phone; the rest still need real
  // payment profiles (Vipps handle, PayPal email, IBAN). Until those land,
  // they fall through to the optimistic "settled out-of-band" path.
  const swishEligible = isSwishEligible({
    currency: currency ?? 'SEK',
    payeeSwishNumber: counter?.phone ?? null,
    platform: Platform.OS as SwishPlatform,
    amountMinor,
  });
  const methods: MethodRow[] = [
    { id: 'swish',  enabled: swishEligible, primary: true, badge: t('settleMethod.instantBadge') },
    { id: 'vipps',  enabled: false, primary: false },
    { id: 'paypal', enabled: true,  primary: false },
    { id: 'bank',   enabled: true,  primary: false },
    { id: 'manual', enabled: true,  primary: false },
  ];

  async function recordSettlement(noteSuffix?: string, amountOverride?: string) {
    if (!id || !from || !to || !amount || !currency || !serverUrl) return false;
    setSubmitting(true);
    try {
      await api.settle(id, {
        from_member_id: from,
        to_member_id: to,
        amount: amountOverride ?? amount,
        currency,
        note: noteSuffix,
      });
      setCompletedAt(new Date());
      setStage('done');
      return true;
    } catch (e: any) {
      showAlert({ title: t('settleMethod.errorTitle'), message: e?.message || t('settleMethod.errorBody') });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function openSwish() {
    if (!swishUrl) return;
    // Skip canOpenURL — in Expo Go (and on iOS without
    // LSApplicationQueriesSchemes declared) it returns false even when
    // the Swish app is installed. openURL is the source of truth: it
    // rejects iff iOS finds no handler for the scheme.
    try {
      await Linking.openURL(swishUrl);
      setSwishOpened(true);
    } catch {
      showAlert({
        title: t('settleMethod.swishUnavailableTitle'),
        message: t('settleMethod.swishUnavailableBody'),
      });
    }
  }

  async function handleMethod(m: MethodId) {
    if (!m || submitting) return;
    if (m === 'manual') {
      await recordSettlement('manual');
      return;
    }
    if (m === 'swish') {
      // Hard-stop if the recipient has no Swish number on file. Without
      // it the deep-link is unbuildable, so we should not silently fall
      // through to "settled".
      if (!counter?.phone || !normalizeSwishNumber(counter.phone)) {
        showAlert({
          title: t('settleMethod.swishMissingPhoneTitle'),
          message: t('settleMethod.swishMissingPhoneBody', { name: counter?.name ?? '' }),
        });
        return;
      }
      let url: string;
      try {
        url = buildSwishLink({
          payeeSwishNumber: counter.phone,
          amountMinor,
          currency: 'SEK',
          groupName: group?.name ?? 'Chara',
          // Without a server-side pending-settlement record we just feed a
          // client-side correlation id. The callbackurl is informational —
          // iOS surfaces a "Return to Chara" affordance after payment.
          pendingId: `${id}-${from}-${to}-${Date.now()}`,
        });
      } catch (e: any) {
        showAlert({
          title: t('settleMethod.swishMissingPhoneTitle'),
          message: e?.message || t('settleMethod.swishMissingPhoneBody', { name: counter?.name ?? '' }),
        });
        return;
      }
      // Don't open Swish or record the settlement yet — Swish gives us
      // no payment-complete callback (see docs/swish-integration.md
      // §3.0.1), so the only honest UX is to park on a waiting screen,
      // let the user tap Open Swish themselves, then explicitly confirm
      // they paid before we record the settlement.
      setSwishUrl(url);
      setSwishOpened(false);
      setStage('awaiting');
      return;
    }
    // vipps / paypal / bank — defer deep-link integration; for v1, record the
    // settlement and let the user complete the payment out-of-band.
    await recordSettlement(m);
  }

  if (stage === 'awaiting') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar
          title={t('settleMethod.swishWaitTitle', { amount: formattedAmount })}
          left={<IconButton icon="arrow-left" onPress={() => { setStage('pick'); setSwishUrl(null); setSwishOpened(false); }} />}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.awaitingScroll}>
          <View style={styles.counterRow}>
            <Avatar initials={initialsOf(counter?.name)} />
            <View style={styles.counterTextWrap}>
              <Text style={styles.counterName} numberOfLines={1}>
                {t('settleMethod.to', { name: counter?.name ?? '' })}
              </Text>
              <Text style={styles.counterMeta} numberOfLines={1}>
                {t('settleMethod.subMeta', { group: group?.name ?? '' })}
              </Text>
            </View>
            <Text
              style={styles.counterAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {formattedAmount}
            </Text>
          </View>
          <View style={styles.heroRule} />
          <View style={styles.awaitingBodyWrap}>
            <Text style={styles.awaitingBody}>
              {t('settleMethod.swishWaitBody', {
                amount: formattedAmount,
                name: counter?.name ?? '',
              })}
            </Text>
          </View>
        </ScrollView>
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
          {/* Stack the two actions. Before opening Swish the open
              button is the primary CTA and the confirm is a quiet
              ghost link; once they've been to Swish we swap the
              hierarchy so confirming is the obvious next step. */}
          {!swishOpened ? (
            <>
              <Button kind="primary" onPress={openSwish} style={{ marginBottom: spacing.s2 }}>
                {t('settleMethod.swishWaitOpen')}
              </Button>
              <TouchableOpacity
                onPress={() => recordSettlement('swish', amount)}
                disabled={submitting}
                style={styles.awaitingSecondary}
              >
                <Text style={styles.awaitingSecondaryText}>
                  {t('settleMethod.swishWaitConfirmShort')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Moss instead of vermillion so the user returning from
                  Swish sees a visually distinct "yes, that's done"
                  affordance — green reads as completion, not a fresh
                  action. Matches the colors.moss "settled / you're
                  owed" semantic from CLAUDE.md. */}
              <Button
                kind="primary"
                onPress={() => recordSettlement('swish', amount)}
                disabled={submitting}
                style={{
                  marginBottom: spacing.s2,
                  backgroundColor: colors.moss,
                  borderColor: colors.moss,
                }}
              >
                {t('settleMethod.swishWaitConfirm', { name: counter?.name?.split(' ')[0] ?? '' })}
              </Button>
              <TouchableOpacity onPress={openSwish} style={styles.awaitingSecondary}>
                <Text style={styles.awaitingSecondaryText}>
                  {t('settleMethod.swishWaitReopen')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  if (stage === 'done') {
    const sentence = isOutgoing
      ? t('settle.settledBody', { amount: formattedAmount, name: counter?.name ?? '' })
      : t('settle.settledBody', { amount: formattedAmount, name: counter?.name ?? '' });
    return (
      <View style={styles.settledRoot}>
        {/* Full-bleed ukiyo-e hero. The illustration is the screen — text
            composes against it like a tea-house bill resting on the
            tatami below. */}
        <Image
          source={require('@/assets/illustrations/settled-night.png')}
          style={styles.settledHero}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <View style={[styles.settledClose, { top: insets.top + 8 }]}>
          <IconButton icon="x" onPress={() => router.back()} />
        </View>

        {/* Paper card slides up over the image edge; the vermillion
            top rule echoes the red chop in the print. */}
        <View style={styles.settledPanel}>
          <View style={styles.settledPanelRule} />
          <View style={styles.settledPanelInner}>
            <Text style={styles.settledEyebrow}>{t('settle.settledTitle').toLowerCase()}</Text>
            <View style={styles.settledStampRow}>
              <View style={styles.settledStampLine} />
              <Stamp size="lg" />
              <View style={styles.settledStampLine} />
            </View>
            <Text style={styles.settledSentence}>{sentence}</Text>
            <Text style={styles.settledChop}>
              {completedAt && `${formatDate(completedAt)} · ${formatTime(completedAt)}`}
            </Text>
          </View>
          <View style={[styles.ctaBar, styles.settledCta, { paddingBottom: insets.bottom + 8 }]}>
            <Button kind="primary" onPress={() => router.back()} style={{ flex: 1 }}>
              {t('common.done')}
            </Button>
          </View>
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.pickScroll}>
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
          <Text
            style={styles.counterAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {formattedAmount}
          </Text>
        </View>
        <View style={styles.heroRule} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('settleMethod.sectionLabel')}</Text>
          <View style={styles.softRule} />
        </View>

        {methods.map((m) => {
          const label = labelForMethod(m.id, t);
          const sub = subForMethod(m.id, t, counter?.name, counter?.phone);
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
                    m.id === 'swish'
                      ? styles.methodTileLogo
                      : m.primary
                      ? styles.methodTilePrimary
                      : styles.methodTileMuted,
                  ]}
                >
                  {m.id === 'swish' ? (
                    <Image
                      source={require('@/assets/swish-logo.png')}
                      style={styles.methodTileImage}
                      resizeMode="contain"
                      accessibilityLabel="Swish"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.methodTileLetter,
                        m.primary && styles.methodTileLetterPrimary,
                      ]}
                    >
                      {label.slice(0, 1).toUpperCase()}
                    </Text>
                  )}
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
          disabled={submitting || !swishEligible}
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
  counterPhone?: string | null,
): string {
  switch (id) {
    case 'swish': {
      if (!counterName) return t('settleMethod.swishUnlinked');
      const canonical = counterPhone ? normalizeSwishNumber(counterPhone) : null;
      if (!canonical) return t('settleMethod.swishUnlinked');
      // Display as national format with light spacing.
      const national = '0' + canonical.slice(3);
      const pretty = `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
      return t('settleMethod.swishSub', { name: counterName.split(' ')[0], phone: pretty });
    }
    case 'vipps':  return t('settleMethod.vippsUnlinked');
    case 'paypal': return t('settleMethod.paypalUnlinked');
    case 'bank':   return t('settleMethod.bankSub');
    case 'manual': return t('settleMethod.manualSub');
  }
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
  methodTileLogo: {
    backgroundColor: colors.paper,
    borderColor: colors.ruleSoft,
    padding: 4,
  },
  methodTileImage: {
    width: '100%',
    height: '100%',
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
  awaitingScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pickScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  awaitingBodyWrap: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
  },
  awaitingBody: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    lineHeight: 22,
  },
  awaitingRoundingNote: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: spacing.s3,
    lineHeight: 18,
  },
  awaitingSecondary: {
    alignItems: 'center',
    paddingVertical: spacing.s3,
  },
  awaitingSecondaryText: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
  settledScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s6,
    gap: spacing.s3,
  },
  settledRoot: {
    flex: 1,
    backgroundColor: '#0E1A2E', // matches the deep dusk sky of the print
  },
  settledHero: {
    width: '100%',
    flex: 1,
  },
  settledClose: {
    position: 'absolute',
    left: spacing.s4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settledPanel: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    marginTop: -spacing.s6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  settledPanelRule: {
    height: 3,
    backgroundColor: colors.vermillion,
  },
  settledPanelInner: {
    paddingHorizontal: spacing.s6,
    paddingTop: spacing.s5,
    paddingBottom: spacing.s4,
    alignItems: 'center',
  },
  settledEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 4,
    textTransform: 'lowercase',
    marginBottom: spacing.s3,
  },
  settledStampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s4,
  },
  settledStampLine: {
    width: 36,
    height: 0.5,
    backgroundColor: colors.graphite,
  },
  settledSentence: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.graphite,
    textAlign: 'center',
    marginBottom: spacing.s4,
  },
  settledChop: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 1.5,
    textTransform: 'lowercase',
  },
  settledCta: {
    borderTopWidth: 0,
    paddingTop: spacing.s2,
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
