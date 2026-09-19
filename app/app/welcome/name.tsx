import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Text';
import { OnboardingScaffold } from '@/components/OnboardingScaffold';
import { useEnglishT } from '@/lib/i18n';
import { loadDraft, nextAfterName, updateDraft } from '@/lib/onboarding-draft';
import { legacyHostedUrl } from '@/lib/legacy-hosted-url';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

export default function WelcomeNameScreen() {
  const t = useEnglishT();
  const [name, setName] = useState('');

  useEffect(() => {
    void loadDraft().then((d) => {
      if (d?.name) setName(d.name);
    });
  }, []);

  const canSubmit = name.trim().length > 0;

  async function handleContinue() {
    if (!canSubmit) return;
    const draft = await updateDraft({ name: name.trim() });
    analytics.track('user_name_entered');
    router.push(nextAfterName(draft, legacyHostedUrl()) as never);
  }

  return (
    <OnboardingScaffold
      eyebrow={t('welcome.step', { current: 1, total: 3 })}
      headline={t('welcome.nameHeadline')}
      body={t('welcome.nameBody')}
      cta={{ label: t('welcome.continue'), onPress: handleContinue, disabled: !canSubmit }}
    >
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('onboardingName.label')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboardingName.placeholder')}
          placeholderTextColor={colors.lead}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          returnKeyType="next"
          onSubmitEditing={handleContinue}
          style={styles.input}
        />
      </View>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.s2 },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
});
