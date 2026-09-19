import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { useEnglishT } from '@/lib/i18n';
import { loadDraft, updateDraft } from '@/lib/onboarding-draft';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

export default function WelcomeChooseScreen() {
  const t = useEnglishT();
  const [name, setName] = useState('');

  useEffect(() => {
    void loadDraft().then((d) => setName(d?.name ?? ''));
  }, []);

  async function choose(intent: 'create' | 'join') {
    await updateDraft({ intent });
    analytics.track(intent === 'create' ? 'onboarding_create_chosen' : 'onboarding_scan_chosen');
    router.push(intent === 'create' ? '/welcome/create' : '/welcome/scan');
  }

  return (
    <OnboardingScaffold
      eyebrow={t('welcome.step', { current: 2, total: 3 })}
      headline={`${t('onboarding.greetingNamed', { name })}\n${t('welcome.chooseHeadline')}`}
    >
      <View style={styles.choices}>
        <ChoiceCard
          accent={colors.vermillion}
          icon="plus"
          eyebrow={t('onboarding.createEyebrow')}
          title={t('onboarding.createTitle')}
          body={t('onboarding.createBody')}
          onPress={() => choose('create')}
        />
        <ChoiceCard
          accent={colors.graphite}
          icon="camera"
          eyebrow={t('onboarding.scanEyebrow')}
          title={t('onboarding.scanTitle')}
          body={t('onboarding.scanBody')}
          onPress={() => choose('join')}
        />
      </View>
    </OnboardingScaffold>
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
});
