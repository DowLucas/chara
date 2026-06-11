import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useEnglishT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { setFlag, FLAG_ONBOARDING_SKIPPED } from '@/lib/storage';
import { colors, fontBody, fontBodyMedium, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { ContentContainer } from '@/components/ContentContainer';
import * as analytics from '@/lib/analytics';

export default function OnboardingHome() {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  const { user } = useAuth();
  const greeting = user?.name ? t('onboarding.greetingNamed', { name: user.name }) : t('onboarding.greetingAnon');

  useEffect(() => {
    analytics.track('onboarding_seen');
  }, []);

  async function handleSkip() {
    // Persist so the (tabs) gate stops bouncing the user back here when they
    // have no groups yet. They can still create/join from the Groups tab.
    await setFlag(FLAG_ONBOARDING_SKIPPED, '1');
    router.replace('/(tabs)');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.s4 }]}>
      <ContentContainer style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('onboarding.eyebrow')}</Text>
        <Text style={styles.headline}>{greeting}{'\n'}{t('onboarding.subhead')}</Text>
        <Text style={styles.body}>{t('onboarding.intro')}</Text>
      </View>

      <View style={styles.illustrationWrap}>
        <Image
          source={require('@/assets/illustrations/onboarding-welcome.png')}
          style={styles.illustration}
          resizeMode="contain"
          accessible={false}
        />
      </View>

      <View style={styles.choices}>
        <ChoiceCard
          accent={colors.vermillion}
          icon="plus"
          eyebrow={t('onboarding.createEyebrow')}
          title={t('onboarding.createTitle')}
          body={t('onboarding.createBody')}
          onPress={() => {
            analytics.track('onboarding_create_chosen');
            router.push('/onboarding/create');
          }}
        />
        <ChoiceCard
          accent={colors.graphite}
          icon="camera"
          eyebrow={t('onboarding.scanEyebrow')}
          title={t('onboarding.scanTitle')}
          body={t('onboarding.scanBody')}
          onPress={() => {
            analytics.track('onboarding_scan_chosen');
            router.push('/onboarding/scan');
          }}
        />
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipLabel}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <Text style={styles.footerHint}>{t('onboarding.footerHint')}</Text>
      </View>
      </ContentContainer>
    </View>
  );
}

function ChoiceCard({
  accent,
  icon,
  eyebrow,
  title,
  body,
  onPress,
}: {
  accent: string;
  icon: keyof typeof Feather.glyphMap;
  eyebrow: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.cardIcon, { backgroundColor: accent }]}>
        <Feather name={icon} size={20} color={colors.fgOnAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardEyebrow}>{eyebrow}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.lead} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.s5,
  },
  header: { gap: spacing.s3, marginTop: spacing.s4 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 20,
    marginTop: spacing.s2,
  },
  illustrationWrap: {
    flex: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  choices: { gap: spacing.s3, marginBottom: spacing.s4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    backgroundColor: colors.bone,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  cardTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.4,
  },
  cardBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 20,
    marginTop: 3,
  },
  skipBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    marginTop: spacing.s1,
  },
  skipLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    textDecorationColor: colors.ruleSoft,
  },
  footer: { alignItems: 'center', paddingTop: spacing.s3 },
  footerHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
});
